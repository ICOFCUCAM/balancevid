/**
 * The worker.  [Doctrine U-23, D-14]
 *
 * Runs as its own process and is the ONLY thing in the system permitted to
 * invoke ffmpeg. The web tier never does -- one forty-minute export must not
 * make the application unusable for everyone else.
 *
 *   npm run worker
 *
 * Killing it mid-job is safe: an unfinished job is re-claimable and the shot
 * cache (U-16) means a re-run resumes rather than restarts.
 */

import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AssetId, Take } from '../domain/document.js';
import { buildRenderPlan } from '../domain/plan.js';
import { compose } from '../render/compose.js';
import { ingest, makeProxy } from '../render/ingest.js';
import { ensureDirs, paths } from '../store/paths.js';
import { claim, finish, update, type Job } from '../store/queue.js';
import { audit, loadConversation, mutateConversation } from '../store/repository.js';
import { assembleTake, takeMezzaninePath } from '../store/takes.js';
import { enqueue } from '../store/queue.js';
import { resolveTranscriber } from '../transcribe/index.js';
import {
  loadAllTakeTranscripts, loadTranscript, saveTakeTranscript, saveTranscript,
} from '../store/transcripts.js';
import { buildCues } from '../render/cues.js';
import { archiveUpload, archiveWeb, type ArchiveResult } from '../evidence/archive.js';
import { projectTimeline } from '../domain/timeline.js';

const POLL_MS = 400;

export async function runJob(job: Job): Promise<Job> {
  switch (job.kind) {
    case 'ingest_source': return ingestSource(job);
    case 'transcribe_source': return transcribeSource(job);
    case 'assemble_take': return assembleTakeJob(job);
    case 'transcribe_take': return transcribeTake(job);
    case 'archive_evidence': return archiveEvidence(job);
    case 'render': return render(job);
  }
}

/** Normalise an uploaded source and record its measured duration. [U-02] */
async function ingestSource(job: Job): Promise<Job> {
  const originalPath = String(job.payload['originalPath']);
  const assetId = String(job.payload['assetId']);
  const mezzaninePath = paths.asset(job.conversationId, `${assetId}mezz`, 'mp4');

  const result = await ingest(originalPath, mezzaninePath);

  // The editor scrubs the proxy; the renderer cuts the mezzanine. If they
  // disagreed about which frame is frame N, frame-exactness would be true of
  // the file and false of the experience.
  const proxyPath = paths.sourceProxy(job.conversationId, assetId);
  const proxy = await makeProxy(mezzaninePath, proxyPath);
  if (proxy.durationFrames !== result.info.durationFrames) {
    throw new Error(
      `preview/render frame parity broken: proxy has ${proxy.durationFrames} frames, ` +
      `mezzanine has ${result.info.durationFrames}`,
    );
  }

  await mutateConversation(job.conversationId, (conversation) => {
    conversation.source.mezzanineAssetId = assetId as AssetId;
    // The duration the timeline uses is the one measured from the mezzanine,
    // never the one the uploaded container claimed.
    conversation.source.durationFrames = result.info.durationFrames;
  });
  await audit(job.conversationId, {
    action: 'source.ingested',
    detail: {
      assetId,
      durationFrames: result.info.durationFrames,
      width: result.info.width,
      height: result.info.height,
      proxyWidth: proxy.width,
      synthesisedAudio: result.synthesisedAudio,
    },
  });

  // Transcription is its own job. It is much slower than normalisation, and
  // the user can already watch, interrupt and respond without it -- so it must
  // not hold the source hostage.
  await enqueue({
    kind: 'transcribe_source',
    conversationId: job.conversationId,
    payload: { assetId },
  });

  return finish(job, 'done', {
    progress: 100,
    result: { assetId, durationFrames: result.info.durationFrames },
  });
}

/**
 * Transcribe the source.  [Doctrine U-03, D-14]
 *
 * A source with no transcript is a degraded conversation, not a broken one:
 * everything the transcript unlocks is additive, and the core loop works
 * without it. So a missing engine finishes the job with a reason rather than
 * failing it and leaving the project looking damaged.
 */
