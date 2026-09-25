'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Alignment, Performance } from '../../../src/domain/performance.js';
import { effectiveOffset, sceneAt } from '../../../src/domain/performance.js';
import { HOUSE_SAMPLE_RATE } from '../../../src/domain/time.js';

/**
 * Several takes, playing as one.  [Doctrine STUDIO-TWO §2, §7, S-2]
 *
 * "All takes are aligned to the same music clock. The song itself never
 *  moves."
 *
 * THE SONG IS THE CLOCK, and everything else follows it. That is not a
 * metaphor here: the master plays through Web Audio, whose `currentTime` is
 * the audio hardware's own clock, and every video element is steered to agree
 * with it. Nothing is steered to agree with anything else — no video is the
 * reference, because a video element's clock is a suggestion and four of them
 * are four suggestions.
 *
 * WHY STEERED AND NOT SET. A `<video>` told to seek stalls for a frame or two
 * and then drifts, because its playback rate is whatever its own clock thinks
 * one second is. Setting `currentTime` every tick would be a permanent stutter.
 * So each take is nudged instead: small errors are corrected by running very
 * slightly fast or slow, which is inaudible and invisible, and only an error
 * too large to walk off is corrected by seeking. This is what every
 * synchronised player does, and doing it the obvious way instead is the
 * difference between a tool and a demo.
 */

/** Past this, a nudge cannot catch up in reasonable time: seek. */
const SEEK_THRESHOLD_SECONDS = 0.25;
/** Inside this, leave it alone — correcting noise is how you make judder. */
const IN_SYNC_SECONDS = 0.012;
/** The most the rate is bent. Beyond this it is audible on a voice. */
const MAX_RATE_TRIM = 0.06;

export interface PerformancePlayer {
  playing: boolean;
  /**
   * Where the song is, for DRAWING. Updated about ten times a second.
   *
   * Deliberately not the exact clock. The steering below runs every animation
   * frame, and pushing that into React state would re-render the stage, the
   * timeline and every video's style sixty times a second — in a tool whose
   * whole job is timing, spending the frame budget on redrawing a playhead is
   * the wrong trade.
   */
  position: number;
  /**
   * Where the song is, exactly, right now.
   *
   * For decisions rather than for drawing: a scene written by a keypress must
   * land where the song actually was, not where the last repaint said it was.
   * A tenth of a second is invisible on a playhead and three frames out on a
   * cut.
   */
  positionNow: () => number;
  ready: boolean;
  error: string | null;
  play: () => Promise<void>;
  pause: () => void;
  seek: (samples: number) => void;
  /** Register a take's video element so the player can steer it. */
  attach: (takeId: string, element: HTMLVideoElement | null) => void;
  /**
   * How loud the song is, 0 to 1.
   *
   * MONITORING ONLY. This is the volume of the speakers in the room while
   * somebody directs — it is not a property of the performance, it is not
   * written to the document, and it changes nothing about the render. Turning
   * the song down to hear yourself think must not quietly turn it down in the
   * finished video. [§9]
   */
  volume: number;
  setVolume: (level: number) => void;
}

/**
 * Which takes need decoding is resolved HERE, from the player's own clock.
 *
 * The caller cannot supply it: the answer depends on where the song is, and
 * where the song is comes out of this hook. Asking the caller would mean
 * asking it to know the position before the thing that knows the position has
 * told it — and the first version quietly passed the scene at zero, which
 * would have decoded the opening scene's takes for the whole song.
 */
