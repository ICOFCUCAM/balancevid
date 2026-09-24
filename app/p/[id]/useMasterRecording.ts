'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Performing against the song.  [Doctrine STUDIO-TWO §10, S-3, U-06]
 *
 * The one thing this has to get right is WHEN the recording started relative
 * to the music, and the brief's §10 makes it sound like something the system
 * simply knows. It is not. Three separate errors are in play:
 *
 *   START LATENCY   `MediaRecorder.start()` does not begin capturing at the
 *                   moment it is called.
 *   OUTPUT LATENCY  the master the performer HEARS is behind the master's own
 *                   clock by the audio device's output latency, so they
 *                   perform late by exactly that much.
 *   THE PAGE CLOCK  `Date.now()` and even `performance.now()` are not the
 *                   clock the audio is playing on.
 *
 * So the master is played through Web Audio, whose clock IS the audio clock,
 * and the offset is taken from it at the moment the first chunk closes —
 * corrected by the device latency the author calibrated, where they have. The
 * worker then checks the answer against the master itself.
 *
 * HEADPHONES. §10 says the performer should wear them and this hook cannot
 * enforce it. What it can do is make the reason visible: a take recorded with
 * the song coming out of speakers carries the backing track twice in the
 * finished video, a few milliseconds apart, and that cannot be removed
 * afterwards. The worker detects it and the studio says so.
 */

/** Rolling segments, as every other recording in this product uses. [U-06] */
const SEGMENT_MS = 4000;

export type RecordingPhase = 'idle' | 'arming' | 'ready' | 'counting' | 'recording' | 'finishing';

export interface MasterRecording {
  phase: RecordingPhase;
  error: string | null;
  /** Where the song has got to, in seconds, for a playhead. */
  position: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** The camera, for a preview elsewhere on the page. */
  stream: MediaStream | null;
  arm: () => Promise<void>;
  start: (label: string, environment: { kind: string; spaceId?: string }) => Promise<void>;
  stop: () => void;
  disarm: () => void;
}

