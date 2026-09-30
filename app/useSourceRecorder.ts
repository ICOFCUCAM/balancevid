'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Quality } from '../src/domain/quality.js';

/**
 * Recording the thing you are about to respond to.
 *   [STUDIO-ONE §2C, §2D, §4; U-02, U-06, D-19]
 *
 * *"Record now — camera + microphone. The user could say: I want to
 * respond to something live."* And: *"the user opens a website,
 * presentation, news article, software demonstration… BalanceVid records
 * the screen and their response."*
 *
 * WHY THIS IS NOT `useMasterRecording`, WHICH ALREADY RECORDS.
 *
 * Studio Two's recorder is eighty lines of latency arithmetic: when
 * `MediaRecorder.start()` actually began capturing, how far behind the
 * audio device is, which clock the page is measuring on, and where that
 * puts the take against the song. Every one of those exists because a
 * take must land on a master to the frame.
 *
 * A SOURCE HAS NOTHING TO LAND ON. It is the clock — the thing everything
 * else will later be placed against — so there is no offset to measure and
 * no sync to get wrong. Reusing the performance recorder here would mean
 * carrying calibration, the count-in, the headphone warning and a sink
 * shaped like a performance take, in order to use the one line that calls
 * `MediaRecorder`. That is not reuse; it is a dependency on the wrong
 * thing. The ROOM's own capture makes the same split for the same reason.
 *
 * WHAT IT DOES SHARE IS THE QUALITY LADDER. `useQuality('recording')` is
 * the same preset Studio Two and the Take App record at, including 2160p,
 * because "how good a source to keep" is one question and this product
 * already answers it in one place. [CHANNEL §23a]
 *
 * AND THE BYTES GO WHERE AN UPLOAD GOES. What comes out is a `File`, handed
 * to the same `POST /api/conversations` that a chosen file is handed to,
 * ingested by the same worker into the same mezzanine. A recorded source
 * and an uploaded one differ in `capturedAs` and in nothing else — which is
 * the whole reason the recording was worth building: there is no second
 * pipeline behind it.
 */

export type RecordingState = 'idle' | 'arming' | 'ready' | 'recording' | 'saving';

export interface SourceRecording {
  state: RecordingState;
  /** What the camera or the screen is showing, for the monitor. */
  stream: MediaStream | null;
  /** Whole seconds since recording began. */
  elapsed: number;
  error: string | null;
  /** Ask for the devices and show the picture, without recording yet. */
  arm: () => Promise<void>;
  start: () => void;
  /** Stop, and answer with the file. */
  stop: () => Promise<File | null>;
  /** Put the camera light out. */
  release: () => void;
}

/**
 * One container, chosen by asking rather than by assuming.
 *
 * Chrome and Firefox record WebM; Safari records MP4 and has never
 * supported `video/webm` in `MediaRecorder`. The ingest normalises
 * whatever arrives, so the only thing that matters is picking something
 * the browser in front of us will actually produce — and `isTypeSupported`
 * is the only honest way to find out.
 */
function container(): { mimeType: string; extension: string } {
  const tries = [
    { mimeType: 'video/webm;codecs=vp9,opus', extension: 'webm' },
    { mimeType: 'video/webm;codecs=vp8,opus', extension: 'webm' },
    { mimeType: 'video/webm', extension: 'webm' },
    { mimeType: 'video/mp4', extension: 'mp4' },
  ];
  for (const one of tries) {
    if (typeof MediaRecorder !== 'undefined'
      && MediaRecorder.isTypeSupported(one.mimeType)) return one;
  }
  return { mimeType: '', extension: 'webm' };
}

