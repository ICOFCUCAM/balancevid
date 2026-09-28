'use client';

import { useEffect, useRef, useState } from 'react';
import { measureVoice } from '../../../src/domain/voice.js';

/**
 * The meters on the desk.  [Doctrine CHANNEL §7, ROOM §2, D-19]
 *
 *     ▁▃▅▇▅▃▁   ▁▂▄▂▁
 *      HOST      MASTER
 *
 * A control room's one honest answer to "is it working". A picture can be
 * wrong in ways nobody notices for a minute; silence is noticed in three
 * seconds, and a meter that is moving is the difference between a presenter
 * who knows their microphone is live and one who finds out afterwards.
 *
 * IT MEASURES NOTHING NEW. `measureVoice` is the Room's own measurement —
 * energy, speech confidence and a noise floor that follows the room — and it
 * is already unit-tested against spectra. This is the twenty lines of
 * plumbing its own header says it deliberately does not contain: an
 * AnalyserNode per stream, a frame every so often, and the energy handed
 * back. A second loudness calculation in this codebase would be a second
 * answer to "is anybody talking", and the Room's speaker switching and the
 * channel's meters would disagree about it on exactly the quiet sentence
 * where it matters.
 */

/** Small: this is a meter, not an analysis. 32 bins is plenty for a bar. */
const FFT_SIZE = 256;

/** Twenty a second. A meter updated at 60fps is a meter costing a frame. */
const FRAME_MS = 50;

export interface FeedLevel {
  id: string;
  /** 0–1, as `stage.ts` means loudness. */
  energy: number;
  /** 0–1. Whether this sounds like a voice rather than a fan. */
  speech: number;
}

/**
 * One meter per stream, plus `master` for the mixed feed.
 *
 * Streams come and go mid-broadcast — a guest joins, a camera is swapped —
 * so taps are opened and closed as the list changes rather than once at the
 * start. A meter that stopped moving because somebody reconnected would be
 * read as a dead microphone, which is the opposite of what a meter is for.
 */
export function useFeedLevels(
  streams: readonly { id: string; stream: MediaStream }[],
  enabled: boolean,
): Record<string, FeedLevel> {
  const [levels, setLevels] = useState<Record<string, FeedLevel>>({});
  const contextRef = useRef<AudioContext | null>(null);
  const tapsRef = useRef(new Map<string, {
    node: MediaStreamAudioSourceNode;
    analyser: AnalyserNode;
    bins: Float32Array<ArrayBuffer>;
    previous?: Float32Array<ArrayBuffer>;
    floor: number;
  }>());
  /*
   * The list lives in a ref so the frame timer below is started once and runs
   * for the length of the broadcast. Restarting it whenever somebody joins
   * would put a gap in every meter each time the room changed.
   */
  const wantedRef = useRef(streams);
  wantedRef.current = streams;

  useEffect(() => {
    if (!enabled) { setLevels({}); return; }
    const context = new AudioContext();
    contextRef.current = context;
    const taps = tapsRef.current;

    const tick = () => {
      const wanted = wantedRef.current;
      const ids = new Set(wanted.map((entry) => entry.id));

      for (const entry of wanted) {
        if (taps.has(entry.id)) continue;
        if (entry.stream.getAudioTracks().length === 0) continue;
        try {
          const analyser = context.createAnalyser();
          analyser.fftSize = FFT_SIZE;
          analyser.smoothingTimeConstant = 0.1;
          const node = context.createMediaStreamSource(entry.stream);
          node.connect(analyser);
          taps.set(entry.id, {
            node, analyser,
            bins: new Float32Array(analyser.frequencyBinCount),
            floor: 0,
          });
        } catch { /* a stream with no live audio: nothing to meter. */ }
      }
      for (const [id, tap] of taps) {
        if (ids.has(id)) continue;
        tap.node.disconnect();
        taps.delete(id);
      }

      const next: Record<string, FeedLevel> = {};
      for (const [id, tap] of taps) {
        tap.analyser.getFloatFrequencyData(tap.bins);
        /*
         * Decibels out, linear magnitudes in — `measureVoice` is written
         * against a magnitude spectrum, and handing it decibels would make
         * every silence read as a shout in the negative.
         */
        const magnitudes = new Float32Array(tap.bins.length);
        for (let i = 0; i < tap.bins.length; i += 1) {
          magnitudes[i] = Math.pow(10, (tap.bins[i] ?? -160) / 20);
        }
        const measured = measureVoice(magnitudes, {
          sampleRate: context.sampleRate,
          previous: tap.previous,
          noiseFloor: tap.floor,
        });
        tap.previous = magnitudes;
        tap.floor = measured.noiseFloor;
        next[id] = {
          id, energy: measured.energy, speech: measured.speechConfidence,
        };
      }
      setLevels(next);
    };

    const timer = setInterval(tick, FRAME_MS);
    return () => {
      clearInterval(timer);
      for (const [, tap] of taps) tap.node.disconnect();
      taps.clear();
      void context.close();
      contextRef.current = null;
      setLevels({});
    };
  }, [enabled]);

  return levels;
}
