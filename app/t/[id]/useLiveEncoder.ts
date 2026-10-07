'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type Quality, DEFAULT_QUALITY, QUALITIES,
} from '../../../src/domain/quality.js';
/* Whether a failed chunk is still worth sending, how long to wait,
   and what to call the failure. A decision with no network in it,
   so it lives in the domain and is tested without a browser.
   [liveChunk.ts, D-19] */
import {
  failureSays, sendAgain, waitBefore,
} from '../../../src/domain/liveChunk.js';

/**
 * The broadcast encoder, in the browser.  [Doctrine CHANNEL §7, §8, U-23]
 *
 *     Camera → Microphone → Live ingest → Broadcast encoder → Online TV
 *
 * The other end of the pipe. Everything downstream of it — the buffer, the
 * playout engine, the delay, the sweeper, the keep-or-discard decision — was
 * built and tested before this existed, which was the honest gap: a live
 * session that was modelled and invariant-checked with nothing arriving.
 *
 * IT REUSES THE RECORDING PATH IN SHAPE, NOT IN CODE. `useMasterRecording`
 * and `useRoomCapture` both drive a MediaRecorder and both collect numbered
 * chunks to be joined when the take is finished. A broadcast is never
 * finished, so the chunks are not collected: each one is posted the moment it
 * exists and appended to a file something is reading four seconds behind.
 *
 * TWO SECONDS A CHUNK. Shorter means more requests for the same bytes and a
 * keyframe more often than a 720p encoder wants; longer means the delay the
 * playout engine has to allow for grows with it. Two is small against the
 * twelve-second broadcast delay and large enough that a phone on a train does
 * not spend its evening in TLS handshakes.
 *
 * A CHUNK THAT MISSES IS GONE — AND THAT WAS WRONG, ON ITS OWN
 * TERMS. What stood here said *"there is no retry and no queue: a
 * chunk that arrives late has missed the broadcast, and inserting
 * it would corrupt a file being read right now."* Both halves fail
 * against the code in this same file.
 *
 * THERE HAS ALWAYS BEEN A QUEUE. `queue` serialises every post and
 * its own comment says why: *"chunk two cannot overtake chunk one
 * on a flaky connection. Appending them out of order would splice
 * the broadcast."* A retry inside that chain is not an insertion —
 * the chunk holds the place it already held, and chunk two waits
 * exactly as it already waits. The corruption that paragraph
 * feared is the thing the queue was built to prevent.
 *
 * AND "LATE" HAS A NUMBER. The engine reads twelve seconds behind.
 * A chunk that lands two seconds after its first attempt is ten
 * seconds EARLY. "Later means never" is true past the delay
 * horizon and false everywhere inside it, which is where nearly
 * every failure lives.
 *
 * WHAT DROPPING ACTUALLY COSTS. The clock does not stop for a
 * failed upload, so every dropped chunk is two seconds of media
 * the buffer will never hold while the broadcast ages two seconds.
 * It is not recoverable and it does not average out. The engine's
 * `liveReachMs` clamp absorbs it by growing the delay rather than
 * freezing the picture; absorbing it is better than freezing, and
 * not needing to is better still.
 *
 * THE RULE IS IN `liveChunk.ts`, not here, because it is a
 * decision and not a fetch. What this file keeps is the asking.
 */

/** How much of the broadcast goes in each request. */
const CHUNK_MS = 2000;

/**
 * What to record. VP8 rather than VP9: this runs for the length of a
 * broadcast on whatever machine the presenter has, and VP9's encoder is
 * markedly more expensive for a picture nobody is going to freeze-frame. The
 * playout engine re-encodes every piece to the house format anyway.
 */
const WANTED = [
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];

