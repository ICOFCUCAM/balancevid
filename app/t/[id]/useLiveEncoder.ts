'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
 * A CHUNK THAT MISSES IS GONE, and that is deliberate. There is no retry and
 * no queue: a chunk that arrives late has missed the broadcast, and inserting
 * it would corrupt a file being read right now. Live is the one place in this
 * product where "later" means "never" — so what a failure does is count
 * itself, and the studio says the feed is struggling rather than silently
 * getting further behind.
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
 */
export function useLiveEncoder(
  channelId: string, feed?: MediaStream | null,
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
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
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
        videoBitsPerSecond: 2_500_000,
        audioBitsPerSecond: 128_000,
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size === 0 || !live.current) return;
        /*
         * Chained rather than awaited: `ondataavailable` must return at once
         * or the recorder's own timing slips, and the chain is what keeps the
         * order the wire needs.
         */
        queue.current = queue.current.then(async () => {
          try {
            const response = await fetch(`/api/channels/${channelId}/live`, {
              method: 'POST',
              headers: { 'content-type': 'application/octet-stream' },
              body: event.data,
            });
            if (!response.ok) {
              /*
               * 409 means the operator ended the broadcast while this chunk
               * was in flight. That is not a fault, it is a race with a
               * decision, and the encoder stops rather than complaining.
               */
              if (response.status === 409) { stop(); return; }
              throw new Error(String(response.status));
            }
            setSent((count) => count + 1);
            setRate(Math.round(event.data.size / (CHUNK_MS / 1000)));
          } catch {
            setDropped((count) => count + 1);
          }
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
  }, [channelId, feed, stop]);

  return { videoRef, stream, running, sent, dropped, rate, error, start, stop };
}