export function usePerformancePlayer(performance: Performance): PerformancePlayer {
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(1);

  const contextRef = useRef<AudioContext | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  /** Where the song was when playback began, and when that was. */
  const originRef = useRef({ atSample: 0, atContextTime: 0 });
  const pausedAtRef = useRef(0);
  /** When the playhead was last pushed into React. See `position` above. */
  const lastDrawn = useRef(0);
  const elements = useRef(new Map<string, HTMLVideoElement>());
  const documentRef = useRef(performance);
  documentRef.current = performance;

  const id = performance.id;
  const alignments = useRef(new Map<string, Alignment>());
  alignments.current = new Map(performance.takes.map((t) => [t.id, t.alignment]));

  /* ---- the song ------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const context = new AudioContext({ sampleRate: HOUSE_SAMPLE_RATE });
        const gain = context.createGain();
        gain.connect(context.destination);
        const response = await fetch(`/api/performances/${id}/master`);
        if (!response.ok) throw new Error('the song is not ready yet');
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (cancelled) { void context.close(); return; }
        contextRef.current = context;
        gainRef.current = gain;
        bufferRef.current = buffer;
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => () => {
    sourceRef.current?.stop();
    void contextRef.current?.close();
  }, []);

  /** Where the song is now, from the audio clock — never from a counter. */
  const now = useCallback((): number => {
    const context = contextRef.current;
    if (!context || !sourceRef.current) return pausedAtRef.current;
    const { atSample, atContextTime } = originRef.current;
    return atSample + (context.currentTime - atContextTime) * HOUSE_SAMPLE_RATE;
  }, []);

  const startAt = useCallback((samples: number) => {
    const context = contextRef.current;
    const buffer = bufferRef.current;
    if (!context || !buffer) return;
    sourceRef.current?.stop();
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gainRef.current ?? context.destination);
    source.start(0, Math.max(0, samples) / HOUSE_SAMPLE_RATE);
    sourceRef.current = source;
    originRef.current = { atSample: Math.max(0, samples), atContextTime: context.currentTime };
  }, []);

  const play = useCallback(async () => {
    const context = contextRef.current;
    if (!context || !bufferRef.current) return;
    await context.resume();
    startAt(pausedAtRef.current);
    setPlaying(true);
  }, [startAt]);

  const pause = useCallback(() => {
    pausedAtRef.current = now();
    sourceRef.current?.stop();
    sourceRef.current = null;
    for (const element of elements.current.values()) element.pause();
    setPlaying(false);
  }, [now]);

  const seek = useCallback((samples: number) => {
    pausedAtRef.current = Math.max(0, Math.min(samples, performance.master.durationSamples));
    lastDrawn.current = pausedAtRef.current;
    setPosition(pausedAtRef.current);
    if (sourceRef.current) startAt(pausedAtRef.current);
    // Paused or playing, the pictures move with the song.
    for (const [takeId, element] of elements.current) {
      const alignment = alignments.current.get(takeId);
      if (alignment) element.currentTime = takeSeconds(alignment, pausedAtRef.current);
    }
  }, [performance.master.durationSamples, startAt]);

  const setVolume = useCallback((level: number) => {
    const clamped = Math.max(0, Math.min(1, level));
    setVolumeState(clamped);
    /*
     * Ramped rather than set. A gain that jumps discontinuously clicks, and a
     * click on every pixel of a drag is a slider that sounds broken.
     */
    const gain = gainRef.current;
    if (gain && contextRef.current) {
      gain.gain.setTargetAtTime(clamped, contextRef.current.currentTime, 0.01);
    }
  }, []);

  const attach = useCallback((takeId: string, element: HTMLVideoElement | null) => {
    if (element) elements.current.set(takeId, element);
    else elements.current.delete(takeId);
  }, []);

  /* ---- the steering ---------------------------------------------------- */
  useEffect(() => {
    if (!playing) return;
    let stopped = false;

    const tick = () => {
      if (stopped) return;
      const at = now();
      if (at - lastDrawn.current > HOUSE_SAMPLE_RATE / 10) {
        lastDrawn.current = at;
        setPosition(at);
      }

      if (at >= performance.master.durationSamples) { pause(); return; }

      for (const [takeId, element] of elements.current) {
        const alignment = alignments.current.get(takeId);
        if (!alignment) continue;

        /*
         * A take that is not on screen is paused rather than played silently
         * in the background. Four decoders running for one visible picture is
         * how a laptop's fans come on and the author starts mistrusting their
         * own timing.
         */
        const onScreen: readonly string[] =
          sceneAt(documentRef.current, Math.round(at))?.takeIds ?? [];
        if (!onScreen.includes(takeId)) {
          if (!element.paused) element.pause();
          continue;
        }

        const want = takeSeconds(alignment, at);
        if (want < 0 || want > element.duration || Number.isNaN(element.duration)) {
          if (!element.paused) element.pause();
          continue;
        }
        if (element.paused) { void element.play().catch(() => undefined); }

        const drift = element.currentTime - want;
        if (Math.abs(drift) > SEEK_THRESHOLD_SECONDS) {
          // Too far to walk off: jump, and accept the stall.
          element.currentTime = want;
          element.playbackRate = 1;
        } else if (Math.abs(drift) > IN_SYNC_SECONDS) {
          /*
           * Walk it off. Running a few percent fast or slow for a moment is
           * invisible on a picture and inaudible on a voice; a seek every
           * tick is a permanent stutter.
           */
          const trim = Math.max(-MAX_RATE_TRIM, Math.min(MAX_RATE_TRIM, -drift * 0.5));
          element.playbackRate = 1 + trim;
        } else if (element.playbackRate !== 1) {
          element.playbackRate = 1;
        }
      }
      window.requestAnimationFrame(tick);
    };

    window.requestAnimationFrame(tick);
    return () => { stopped = true; };
  }, [playing, now, pause, performance.master.durationSamples]);

  return {
    playing, position, positionNow: now, ready, error,
    play, pause, seek, attach, volume, setVolume,
  };
}

/** Where this take's own media is, at this moment of the song. [S-2] */
function takeSeconds(alignment: Alignment, masterSample: number): number {
  return ((masterSample - effectiveOffset(alignment)) * alignment.rateRatio)
    / HOUSE_SAMPLE_RATE;
}
