'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  type Calibration, CALIBRATION_CLICKS, CLICK_LEAD_SECONDS, CLICK_SPACING_SECONDS,
  summariseCalibration,
} from '../../../src/domain/calibration.js';
import { measureRoundTrip } from '../../../src/domain/align.js';
import { HOUSE_SAMPLE_RATE } from '../../../src/domain/time.js';

/**
 * Measuring what this device adds.  [Doctrine STUDIO-TWO §10, S-3, U-23]
 *
 * The product plays three clicks at moments it chose, the microphone hears
 * them, and the gap is everything the device adds on the way out and back.
 * Four seconds of the author's time, once per device.
 *
 * IT RUNS IN THE BROWSER, entirely. Not because the worker could not do the
 * arithmetic — it is the same `measureRoundTrip` the take assembly uses, which
 * is the point — but because the thing being measured IS this browser on this
 * machine with these headphones, and a measurement that travelled through an
 * upload would be measuring the upload as well.
 *
 * THE MICROPHONE IS OPENED WITH EVERYTHING TURNED OFF. Echo cancellation
 * exists precisely to remove a sound the speakers just made from what the
 * microphone hears, which is the exact sound being measured; automatic gain
 * would rescale the click; noise suppression would treat it as noise. The
 * browser's defaults are right for a call and wrong for a measurement.
 *
 * THE RESULT LIVES IN THIS BROWSER, not in the document. A latency is a fact
 * about a device, and the same performance opened on a laptop and a phone has
 * two different answers. It is written onto each TAKE as it is recorded, so
 * the document still records what was used — but the device's own number stays
 * where the device is.
 */

const STORAGE_KEY = 'balancevid.calibration.v1';

export type CalibrationPhase = 'idle' | 'listening' | 'done' | 'failed';

export interface CalibrationState {
  phase: CalibrationPhase;
  calibration: Calibration | null;
  error: string | null;
  /** Seconds left, for a control that has to say something while it waits. */
  countdown: number;
  run: () => Promise<void>;
  forget: () => void;
}

export function useCalibration(): CalibrationState {
  const [phase, setPhase] = useState<CalibrationPhase>('idle');
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const running = useRef(false);

  /* What this browser measured last time. */
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setCalibration(JSON.parse(stored) as Calibration);
    } catch {
      /* A browser with storage switched off measures again. Not an error. */
    }
  }, []);

  const forget = useCallback(() => {
    setCalibration(null);
    setPhase('idle');
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* as above */ }
  }, []);

  const run = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setError(null);
    setPhase('listening');

    let stream: MediaStream | undefined;
    let context: AudioContext | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        },
      });
      context = new AudioContext({ sampleRate: HOUSE_SAMPLE_RATE });
      await context.resume();

      const recorder = new MediaRecorder(stream);
      const parts: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) parts.push(event.data); };
      const finished = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(parts));
      });
      recorder.start();

      /*
       * The recorder's own clock starts HERE, as far as this measurement is
       * concerned, and every click is scheduled against the audio clock from
       * this same instant. Any error in that assumption is start latency,
       * which the loop is measuring too. [S-3]
       */
      const startedAt = context.currentTime;
      const clickAt: number[] = [];
      for (let i = 0; i < CALIBRATION_CLICKS; i += 1) {
        const when = startedAt + CLICK_LEAD_SECONDS + i * CLICK_SPACING_SECONDS;
        clickAt.push(when - startedAt);
        emitClick(context, when);
      }

      const total = CLICK_LEAD_SECONDS + CALIBRATION_CLICKS * CLICK_SPACING_SECONDS + 0.4;
      for (let left = Math.ceil(total); left > 0; left -= 1) {
        setCountdown(left);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      setCountdown(0);
      recorder.stop();

      const heard = await context.decodeAudioData(await (await finished).arrayBuffer());
      const mono = heard.getChannelData(0);
      const readings = clickAt.map((offset) => measureRoundTrip(
        Math.round(offset * heard.sampleRate), mono, { rate: heard.sampleRate }));

      const result = summariseCalibration(readings, new Date().toISOString());
      setCalibration(result);
      setPhase(result.confident ? 'done' : 'failed');
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(result)); }
      catch { /* measured anyway; it just will not be remembered. */ }
    } catch (e) {
      setError(e instanceof Error
        ? 'We could not reach your microphone, or could not read the recording.'
        : String(e));
      setPhase('failed');
    } finally {
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
      running.current = false;
    }
  }, []);

  return { phase, calibration, error, countdown, run, forget };
}

/**
 * A click: short, broadband, and loud enough to survive a room.
 *
 * Built as a buffer rather than an oscillator so it starts at a sample the
 * product chose. An oscillator ramped up has an onset nobody can point at,
 * and this whole measurement is a measurement of an onset.
 */
function emitClick(context: AudioContext, when: number): void {
  const length = Math.round(context.sampleRate * 0.006);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    // A decaying burst: full amplitude at the first sample, gone in six
    // milliseconds, so the onset is the loudest thing in it.
    data[i] = Math.sin((i / 6) * Math.PI * 2) * (1 - i / length) ** 2;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  const gain = context.createGain();
  gain.gain.value = 0.9;
  source.connect(gain).connect(context.destination);
  source.start(when);
}
