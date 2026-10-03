'use client';

import type { RecordingSink } from '../../p/[id]/useMasterRecording.js';
import { askToDrain, takeQueue } from './queue.js';

/**
 * Where the Take App sends a recording.  [D-19, D-25; TAKE-APP T3, T5]
 *
 * The second of two sinks, and the whole reason the recorder takes one:
 * everything difficult about recording against a song — the song on the
 * audio clock, the offset taken at the instant the first chunk closes,
 * the device latency subtracted, the elapsed time measured where it is
 * honest — is identical on a producer's laptop and a performer's phone,
 * and must not exist twice.
 *
 * WHAT DIFFERS IS THREE URLS AND ONE FACT: this one reports the device,
 * because a producer with twenty submissions and one that is out of
 * sync needs to know which phone it came from, and on the studio's own
 * recorder there is only ever one machine.
 */
export function takeSink(
  link: string,
  /**
   * A finished recording, KEPT rather than sent.  [TAKE-APP T4]
   *
   * "Take 3 doesn't have to reach the server at all if they delete it
   * locally." Its SEGMENTS are already there — a phone that loses a
   * call mid-song must not lose the performance with it — but nothing
   * has crossed to the producer, and this hands the performer what
   * they need to decide: the recording's id and what the phone
   * measured about it.
   *
   * THE MEASUREMENT IS TAKEN AT THE STOP AND NOT LATER, because that
   * is when the audio clock still knows. `sendTake` below carries it
   * whenever the performer presses Send.
   */
  keep: (submissionId: string, spec: KeptSpec) => void,
  /**
   * WHICH CAMERA THIS SINK IS.  [TAKE-DESKTOP B-2]
   *
   * A phone has one and passes nothing, which is what no track
   * meant. A capture station recording four sources at once makes
   * FOUR SINKS SHARING ONE SUBMISSION ID, one per recorder, rather
   * than one sink that is told which track on every segment.
   *
   * THAT IS B-1'S OWN CORRECTION APPLIED AGAIN. The first draft of
   * B-1 wanted to give a take N tracks, and reading Studio Two
   * showed that four cameras do not need a new model, they need
   * four takes that know they belong together. Four cameras do not
   * need a new recorder argument either: `useMasterRecording` is
   * one camera and stays one camera, untouched, including every
   * line of the latency arithmetic this stage was told not to
   * touch. What knows about the capture is the thing outside it.
   */
  track = 0,
): RecordingSink {
  const at = `/api/take/${encodeURIComponent(link)}`;
  /* Track 0 sends the URL it has always sent, down to the query. */
  const on = track > 0 ? `&track=${track}` : '';
  return {
    begin: async () => {
      const response = await fetch(`${at}/submissions`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error ?? 'could not start recording');
      }
      return data.submissionId as string;
    },
    /*
     * WRITTEN DOWN BEFORE IT IS SENT.  [T13a; U-06]
     *
     * This was `await fetch(...)` with no check on the response,
     * under a caller that swallows the rejection so the next segment
     * can carry on. On a laptop in a studio that is nearly always
     * fine. On a phone on mobile data — this surface's entire
     * premise — a segment that fails is GONE: the take has a hole in
     * the middle of it, the duration still looks plausible, and
     * nobody is told. U-06 exists so that a crash costs one segment;
     * it does not say a segment may be dropped in silence.
     *
     * So the bytes go to IndexedDB first and the queue delivers them
     * — retrying with a backoff, surviving the tab closing, the
     * phone locking and the signal going, and finishing in the
     * background where the browser has Background Sync. That is
     * exactly what T13a said a packaged client would add, and it is
     * the half of that row that was never about a store account.
     *
     * A PHONE THAT CANNOT HAVE A QUEUE STILL RECORDS. Private
     * browsing has no IndexedDB; that is a reason for a less durable
     * upload, not a reason to refuse somebody's performance. The
     * direct path is the fallback — and unlike the original it reads
     * the response, so a refusal is at least an error somebody can
     * be shown. [U-19]
     */
    chunk: async (id, index, body) => {
      const queue = await takeQueue();
      if (queue) {
        await queue.put({ link, submissionId: id, index, track, blob: body });
        void askToDrain();
        return;
      }
      const response = await fetch(`${at}/submissions/${id}?index=${index}${on}`, {
        method: 'POST', body,
        headers: { 'content-type': 'application/octet-stream' },
      });
      if (!response.ok) throw new Error('that part of the recording did not arrive');
    },
    /*
     * STOPPING IS NOT SENDING.  [TAKE-APP T4; D-25]
     *
     * The first version of this file sent the recording here, and the
     * Take App's own comment two files away said it did not — "a
     * finished recording is KEPT, not sent" — which is the kind of
     * disagreement that is invisible until somebody reads both. The
     * performer decides; this hands them the recording to decide
     * about.
     *
     * NO JOB COMES BACK EITHER WAY, and that is the design rather
     * than an omission. A submission is not turned into a take until
     * a producer accepts it — the only moment D-25 allows — so there
     * is nothing for the performer to wait on and nothing to tell
     * them about somebody else's production.
     */
    finish: async (id, spec) => {
      keep(id, {
        ...spec,
        device: typeof navigator === 'undefined' ? undefined : navigator.userAgent,
        ...(track > 0 ? { track } : {}),
      });
      return {};
    },
  };
}

/** What the phone measured, held until the performer decides. [T4] */
export interface KeptSpec {
  hintSamples: number;
  elapsedSamples: number;
  latencySamples: number;
  device?: string | undefined;
  /** Which angle reported this, where a capture has more than one. [B-2] */
  track?: number;
  /**
   * EVERY ANGLE OF ONE CAPTURE, SENT TOGETHER, or absent for a
   * recording with one.  [B-2]
   *
   * The send is one PUT however many cameras there were, because
   * what is being sent is one performance: four PUTs would be four
   * submissions that happened to arrive together and nothing on the
   * server could say they were one take. Absent is byte for byte
   * what a phone sends.
   */
  tracks?: TrackSpec[];
}

/** One angle, as the client describes it when it sends a capture. [B-2] */
export interface TrackSpec {
  track: number;
  /** From the earliest angle, in samples. Not against the reference. */
  offsetSamples: number;
  hintSamples?: number;
  elapsedSamples?: number;
  device?: string;
}

/**
 * Send one to the producer.  [TAKE-APP T4, T5; D-25]
 *
 * THE MOMENT A RECORDING BECOMES A SUBMISSION. Until this returns,
 * what is on the server is bytes in a directory that nothing reads
 * and that are swept with the request.
 */
export async function sendTake(
  link: string, submissionId: string, spec: KeptSpec,
  send: typeof fetch = fetch,
): Promise<void> {
  const response = await send(
    `/api/take/${encodeURIComponent(link)}/submissions/${submissionId}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(spec),
    });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'that take could not be sent');
  }
}

/**
 * Throw one away before it is sent.  [TAKE-APP T4]
 *
 * "Take 3 doesn't have to reach the server at all if they delete it
 * locally." It does reach it, in segments, because a dropped call
 * must not cost a good take — so deleting is an explicit act that
 * removes them, rather than a silence that leaves them lying around
 * until the request is swept.
 */
export async function dropTake(
  link: string, submissionId: string, send: typeof fetch = fetch,
): Promise<void> {
  const response = await send(
    `/api/take/${encodeURIComponent(link)}/submissions/${submissionId}`,
    { method: 'DELETE' });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? 'that take could not be deleted');
  }
}
