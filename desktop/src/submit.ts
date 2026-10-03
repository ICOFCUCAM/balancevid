/**
 * What is left to send, and how far it got.
 *   [Doctrine U-06, D-21; TAKE-DESKTOP T-5]
 *
 * > *"Submit sends the set under one capture, resumable per
 * > source, over the existing Take protocol."*
 *
 * RESUMABLE PER SOURCE IS THE WHOLE OF THIS FILE. A capture
 * station records in a hall and submits from an office, over
 * whatever connection the building has; four angles of a long
 * performance is gigabytes, and an upload that starts again
 * from nothing every time a connection drops is an upload that
 * never finishes. So what has arrived is written down as it
 * arrives, and a send that is interrupted is a send that
 * continues.
 *
 * A COUNT PER TRACK, NOT A SET. The pieces of one angle are
 * sent in order and the track stops at the first that fails, so
 * the number of pieces accepted says exactly which remain. A
 * set of indices would describe states this sender cannot
 * produce and would have to be trusted not to.
 *
 * THE RECORD IS THE CAPTURE'S OWN, in the capture's own
 * directory, and is deleted with it. A station-wide list of
 * what is half-sent would be a second place the truth lives,
 * and — because it would have to carry the credential for each
 * — *"a list of every credential in the installation in one
 * place"*, which is the thing `store/requests.ts` refuses to
 * build on the other side of the same protocol. [D-19, D-21]
 *
 * NOTHING HERE TOUCHES THE FILESYSTEM, THE NETWORK OR A CLOCK.
 */

import { MOST_ANGLES, type Capture } from '../../shared/src/capture.js';
import {
  type Piece, type TrackSpec, PIECE_BYTES, piecesOf, refusedBecause,
  tracksFrom,
} from '../../shared/src/submit.js';

/**
 * Where a capture is going.
 *
 * THE LINK IS A CREDENTIAL AND NEVER LEAVES THE MAIN PROCESS.
 * The window asks for a capture to be sent by its id; it is
 * told the name of the installation, so a person can see where
 * their work is going, and nothing else. A renderer is a web
 * page, and this one has four cameras pointed at a room. [D-21]
 */
export interface Destination {
  origin: string;
  /** `<requestId>.<secret>`. Main process only. */
  link: string;
  /** What the installation calls itself, for a person to read. */
  name: string;
}

/** How far a capture has got towards being somebody's submission. */
export interface Sending {
  /** The id the installation gave this recording. */
  submissionId?: string;
  /** When this station followed the link, which the call records. */
  openedAt?: string;
  /** Per track, how many of its pieces have been accepted. */
  done: Record<string, number>;
  /** Set when the installation answered that it is a submission. */
  sentAt?: string;
  /** What went wrong last, in words for the operator. */
  trouble?: string;
}

export const NOTHING_SENT: Sending = { done: {} };

/**
 * A record off the disk, believed only so far as it is a record.
 *
 * ANYTHING MAY BE IN THIS FILE. It is JSON in a directory a
 * person can open, and a hand-edited count would make the
 * sender skip pieces that were never sent — a submission with a
 * hole in it, of a plausible length, that nobody can tell from
 * a good one until they watch it. So every count is checked to
 * be a whole number that is not negative, and anything else is
 * read as nothing sent. [D-21]
 */
export function readSending(raw: unknown): Sending {
  if (!raw || typeof raw !== 'object') return { done: {} };
  const said = raw as Record<string, unknown>;
  const done: Record<string, number> = {};
  const counts = said['done'];
  if (counts && typeof counts === 'object') {
    for (const [track, count] of Object.entries(counts)) {
      /*
       * A TRACK NUMBER IS ONE THE PROTOCOL WOULD HAVE ISSUED.
       * `\d{1,2}` was written first, which allows 99 — a number
       * no capture can have and a key the sender would then
       * carry around meaning nothing. The bound is the
       * protocol's own. [shared `MOST_ANGLES`]
       */
      const n = Number(track);
      if (!/^\d{1,2}$/.test(track) || n >= MOST_ANGLES) continue;
      if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) continue;
      done[track] = count;
    }
  }
  return {
    done,
    ...(typeof said['openedAt'] === 'string'
      ? { openedAt: said['openedAt'] } : {}),
    ...(typeof said['submissionId'] === 'string'
      ? { submissionId: said['submissionId'] } : {}),
    ...(typeof said['sentAt'] === 'string' ? { sentAt: said['sentAt'] } : {}),
    ...(typeof said['trouble'] === 'string'
      ? { trouble: said['trouble'].slice(0, 200) } : {}),
  };
}