async function transcribeSource(job: Job): Promise<Job> {
  const assetId = String(job.payload['assetId']);
  const transcriber = await resolveTranscriber(
    typeof job.payload['engineId'] === 'string' ? String(job.payload['engineId']) : undefined,
  );
  if (!transcriber) {
    await audit(job.conversationId, {
      action: 'transcript.skipped',
      detail: { reason: 'no transcription engine is available on this host' },
    });
    return finish(job, 'done', {
      progress: 100,
      result: { skipped: true, reason: 'no transcription engine available' },
    });
  }

  const mezzaninePath = paths.asset(job.conversationId, `${assetId}mezz`, 'mp4');
  const transcript = await transcriber.transcribe(mezzaninePath, assetId);
  const version = await saveTranscript(job.conversationId, transcript);

  await mutateConversation(job.conversationId, (conversation) => {
    conversation.source.transcriptVersion = version;
  });
  await audit(job.conversationId, {
    action: 'transcript.created',
    detail: {
      version, engine: transcript.engine, model: transcript.model,
      words: transcript.words.length,
      sentences: transcript.sentences.length,
      paragraphs: transcript.paragraphs.length,
    },
  });

  return finish(job, 'done', {
    progress: 100,
    result: {
      version, engine: transcript.engine,
      words: transcript.words.length, sentences: transcript.sentences.length,
    },
  });
}

/**
 * Assemble a streamed take and fill in its real duration.
 *
 * Until this completes the take has zero usable frames, so the intervention is
 * simply not renderable yet -- no special "pending" state is needed, because
 * the domain already refuses to render an empty take.
 */
async function assembleTakeJob(job: Job): Promise<Job> {
  const interventionId = String(job.payload['interventionId']);
  const takeId = String(job.payload['takeId']);

  const assembled = await assembleTake(job.conversationId, takeId, {
    prerollSegments: Number(job.payload['prerollSegments'] ?? 0) || 0,
    captureMimeType: job.payload['captureMimeType']
      ? String(job.payload['captureMimeType']) : undefined,
  });

  await mutateConversation(job.conversationId, (conversation) => {
    const intervention = conversation.interventions.find((i) => i.id === interventionId);
    if (!intervention) throw new Error(`intervention ${interventionId} vanished`);
    const index = intervention.takes.findIndex((t) => t.id === takeId);
    const merged: Take = { ...assembled.take, id: takeId as Take['id'] };
    if (index >= 0) intervention.takes[index] = merged;
    else intervention.takes.push(merged);
    intervention.selectedTakeId = merged.id;
  });
  await audit(job.conversationId, {
    action: 'take.assembled',
    detail: {
      interventionId, takeId,
      durationFrames: assembled.take.durationFrames,
      prerollFrames: assembled.take.prerollFrames,
      segments: assembled.segments,
      skippedSegments: assembled.skippedSegments,
    },
  });

  // Caption the response in its own job, for the same reason the source is
  // captioned in its own: the user can carry on recording while it runs.
  await enqueue({
    kind: 'transcribe_take',
    conversationId: job.conversationId,
    payload: { takeId, assetId: assembled.take.assetId },
  });

  return finish(job, 'done', {
    progress: 100,
    result: {
      takeId,
      durationFrames: assembled.take.durationFrames,
      prerollFrames: assembled.take.prerollFrames,
      segments: assembled.segments,
    },
  });
}

/** Transcribe one take, so the response side of the export is captioned too. */
async function transcribeTake(job: Job): Promise<Job> {
  const takeId = String(job.payload['takeId']);
  const assetId = String(job.payload['assetId']);
  const transcriber = await resolveTranscriber();
  if (!transcriber) {
    return finish(job, 'done', { progress: 100, result: { skipped: true } });
  }

  const mediaPath = takeMezzaninePath(job.conversationId, assetId);
  const transcript = await transcriber.transcribe(mediaPath, assetId);
  await saveTakeTranscript(job.conversationId, takeId, transcript);
  await audit(job.conversationId, {
    action: 'transcript.take',
    detail: { takeId, words: transcript.words.length, sentences: transcript.sentences.length },
  });

  return finish(job, 'done', {
    progress: 100,
    result: { takeId, words: transcript.words.length },
  });
}

/**
 * Archive a piece of evidence.  [Doctrine U-33 §1]
 *
 * Until this succeeds the evidence is attached but not archived, and
 * `evidenceAt` will not show it: an unarchived citation is not yet verifiable,
 * so it is not yet put on screen as though it were.
 *
 * A failure is recorded ON the evidence rather than failing the job, because
 * a dead link is the author's problem to see and fix, not a broken project.
 */