export function useSourceRecorder(
  quality: Quality,
  /**
   * Where the picture comes from.
   *
   * `camera` asks for a camera and a microphone. `screen` asks the browser
   * for a display, and the browser owns that picker entirely — which is a
   * security property and not a limitation, the same argument
   * `useScreenShare` makes.
   */
  from: 'camera' | 'screen',
  device?: { cameraId?: string; microphoneId?: string },
): SourceRecording {
  const [state, setState] = useState<RecordingState>('idle');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const held = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const parts = useRef<Blob[]>([]);
  const began = useRef(0);

  const release = useCallback(() => {
    for (const track of held.current?.getTracks() ?? []) track.stop();
    held.current = null;
    recorder.current = null;
    setStream(null);
    setState('idle');
    setElapsed(0);
  }, []);

  /* A camera is never left on by a page that has gone away. */
  useEffect(() => release, [release]);

  const arm = useCallback(async () => {
    setError(null);
    setState('arming');
    try {
      const media = from === 'screen'
        ? await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: quality.fps },
            width: { ideal: quality.width },
            height: { ideal: quality.height },
          },
          /*
           * Asked for, not required — Chrome offers tab audio and
           * Firefox does not, and a demonstration is often silent.
           * A source with no sound still ingests: the engine
           * synthesises a silent track, the same way it synthesises a
           * black picture for a podcast.
           */
          audio: true,
        })
        : await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: quality.width },
            height: { ideal: quality.height },
            frameRate: { ideal: quality.fps },
            ...(device?.cameraId ? { deviceId: { exact: device.cameraId } } : {}),
          },
          audio: device?.microphoneId
            ? { deviceId: { exact: device.microphoneId } } : true,
        });
      held.current = media;
      setStream(media);
      setState('ready');

      /*
       * THE BROWSER'S OWN STOP IS A REAL CONTROL. Chrome's "stop
       * sharing" bar ends the track without telling this page, and a
       * recorder that only noticed its own button would keep writing a
       * black rectangle.
       */
      const track = media.getVideoTracks()[0];
      if (track) {
        track.addEventListener('ended', () => {
          if (recorder.current?.state === 'recording') recorder.current.stop();
          else release();
        });
      }
    } catch (e) {
      /*
       * Dismissing the picker is a decision, not a fault. A red message
       * for it teaches people to distrust red messages.
       */
      const name = (e as { name?: string }).name;
      setState('idle');
      if (name === 'NotAllowedError' || name === 'AbortError') return;
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [device?.cameraId, device?.microphoneId, from, quality.fps,
    quality.height, quality.width, release]);

  const start = useCallback(() => {
    const media = held.current;
    if (!media) return;
    const { mimeType } = container();
    parts.current = [];
    const made = new MediaRecorder(media, {
      ...(mimeType ? { mimeType } : {}),
      videoBitsPerSecond: quality.videoBitsPerSecond,
      audioBitsPerSecond: quality.audioBitsPerSecond,
    });
    made.ondataavailable = (event) => {
      if (event.data.size > 0) parts.current.push(event.data);
    };
    recorder.current = made;
    began.current = Date.now();
    /*
     * A TIMESLICE, SO A CRASH LEAVES SOMETHING. [U-06] One blob at the
     * end means a browser that dies at minute nine leaves nothing at all;
     * four-second parts mean it leaves eight minutes and fifty-six
     * seconds. It is the same interval every other recorder here uses.
     */
    made.start(4000);
    setState('recording');
    setElapsed(0);
  }, [quality.audioBitsPerSecond, quality.videoBitsPerSecond]);

  /* The clock, which is read from the start time and not counted up. */
  useEffect(() => {
    if (state !== 'recording') return;
    const tick = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - began.current) / 1000));
    }, 250);
    return () => window.clearInterval(tick);
  }, [state]);

  const stop = useCallback(async () => {
    const made = recorder.current;
    if (!made || made.state === 'inactive') return null;
    setState('saving');
    const { mimeType, extension } = container();
    const done = new Promise<File>((resolve) => {
      made.onstop = () => {
        const type = mimeType.split(';')[0] || 'video/webm';
        const blob = new Blob(parts.current, { type });
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
        resolve(new File([blob], `${from}-${stamp}.${extension}`, { type }));
      };
    });
    made.stop();
    const file = await done;
    release();
    return file;
  }, [from, release]);

  return { state, stream, elapsed, error, arm, start, stop, release };
}