export function useMasterRecording({
  performanceId, masterUrl, sampleRate, countInSeconds, latencySamples, onFinished,
}: {
  performanceId: string;
  masterUrl: string;
  sampleRate: number;
  /** A musical lead-in, so nobody starts singing from a standing start. [S-10] */
  countInSeconds: number;
  /** What the author's device adds, if they have calibrated it. [S-3] */
  latencySamples: number;
  onFinished: (jobId: string) => void;
}): MasterRecording {
  const [phase, setPhase] = useState<RecordingPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const takeRef = useRef<{ takeId: string } | null>(null);
  /**
   * Which segment number the NEXT one opening will be.
   *
   * Reserved when a segment opens rather than when it closes, because the
   * number is the take's running order and closing is when things go wrong.
   */
  const indexRef = useRef(0);
  const startedAtRef = useRef(0);
  const offsetRef = useRef(0);

  /* ---- the camera, and the song, loaded before anything begins --------- */
  const arm = useCallback(async () => {
    setError(null);
    setPhase('arming');
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        /*
         * Echo cancellation OFF, deliberately, and it is the opposite of the
         * Conversation Room's choice. There the browser's processing helps:
         * it is speech, and the room's own sound is noise. Here the room's
         * sound is a performance, and echo cancellation would duck the
         * singing every time the backing track moved.
         */
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = media;
      setStream(media);
      if (videoRef.current) videoRef.current.srcObject = media;

      const context = new AudioContext({ sampleRate });
      const response = await fetch(masterUrl);
      bufferRef.current = await context.decodeAudioData(await response.arrayBuffer());
      audioRef.current = context;
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error
        ? 'We could not reach your camera, or could not read the song. Check this site\'s permissions.'
        : String(e));
      setPhase('idle');
    }
  }, [masterUrl, sampleRate]);

  const disarm = useCallback(() => {
    sourceRef.current?.stop();
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void audioRef.current?.close();
    streamRef.current = null;
    audioRef.current = null;
    bufferRef.current = null;
    setStream(null);
    setPhase('idle');
    setPosition(0);
  }, []);

  /* ---- a take ---------------------------------------------------------- */

  /**
   * The take is over: ask for it to be joined and placed on the song.
   *
   * Called ONLY once the last segment has finished uploading. The first
   * version waited a fixed 600ms instead and hoped — and hoping is what the
   * rest of this file exists not to do.
   */
  const finishTake = useCallback(async (takeId: string) => {
    try {
      const response = await fetch(`/api/performances/${performanceId}/takes/${takeId}`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hintSamples: offsetRef.current }),
      });
      const data = await response.json().catch(() => ({}));
      if (data.job?.id) onFinished(data.job.id);
    } catch {
      /* The chunks are on disk under their numbers; it can be retried. */
    } finally {
      setPhase('ready');
    }
  }, [onFinished, performanceId]);

  const segment = useCallback((takeId: string) => {
    const media = streamRef.current;
    if (!media) return;
    const recorder = new MediaRecorder(media);
    const parts: Blob[] = [];
    const index = indexRef.current;
    indexRef.current += 1;
    recorder.ondataavailable = (event) => { if (event.data.size > 0) parts.push(event.data); };
    recorder.onstop = () => {
      /*
       * UPLOADED WHATEVER ELSE IS TRUE. The first version read the take out of
       * a ref and returned early when it was gone — and the take being gone is
       * exactly the state the LAST segment closes in, because `stop` clears it
       * before stopping the recorder. So every take lost its final segment: up
       * to four seconds of somebody's performance, silently, with a duration
       * that looked plausible. [U-06]
       */
      const upload = fetch(
        `/api/performances/${performanceId}/takes/${takeId}?index=${index}`,
        { method: 'POST', body: new Blob(parts),
          headers: { 'content-type': 'application/octet-stream' } },
      ).catch(() => { /* the next segment carries on; U-06's whole point. */ });

      if (takeRef.current && recorderRef.current === recorder) segment(takeId);
      else void upload.then(() => finishTake(takeId));
    };
    recorder.start();
    recorderRef.current = recorder;
    window.setTimeout(() => {
      if (recorderRef.current === recorder && recorder.state === 'recording') recorder.stop();
    }, SEGMENT_MS);
  }, [finishTake, performanceId]);

  const start = useCallback(async (
    label: string, environment: { kind: string; spaceId?: string },
  ) => {
    const context = audioRef.current;
    const buffer = bufferRef.current;
    if (!context || !buffer) { setError('turn the camera on first'); return; }
    setError(null);

    try {
      await context.resume();
      setPhase('counting');

      /*
       * Scheduled, not started. `AudioBufferSourceNode.start(when)` places the
       * music on the audio clock at a moment chosen in advance, which is the
       * only way to know afterwards where it began — starting it "now" and
       * asking later gives you the page's idea of now, which is not the same
       * clock.
       */
      const beginsAt = context.currentTime + countInSeconds;
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start(beginsAt);
      sourceRef.current = source;

      const response = await fetch(`/api/performances/${performanceId}/takes`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          label, environment, offsetSamples: 0,
          method: latencySamples ? 'calibrated' : 'measured',
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'could not begin the take');

      takeRef.current = { takeId: data.takeId };
      indexRef.current = 0;

      // Wait out the count-in, then record. The music has already been placed
      // on the audio clock, so this only decides when the camera joins it.
      window.setTimeout(() => {
        if (!takeRef.current) return;
        const context2 = audioRef.current;
        if (!context2) return;

        /*
         * WHERE THE SONG IS, at the instant the recorder starts, on the audio
         * clock — plus what the device adds on the way to the performer's
         * ears, which they heard and therefore performed behind.
         */
        const into = context2.currentTime - beginsAt;
        offsetRef.current = Math.max(0, Math.round(into * sampleRate) + latencySamples);
        startedAtRef.current = context2.currentTime;
        segment(takeRef.current.takeId);
        setPhase('recording');
      }, Math.max(0, countInSeconds * 1000));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('ready');
    }
  }, [countInSeconds, latencySamples, performanceId, sampleRate, segment]);

  const stop = useCallback(() => {
    const take = takeRef.current;
    if (!take) return;
    setPhase('finishing');
    takeRef.current = null;
    sourceRef.current?.stop();

    const recorder = recorderRef.current;
    if (recorder && recorder.state === 'recording') {
      // Its `onstop` uploads the last segment and then finalises the take, in
      // that order, so the worker never joins a take that is still arriving.
      recorder.stop();
    } else {
      // Between segments: nothing is in flight and no `onstop` is coming.
      void finishTake(take.takeId);
    }
  }, [finishTake]);

  /* ---- the playhead ---------------------------------------------------- */
  useEffect(() => {
    if (phase !== 'recording' && phase !== 'counting') return;
    const timer = window.setInterval(() => {
      const context = audioRef.current;
      if (!context) return;
      setPosition(Math.max(0,
        (context.currentTime - startedAtRef.current) + offsetRef.current / sampleRate));
    }, 100);
    return () => window.clearInterval(timer);
  }, [phase, sampleRate]);

  // Leaving the page should not leave a camera light on.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void audioRef.current?.close();
  }, []);

  return { phase, error, position, videoRef, stream, arm, start, stop, disarm };
}
