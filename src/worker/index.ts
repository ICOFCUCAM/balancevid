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
import { buildAttribution, buildRenderPlan, type RenderPlan } from '../domain/plan.js';
import { buildClipPlan, buildClipTimeline } from '../domain/clips.js';
import { buildReelPlan, buildReelTimeline } from '../domain/reel.js';
import { compose } from '../render/compose.js';
import { ingest, makeProxy } from '../render/ingest.js';
import { renderThumbnail, renderTakePoster } from '../render/thumbnails.js';
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
import { buildBundle } from '../publish/bundle.js';
import { HOUSE_FPS } from '../domain/time.js';
import { EXPORT_PROFILES } from '../domain/presentation.js';

const POLL_MS = 400;

export async function runJob(job: Job): Promise<Job> {
  switch (job.kind) {
    case 'ingest_source': return ingestSource(job);
    case 'transcribe_source': return transcribeSource(job);
    case 'assemble_take': return assembleTakeJob(job);
    case 'transcribe_take': return transcribeTake(job);
    case 'archive_evidence': return archiveEvidence(job);
    case 'render': return render(job);
    case 'render_clip': return renderClip(job);
    case 'render_reel': return renderReel(job);
    case 'render_thumbnails': return renderThumbnails(job);
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

  /*
   * The still, BEFORE the duration is recorded.
   *
   * The order matters and used to be the other way round. A take's duration
   * going above zero is what tells every surface the still exists, so writing
   * the duration first opens a window — short, but every poll lands in it —
   * where the document advertises a picture that is not on disk yet. The
   * image 404s, and a client that drops a broken image never asks again: the
   * still is simply missing for the rest of the session even though the file
   * arrived a moment later. Nothing announces the take until everything it
   * promises is there.
   *
   * A failure still costs a chip on a timeline and never the take, so it is
   * caught and recorded rather than allowed to fail the job (D-07).
   */
  try {
    const take = assembled.take;
    await renderTakePoster(
      takeMezzaninePath(job.conversationId, take.assetId),
      paths.takePoster(job.conversationId, take.assetId),
      take.mediaInFrame + HOUSE_FPS,
    );
  } catch (error) {
    await audit(job.conversationId, {
      action: 'take.poster_failed',
      detail: { takeId, reason: error instanceof Error ? error.message : String(error) },
    });
  }

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
    /*
     * A paged document keeps its pages in order. The asset ids follow the
     * files the rasteriser wrote — `<assetId>p1`, `p2`, … — so the store's
     * own path helper resolves them without a second naming scheme.
     */
    if (result.pagePaths?.length) {
      evidence.pageAssetIds = result.pagePaths
        .map((_, i) => `${assetId}p${i + 1}`) as never;
      evidence.pageCount = result.pageCount ?? result.pagePaths.length;
      // Page one unless the author has already said which page they mean.
      if (!evidence.locator.page) evidence.locator.page = 1;
    }
    if (result.note) evidence.archiveNote = result.note;
    else delete evidence.archiveNote;
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

  // Captions are assembled here, from the transcripts, and mapped onto the
  // output clock. Every export ships them (INV-07).
  const sourceTranscript = await loadTranscript(conversation.id);
  const takeTranscripts = await loadAllTakeTranscripts(conversation.id);
  const cues = buildCues(conversation, projectTimeline(conversation), {
    source: sourceTranscript?.transcript ?? null,
    takes: takeTranscripts,
  });

  const result = await compose(plan, {
    workDir,
    outputPath,
    cues,
    resolveAsset: assetResolver(conversation),
    resolveEvidence: (assetId: AssetId) => paths.evidenceCapture(conversation.id, assetId),
    onProgress: progressReporter(job, plan),
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

  // "The user finishes the render and has everything required to publish,
  // already written." Thumbnails are the one part of the bundle that needs a
  // decoder, so the export queues them rather than making the author ask. [U-30]
  await enqueue({
    kind: 'render_thumbnails',
    conversationId: conversation.id,
    payload: { exportProfileId },
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

/**
 * Render one claim-and-response pair as a vertical clip.  [Doctrine U-22]
 *
 * Same planner, same compositor, different timeline. A clip is not a second
 * rendering path -- if it were, it would drift from the first.
 */
async function renderClip(job: Job): Promise<Job> {
  const conversation = await loadConversation(job.conversationId);
  const interventionId = String(job.payload['interventionId']);
  const sourceTranscript = await loadTranscript(job.conversationId);

  const plan = buildClipPlan(conversation, interventionId, {
    transcript: sourceTranscript?.transcript ?? null,
    accessedAt: conversation.createdAt,
  });

  const workDir = paths.render(conversation.id, plan.planHash);
  await mkdir(workDir, { recursive: true });
  const outputPath = join(workDir, 'FINAL.mp4');

  const timeline = buildClipTimeline(
    conversation, interventionId, sourceTranscript?.transcript ?? null);
  const cues = buildCues(conversation, timeline, {
    source: sourceTranscript?.transcript ?? null,
    takes: await loadAllTakeTranscripts(conversation.id),
  });

  const result = await compose(plan, {
    workDir, outputPath, cues,
    resolveAsset: assetResolver(conversation),
    resolveEvidence: (assetId: AssetId) => paths.evidenceCapture(conversation.id, assetId),
    onProgress: progressReporter(job, plan),
  });

  await audit(conversation.id, {
    action: 'clip.rendered',
    detail: {
      interventionId, planHash: plan.planHash,
      totalOutputFrames: plan.totalOutputFrames,
      seconds: Number((plan.totalOutputFrames / plan.exportProfile.fps).toFixed(1)),
    },
  });

  return finish(job, 'done', {
    progress: 100,
    result: {
      interventionId,
      planHash: plan.planHash,
      outputPath: result.outputPath,
      totalOutputFrames: result.totalOutputFrames,
      seconds: Number((plan.totalOutputFrames / plan.exportProfile.fps).toFixed(1)),
    },
  });
}

/**
 * Render the response reel.  [Doctrine U-01]
 *
 * The author's own material, in order, with the claim each response answers
 * shown as typography. No provider footage, structurally: the timeline has no
 * source segment for any to appear in.
 */
async function renderReel(job: Job): Promise<Job> {
  const conversation = await loadConversation(job.conversationId);
  const plan = buildReelPlan(conversation, { accessedAt: conversation.createdAt });

  const workDir = paths.render(conversation.id, plan.planHash);
  await mkdir(workDir, { recursive: true });
  const outputPath = join(workDir, 'FINAL.mp4');

  const cues = buildCues(conversation, buildReelTimeline(conversation), {
    source: null,
    takes: await loadAllTakeTranscripts(conversation.id),
  });

  const result = await compose(plan, {
    workDir, outputPath, cues,
    resolveAsset: assetResolver(conversation),
    resolveEvidence: (assetId: AssetId) => paths.evidenceCapture(conversation.id, assetId),
    onProgress: progressReporter(job, plan),
  });

  await audit(conversation.id, {
    action: 'reel.rendered',
    detail: {
      planHash: plan.planHash,
      responses: plan.shots.length,
      totalOutputFrames: plan.totalOutputFrames,
    },
  });

  return finish(job, 'done', {
    progress: 100,
    result: {
      planHash: plan.planHash,
      outputPath: result.outputPath,
      totalOutputFrames: result.totalOutputFrames,
      responses: plan.shots.length,
    },
  });
}

/**
 * Thumbnail candidates, rendered.  [Doctrine U-30]
 *
 * One failed candidate does not fail the set: an author with five usable
 * thumbnails and one missing is in a better position than an author with a
 * failed job and none.
 */
async function renderThumbnails(job: Job): Promise<Job> {
  const conversation = await loadConversation(job.conversationId);
  const profile = EXPORT_PROFILES[String(job.payload['exportProfileId'] ?? 'youtube_16x9')]
    ?? EXPORT_PROFILES['youtube_16x9']!;
  const sourceTranscript = await loadTranscript(conversation.id);
  const attribution = buildAttribution(conversation, conversation.createdAt).text;

  const bundle = buildBundle({
    conversation,
    sourceTranscript: sourceTranscript?.transcript ?? null,
    generatedAt: new Date().toISOString(),
    attribution,
  });

  const outDir = paths.thumbnails(conversation.id);
  await mkdir(outDir, { recursive: true });
  const resolve = assetResolver(conversation);
  const rendered: string[] = [];
  const failed: string[] = [];
  let done = 0;

  for (const candidate of bundle.thumbnails) {
    const outPath = paths.thumbnail(conversation.id, candidate.id);
    try {
      let mediaPath: string | undefined;
      if (candidate.kind === 'frame') {
        if (!conversation.source.mezzanineAssetId) throw new Error('source not yet normalised');
        mediaPath = resolve(conversation.source.mezzanineAssetId);
      } else if (candidate.kind === 'take') {
        const take = conversation.interventions
          .flatMap((i) => i.takes).find((t) => t.id === candidate.takeId);
        if (!take) throw new Error('take no longer in the document');
        mediaPath = takeMezzaninePath(conversation.id, take.assetId);
      }
      await renderThumbnail({
        candidate,
        profile,
        ...(mediaPath ? { mediaPath } : {}),
        outPath,
        scratchDir: outDir,
        attribution,
      });
      rendered.push(candidate.id);
    } catch (error) {
      failed.push(`${candidate.id}: ${(error as Error).message}`);
    }
    done += 1;
    job.progress = Math.round((done / bundle.thumbnails.length) * 100);
    await update(job);
  }

  await audit(conversation.id, {
    action: 'thumbnails.rendered',
    detail: { rendered: rendered.length, failed: failed.length, profile: profile.id },
  });

  return finish(job, 'done', {
    progress: 100,
    result: { rendered, ...(failed.length > 0 ? { failed } : {}) },
  });
}

/** One resolver, so both render paths read assets the same way. */
function assetResolver(conversation: { id: string; source: { mezzanineAssetId?: string } }) {
  return (assetId: AssetId): string =>
    assetId === conversation.source.mezzanineAssetId
      ? paths.asset(conversation.id, `${conversation.source.mezzanineAssetId}mezz`, 'mp4')
      : takeMezzaninePath(conversation.id, assetId);
}

/** Real progress, never a spinner without a number (D-13). */
function progressReporter(job: Job, plan: RenderPlan) {
  let last = -1;
  return (info: Record<string, string>): void => {
    const frame = Number(info['frame'] ?? NaN);
    if (!Number.isFinite(frame) || plan.totalOutputFrames === 0) return;
    const pct = Math.min(99, Math.round((frame / plan.totalOutputFrames) * 100));
    if (pct !== last) {
      last = pct;
      void update({ ...job, progress: pct });
    }
  };
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
