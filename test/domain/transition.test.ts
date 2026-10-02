/**
 * The join between two programmes.
 * [Doctrine CHANNEL §5, §6, §9, §13, D-04, D-16, C-34]
 *
 * The audit: *"Transitions | Cut only | Dissolve, wipe, stinger."*
 *
 * THE RULES MATTER MORE THAN THE EFFECT, and these tests are mostly
 * about the three joins that must stay hard cuts. Each is a case
 * where four hundred milliseconds is worth less than what it costs:
 * an emergency somebody pressed a button for, a live feed that is
 * happening while it happens, and a boundary that is not a join at
 * all.
 */

import { describe, expect, it } from 'vitest';

import type { OnAir, ProgrammeSource } from '../../src/domain/channel.js';
import {
  CUT, DIP_MS, LEAST_PIECE_MS,
  afadeFilters, dipAt, dipMs, fadeFilters, isCut, sameThing,
} from '../../src/domain/transition.js';

const FILM: ProgrammeSource = { kind: 'media', assetId: 'ast_film', form: 'video' };
const TALK: ProgrammeSource = { kind: 'media', assetId: 'ast_talk', form: 'video' };

const on = (kind: OnAir['kind'], source = FILM): OnAir =>
  (kind === 'off' ? { kind } : { kind, source }) as unknown as OnAir;

const SEG = 4000;
const join = (leaving: OnAir, arriving: OnAir, leavingMs = SEG, arrivingMs = SEG) =>
  dipAt({ leaving, arriving, leavingMs, arrivingMs });

describe('the joins that stay hard cuts (C-34)', () => {
  /*
   * SOMEBODY PRESSED A BUTTON MARKED EMERGENCY. The product
   * answering with four hundred milliseconds of a slow dip is the
   * product deciding its own polish is worth more than the reason
   * they pressed it.
   */
  it('cuts to the emergency source and never fades', () => {
    expect(join(on('rotation'), on('emergency', TALK))).toEqual(CUT);
    expect(isCut(on('rotation'), on('emergency', TALK))).toBe(true);
  });

  /* And out of it: when an operator clears an emergency, the thing
     they want back is the channel, now. */
  it('cuts out of the emergency source too', () => {
    expect(join(on('emergency'), on('rotation', TALK))).toEqual(CUT);
  });

  /*
   * CUTTING TO LIVE IS WHAT A CUT IS FOR. A gallery cuts to a
   * camera; it does not mix to one from the schedule. And fading a
   * live feed means choosing to lose half a second of something
   * that is happening while it happens.
   */
  it('cuts into and out of a live feed', () => {
    expect(join(on('rotation'), on('live', TALK))).toEqual(CUT);
    expect(join(on('live'), on('programme', TALK))).toEqual(CUT);
  });

  /*
   * AND NOTHING IS FADED INTO ITSELF. A read split for any other
   * reason is not a join, and dipping there would put a hole in the
   * middle of a programme. This is the rule a careless
   * implementation gets wrong.
   */
  it('does not dip in the middle of one thing', () => {
    expect(join(on('rotation', FILM), on('rotation', FILM))).toEqual(CUT);
    expect(sameThing(on('rotation', FILM), on('programme', FILM))).toBe(true);
  });

  it('treats two stretches of off air as one thing', () => {
    expect(sameThing(on('off'), on('off'))).toBe(true);
    expect(join(on('off'), on('off'))).toEqual(CUT);
  });
});

