/**
 * The as-run, on disk.  [Doctrine CHANNEL §5, §18, D-18, D-20, C-32]
 *
 *     var/asrun/<channel>/2026-10-02.jsonl
 *
 * WRITTEN BY THE ENGINE, READ BY THE WEB TIER, which is the same
 * division every other fact those two processes share lives under
 * (§11, D-20): the engine is the only thing that knows what it put
 * out, and the web tier is the only thing that can hand it to
 * anybody.
 *
 * APPEND-ONLY, AND ONE FILE PER UTC DAY. Append-only because an
 * as-run that can be rewritten is not evidence, and a day per file
 * because that is the unit people ask for one in. UTC because a log
 * whose days turn in the channel's local zone has a day with
 * twenty-five hours in it once a year.
 *
 * AND NOTHING SWEEPS IT. D-18 is careful that segments are transport
 * and not an archive — written, served for half a minute, deleted.
 * The as-run is the opposite by design: it is the record that
 * survives them. It is also small, because it is coalesced before it
 * gets here: a day of broadcasting is a few dozen lines.
 *
 * THE LAST LINE IS REWRITTEN, which is the one concession. A stretch
 * grows four seconds at a time for as long as a programme lasts, and
 * appending a line per segment would turn a half-hour programme into
 * 450 lines. So the open stretch is held in memory by the caller and
 * only its final shape is appended — see `closeTo`.
 */

import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

import type { Ran } from '../domain/asRun.js';
import { VAR_ROOT, safe } from './paths.js';

const ROOT = join(VAR_ROOT, 'asrun');

/** The UTC day an instant belongs to. */
export function dayOf(atMs: number): string {
  return new Date(atMs).toISOString().slice(0, 10);
}

function fileFor(channelId: string, day: string): string {
  return join(ROOT, safe(channelId), `${day}.jsonl`);
}

/**
 * Write one finished stretch down.
 *
 * FILED UNDER THE DAY IT STARTED, so a programme running through
 * midnight is one row in one file rather than two halves nobody can
 * join. The row's own instants say where it ended.
 */
export async function recordRan(channelId: string, ran: Ran): Promise<void> {
  const path = fileFor(channelId, dayOf(ran.fromMs));
  await mkdir(join(ROOT, safe(channelId)), { recursive: true });
  await appendFile(path, `${JSON.stringify(ran)}\n`, 'utf8');
}

/** Everything transmitted on one UTC day. */
export async function readRan(
  channelId: string, day: string,
): Promise<Ran[]> {
  try {
    const body = await readFile(fileFor(channelId, safe(day)), 'utf8');
    return body.split('\n').filter(Boolean).map((line) => {
      try { return JSON.parse(line) as Ran; } catch { return null; }
    }).filter((one): one is Ran => one !== null);
  } catch {
    return [];
  }
}

/** Which days there is a log for, newest first. */
export async function ranDays(channelId: string): Promise<string[]> {
  try {
    return (await readdir(join(ROOT, safe(channelId))))
      .filter((name) => name.endsWith('.jsonl'))
      .map((name) => name.replace(/\.jsonl$/, ''))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}
