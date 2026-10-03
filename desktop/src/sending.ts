/**
 * Sending a capture, out here where the disk and the socket are.
 *   [Doctrine U-06, U-19, D-21; TAKE-DESKTOP T-5]
 *
 * THE WINDOW ASKS FOR A CAPTURE TO BE SENT BY ITS ID AND IS
 * TOLD HOW FAR IT GOT. It does not hold the credential, does
 * not open a socket, and does not read a file — its content
 * policy is still `connect-src 'none'` and that is the point of
 * the whole arrangement: a capture station with four cameras
 * pointed at a room is the last program whose web page should
 * be able to post somewhere. [T-1, T-2]
 *
 * EVERY PIECE THAT LANDS IS WRITTEN DOWN BEFORE THE NEXT IS
 * SENT. A send interrupted by a closed laptop, a dropped
 * connection or a power cut resumes from the piece after the
 * last one the installation acknowledged — not from the
 * beginning, and not from where this process last remembered
 * being. The record is on the disk because the thing it
 * survives is this process ending. [U-06]
 *
 * ONE SEND PER CAPTURE AT A TIME. Two senders on one capture
 * would both read the same count, both send the same piece, and
 * both write it back — and the second would be writing a number
 * that was true a moment ago. The register below is what makes
 * pressing SEND twice do nothing the second time.
 *
 * THREE OUTCOMES FROM A REQUEST AND NOT TWO, exactly as the
 * browser's queue decided: sent, worth trying again, and a
 * refusal that trying again cannot fix. A station that retried
 * a closed link forever would be a progress bar that never
 * moves and an operator who cannot tell a bad connection from a
 * finished call. [U-19]
 */

import { open as openFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  PIECE_BYTES, callPath, declarePath, piecePath, sendPath,
} from '../../shared/src/submit.js';
import {
  type Destination, type Sending, nextStep,
} from './submit.js';
import {
  captureDir, oneCapture, readSendingOf, writeSendingOf,
} from './recordings.js';

/**
 * How long one request has.
 *
 * LONGER THAN ASKING AN INSTALLATION WHAT IT IS, because this
 * one carries a megabyte up a connection in a building. Short
 * enough that a connection which has silently gone is noticed
 * rather than waited on until somebody closes the window.
 */
export const PIECE_TIMEOUT_MS = 120_000;
export const CALL_TIMEOUT_MS = 15_000;

/** What a request came back as. */
export type Verdict = 'ok' | 'again' | 'dead';

export function verdictOf(status: number): Verdict {
  if (status >= 200 && status < 300) return 'ok';
  /* Busy, rate-limited, or broken at their end: all worth repeating. */
  if (status === 408 || status === 429 || status >= 500) return 'again';
  return 'dead';
}

/** The captures this process is in the middle of sending. */
const inFlight = new Set<string>();
/** The ones an operator has asked to stop. */
const stopping = new Set<string>();

export function isSending(id: string): boolean {
  return inFlight.has(id);
}

/**
 * Ask a send to stop at the next piece.
 *
 * AT THE NEXT PIECE AND NOT MID-REQUEST. A piece abandoned in
 * flight may still land, and a count that did not record it
 * would send it twice — which the route would accept, because
 * a piece written twice at the same index is the same piece.
 * Stopping cleanly is simply cheaper than reasoning about that.
 */
export function stopSending(id: string): void {
  if (inFlight.has(id)) stopping.add(id);
}