/** One angle's remaining work. */
export interface Remaining {
  track: number;
  file: string;
  label: string;
  pieces: Piece[];
}

/**
 * What is still to go up, angle by angle.
 *
 * IN TRACK ORDER AND IN PIECE ORDER, because an operator
 * watching a count go down wants it to go down — the same
 * reason the browser's queue drains serially rather than four
 * at a time.
 */
export function remaining(
  capture: Capture, sending: Sending, piece = PIECE_BYTES,
): Remaining[] {
  const out: Remaining[] = [];
  capture.angles.forEach((angle, track) => {
    const all = piecesOf(angle.bytes, piece);
    /*
     * NOT CLAMPED, AND THE CLAMP THAT WAS HERE IS GONE. A count
     * higher than there are pieces cannot make `slice` go
     * backwards — that is specified, not a coincidence — and
     * `Math.min` around it changed nothing any test could see.
     * What actually keeps a corrupt count out is `readSending`,
     * which is where a number off a disk is believed or not.
     */
    const already = sending.done[String(track)] ?? 0;
    const left = all.slice(already);
    if (left.length > 0) {
      out.push({ track, file: angle.file, label: angle.label, pieces: left });
    }
  });
  return out;
}

export interface Progress {
  /** Bytes the installation has acknowledged. */
  bytes: number;
  /** Bytes in the whole capture. */
  total: number;
  /** Angles with nothing left to upload. */
  anglesDone: number;
  angles: number;
  /** True only once the installation has called it a submission. */
  sent: boolean;
}

/**
 * How far along, in the two numbers an operator can act on.
 *
 * BYTES AND NOT PIECES, because angles are not the same length
 * — a camera that dropped out after a minute has three pieces
 * and the others have three hundred, and a progress bar counting
 * pieces would sit at a quarter while one twentieth of the work
 * was done.
 */
export function progressOf(
  capture: Capture, sending: Sending, piece = PIECE_BYTES,
): Progress {
  let bytes = 0;
  let total = 0;
  let anglesDone = 0;
  capture.angles.forEach((angle, track) => {
    const all = piecesOf(angle.bytes, piece);
    const already = sending.done[String(track)] ?? 0;
    for (const one of all.slice(0, already)) bytes += one.bytes;
    total += angle.bytes;
    if (already >= all.length) anglesDone += 1;
  });
  return {
    bytes,
    total,
    anglesDone,
    angles: capture.angles.length,
    sent: Boolean(sending.sentAt),
  };
}

/**
 * The next thing the sender should do.
 *
 * A STATE READ OFF THE RECORD RATHER THAN HELD IN A VARIABLE,
 * so a send resumed in a later run of the application reaches
 * the same conclusion as one that never stopped. There is no
 * resume path and normal path; there is one path that starts
 * wherever it starts.
 */
export type Step =
  | { do: 'refuse'; because: string }
  | { do: 'open' }
  | { do: 'declare' }
  | { do: 'pieces'; left: Remaining[] }
  | { do: 'send'; tracks: TrackSpec[] }
  | { do: 'done' };

