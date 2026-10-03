/**
 * Where a capture goes on this machine.  [Doctrine U-06, D-21;
 * TAKE-DESKTOP T-4]
 *
 * > *"All recorders start from one call, to local disk."*
 *
 * ONE DIRECTORY PER CAPTURE, with one file per angle and one
 * `capture.json` beside them. A person who opens it in a file
 * manager sees four videos and the thing that says how they go
 * together, which is what a capture IS.
 *
 * SEGMENTS ARE APPENDED, NOT COLLECTED. `useMasterRecording`
 * sends four-second chunks because *"a browser that crashes
 * mid-song has still left evidence that somebody was
 * recording"*, and the same reasoning decides the same thing
 * here with more force: a capture station crash forty minutes
 * into a performance must leave forty minutes on the disk, not
 * nothing. Each chunk is appended to its angle's file as it
 * arrives, so the file on disk is always as long as the
 * recording is.
 *
 * THE MANIFEST IS WRITTEN AT THE START AND AGAIN AT THE END. At
 * the start, so a directory found after a crash says what it was
 * and when it began; at the end, so it carries the measured
 * starts and the spread. The first write is the evidence; the
 * second is the record.
 *
 * NOTHING HERE DECIDES ANY NUMBER. The offsets and the spread are
 * `shared/src/capture.ts`'s, because the installation reads them
 * and the two ends must agree. This writes them down. [D-19, B-1]
 */

import { app } from 'electron';
import { appendFile, mkdir, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { type Capture, captureOf } from '../../shared/src/capture.js';

/** The file in a capture's directory that says what it is. */
export const MANIFEST = 'capture.json';

export function capturesDir(): string {
  return join(app.getPath('userData'), 'captures');
}

export function captureDir(id: string): string {
  /*
   * THE ID IS CHECKED BEFORE IT IS A PATH. It comes from the
   * renderer, and a renderer is a web page: `../../` in an id
   * would be a capture written wherever that led. The ids this
   * application makes are hex and underscores; anything else is
   * not one.
   */
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('not a capture id');
  return join(capturesDir(), id);
}

/** A name a file manager sorts usefully. `cap_20261003T104500_a1b2`. */
export function captureId(at = new Date(), random = Math.random()): string {
  const stamp = at.toISOString().replace(/[-:]/g, '').replace(/\..*/, '');
  return `cap_${stamp}_${random.toString(36).slice(2, 6)}`;
}

/**
 * Open a capture: make its directory and write what is known.
 *
 * DECLARED BEFORE THE MEDIA EXISTS, which is `RecordingSink`'s
 * own first rule — *"a browser that crashes mid-song has still
 * left evidence that somebody was recording, and chunks arriving
 * for a recording nobody declared would have nowhere to go."*
 */
export async function beginCapture(
  id: string, label: string, beganAt: string,
): Promise<string> {
  const dir = captureDir(id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, MANIFEST), JSON.stringify({
    id, label, beganAt, sampleRate: 0, spreadMs: 0,
    startedTogether: false, angles: [],
  } satisfies Capture, null, 2), 'utf8');
  return dir;
}

/**
 * One chunk, appended to its angle's file.
 *
 * APPENDED RATHER THAN NUMBERED-THEN-JOINED, which is where this
 * differs from the browser's sink and the reason is the
 * destination. The Take App numbers its chunks because they
 * travel over a network that drops them and arrive out of order;
 * a local disk does neither. What a join would buy here is a
 * second copy of every file at the end of a recording, on the
 * disk whose free space PREPARE just finished worrying about.
 */
export async function writeChunk(
  id: string, file: string, bytes: Uint8Array,
): Promise<number> {
  if (!/^[A-Za-z0-9_.-]{1,80}$/.test(file)) throw new Error('not an angle file');
  const target = join(captureDir(id), file);
  await appendFile(target, bytes);
  return bytes.byteLength;
}

/**
 * Close a capture: write what was measured.
 *
 * TEMP THEN RENAME, like every other record in this product. A
 * manifest half-written is a capture that reads as corrupt, and
 * the videos beside it are perfectly good.
 */
export async function endCapture(
  spec: Parameters<typeof captureOf>[0],
): Promise<Capture> {
  const made = captureOf(spec);
  const dir = captureDir(made.id);
  const target = join(dir, MANIFEST);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(made, null, 2), 'utf8');
  await rename(temp, target);
  return made;
}

/** What each angle's file actually weighs, once it is closed. */
export async function sizesIn(
  id: string, files: readonly string[],
): Promise<Record<string, number>> {
  const dir = captureDir(id);
  const out: Record<string, number> = {};
  await Promise.all(files.map(async (file) => {
    out[file] = await stat(join(dir, file))
      .then((one) => one.size)
      .catch(() => 0);
  }));
  return out;
}

/** Every capture on this machine, newest first. */
export async function listCaptures(): Promise<Capture[]> {
  let names: string[];
  try {
    names = await readdir(capturesDir());
  } catch {
    return [];
  }
  const found: Capture[] = [];
  for (const name of names.sort().reverse()) {
    try {
      const raw = await import('node:fs/promises')
        .then((fs) => fs.readFile(join(capturesDir(), name, MANIFEST), 'utf8'));
      const read: unknown = JSON.parse(raw);
      if (read && typeof read === 'object') found.push(read as Capture);
    } catch {
      /* A directory with no readable manifest is not a capture
         this screen can say anything about. The files are still
         there for a person to find. */
    }
  }
  return found;
}

/** Throw one away, whole. */
export async function removeCapture(id: string): Promise<void> {
  await rm(captureDir(id), { recursive: true, force: true });
}