async function fetchWith(
  url: string, init: RequestInit, timeoutMs: number,
): Promise<Response | null> {
  const halt = new AbortController();
  const timer = setTimeout(() => halt.abort(), timeoutMs);
  try {
    return await fetch(url, {
      credentials: 'omit', cache: 'no-store', redirect: 'follow',
      ...init, signal: halt.signal,
    });
  } catch {
    /* Unreachable, refused, timed out. One answer for all of
       them, and it is "try again": a hall's connection coming
       back is the ordinary case. */
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** One piece of one angle, read off the disk and posted. */
async function sendPiece(
  to: Destination, submissionId: string, id: string,
  file: string, track: number, index: number, at: number, bytes: number,
): Promise<Verdict> {
  let body: Uint8Array;
  try {
    const handle = await openFile(join(captureDir(id), file), 'r');
    try {
      const into = new Uint8Array(bytes);
      const { bytesRead } = await handle.read(into, 0, bytes, at);
      /*
       * A FILE SHORTER THAN THE MANIFEST SAYS IS NOT A PIECE TO
       * PAD. It means the manifest and the disk disagree — a
       * capture half-copied onto a stick, or a file somebody
       * trimmed. Sending zeroes would produce a submission the
       * installation cannot decode and nobody can explain.
       */
      if (bytesRead !== bytes) return 'dead';
      body = into;
    } finally {
      await handle.close();
    }
  } catch {
    return 'dead';
  }

  const response = await fetchWith(
    `${to.origin}${piecePath(to.link, submissionId, index, track)}`,
    {
      method: 'POST',
      /* A fresh buffer, because `fetch` wants a body it owns and
         a view onto a pooled one is not that. */
      body: body.slice().buffer as ArrayBuffer,
      headers: { 'content-type': 'application/octet-stream' },
    },
    PIECE_TIMEOUT_MS);
  return response ? verdictOf(response.status) : 'again';
}

/** What a send came back with, for the window to show. */
export interface Sent {
  sending: Sending;
  /** True while there is more to do and nothing has refused. */
  more: boolean;
}

/**
 * Send what is left of one capture.
 *
 * RUNS UNTIL IT IS DONE, REFUSED, OR THE CONNECTION GOES. It
 * does not retry on a schedule: a station whose hall has no
 * connection is a station whose operator presses send again
 * when it has one, and a background retry loop in an
 * application somebody is watching is a progress bar that moves
 * without being asked. The browser's queue retries because the
 * page may be closed; this window is open and a person is
 * looking at it. [U-19]
 */
export async function sendCapture(id: string): Promise<Sent> {
  const before = await readSendingOf(id);
  if (inFlight.has(id)) return { sending: before, more: true };
  inFlight.add(id);
  stopping.delete(id);
  try {
    return await run(id);
  } finally {
    inFlight.delete(id);
    stopping.delete(id);
  }
}

async function run(id: string): Promise<Sent> {
  const capture = await oneCapture(id);
  let record = await readSendingOf(id);
  if (!capture) {
    return { sending: { ...record, trouble: 'that capture is not here' },
      more: false };
  }
  const to = record.to;
  if (!to) {
    return { sending: { ...record, trouble: 'nothing to send this to yet' },
      more: false };
  }

  const keep = async (next: Sending): Promise<void> => {
    record = { ...next, to };
    await writeSendingOf(id, record);
  };
  /* A new attempt starts with no complaint from the last one. */
  if (record.trouble) {
    const { trouble: _was, ...clean } = record;
    await keep(clean);
  }

  for (;;) {
    if (stopping.has(id)) return { sending: record, more: true };
    const step = nextStep(capture, record, PIECE_BYTES);

    if (step.do === 'done') return { sending: record, more: false };

    if (step.do === 'refuse') {
      await keep({ ...record, trouble: step.because });
      return { sending: record, more: false };
    }

    if (step.do === 'open') {
      const answer = await fetchWith(
        `${to.origin}${callPath(to.link)}`, { method: 'GET' }, CALL_TIMEOUT_MS);
      if (!answer) {
        await keep({ ...record, trouble: `could not reach ${to.name}` });
        return { sending: record, more: true };
      }
      if (verdictOf(answer.status) !== 'ok') {
        await keep({ ...record, trouble: troubleFrom(answer.status,
          'that link is not open any more') });
        return { sending: record, more: verdictOf(answer.status) === 'again' };
      }
      await keep({ ...record, openedAt: new Date().toISOString() });
      continue;
    }

    if (step.do === 'declare') {
      const answer = await fetchWith(
        `${to.origin}${declarePath(to.link)}`, { method: 'POST' },
        CALL_TIMEOUT_MS);
      if (!answer) {
        await keep({ ...record, trouble: `could not reach ${to.name}` });
        return { sending: record, more: true };
      }
      const said = await answer.json().catch(() => ({})) as {
        submissionId?: string; error?: string;
      };
      if (verdictOf(answer.status) !== 'ok' || !said.submissionId) {
        await keep({ ...record, trouble: said.error
          ?? troubleFrom(answer.status, 'that studio would not take a recording') });
        return { sending: record, more: verdictOf(answer.status) === 'again' };
      }
      await keep({ ...record, submissionId: said.submissionId });
      continue;
    }

    if (step.do === 'pieces') {
      const angle = step.left[0]!;
      const piece = angle.pieces[0]!;
      const verdict = await sendPiece(to, record.submissionId!, id,
        angle.file, angle.track, piece.index, piece.at, piece.bytes);
      if (verdict === 'ok') {
        /*
         * WRITTEN DOWN BEFORE THE NEXT ONE IS SENT. A count kept
         * in this loop and saved at the end would be a count
         * that is worth nothing the moment the thing it protects
         * against happens.
         */
        await keep({
          ...record,
          done: { ...record.done, [String(angle.track)]: piece.index + 1 },
        });
        continue;
      }
      await keep({
        ...record,
        trouble: verdict === 'again'
          ? `${angle.label} stopped sending — try again when the `
            + 'connection is back'
          : `${angle.label} was refused by ${to.name}`,
      });
      return { sending: record, more: verdict === 'again' };
    }

    /* Everything is up: turn it into one submission of N angles. */
    const answer = await fetchWith(
      `${to.origin}${sendPath(to.link, record.submissionId!)}`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tracks: step.tracks }),
      },
      CALL_TIMEOUT_MS);
    if (!answer) {
      await keep({ ...record, trouble: `could not reach ${to.name}` });
      return { sending: record, more: true };
    }
    const said = await answer.json().catch(() => ({})) as { error?: string };
    if (verdictOf(answer.status) !== 'ok') {
      await keep({ ...record, trouble: said.error
        ?? troubleFrom(answer.status, 'that studio would not take it') });
      return { sending: record, more: verdictOf(answer.status) === 'again' };
    }
    await keep({ ...record, sentAt: new Date().toISOString() });
    return { sending: record, more: false };
  }
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
