/**
 * How long a thing is, asked once.  [Doctrine CHANNEL §25, C-14; D-18]
 *
 * *"[ Song — Ancient Days   04:04 ]"*
 *
 * THE LIBRARY HAS NEVER KNOWN. `broadcastLibrary`'s own header says it
 * supplies *"the one thing a scheduler needs that a render does not carry:
 * how long it is"* — and `BroadcastItem` has no duration field. It never
 * did. The studio compensated by printing megabytes where a duration
 * belongs, and by defaulting every scheduled slot to fifteen minutes,
 * which is a number nobody chose about a programme nobody measured.
 *
 * WHY NOT ASK THE DOCUMENT. A conversation's timeline and a performance's
 * export both know their exact output length, and both would be the length
 * of the document AS IT IS NOW — not of the file on disk, which was
 * rendered from a plan that may since have changed. A schedule points at a
 * FILE. So the file is what is measured.
 *
 * WHY NOT `probe()`. It counts frames by decoding, which is exact and is
 * far too slow to run over a library on every listing: the author's own
 * installation has thirty renders and a control room that took thirty
 * decodes to draw its left rail would be a control room nobody opens. The
 * container's own duration is accurate to a few milliseconds, and a
 * schedule slot is milliseconds by design — *"nothing here has to be
 * frame-exact against anything else"* (`Programme.durationMs`).
 *
 * AND IT IS ASKED ONCE. The answer is written beside the file it is about,
 * with the size and modification time it was measured from, so a file that
 * is replaced is measured again and a file that is not is never measured
 * twice. A sidecar rather than a central index, for the reason D-18 gives
 * about everything else here: an index is a second place the truth lives.
 */

import { readFile, rename, stat, writeFile } from 'node:fs/promises';

import { ffprobe } from '../render/ffmpeg.js';

export interface MediaFacts {
  durationMs: number;
  hasVideo: boolean;
  hasAudio: boolean;
  width: number;
  height: number;
}

interface Sidecar extends MediaFacts {
  /** What the file was when this was measured. */
  bytes: number;
  modifiedAt: string;
  measuredAt: string;
}

/**
 * Is a remembered measurement still about this file?
 *
 * SIZE AND MODIFICATION TIME, both. Either alone is a real collision: a
 * re-render of the same plan produces a file of the same length at a new
 * time, and a file restored from a backup carries an old time at the same
 * length. Pure, so the rule is testable without a filesystem.
 */
export function fresh(
  sidecar: Pick<Sidecar, 'bytes' | 'modifiedAt'> | null,
  file: { bytes: number; modifiedAt: string },
): boolean {
  if (!sidecar) return false;
  return sidecar.bytes === file.bytes && sidecar.modifiedAt === file.modifiedAt;
}

/**
 * Read what ffprobe said, without trusting that it said anything.
 *
 * A container with no duration, a stream with no dimensions and a file
 * ffprobe cannot open all end in the same place: no facts, and the caller
 * shows an em dash. An invented zero would be a claim — `clock()` in the
 * domain is built around exactly that distinction.
 */
export function readProbe(raw: string): MediaFacts | null {
  let json: {
    format?: { duration?: string };
    streams?: Array<Record<string, unknown>>;
  };
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const streams = json.streams ?? [];
  const video = streams.find((one) => one['codec_type'] === 'video');
  const audio = streams.find((one) => one['codec_type'] === 'audio');
  const seconds = Number(json.format?.duration ?? Number.NaN);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return {
    durationMs: Math.round(seconds * 1000),
    hasVideo: Boolean(video),
    hasAudio: Boolean(audio),
    width: Number(video?.['width'] ?? 0),
    height: Number(video?.['height'] ?? 0),
  };
}

const SIDECAR = (file: string) => `${file}.facts.json`;

/**
 * The facts about one file, measured once and remembered beside it.
 *
 * NEVER THROWS. A library listing that failed because one file in it is
 * unreadable would be a control room that cannot draw its rail because
 * somebody deleted a render — and the rail is how they would find that
 * out. Unmeasurable is a state, and it is `null`.
 */
export async function factsFor(file: string): Promise<MediaFacts | null> {
  let info;
  try {
    info = await stat(file);
  } catch {
    return null;
  }
  const now = { bytes: info.size, modifiedAt: info.mtime.toISOString() };

  try {
    const remembered = JSON.parse(
      await readFile(SIDECAR(file), 'utf8')) as Sidecar;
    if (fresh(remembered, now)) {
      const { bytes, modifiedAt, measuredAt, ...facts } = remembered;
      return facts;
    }
  } catch { /* no sidecar, or one this build cannot read. Measure again. */ }

  let facts: MediaFacts | null;
  try {
    facts = readProbe(await ffprobe([
      '-v', 'error', '-print_format', 'json',
      /* No `-count_frames`: see the head of this file. */
      '-show_format', '-show_streams',
      file,
    ]));
  } catch {
    return null;
  }
  if (!facts) return null;

  /*
   * Written through a temporary file and renamed, like every other write
   * in this store: a listing that runs while a sidecar is half-written
   * must read the old answer or none, never half of one.
   *
   * AND A FAILED WRITE IS NOT A FAILED MEASUREMENT. A read-only library
   * still lists; it simply measures every time.
   */
  const sidecar: Sidecar = { ...facts, ...now, measuredAt: new Date().toISOString() };
  try {
    const temp = `${SIDECAR(file)}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(sidecar), 'utf8');
    await rename(temp, SIDECAR(file));
  } catch { /* as above. */ }
  return facts;
}
