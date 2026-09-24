/**
 * Beats are a suggestion, not a fact.  [Doctrine STUDIO-TWO §11, S-8, INV-06]
 *
 * Two claims are tested here and they pull in opposite directions, which is
 * the point: the detector has to be good enough to be worth offering, and it
 * has to have no authority at all until somebody accepts it.
 *
 * The fixture is arithmetic rather than a recording — a click track built in
 * memory at a tempo and a phase this file chose — so "it found 120" means it
 * found the number that is actually there.
 */
import { describe, expect, it } from 'vitest';

import {
  BEATS_USABLE_CONFIDENCE, BeatsNotAccepted, SNAP_WINDOW_SAMPLES,
  assertBeatsAccepted, beatPeriod, beatPositions, detectBeats, snapToBeat,
} from '../../src/domain/beats.js';
import { HOUSE_SAMPLE_RATE, secondsToSamples } from '../../src/domain/time.js';

/** A click track: a short burst every beat, silence between. */
function clickTrack(bpm: number, seconds: number, phaseSeconds = 0): Float32Array {
  const samples = new Float32Array(secondsToSamples(seconds));
  const period = (60 / bpm) * HOUSE_SAMPLE_RATE;
  const burst = Math.round(HOUSE_SAMPLE_RATE * 0.02);
  for (let at = phaseSeconds * HOUSE_SAMPLE_RATE; at < samples.length; at += period) {
    for (let i = 0; i < burst; i += 1) {
      const index = Math.round(at) + i;
      if (index >= samples.length) break;
      // A decaying click, so the onset is a rise and not a square edge.
      samples[index] = Math.sin((i / 24) * Math.PI * 2) * (1 - i / burst);
    }
  }
  return samples;
}

describe('finding the pulse', () => {
  it('hears the tempo that is actually there', () => {
    for (const bpm of [90, 120, 140]) {
      const found = detectBeats(clickTrack(bpm, 12))!;
      expect(found).not.toBeNull();
      expect(Math.abs(found.bpm - bpm)).toBeLessThan(2);
      expect(found.confidence).toBeGreaterThan(BEATS_USABLE_CONFIDENCE);
    }
  });

  it('and where the first beat falls, not just how often they come', () => {
    const found = detectBeats(clickTrack(120, 12, 0.25))!;
    const period = beatPeriod(found.bpm);
    // The phase is only meaningful modulo the period: 0.25s and 0.75s are the
    // same grid at 120 BPM, and a test that demanded the first one would be
    // testing an implementation detail rather than the answer.
    const offset = ((found.phaseSamples % period) + period) % period;
    const expected = secondsToSamples(0.25) % period;
    const error = Math.min(
      Math.abs(offset - expected), period - Math.abs(offset - expected));
    expect(error).toBeLessThan(secondsToSamples(0.03));
  });

  /*
   * The octave, said honestly. A detector cannot tell 175 from 87.5 — every
   * other beat lines up exactly as well — and neither can a person: asked to
   * tap along to something that fast, most people tap half-time. So the
   * answer is the one people would tap, and halving and doubling are one
   * press each in the studio rather than a re-detect. [S-8]
   */
  it('answers at the tempo somebody would tap, for a very fast song', () => {
    const found = detectBeats(clickTrack(176, 12))!;
    const halved = Math.abs(found.bpm - 88) < 2;
    const straight = Math.abs(found.bpm - 176) < 2;
    expect(halved || straight).toBe(true);
  });

  it('says nothing rather than something about silence', () => {
    expect(detectBeats(new Float32Array(secondsToSamples(10)))).toBeNull();
  });

  it('and nothing about a clip too short to have a tempo', () => {
    expect(detectBeats(clickTrack(120, 2))).toBeNull();
  });

  it('reports low confidence for a song with no pulse in it', () => {
    // Noise: onsets everywhere and a period nowhere.
    const noise = new Float32Array(secondsToSamples(12));
    let seed = 7;
    for (let i = 0; i < noise.length; i += 1) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      noise[i] = (seed / 2147483648) * 2 - 1;
    }
    const found = detectBeats(noise);
    expect(found === null || found.confidence < BEATS_USABLE_CONFIDENCE).toBe(true);
  });
});

describe('snapping is a suggestion the author accepts (INV-06, S-8)', () => {
  const grid = { bpm: 120, phaseSamples: 0 };

  it('moves a cut that was aimed at a beat', () => {
    const near = secondsToSamples(2) + 1200; // 25ms late, a human keypress
    const { sample, snapped } = snapToBeat(near, grid);
    expect(snapped).toBe(true);
    expect(sample).toBe(secondsToSamples(2));
  });

  it('and leaves one that was not, which is what makes it safe to leave on', () => {
    const between = secondsToSamples(2.25);
    const { sample, snapped } = snapToBeat(between, grid);
    expect(snapped).toBe(false);
    expect(sample).toBe(between);
  });

  it('never moves a cut further than the window says', () => {
    for (let offset = 0; offset < secondsToSamples(0.5); offset += 977) {
      const at = secondsToSamples(4) + offset;
      const { sample } = snapToBeat(at, grid);
      expect(Math.abs(sample - at)).toBeLessThanOrEqual(SNAP_WINDOW_SAMPLES);
    }
  });

  it('refuses to move anything with beats nobody accepted', () => {
    const detected = {
      bpm: 120, phaseSamples: 0, confidence: 0.9,
      detector: 'onset-autocorrelation@1', detectedAt: '2026-09-24T12:00:00.000Z',
    };
    expect(() => assertBeatsAccepted(detected, 'snapping')).toThrow(BeatsNotAccepted);
    expect(() => assertBeatsAccepted(undefined, 'snapping')).toThrow(BeatsNotAccepted);
    expect(() => assertBeatsAccepted({
      ...detected, acceptedBy: 'owner', acceptedAt: '2026-09-24T12:01:00.000Z',
    }, 'snapping')).not.toThrow();
  });

  it('draws a grid that starts at the first beat, not at the phase it was found on', () => {
    const positions = beatPositions({ bpm: 120, phaseSamples: secondsToSamples(2.7) },
      secondsToSamples(4));
    // 120 BPM is every half second, and a beat at 2.7s means one at 0.2s too:
    // a grid that began where the detector happened to look would leave the
    // opening of the song without any.
    expect(positions[0]).toBe(secondsToSamples(0.2));
    expect(positions).toHaveLength(8);
  });
});