describe('the joins that dip (C-34)', () => {
  it('dips between two scheduled items', () => {
    const dip = join(on('rotation', FILM), on('rotation', TALK));
    expect(dip.outMs).toBe(DIP_MS);
    expect(dip.inMs).toBe(DIP_MS);
  });

  it('dips between a programme and the loop', () => {
    expect(join(on('programme', FILM), on('rotation', TALK)).outMs)
      .toBe(DIP_MS);
  });

  /* Going off air is a fade down, and coming back is a fade up.
     Each side is decided on its own. */
  it('fades out when the schedule runs out, and in when it resumes', () => {
    expect(join(on('rotation', FILM), on('off')).outMs).toBe(DIP_MS);
    expect(join(on('off'), on('rotation', FILM)).inMs).toBe(DIP_MS);
  });

  it('fades each side by what that side can afford', () => {
    /* A programme ending 600ms into a segment fades over what it
       has; the one beginning has the rest and fades in full. */
    const dip = join(on('rotation', FILM), on('rotation', TALK), 1050, 4000);
    expect(dip.outMs).toBe(350);
    expect(dip.inMs).toBe(DIP_MS);
  });
});

describe('how long a dip lasts (D-04, C-34)', () => {
  it('is four hundred milliseconds where there is room', () => {
    expect(dipMs(4000)).toBe(DIP_MS);
    /* Under a quarter-second reads as a dropped frame; past about a
       second it is a MIX, which is a mood a continuity announcer
       sets and not something a schedule does to every join. */
    expect(DIP_MS).toBeGreaterThanOrEqual(250);
    expect(DIP_MS).toBeLessThanOrEqual(1000);
  });

  it('never takes more than a third of a short piece', () => {
    /* The third only binds just above the floor: at 1500ms the
       400ms cap is already the smaller of the two. */
    expect(dipMs(1050)).toBe(350);
    expect(dipMs(1200)).toBe(400);
    for (const ms of [1000, 1050, 1200, 1500, 4000]) {
      expect(dipMs(ms), `${ms}ms`).toBeLessThanOrEqual(Math.floor(ms / 3));
    }
  });

  /* A piece shorter than about a second is mostly fade, which is a
     flicker and not a transition. Those are cut, as they were. */
  it('does not fade a piece too short to be worth it', () => {
    expect(dipMs(LEAST_PIECE_MS - 1)).toBe(0);
    expect(dipMs(200)).toBe(0);
    expect(dipMs(0)).toBe(0);
  });

  it('never fades for longer than the piece exists', () => {
    for (const ms of [0, 100, 999, 1000, 1500, 4000, 40_000]) {
      expect(dipMs(ms), `${ms}ms`).toBeLessThanOrEqual(ms);
    }
  });
});

describe('what the encoder is told (§13, D-16, C-34)', () => {
  it('fades in from the start and out at the end', () => {
    const filters = fadeFilters({ outMs: 400, inMs: 400 }, 4000);
    expect(filters).toContain('fade=t=in:st=0:d=0.400');
    expect(filters).toContain('fade=t=out:st=3.600:d=0.400');
  });

  it('asks for nothing at a cut', () => {
    expect(fadeFilters(CUT, 4000)).toEqual([]);
    expect(afadeFilters(CUT, 4000)).toEqual([]);
  });

  it('fades only the side that is fading', () => {
    expect(fadeFilters({ outMs: 400, inMs: 0 }, 4000))
      .toEqual(['fade=t=out:st=3.600:d=0.400']);
    expect(fadeFilters({ outMs: 0, inMs: 400 }, 4000))
      .toEqual(['fade=t=in:st=0:d=0.400']);
  });

  /*
   * THE SOUND IS THE HALF THAT MATTERS MORE. An ear notices a
   * discontinuity an eye forgives, and the click at a hard cut
   * between two unrelated waveforms is the most audible fault a
   * channel has at a join.
   */
  it('fades the sound on the same shape as the picture', () => {
    const dip = { outMs: 400, inMs: 400 };
    expect(afadeFilters(dip, 4000)).toEqual([
      'afade=t=in:st=0:d=0.400',
      'afade=t=out:st=3.600:d=0.400',
    ]);
  });

  it('puts the out fade where the piece actually ends', () => {
    expect(fadeFilters({ outMs: 400, inMs: 0 }, 1200))
      .toEqual(['fade=t=out:st=0.800:d=0.400']);
  });
});
