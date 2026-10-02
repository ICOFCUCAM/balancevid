/**
 * Every programme at the same loudness.
 * [Doctrine CHANNEL §5, §10, U-23, D-04, C-33]
 *
 * The audit: *"Audio | Per-source meters and a master | Per-source
 * EQ, compression, ducking, loudness to −23 LUFS."* Loudness is the
 * one of those four that is a REQUIREMENT — EBU R128 and ATSC A/85
 * are law for broadcasters — and the complaint it answers is the one
 * every viewer has.
 *
 * AND THIS CHANNEL IS THE CASE THEY WERE WRITTEN FOR: it cuts from a
 * Studio Two music video, mastered loud the way music is, to a
 * Studio One conversation recorded on whatever microphone somebody
 * had. Ten decibels apart before anybody does anything wrong.
 */

import { describe, expect, it } from 'vitest';

import {
  CEILING_DBTP, MOST_BOOST_DB, SILENCE_LUFS, TARGET_LUFS,
  afterGain, atTarget, gainFor, volumeFilter,
} from '../../src/domain/loudness.js';

/** A well-behaved item: loud, with headroom. */
const music = { lufs: -14.2, truePeak: -3.1 };
/** A quiet one with plenty of room to grow. */
const talk = { lufs: -27.6, truePeak: -12.0 };

describe('bringing an item to the house loudness (C-33)', () => {
  it('turns a loud music video down', () => {
    const gain = gainFor(music);
    expect(gain).toBeLessThan(0);
    expect(afterGain(music, gain).lufs).toBeCloseTo(TARGET_LUFS, 1);
  });

  it('turns a quiet conversation up', () => {
    const gain = gainFor(talk);
    expect(gain).toBeGreaterThan(0);
    expect(afterGain(talk, gain).lufs).toBeCloseTo(TARGET_LUFS, 1);
  });

  /* The whole point: after the gain they are the same loudness, and
     the viewer does not reach for the remote at the join. */
  it('puts the two of them at the same level', () => {
    expect(atTarget(afterGain(music, gainFor(music)).lufs)).toBe(true);
    expect(atTarget(afterGain(talk, gainFor(talk)).lufs)).toBe(true);
  });

  it('leaves an item that is already right alone', () => {
    expect(gainFor({ lufs: TARGET_LUFS, truePeak: -6 })).toBe(0);
    expect(volumeFilter(0)).toBe(null);
  });

  it('is the broadcast target, not a streaming one', () => {
    /* −14 is what the music platforms normalise their own catalogues
       to; a channel mastered there would be nine decibels hotter
       than every other channel a viewer has, which is the behaviour
       R128 was written to stop rather than to copy. */
    expect(TARGET_LUFS).toBe(-23);
  });
});

describe('the peak wins (EBU R128 s.5, C-33)', () => {
  /*
   * A quiet item that is also peaky cannot be both brought to −23
   * and kept under −1 dBTP. The ceiling is the constraint that must
   * hold: being two decibels quiet is a thing a viewer does not
   * notice, and clipping is a thing they do.
   */
  const peaky = { lufs: -30, truePeak: -2 };

  /*
   * THE CEILING IS A NUMBER, NOT A VARIABLE. Asserting the maths
   * against `CEILING_DBTP` leaves the constant free to move, and it
   * is a standards claim: R128 asks for a true-peak maximum of −1
   * dBFS, and the headroom is what survives a lossy codec
   * reconstructing overshoots the original never had.
   */
  it('leaves a decibel of headroom below full scale', () => {
    expect(CEILING_DBTP).toBe(-1);
    expect(CEILING_DBTP).toBeLessThan(0);
  });

  it('reduces the gain rather than clipping', () => {
    const gain = gainFor(peaky);
    expect(gain).toBe(CEILING_DBTP - peaky.truePeak);
    expect(afterGain(peaky, gain).truePeak).toBeCloseTo(CEILING_DBTP, 5);
  });

  it('accepts being under the target to stay under the ceiling', () => {
    const after = afterGain(peaky, gainFor(peaky));
    expect(after.lufs).toBeLessThan(TARGET_LUFS);
    expect(atTarget(after.lufs)).toBe(false);
  });

  it('never lets any item exceed the ceiling', () => {
    for (const lufs of [-40, -30, -23, -14, -8]) {
      for (const truePeak of [-20, -6, -1, -0.2, 0, 1.5]) {
        const after = afterGain({ lufs, truePeak },
          gainFor({ lufs, truePeak }));
        expect(after.truePeak, `${lufs} LUFS / ${truePeak} dBTP`)
          .toBeLessThanOrEqual(CEILING_DBTP + 0.05);
      }
    }
  });

  /* An item already over the ceiling is pulled down, even if that
     takes it below the target: it arrived clipping. */
  it('pulls down something already over the ceiling', () => {
    expect(gainFor({ lufs: -23, truePeak: 0.5 })).toBeLessThan(0);
  });
});

