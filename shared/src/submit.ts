/**
 * Sending a capture to an installation.
 *   [Doctrine D-19, U-02; TAKE-DESKTOP T-5, B-2]
 *
 * > *"Submit sends the set under one capture, resumable per
 * > source, over the existing Take protocol."*
 *
 * THE PROTOCOL NOW HAS TWO WRITERS AND MUST HAVE ONE
 * DEFINITION. B-2 gave the participation route a track
 * dimension and the browser's Take App was its only client; T-5
 * makes the desktop capture station a second one. A shape
 * written out twice is a shape that disagrees with itself the
 * first time either end changes — and the one rule this
 * document states about the two programs is *"no second
 * participation protocol."*
 *
 * SO THE BODY, THE PATHS AND THE ARITHMETIC THAT BUILDS THEM
 * LIVE HERE, imported by the browser sink and by the desktop
 * sender. Neither end may spell a URL for itself.
 *
 * NOTHING HERE TOUCHES THE FILESYSTEM, THE NETWORK OR A CLOCK.
 * It says what to send and where; the two programs do the
 * sending, because one of them has `fetch` in a renderer with
 * no network and the other has a disk.
 */

import { MOST_ANGLES, type Capture } from './capture.js';
import type { Samples } from './time.js';

/**
 * One angle, as the client describes it when it sends a capture.
 *
 * `offsetSamples` IS FROM THE EARLIEST ANGLE, not from a song.
 * A capture of a room has no song, and the number that matters
 * about four cameras is how they sit against EACH OTHER. The
 * installation reads it into `capturedIn.offsetSamples`, which
 * is the field B-1 added for exactly this and deliberately not
 * `alignment.offsetSamples`. [B-1, B-2]
 */
export interface TrackSpec {
  track: number;
  offsetSamples: Samples;
  /** Where it sits against a reference, where there is one. */
  hintSamples?: number;
  elapsedSamples?: number;
  device?: string;
}

/** The body of the send that turns uploaded pieces into a submission. */
export interface SendBody {
  tracks?: TrackSpec[];
  hintSamples?: number;
  elapsedSamples?: number;
  latencySamples?: number;
  device?: string;
}

/* ------------------------------------------------------------------ *
 *  Where the three requests go.
 * ------------------------------------------------------------------ */

/**
 * The call itself: what is being asked for, and the act of
 * arriving at it.
 *
 * READING IT IS NOT A READ. `open()` on the installation moves a
 * request from *created* to *opened* the first time somebody
 * follows the link, which is how a producer learns their
 * invitation was received — and the state machine allows
 * *submitted* only from there. The browser Take App does this by
 * loading the page; a capture station never loads a page, so it
 * must do it on purpose.
 *
 * FOUND BY A 409. The first desktop send declared a recording,
 * uploaded every angle, and was refused with *"a created request
 * cannot become submitted"* — the whole upload done and nothing
 * to show for it. Opening the call is now the first thing a send
 * does, before a byte moves.
 */
export function callPath(link: string): string {
  return `/api/take/${encodeURIComponent(link)}`;
}

/** Declare a recording and be told its id. */
export function declarePath(link: string): string {
  return `${callPath(link)}/submissions`;
}

/**
 * One piece of one angle.
 *
 * NO `track` FOR TRACK 0, which is not a saving: it is the
 * URL a phone has always posted, and the compatibility story
 * B-2 is built on only holds if both clients spell it the same
 * way. [B-2]
 */
export function piecePath(
  link: string, submissionId: string, index: number, track = 0,
): string {
  return `${declarePath(link)}/${encodeURIComponent(submissionId)}`
    + `?index=${index}${track > 0 ? `&track=${track}` : ''}`;
}

/** Turn what has been uploaded into a submission. */
export function sendPath(link: string, submissionId: string): string {
  return `${declarePath(link)}/${encodeURIComponent(submissionId)}`;
}

/* ------------------------------------------------------------------ *
 *  How a finished file is cut up to be sent.
 * ------------------------------------------------------------------ */

/**
 * HOW BIG A PIECE IS, and why it is a byte count here and four
 * seconds in the browser.
 *
 * The Take App's segments are whatever `MediaRecorder` handed
 * it, because they are produced while the performance is still
 * happening and there is nothing else they could be. A capture
 * station sends a file that already exists, and the only thing
 * the size decides is how much is re-sent when a connection
 * drops. A megabyte is a few seconds of 1080p and a small
 * enough loss to accept twice.
 */
export const PIECE_BYTES = 1024 * 1024;

