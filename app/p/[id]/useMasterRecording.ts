'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { placeTakeOnSong } from '../../../src/domain/calibration.js';

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

/**
 * WHERE A RECORDING GOES.  [D-19, D-25; TAKE-APP T3, T4]
 *
 * Everything above this line is about getting the SYNC right — the song
 * on the audio clock, the offset taken at the instant the first chunk
 * closes, the device latency subtracted, the elapsed time measured
 * where it is honest. None of it has anything to do with which URL the
 * bytes are posted to, and all of it is the part that must not exist
 * twice.
 *
 * So the destination is an argument. The studio's own recorder sends to
 * the performance; the Take App sends to the participation request it
 * was opened from. One recorder, two sinks — because the alternative is
 * a second recorder that gets the latency arithmetic subtly wrong six
 * months from now and nobody notices until a take is three frames out.
 */
export interface RecordingSink {
  /**
   * Declare the recording BEFORE the media exists, and answer with its
   * id. A browser that crashes mid-song has still left evidence that
   * somebody was recording, and chunks arriving for a recording nobody
   * declared would have nowhere to go. [U-06]
   */
  begin: (spec: {
    label: string;
    environment: { kind: string; spaceId?: string };
    offsetSamples: number;
    method: 'measured' | 'calibrated';
    latencySamples?: number;
  }) => Promise<string>;
  /** One segment, under its number. */
  chunk: (id: string, index: number, body: Blob) => Promise<void>;
  /** The last segment has landed: join it and place it. */
  finish: (id: string, spec: {
    hintSamples: number; elapsedSamples: number; latencySamples: number;
  }) => Promise<{ jobId?: string }>;
}

export interface MasterRecording {
  phase: RecordingPhase;
  error: string | null;
  /** Where the song has got to, in seconds, for a playhead. */
  position: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** The camera, for a preview elsewhere on the page. */
  stream: MediaStream | null;
  arm: () => Promise<void>;
  /**
   * Begin, optionally from somewhere other than the top of the song.
   *
   * `fromSamples` is where the SONG starts playing, not where the take
   * is placed: a performer asked for the third verse hears the third
   * verse, and the take still lands on the song's own clock wherever
   * the recorder actually opened. [TIMELINE B7]
   */
  start: (
    label: string,
    environment: { kind: string; spaceId?: string },
    fromSamples?: number,
  ) => Promise<void>;
  stop: () => void;
  disarm: () => void;
}