describe('what is not worth lifting (D-04, C-33)', () => {
  /*
   * The gain is applied to EVERYTHING in the file. Lifting a −41
   * LUFS recording eighteen decibels lifts its room tone, hiss and
   * hum by eighteen decibels too, and past about twelve the noise is
   * louder than the programme was.
   */
  it('caps how far a very quiet item is lifted', () => {
    const faint = { lufs: -41, truePeak: -30 };
    expect(gainFor(faint)).toBe(MOST_BOOST_DB);
    /* And it stays honestly quiet rather than pretending. */
    expect(atTarget(afterGain(faint, gainFor(faint)).lufs)).toBe(false);
  });

  it('puts no floor on turning something down', () => {
    /* Reducing a signal cannot introduce anything that was not
       already in it, so only the lift is capped. */
    expect(gainFor({ lufs: -5, truePeak: -0.5 }))
      .toBeLessThan(-MOST_BOOST_DB);
  });

  /*
   * `ebur128` reports −70 or lower for a gate that never opened. A
   * gain computed against that is forty-seven decibels of hiss.
   */
  it('leaves silence alone', () => {
    expect(gainFor({ lufs: -70, truePeak: -90 })).toBe(0);
    expect(gainFor({ lufs: SILENCE_LUFS, truePeak: -80 })).toBe(0);
    expect(gainFor({ lufs: -Infinity, truePeak: -Infinity })).toBe(0);
  });

  it('leaves an unmeasurable item alone rather than guessing', () => {
    expect(gainFor({ lufs: Number.NaN, truePeak: -6 })).toBe(0);
  });

  /* A missing peak must not silently become a missing ceiling. */
  it('still applies the boost cap when the peak is unknown', () => {
    expect(gainFor({ lufs: -41, truePeak: Number.NaN })).toBe(MOST_BOOST_DB);
  });
});

describe('what the engine is told to run (U-23, C-33)', () => {
  it('is one volume change and nothing else', () => {
    const filter = volumeFilter(gainFor(music))!;
    expect(filter).toMatch(/^volume=-?\d+\.\d+dB$/);
    /* No compressor, no limiter, no dynamic normaliser: this moves
       one number and leaves somebody's mix alone, which is the
       entire argument for measuring beforehand. */
    for (const nope of ['loudnorm', 'dynaudnorm', 'acompressor', 'alimiter']) {
      expect(filter).not.toContain(nope);
    }
  });

  /*
   * The engine builds a chain four times a second; a `volume=0.0dB`
   * in it is a decode and re-encode of audio that needed nothing.
   */
  it('asks for nothing when there is nothing to do', () => {
    expect(volumeFilter(0)).toBe(null);
    expect(volumeFilter(0.04)).toBe(null);
    expect(volumeFilter(Number.NaN)).toBe(null);
  });

  it('asks for something as soon as there is', () => {
    expect(volumeFilter(-8.8)).toBe('volume=-8.8dB');
    expect(volumeFilter(4.6)).toBe('volume=4.6dB');
  });

  /* A tenth of a decibel is below the threshold of hearing for a
     level change, and rounding keeps the filter string stable so a
     cached chain does not churn. */
  it('rounds to a tenth', () => {
    /* −23.456789 is quieter than the target, so it goes UP by the
       difference: +0.456789, rounded. */
    expect(gainFor({ lufs: -23.456789, truePeak: -6 })).toBe(0.5);
    expect(gainFor({ lufs: -22.543210, truePeak: -6 })).toBe(-0.5);
  });
});