export function nextStep(
  capture: Capture, sending: Sending, piece = PIECE_BYTES,
): Step {
  if (sending.sentAt) return { do: 'done' };
  const because = refusedBecause(capture);
  if (because) return { do: 'refuse', because };
  /*
   * ARRIVING AT THE CALL COMES FIRST, AND COSTS A ROUND TRIP
   * NOBODY WOULD HAVE WRITTEN FROM THE DOCUMENT. The
   * installation's request machine allows *submitted* only from
   * *opened*, and a link is opened by somebody following it —
   * which the browser does by loading the page and a capture
   * station never does at all. Found by a 409 after a whole
   * capture had been uploaded. [shared `callPath`]
   */
  if (!sending.openedAt) return { do: 'open' };
  if (!sending.submissionId) return { do: 'declare' };
  const left = remaining(capture, sending, piece);
  if (left.length > 0) return { do: 'pieces', left };
  return { do: 'send', tracks: tracksFrom(capture) };
}

/* ------------------------------------------------------------------ *
 *  What a person is told.
 * ------------------------------------------------------------------ */

function sizeSays(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

/**
 * Where this capture has got to, in a sentence.
 *
 * THE DESTINATION IS NAMED AND THE CREDENTIAL IS NOT. A person
 * about to send four cameras of somebody's performance should
 * be able to read where it is going; the secret that authorises
 * it is not theirs to read off a screen in a hall. [D-21]
 */
export function sendingSays(
  capture: Capture, sending: Sending, to: { name: string } | null,
  piece = PIECE_BYTES,
): string {
  if (sending.sentAt) {
    return `Sent to ${to?.name ?? 'the studio'} as one capture of `
      + `${capture.angles.length} angles.`;
  }
  const because = refusedBecause(capture);
  if (because) return because;
  if (!to) return 'Nothing to send this to yet — connect to a studio first.';
  const seen = progressOf(capture, sending, piece);
  if (seen.bytes === 0) {
    return `${sizeSays(seen.total)} to send to ${to.name}, `
      + `${capture.angles.length} angles under one capture.`;
  }
  return `${sizeSays(seen.bytes)} of ${sizeSays(seen.total)} sent to `
    + `${to.name} · ${seen.anglesDone} of ${seen.angles} angles complete`;
}

/* ------------------------------------------------------------------ *
 *  What an answer from the installation means.
 * ------------------------------------------------------------------ */

/** What a request came back as. */
export type Verdict = 'ok' | 'again' | 'dead';

/**
 * THREE OUTCOMES AND NOT TWO, which is the browser queue's own
 * conclusion reached again out here.
 *
 * > *"'Sent' and 'try again' are the obvious pair; the third is
 * > a refusal that trying again cannot fix — an empty chunk, a
 * > link that is no longer open, an id the server will not
 * > accept. Retrying those forever is a counter that never
 * > reaches zero."*
 *
 * THE TWO CLIENTS CANNOT SHARE THE CODE. One is a classic script
 * in a service worker and the other is Node inside Electron, so
 * what they share is a test that says they agree. [D-19, U-19]
 *
 * IT LIVES HERE AND NOT IN `sending.ts` FOR A REASON CI FOUND.
 * `sending.ts` reaches the disk, so it imports `recordings.ts`,
 * which imports `electron` — and a test that imported this
 * function from there dragged Electron into the web tier's own
 * typecheck, which installs no such thing. Deciding what an
 * answer means is not I/O; it belongs with the rest of the
 * reasoning, where anything may read it. [T-5]
 */
export function verdictOf(status: number): Verdict {
  if (status >= 200 && status < 300) return 'ok';
  /* Busy, rate-limited, or broken at their end: all worth repeating. */
  if (status === 408 || status === 429 || status >= 500) return 'again';
  return 'dead';
}

/**
 * What to tell an operator about a status code.
 *
 * THE INSTALLATION'S OWN WORDS WHERE IT GAVE ANY, and this only
 * where it did not. A refusal rewritten into a generic failure
 * is a refusal nobody can act on: *"this request accepts 1
 * recording(s) and has them"* is something an operator can do
 * something about, and "upload failed" is not. [U-19]
 */
export function troubleFrom(status: number, plain: string): string {
  if (status === 404) return 'that link is not open';
  if (status === 409) return plain;
  if (status >= 500) return 'that studio had a problem — try again';
  return plain;
}
