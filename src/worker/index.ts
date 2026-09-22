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

const POLL_MS = 400;

export async function runJob(job: Job): Promise<Job> {
  switch (job.kind) {
    case 'ingest_source': return ingestSource(job);
    case 'assemble_take': return assembleTakeJob(job);
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

  return finish(job, 'done', {
    progress: 100,
    result: { assetId, durationFrames: result.info.durationFrames },
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
    },
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

  let lastReported = -1;
  const result = await compose(plan, {
    workDir,
    outputPath,
    resolveAsset: (assetId: AssetId) =>
      assetId === conversation.source.mezzanineAssetId
        ? sourceMezz
        : takeMezzaninePath(conversation.id, assetId),
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