async function archiveEvidence(job: Job): Promise<Job> {
  const interventionId = String(job.payload['interventionId']);
  const evidenceId = String(job.payload['evidenceId']);
  const assetId = String(job.payload['assetId']);
  const outDir = paths.evidence(job.conversationId);

  let result: ArchiveResult | null = null;
  let failure: string | null = null;
  try {
    if (job.payload['url']) {
      result = await archiveWeb(String(job.payload['url']), outDir, assetId);
    } else {
      result = await archiveUpload(
        String(job.payload['uploadPath']),
        String(job.payload['kind']) as 'image' | 'document',
        outDir, assetId, String(job.payload['title'] ?? 'Attachment'),
      );
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  await mutateConversation(job.conversationId, (conversation) => {
    const target = conversation.interventions.find((i) => i.id === interventionId);
    const evidence = target?.evidence?.find((e) => e.id === evidenceId);
    if (!evidence) return;
    if (failure || !result) {
      evidence.archived = false;
      evidence.archiveError = failure ?? 'archiving produced nothing';
      return;
    }
    evidence.archived = true;
    delete evidence.archiveError;
    evidence.contentHash = result.contentHash;
    evidence.retrievedAt = result.retrievedAt;
    if (result.title) evidence.title = evidence.title.trim() || result.title;
    if (result.capturePath) evidence.captureAssetId = assetId as never;
  });

  await audit(job.conversationId, {
    action: failure ? 'evidence.archive_failed' : 'evidence.archived',
    detail: {
      evidenceId, interventionId,
      ...(failure ? { error: failure } : {
        contentHash: result?.contentHash,
        hasCapture: Boolean(result?.capturePath),
        note: result?.note,
      }),
    },
  });

  return finish(job, 'done', {
    progress: 100,
    result: failure
      ? { evidenceId, archived: false, error: failure }
      : { evidenceId, archived: true, hasCapture: Boolean(result?.capturePath), note: result?.note },
  });
}

async function render(job: Job): Promise<Job> {
  const conversation = await loadConversation(job.conversationId);
  const exportProfileId = String(job.payload['exportProfileId'] ?? 'youtube_16x9');
  const burnInCaptions = job.payload['burnInCaptions'] !== false;

  const plan = buildRenderPlan(conversation, {
    exportProfileId,
    burnInCaptions,
    accessedAt: conversation.createdAt,
  });

  const workDir = paths.render(conversation.id, plan.planHash);
  await mkdir(workDir, { recursive: true });
  const outputPath = join(workDir, 'FINAL.mp4');
  const sourceMezz = paths.asset(
    conversation.id, `${conversation.source.mezzanineAssetId}mezz`, 'mp4',
  );

  // Captions are assembled here, from the transcripts, and mapped onto the
  // output clock. Every export ships them (INV-07).
  const sourceTranscript = await loadTranscript(conversation.id);
  const takeTranscripts = await loadAllTakeTranscripts(conversation.id);
  const cues = buildCues(conversation, projectTimeline(conversation), {
    source: sourceTranscript?.transcript ?? null,
    takes: takeTranscripts,
  });

  let lastReported = -1;
  const result = await compose(plan, {
    workDir,
    outputPath,
    cues,
    resolveAsset: (assetId: AssetId) =>
      assetId === conversation.source.mezzanineAssetId
        ? sourceMezz
        : takeMezzaninePath(conversation.id, assetId),
    resolveEvidence: (assetId: AssetId) => paths.evidenceCapture(conversation.id, assetId),
    onProgress: (info) => {
      const frame = Number(info['frame'] ?? NaN);
      if (!Number.isFinite(frame) || plan.totalOutputFrames === 0) return;
      const pct = Math.min(99, Math.round((frame / plan.totalOutputFrames) * 100));
      if (pct !== lastReported) {
        lastReported = pct;
        void update({ ...job, progress: pct });
      }
    },
  });

  await audit(conversation.id, {
    action: 'render.completed',
    detail: {
      planHash: plan.planHash, exportProfileId,
      totalOutputFrames: plan.totalOutputFrames,
      shotsRendered: result.shotsRendered, shotsCached: result.shotsCached,
      sourceRatio: Number(plan.sourceRatio.toFixed(3)),
      cues: cues.length,
    },
  });

  return finish(job, 'done', {
    progress: 100,
    result: {
      planHash: plan.planHash,
      outputPath: result.outputPath,
      srtPath: result.srtPath,
      vttPath: result.vttPath,
      totalOutputFrames: result.totalOutputFrames,
      shotsRendered: result.shotsRendered,
      shotsCached: result.shotsCached,
      cues: cues.length,
    },
  });
}

async function main(): Promise<void> {
  await ensureDirs();
  process.stdout.write('balancevid worker ready\n');
  let stopping = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => { stopping = true; });
  }

  while (!stopping) {
    const job = await claim();
    if (!job) { await new Promise((r) => setTimeout(r, POLL_MS)); continue; }
    process.stdout.write(`${job.kind} ${job.id} ...\n`);
    try {
      const done = await runJob(job);
      process.stdout.write(`  done ${JSON.stringify(done.result ?? {})}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`  failed: ${message}\n`);
      await finish(job, 'failed', { error: message });
      await audit(job.conversationId, { action: `${job.kind}.failed`, detail: { error: message } });
    }
  }
  process.stdout.write('worker stopped\n');
}

if (process.argv[1]?.includes('worker')) void main();
