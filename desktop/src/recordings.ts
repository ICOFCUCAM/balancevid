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
import {
  appendFile, mkdir, readFile, readdir, rename, rm, stat, writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import { NAME_LONGEST, asOrigin } from '../../shared/src/connections.js';

import { type Capture, captureOf } from '../../shared/src/capture.js';
import { type Destination, type Sending, readSending } from './submit.js';

/** The file in a capture's directory that says what it is. */
export const MANIFEST = 'capture.json';

/**
 * Where this capture is going, and how far it has got.
 *   [TAKE-DESKTOP T-5, D-21]
 *
 * A SECOND FILE AND NOT A FIELD ON THE MANIFEST, because the
 * manifest is the shared `Capture` — the record the
 * INSTALLATION reads, the one a person opens in a file manager
 * beside the videos, the one somebody copies onto a stick with
 * them. A credential in it would be a credential in all of
 * those places. *"A stream key in one is a stream key in
 * somebody's backup."* [D-21]
 *
 * AND IT IS THE CAPTURE'S OWN, deleted with it. A station-wide
 * list of what is half-sent would have to carry a credential
 * per entry, which is the list `store/requests.ts` refuses to
 * build on the other side of this same protocol.
 */
export const SENDING = 'sending.json';

/** What `sending.json` holds: the progress, plus where it goes. */
export interface Stored extends Sending {
  to?: Destination;
}

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

/**
 * Where a capture is going, as this machine recorded it.
 *
 * READ THROUGH THE SHARED RULES, never believed as JSON: this
 * is a file in a directory a person can open, and a
 * hand-written count would make the sender skip pieces nobody
 * sent. A file that cannot be read is a capture nothing has
 * been sent of, which is true of every capture before this
 * stage existed. [D-21]
 */
export async function readSendingOf(id: string): Promise<Stored> {
  try {
    const raw = await readFile(join(captureDir(id), SENDING), 'utf8');
    const said: unknown = JSON.parse(raw);
    const read = readSending(said);
    const to = (said as { to?: unknown })?.to;
    return { ...read, ...(destinationFrom(to) ? { to: destinationFrom(to)! } : {}) };
  } catch {
    return { done: {} };
  }
}

/**
 * A destination off the disk, or nothing.
 *
 * THE ORIGIN GOES THROUGH `asOrigin`, the same parser both
 * programs use, so a hand-edited file cannot point a capture
 * station at something that is not an origin. The link's shape
 * is checked too: it is about to be put in a URL path.
 */
export function destinationFrom(raw: unknown): Destination | null {
  if (!raw || typeof raw !== 'object') return null;
  const said = raw as Record<string, unknown>;
  const origin = typeof said['origin'] === 'string'
    ? asOrigin(said['origin']) : null;
  const link = said['link'];
  if (!origin || typeof link !== 'string') return null;
  if (!/^[A-Za-z0-9_-]{1,160}\.[A-Za-z0-9_-]{1,160}$/.test(link)) return null;
  return {
    origin,
    link,
    name: String(said['name'] ?? '').slice(0, NAME_LONGEST) || origin,
  };
}

/** Write it, temp-then-rename, like every other record here. */
export async function writeSendingOf(id: string, record: Stored): Promise<void> {
  const target = join(captureDir(id), SENDING);
  const temp = `${target}.${process.pid}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(record, null, 2), 'utf8');
    await rename(temp, target);
  } catch {
    /*
     * A CAPTURE WHOSE PROGRESS CANNOT BE WRITTEN STILL SENDS.
     * What is lost is the resume, not the upload — and telling
     * an operator their send failed because a note about it
     * could not be filed would be refusing to do the work over
     * the paperwork. [U-19]
     */
  }
}

/** One capture's manifest, or nothing. */
export async function oneCapture(id: string): Promise<Capture | null> {
  try {
    const raw = await readFile(join(captureDir(id), MANIFEST), 'utf8');
    const read: unknown = JSON.parse(raw);
    if (!read || typeof read !== 'object') return null;
    const said = read as Capture;
    return Array.isArray(said.angles) ? said : null;
  } catch {
    return null;
  }
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
      const raw = await readFile(join(capturesDir(), name, MANIFEST), 'utf8');
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