export interface LiveEncoder {
  /** The local picture, for the operator's own preview. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  running: boolean;
  /** Chunks that reached the channel, and chunks that did not. */
  sent: number;
  dropped: number;
  /**
   * Chunks that needed a second attempt and got there.
   *
   * COUNTED APART FROM BOTH, because they are neither. Folded into
   * `sent`, a studio would call a struggling uplink perfect;
   * folded into `dropped`, it would mourn two seconds that went
   * out on the wire. What a presenter needs to know is whether
   * anything is actually being lost — that is `dropped`, and this
   * is the warning in front of it.
   */
  retried: number;
  /**
   * WHY the last chunk failed, in words, or nothing.
   *
   * `catch {}` threw this away. A studio could see twelve chunks
   * lost and not know whether its own uplink had died or the
   * channel had answered 500 — one is the presenter's to fix and
   * one is ours, and they send different people to look. [D-21]
   */
  why: string | null;
  /** Rolling bytes per second, so "the feed is struggling" is measurable. */
  rate: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * `feed` is what to broadcast, when something else is composing it.
 *
 * Absent, the encoder opens the camera itself — which is a channel going live
 * on its own with nobody else in the room. Present, it broadcasts the mixed
 * picture the composition engine produced and never touches getUserMedia,
 * because the mixer already has the camera and two of them is two red lights.
 *
 * `quality` is the CEILING, not the rate. A MediaRecorder given 6 Mbps does
 * not send 6 Mbps: it sends what the picture costs, up to that. So raising
 * the setting on a static shot changes the meter by almost nothing and
 * changes a concert enormously, which is the correct behaviour and not an
 * intuitive one. [quality.ts]
 */
export function useLiveEncoder(
  channelId: string, feed?: MediaStream | null,
  quality: Quality = QUALITIES[DEFAULT_QUALITY],
): LiveEncoder {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  /**
   * Posts are serialised through this, so chunk two cannot overtake chunk one
   * on a flaky connection. Appending them out of order would splice the
   * broadcast, and the viewer would see the last two seconds twice.
   */
  const queue = useRef<Promise<void>>(Promise.resolve());
  const live = useRef(false);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [running, setRunning] = useState(false);
  const [sent, setSent] = useState(0);
  const [retried, setRetried] = useState(0);
  const [why, setWhy] = useState<string | null>(null);
  const [dropped, setDropped] = useState(0);
  const [rate, setRate] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    live.current = false;
    try { recorderRef.current?.stop(); } catch { /* already stopped. */ }
    recorderRef.current = null;
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    setStream(null);
    setRunning(false);
  }, []);

  /* The camera is never left on by a page that has gone away. */
  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setError(null);
    try {
      const media = feed ?? await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: quality.width },
          height: { ideal: quality.height },
          frameRate: { ideal: quality.fps },
        },
        audio: {
          echoCancellation: true, noiseSuppression: true, autoGainControl: true,
        },
      });
      /*
       * Only a camera this hook opened is a camera this hook turns off. A
       * mixed feed belongs to the mixer, and stopping its tracks here would
       * black out the operator's own preview along with the broadcast.
       */
      streamRef.current = feed ? null : media;
      setStream(media);
      if (videoRef.current) videoRef.current.srcObject = media;

      const mimeType = WANTED.find(
        (type) => MediaRecorder.isTypeSupported(type)) ?? '';
      const recorder = new MediaRecorder(media, {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: quality.videoBitsPerSecond,
        audioBitsPerSecond: quality.audioBitsPerSecond,
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0 || !live.current) return;
        /*
         * WHEN THIS CHUNK CAME OFF THE CAMERA, taken here and not
         * inside the attempt. Everything about whether it is still
         * worth sending is measured from this instant: a chunk
         * ages while it waits behind the one in front of it, and a
         * window measured per attempt would never notice.
         */
        const recordedAt = Date.now();
        /*
         * Chained rather than awaited: `ondataavailable` must return at once
         * or the recorder's own timing slips, and the chain is what keeps the
         * order the wire needs — and what makes a retry safe, because the
         * second attempt holds the same place the first one held.
         */
        queue.current = queue.current.then(async () => {
          /** Why the last attempt failed, for the studio to read. */
          let because = '';
          /*
           * UNTIL IT LANDS OR UNTIL IT IS TOO OLD TO MATTER, and
           * not a count of attempts: a count means something
           * different on every connection, and what decides this
           * is the clock the viewer is on. [liveChunk.ts]
           */
          while (live.current) {
            let status: number | undefined;
            try {
              const response = await fetch(`/api/channels/${channelId}/live`, {
                method: 'POST',
                headers: { 'content-type': 'application/octet-stream' },
                body: event.data,
              });
              if (response.ok) {
                setSent((count) => count + 1);
                setRate(Math.round(event.data.size / (CHUNK_MS / 1000)));
                /* It arrived. A retry that worked is not a loss,
                   and the studio should stop calling it one. */
                if (because) setRetried((count) => count + 1);
                setWhy(null);
                return;
              }
              /*
               * 409 means the operator ended the broadcast while this chunk
               * was in flight. That is not a fault, it is a race with a
               * decision, and the encoder stops rather than complaining.
               */
              if (response.status === 409) { stop(); return; }
              status = response.status;
              because = failureSays(response.status);
            } catch (error) {
              /* `fetch` rejects outright when the connection
                 itself fails, which is the case that recovers a
                 second later and the commonest one on a phone. */
              because = error instanceof Error && error.name === 'AbortError'
                ? 'the upload was cancelled' : failureSays(undefined);
            }
            const age = Date.now() - recordedAt;
            if (!sendAgain({ status, ageMs: age })) break;
            await new Promise((wake) => { setTimeout(wake, waitBefore(age)); });
          }
          setDropped((count) => count + 1);
          setWhy(because || 'the upload failed');
        });
      };
      recorder.onerror = () => { setError('the encoder stopped'); stop(); };

      live.current = true;
      recorder.start(CHUNK_MS);
      recorderRef.current = recorder;
      setRunning(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      stop();
    }
  }, [channelId, feed, quality, stop]);

  return {
    videoRef, stream, running, sent, dropped, retried, why, rate, error,
    start, stop,
  };
}