export function useMasterRecording({
  sink, masterUrl, sampleRate, countInSeconds, latencySamples, onFinished,
  audioOnly, once,
}: {
  sink: RecordingSink;
  /**
   * A sound rather than a performance.  [TIMELINE B6i]
   *
   * A voice-over over the song is the same recording problem as a take
   * — the same count-in, the same audio clock, the same measurement of
   * where the song was when capture began — and differs in one thing:
   * there is no picture. Asking for a camera the recording will not
   * use costs a permission prompt, a light on the machine and the
   * author's trust, all for a stream that is thrown away.
   */
  audioOnly?: boolean;
  /**
   * One recording per arming.  [TIMELINE B6i; U-19]
   *
   * A take recorder stays armed, because the next thing an author
   * does is record the same song again — five takes is the point. A
   * voice-over is one sentence at one moment, and leaving the
   * microphone open after it has landed is a device left running for
   * something that is over.
   *
   * IT HAS TO BE THE HOOK'S OWN DECISION rather than the caller's.
   * The first version called `disarm()` from `onFinished`, which is
   * called from inside `finishTake` — whose `finally` then set the
   * phase back to 'ready' immediately after, so the bar reappeared
   * offering "Start" over a sound that had already landed. The
   * browser showed that; no test would have.
   */
  once?: boolean;
  /**
   * The song to record against, or nothing.  [TIMELINE B14d; T12]
   *
   * NOTHING IS A REAL CASE, not a missing argument. A producer who
   * sends a question to a phone is asking for an answer, and there
   * is no clock to keep: no song plays, the count-in is still
   * counted so nobody starts talking from a standing start, and the
   * recording's offset is zero because it is not against anything.
   *
   * Everything else the hook exists for — segments uploaded as they
   * close, the elapsed time taken on the audio clock, the phase the
   * surface reads — is the same either way, and a second recorder
   * for answers would be a second place all of it could be got
   * wrong. [D-19, U-06]
   */
  masterUrl: string | null;
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
  /**
   * When the recorder was told to stop, on the audio clock.
   *
   * Taken at `stop()` rather than when the take is finalised. Finalising waits
   * for the last segment to upload, and measuring the recording's length from
   * there makes every take look one or two percent short — which is the coarse
   * rate check reporting a working machine as broken. [§10, S-3]
   */
  const stoppedAtRef = useRef(0);
  const offsetRef = useRef(0);

  /* ---- the camera, and the song, loaded before anything begins --------- */
  const arm = useCallback(async () => {
    setError(null);
    setPhase('arming');
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: audioOnly
          ? false
          : { width: { ideal: 1280 }, height: { ideal: 720 } },
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
      if (masterUrl) {
        const response = await fetch(masterUrl);
        bufferRef.current = await context.decodeAudioData(
          await response.arrayBuffer());
      }
      audioRef.current = context;
      setPhase('ready');
    } catch (e) {
      setError(e instanceof Error
        ? `We could not reach your ${audioOnly ? 'microphone' : 'camera'}`
          + `${masterUrl ? ', or could not read the song' : ''}. `
          + "Check this site's permissions."
        : String(e));
      setPhase('idle');
    }
  }, [audioOnly, masterUrl, sampleRate]);

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
      /*
       * How long the recorder ran, by the audio clock — the only clock in the
       * browser worth measuring anything against. The worker compares it
       * against how many samples actually came out, which catches a device
       * recording at a rate it did not claim. [§10, S-3]
       */
      const elapsedSamples = stoppedAtRef.current > startedAtRef.current
        ? Math.max(0, Math.round(
          (stoppedAtRef.current - startedAtRef.current) * sampleRate))
        : 0;
      const { jobId } = await sink.finish(takeId, {
        hintSamples: offsetRef.current, elapsedSamples, latencySamples,
      });
      if (jobId) onFinished(jobId);
    } catch {
      /* The chunks are on disk under their numbers; it can be retried. */
    } finally {
      if (once) disarm();
      else setPhase('ready');
    }
  }, [disarm, latencySamples, once, onFinished, sampleRate, sink]);

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
      const upload = sink.chunk(takeId, index, new Blob(parts))
        .catch(() => { /* the next segment carries on; U-06's whole point. */ });

      if (takeRef.current && recorderRef.current === recorder) segment(takeId);
      else void upload.then(() => finishTake(takeId));
    };
    recorder.start();
    recorderRef.current = recorder;
    window.setTimeout(() => {
      if (recorderRef.current === recorder && recorder.state === 'recording') recorder.stop();
    }, SEGMENT_MS);
  }, [finishTake, sink]);

  const start = useCallback(async (
    label: string, environment: { kind: string; spaceId?: string },
    fromSamples = 0,
  ) => {
    const context = audioRef.current;
    const buffer = bufferRef.current;
    /* A song is required only where there is one to require. [B14d] */
    if (!context || (masterUrl && !buffer)) {
      setError(audioOnly ? 'turn the microphone on first' : 'turn the camera on first');
      return;
    }
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
      /*
       * WHERE IN THE SONG IT STARTS.  [TIMELINE B7]
       *
       * "I need an extra vocal section here" — so the song begins
       * where the playhead is rather than at the top, and nobody has
       * to sit through three minutes to record the last verse again.
       *
       * Clamped INSIDE the song: `AudioBufferSourceNode.start` with an
       * offset past the buffer's end plays nothing at all, silently,
       * which would look exactly like a broken microphone.
       */
      const fromSeconds = buffer
        ? Math.max(0, Math.min(buffer.duration - 0.05, fromSamples / sampleRate))
        : 0;
      /*
       * NO SONG, NO SOURCE. An answer to a question is not recorded
       * against anything, so there is nothing to schedule — and the
       * count-in below still runs, because somebody asked a question
       * and nobody should have to start talking from a standing
       * start. [S-10, B14d]
       */
      if (buffer) {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start(beginsAt, fromSeconds);
        sourceRef.current = source;
      }

      const takeId = await sink.begin({
        label, environment, offsetSamples: 0,
        method: latencySamples ? 'calibrated' : 'measured',
        ...(latencySamples ? { latencySamples } : {}),
      });

      takeRef.current = { takeId };
      indexRef.current = 0;

      // Wait out the count-in, then record. The music has already been placed
      // on the audio clock, so this only decides when the camera joins it.
      window.setTimeout(() => {
        if (!takeRef.current) return;
        const context2 = audioRef.current;
        if (!context2) return;

        /*
         * WHERE THE SONG IS, at the instant the recorder starts, on the audio
         * clock — LESS what the device adds.
         *
         * Less, not plus. The performer hears the song late by the output
         * latency and their reply lands in the file later again by the
         * capture latency, so the sound at a given media position belongs
         * EARLIER in the song than the clock alone would say. The derivation
         * is written out in `domain/calibration.ts`; the first version of this
         * line added the number, which would have doubled the error instead
         * of removing it. [S-3]
         */
        /*
         * AND THE OFFSET COUNTS FROM WHERE THE SONG WAS, not from
         * where the audio clock was. `into` is how long after the song
         * began that the recorder opened; the song began at
         * `fromSeconds`, so the moment being recorded is the sum. The
         * first version of this line added nothing, which placed every
         * take recorded from the playhead at the top of the song —
         * the arithmetic that makes this feature worth having is
         * exactly this addition. [§10, S-3]
         */
        const into = context2.currentTime - beginsAt;
        /*
         * AN ANSWER IS NOT AGAINST ANYTHING, so its offset is zero
         * rather than however long the count-in happened to take. A
         * number there would be a measurement of nothing, and the
         * producer would see it in the inbox as though it meant
         * something. [B14d]
         */
        offsetRef.current = masterUrl
          ? placeTakeOnSong(
            Math.round((fromSeconds + into) * sampleRate), latencySamples)
          : 0;
        startedAtRef.current = context2.currentTime;
        stoppedAtRef.current = 0;
        segment(takeRef.current.takeId);
        setPhase('recording');
      }, Math.max(0, countInSeconds * 1000));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('ready');
    }
  }, [audioOnly, countInSeconds, latencySamples, masterUrl, sampleRate, segment, sink]);

  const stop = useCallback(() => {
    const take = takeRef.current;
    if (!take) return;
    setPhase('finishing');
    takeRef.current = null;
    stoppedAtRef.current = audioRef.current?.currentTime ?? 0;
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
