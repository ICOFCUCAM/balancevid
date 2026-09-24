'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { measureVoice } from '../../../../src/domain/voice.js';

/**
 * A participant's own camera, and their own microphone.  [Doctrine ROOM §2, §10]
 *
 * Two jobs, and they are deliberately separate:
 *
 *   MEASURE, always. While anyone is in the room their microphone is
 *   analysed locally and two numbers go to the server ten times a second —
 *   how loud, and how much like a voice. No audio leaves the browser for
 *   this, and the analysis is `measureVoice`, which is a pure function with
 *   its own tests.
 *
 *   RECORD, only while staged. "Record each participant's media
 *   independently... The raw participant recordings remain intact." So each
 *   browser records ITSELF, in rolling segments, and uploads them — exactly
 *   the path the host's own recording already takes (U-06). Nothing is mixed
 *   live, and who was on stage can therefore be changed afterwards.
 *
 * WHAT THIS DOES NOT DO is send anybody's media to anybody else. That is the
 * transport's job (`useRoomMesh`), and it is deliberately somewhere else: the
 * finished video is made from what this hook records, so it stays correct
 * whether or not anybody ever saw each other live. The camera is handed out
 * below as `stream` for the transport to borrow — one getUserMedia, one
 * camera light, two unrelated uses of it.
 */

/** How often a microphone reports itself. Ten a second: the policy's clock. */
const READING_MS = 100;
/** Rolling segments, as the host's capture uses, so a crash costs one. */
const SEGMENT_MS = 4000;
/** An FFT big enough to resolve the speech band, small enough to be free. */
const FFT_SIZE = 1024;

export interface RoomCapture {
  armed: boolean;
  recording: boolean;
  error: string | null;
  /** The live camera, for the participant's own reassurance. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /**
   * The same camera, for the transport to send to the others. [ROOM §12]
   *
   * State rather than the ref, because the transport has to react to it
   * arriving — a ref changing tells React nothing.
   */
  stream: MediaStream | null;
  arm: () => Promise<void>;
  disarm: () => void;
}