export interface Piece {
  index: number;
  /** Where in the angle's file this piece begins. */
  at: number;
  /** How many bytes it carries. */
  bytes: number;
}

/**
 * The pieces one angle's file is sent in.
 *
 * SLICED AT ARBITRARY BYTE BOUNDARIES, WHICH IS SAFE HERE AND
 * WOULD NOT BE IN THE BROWSER. The route joins `.part` files by
 * concatenation, so what it writes is the input put back
 * together byte for byte — a file cut anywhere and rejoined in
 * order is the same file. The browser's chunks are WebM
 * clusters because that is what `MediaRecorder` produces, not
 * because the join needs them to be.
 *
 * A FILE OF NOTHING HAS NO PIECES, and the caller is expected
 * to notice: the route refuses an empty chunk and refuses a
 * track with no pieces, which is the right answer and a bad
 * thing to discover halfway through an upload. `planFor` below
 * is where it is noticed.
 */
export function piecesOf(bytes: number, piece = PIECE_BYTES): Piece[] {
  /*
   * FINITE, AND THAT IS NOT THE SAME AS POSITIVE.
   *
   * This was `!(bytes > 0)`, which mutation could not kill —
   * the loop below never runs for zero or a negative number
   * anyway — and the measurement that showed it unobservable
   * also showed what it was missing. `bytes` comes off a
   * manifest on a disk a person can open; `1e999` parses as
   * `Infinity`, passes every "is it positive" check in this
   * file, and turns the loop into one that never ends, in the
   * process that owns the window. The guard that could not
   * fire became the one that can. [D-21, C-49]
   *
   * AND THERE IS NO `bytes <= 0` BESIDE IT, because the loop
   * below does not run for zero or for a negative number and
   * mutation says so. A file of nothing has no pieces because
   * there is nothing to cut, not because a line says so.
   */
  if (!Number.isFinite(bytes) || !(piece > 0)) return [];
  const out: Piece[] = [];
  for (let at = 0; at < bytes; at += piece) {
    out.push({ index: out.length, at, bytes: Math.min(piece, bytes - at) });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 *  What a capture becomes.
 * ------------------------------------------------------------------ */

/**
 * The angles of a capture, as the send describes them.
 *
 * THE TRACK NUMBER IS THE ANGLE'S PLACE IN THE MANIFEST, which
 * is the slot order the operator arranged the cameras in. It is
 * not the sourceId and it is not a hash: the route wants a small
 * distinct integer per angle and the manifest already has an
 * order somebody chose.
 *
 * NO `elapsedSamples`, AND THAT IS U-02. The capture knows when
 * it began and ended by the wall clock, which is a weaker
 * reading than the container header this product already
 * refuses to trust — and the installation measures the duration
 * by decoding when it accepts. Sending a wall-clock guess would
 * put a number nobody measured onto a producer's document.
 *
 * NO `hintSamples` EITHER. That is where a recording sits
 * against the reference it was performed to, and a capture
 * station recording a room has no reference. The installation
 * leaves such a take `unplaced`, which is exactly true.
 *
 * THE DEVICE IS THE CAMERA'S OWN LABEL, because on a capture
 * station the four angles come from one machine and the camera
 * is the answer to *which one is out*. B-3 puts it in the
 * producer's rail for the same reason.
 */
export function tracksFrom(capture: Capture): TrackSpec[] {
  return capture.angles.map((angle, track) => ({
    track,
    offsetSamples: angle.offsetSamples,
    ...(angle.label ? { device: angle.label } : {}),
  }));
}

/** Why a capture cannot be sent, or nothing. */
export function refusedBecause(capture: Capture): string {
  if (capture.angles.length === 0) return 'this capture has no angles';
  if (capture.angles.length > MOST_ANGLES) {
    return `a capture of more than ${MOST_ANGLES} angles cannot be sent`;
  }
  const empty = capture.angles.filter((one) => !(one.bytes > 0));
  if (empty.length > 0) {
    /*
     * AN ANGLE THAT RECORDED NOTHING IS NOT A SMALL PROBLEM.
     * The route refuses a track with no pieces, so a capture
     * carrying one cannot arrive at all — and finding that out
     * after three cameras have been uploaded is finding it out
     * at the worst moment. Named by camera, because the
     * operator's next question is which one.
     */
    return `${empty.map((one) => one.label || one.file).join(', ')} `
      + `recorded nothing, so this is not a capture of `
      + `${capture.angles.length}`;
  }
  return '';
}
