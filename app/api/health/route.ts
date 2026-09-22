import { access, constants, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { VAR_ROOT, ensureDirs } from '../../../src/store/paths.js';
import { listJobs } from '../../../src/store/queue.js';
import { json } from '../../../src/web/http.js';

export const dynamic = 'force-dynamic';

/**
 * Is this instance actually able to work?  [Doctrine D-13, D-14]
 *
 * Not "is the process up" — a Next.js server answers that by existing. The
 * things that break in a deployment are the volume failing to mount and the
 * worker dying quietly, and both leave a perfectly responsive web tier in
 * front of an application that silently accepts recordings it can never
 * render. So this checks that storage is writable and reports whether
 * anything is draining the queue.
 */
export async function GET(): Promise<Response> {
  const checks: Record<string, unknown> = {};
  let ok = true;

  // Writable storage. A read-only or unmounted volume is the failure mode of
  // every container deployment, and it is invisible until someone records.
  const probe = join(VAR_ROOT, `.health-${process.pid}`);
  try {
    // Creating the tree is part of the check: on a fresh volume nothing
    // exists yet, and "can we make the directories" is the real question.
    await ensureDirs();
    await writeFile(probe, 'ok', 'utf8');
    await rm(probe, { force: true });
    checks['storage'] = { writable: true, root: VAR_ROOT };
  } catch (error) {
    ok = false;
    checks['storage'] = {
      writable: false, root: VAR_ROOT,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  // The worker is a separate process and may be a separate machine. The web
  // tier cannot prove it is alive, but it can say how much work is waiting —
  // a pending count that only grows is the symptom of a dead worker. [U-23]
  try {
    const jobs = await listJobs();
    const pending = jobs.filter((j) => j.state === 'pending').length;
    const running = jobs.filter((j) => j.state === 'running').length;
    const oldestPending = jobs
      .filter((j) => j.state === 'pending')
      .map((j) => j.createdAt).sort()[0];
    checks['queue'] = { pending, running, ...(oldestPending ? { oldestPending } : {}) };
  } catch (error) {
    ok = false;
    checks['queue'] = { error: error instanceof Error ? error.message : String(error) };
  }

  // Transcription is additive: a conversation without it is degraded, not
  // broken (the core loop never depended on it), so a missing model is
  // reported and does not fail the check.
  try {
    await access(join(process.env['BALANCEVID_MODELS']
      ?? join(process.cwd(), 'var', 'models'), 'silero_vad.onnx'), constants.R_OK);
    checks['transcription'] = { available: true };
  } catch {
    checks['transcription'] = { available: false, note: 'sources will not be transcribed' };
  }

  return json({ ok, checks }, { status: ok ? 200 : 503 });
}