export function useRoomCapture({
  conversationId, staged, sourceFrame,
}: {
  conversationId: string;
  /** The host has put them on stage: they should be recording. */
  staged: boolean;
  /** Where the source is, so a turn is anchored on the source clock (U-08). */
  sourceFrame: () => number;
}): RoomCapture {
  const [armed, setArmed] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioRef = useRef<AudioContext | null>(null);
  const previousRef = useRef<Float32Array | null>(null);
  const floorRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const takeRef = useRef<{ interventionId: string; takeId: string } | null>(null);
  /** The number the NEXT segment to open will carry. See `startSegment`. */
  const indexRef = useRef(0);
  const stagedRef = useRef(staged);
  useEffect(() => { stagedRef.current = staged; }, [staged]);

  /* ---- the microphone, measured and reported ------------------------- */
  useEffect(() => {
    if (!armed) return;
    const timer = window.setInterval(() => {
      const analyser = analyserRef.current;
      const context = audioRef.current;
      if (!analyser || !context) return;

      const decibels = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(decibels);
      // Out of decibels and into linear magnitudes, which is what the
      // measurement expects — it returns zero for negative input rather than
      // guessing, so getting this wrong fails loudly rather than quietly.
      const magnitudes = new Float32Array(decibels.length);
      for (let i = 0; i < decibels.length; i += 1) {
        magnitudes[i] = decibels[i]! <= -100 ? 0 : 10 ** (decibels[i]! / 20);
      }

      const reading = measureVoice(magnitudes, {
        sampleRate: context.sampleRate,
        ...(previousRef.current ? { previous: previousRef.current } : {}),
        noiseFloor: floorRef.current,
      });
      previousRef.current = magnitudes;
      floorRef.current = reading.noiseFloor;

      void fetch(`/api/conversations/${conversationId}/room/voice`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          energy: reading.energy,
          speechConfidence: reading.speechConfidence,
          noiseFloor: reading.noiseFloor,
        }),
        // A late reading is worthless; the next one is 100ms away.
        keepalive: false,
      }).catch(() => { /* a dropped reading is a dropped reading. */ });
    }, READING_MS);
    return () => window.clearInterval(timer);
  }, [armed, conversationId]);

  /* ---- recording, while and only while staged ------------------------ */

  /**
   * The turn is over: ask for the segments to be joined.
   *
   * Called only once the LAST segment has been uploaded, because a take
   * finalised while its final chunk is still in flight is assembled short.
   */
  const finalizeTake = useCallback(async (
    take: { interventionId: string; takeId: string },
  ) => {
    await fetch(`/api/conversations/${conversationId}/takes/${take.takeId}/finalize`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ interventionId: take.interventionId, prerollSegments: 0 }),
    }).catch(() => { /* the chunks are on disk; it can be retried. */ });
  }, [conversationId]);

  const startSegment = useCallback(() => {
    const stream = streamRef.current;
    const take = takeRef.current;
    if (!stream || !take) return;
    const { interventionId, takeId } = take;
    const recorder = new MediaRecorder(stream);
    const parts: Blob[] = [];
    const index = indexRef.current;
    indexRef.current += 1;
    recorder.ondataavailable = (event) => { if (event.data.size > 0) parts.push(event.data); };
    recorder.onstop = () => {
      /*
       * UPLOADED WHATEVER ELSE IS TRUE. Reading the take out of the ref and
       * skipping the upload when it is gone loses the last segment of every
       * turn — because being taken off stage clears the ref and THEN stops the
       * recorder, so the final chunk always closes after the take is gone.
       * That is the end of somebody's answer, missing, with nothing to show
       * for it but a duration that looks plausible. [U-06]
       */
      const upload = fetch(
        `/api/conversations/${conversationId}/takes/${takeId}/chunks?index=${index}`,
        { method: 'POST', body: new Blob(parts),
          headers: { 'content-type': 'application/octet-stream' } },
      ).catch(() => { /* the next segment carries on regardless. */ });

      if (stagedRef.current && takeRef.current) startSegment();
      else void upload.then(() => finalizeTake({ interventionId, takeId }));
    };
    recorder.start();
    recorderRef.current = recorder;
    window.setTimeout(() => {
      if (recorderRef.current === recorder && recorder.state === 'recording') recorder.stop();
    }, SEGMENT_MS);
  }, [conversationId, finalizeTake]);

  useEffect(() => {
    if (!armed) return;

    if (staged && !takeRef.current) {
      /*
       * They have been brought in. A turn begins: an intervention anchored
       * where the source is, attributed by the server to whoever the session
       * says they are — never to whoever the request claims.
       */
      void (async () => {
        try {
          const response = await fetch(`/api/conversations/${conversationId}/interventions`, {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ tSourceFrame: sourceFrame(), type: 'explain' }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error ?? 'could not start recording');
          takeRef.current = {
            interventionId: data.interventionId, takeId: data.takeId,
          };
          indexRef.current = 0;
          setRecording(true);
          startSegment();
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        }
      })();
    }

    if (!staged && takeRef.current) {
      // Taken off stage: close the take, and let the worker assemble it.
      const take = takeRef.current;
      takeRef.current = null;
      setRecording(false);
      const recorder = recorderRef.current;
      if (recorder && recorder.state === 'recording') {
        // Its `onstop` uploads the last segment and finalises after it.
        recorder.stop();
      } else {
        // Between segments: nothing in flight, and no `onstop` is coming.
        void finalizeTake(take);
      }
    }
  }, [armed, staged, conversationId, sourceFrame, startSegment, finalizeTake]);

  const arm = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        // The room's own noise handling is the measurement's job, but the
        // browser's is free and better at the parts it does.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      setStream(stream);
      if (videoRef.current) videoRef.current.srcObject = stream;

      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      // Little smoothing: the measurement wants to see the spectrum MOVE, and
      // a smoothed analyser is one that has already hidden the movement.
      analyser.smoothingTimeConstant = 0.1;
      context.createMediaStreamSource(stream).connect(analyser);
      audioRef.current = context;
      analyserRef.current = analyser;
      setArmed(true);
    } catch (e) {
      setError(e instanceof Error
        ? 'We could not reach your camera or microphone. Check this site\'s permissions.'
        : String(e));
    }
  }, []);

  const disarm = useCallback(() => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void audioRef.current?.close();
    streamRef.current = null;
    setStream(null);
    analyserRef.current = null;
    audioRef.current = null;
    takeRef.current = null;
    setArmed(false);
    setRecording(false);
  }, []);

  // Leaving the page should not leave a camera light on.
  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    void audioRef.current?.close();
  }, []);

  return { armed, recording, error, videoRef, stream, arm, disarm };
}
