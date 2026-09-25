/**
 * A durable render queue.  [Doctrine U-23, D-14]
 *
 * "The web tier is stateless, never runs ffmpeg, never blocks on a render."
 * One forty-minute export must not make the application unusable for everyone
 * else -- that is how video products die on their first popular day.
 *
 * Jobs are files, claimed by atomic rename. That gives at-least-once delivery
 * and single-consumer safety on one machine with no broker, and the shot cache
 * (U-16) makes a re-run after a worker loss cheap.
 */

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { newId } from '../domain/ids.js';
import { ensureDirs, paths, safe, type QueueState } from './paths.js';

/**
 * Every kind of work that shells out to ffmpeg. None of it may happen in the
 * web tier, so source ingest and take assembly are queued exactly like a
 * render is.
 */
export type JobKind =
  | 'ingest_source'
  | 'transcribe_source'
  | 'assemble_take'
  | 'transcribe_take'
  | 'archive_evidence'
  | 'render'
  | 'render_clip'
  | 'render_reel'
  | 'render_thumbnails'
  | 'render_card'
  /* Studio Two. The conversationId field carries a performance id for these —
   * see the note on `Job` for why that is a rename waiting to happen rather
   * than a second queue. [STUDIO-TWO S-1] */
  | 'ingest_master'
  | 'ingest_plate'
  | 'assemble_performance_take'
  | 'render_performance'
  | 'render_performance_clip'
  | 'render_performance_card'
  | 'render_audio';

export interface Job {
  id: string;
  kind: JobKind;
  /**
   * Which document this job is about.
   *
   * A Performance id goes here too, and the field keeps the old name on
   * purpose for now: renaming it to `documentId` touches every job, every
   * route that lists them and every stored job on disk, which is a migration
   * rather than a rename. It is named here as a debt so it is not mistaken
   * for a design. [STUDIO-TWO S-1]
   */
  conversationId: string;
  createdAt: string;
  state: QueueState;
  payload: Record<string, unknown>;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
  /** Real progress, so the UI never shows a spinner without a number (D-13). */
  progress?: number;
  result?: Record<string, unknown>;
}

export async function enqueue(job: Omit<Job, 'id' | 'createdAt' | 'state'>): Promise<Job> {
  await ensureDirs();
  const full: Job = {
    ...job,
    id: newId('job'),
    createdAt: new Date().toISOString(),
    state: 'pending',
  };
  await write(full);
  return full;
}

/** Claim one job. The rename is the lock: it succeeds for exactly one worker. */
export async function claim(): Promise<Job | null> {
  await ensureDirs();
  const names = (await readdir(paths.queueState('pending'))).filter((n) => n.endsWith('.json')).sort();
  for (const name of names) {
    const from = join(paths.queueState('pending'), name);
    const to = join(paths.queueState('running'), name);
    try {
      await rename(from, to);
    } catch {
      continue; // another worker won the race
    }
    const job = JSON.parse(await readFile(to, 'utf8')) as Job;
    const claimed: Job = { ...job, state: 'running', startedAt: new Date().toISOString() };
    await writeFile(to, JSON.stringify(claimed, null, 2), 'utf8');
    return claimed;
  }
  return null;
}

export async function update(job: Job): Promise<void> {
  await writeFile(join(paths.queueState(job.state), `${safe(job.id)}.json`), JSON.stringify(job, null, 2), 'utf8');
}

export async function finish(job: Job, state: 'done' | 'failed', patch: Partial<Job> = {}): Promise<Job> {
  const next: Job = { ...job, ...patch, state, finishedAt: new Date().toISOString() };
  await mkdir(paths.queueState(state), { recursive: true });
  // Write the finished record FIRST, then drop the running one. Renaming the
  // running file over the finished record would overwrite the result with the
  // stale claim-time copy, leaving every completed job reading as 'running'.
  await writeFile(join(paths.queueState(state), `${safe(job.id)}.json`), JSON.stringify(next, null, 2), 'utf8');
  await rm(join(paths.queueState('running'), `${safe(job.id)}.json`), { force: true });
  return next;
}

export async function findJob(id: string): Promise<Job | null> {
  for (const state of ['done', 'failed', 'running', 'pending'] as const) {
    try {
      return JSON.parse(await readFile(join(paths.queueState(state), `${safe(id)}.json`), 'utf8')) as Job;
    } catch { /* next */ }
  }
  return null;
}

export async function listJobs(conversationId?: string): Promise<Job[]> {
  await ensureDirs();
  const out: Job[] = [];
  for (const state of ['running', 'pending', 'done', 'failed'] as const) {
    for (const name of await readdir(paths.queueState(state))) {
      if (!name.endsWith('.json')) continue;
      try {
        const job = JSON.parse(await readFile(join(paths.queueState(state), name), 'utf8')) as Job;
        if (!conversationId || job.conversationId === conversationId) out.push(job);
      } catch { /* skip */ }
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function write(job: Job): Promise<void> {
  await writeFile(join(paths.queueState(job.state), `${safe(job.id)}.json`), JSON.stringify(job, null, 2), 'utf8');
}
