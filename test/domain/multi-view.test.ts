/**
 * The tally is the one thing on the page that must not lie.
 * [Doctrine CHANNEL §24, §6, §5, D-04, D-22, C-27]
 *
 * THE FAULT THESE EXIST FOR, and it is reproducible in four lines: roll a
 * film in over a live show, and the grid lit CAMERA 1 red — the room,
 * which nobody could see — while STUDIO TWO, the picture actually on the
 * wire, stayed dark. The guests wore a red tally under a music video,
 * which is precisely what their own comment in the studio forbade.
 *
 * The cause was reading `whatIsOn`'s KIND instead of its SOURCE.
 * `kind: 'live'` stays `'live'` while a reference is rolled in, because a
 * rolled-in segment replaces the feed INSIDE the live answer rather than
 * beside it. One question, asked of the source, is the whole fix.
 */

import { describe, expect, it } from 'vitest';

import type { OnAir, ProgrammeSource } from '../../src/domain/channel.js';
import {
  busFor, onProgramCount, programmeSource, roomOnProgram, saysFor,
} from '../../src/domain/multiView.js';

const ROOM: ProgrammeSource = { kind: 'live', ingestId: 'ing_1' };
const FILM: ProgrammeSource = { kind: 'media', assetId: 'ast_film', form: 'video' };
const TALK: ProgrammeSource = { kind: 'media', assetId: 'ast_talk', form: 'video' };

const live = (source: ProgrammeSource): OnAir =>
  ({ kind: 'live', source, fromMs: 0 } as unknown as OnAir);
const off: OnAir = { kind: 'off' } as OnAir;

describe('a film rolled in over a live show (C-27)', () => {
  const on = live(FILM);

  it('does not call the room on program while a film covers it', () => {
    /* THE BUG. `on.kind` is still 'live' here, and reading it is what
       put a red bar on a camera nobody could see. */
    expect(on.kind).toBe('live');
    expect(roomOnProgram(on)).toBe(false);
    expect(busFor({ on, mine: ROOM })).toBe(null);
  });

  it('calls the film on program, which is what is on the wire', () => {
    expect(busFor({ on, mine: FILM })).toBe('program');
  });

  it('still calls the room on program when the room is what is going out', () => {
    expect(roomOnProgram(live(ROOM))).toBe(true);
    expect(busFor({ on: live(ROOM), mine: ROOM })).toBe('program');
    expect(busFor({ on: live(ROOM), mine: FILM })).toBe(null);
  });

  /* The header's own proof. Three tiles claiming the air is the shape of
     the original fault, and a count that can only read 0 or 1 catches it
     the moment it comes back. */
  it('never puts two sources on program at once', () => {
    /* A GRID WITH ONE OF EVERYTHING ON IT, which is the only fixture
       that can tell "how many are on program" from "how many are lit":
       the film is on air, the talk is cued, the identity is keyed over
       the top, and exactly one of those three is PROGRAM. */
    const buses = [
      busFor({ on, mine: ROOM, cued: TALK }),
      busFor({ on, mine: FILM, cued: TALK }),
      busFor({ on, mine: TALK, cued: TALK }),
      busFor({ on, keyed: true }),
    ];
    expect(buses).toEqual([null, 'program', 'preview', 'key']);
    expect(onProgramCount(buses)).toBe(1);
    expect(onProgramCount([ROOM, FILM].map(
      (mine) => busFor({ on: off, mine })))).toBe(0);
  });
});

describe('what each bus means (C-27)', () => {
  it('says nothing is on when the channel is off', () => {
    expect(programmeSource(off)).toBe(null);
    expect(busFor({ on: off, mine: ROOM })).toBe(null);
    expect(roomOnProgram(off)).toBe(false);
  });

  it('gives the cued source the preview bus', () => {
    expect(busFor({ on: live(ROOM), mine: FILM, cued: FILM })).toBe('preview');
  });

  /* PROGRAM OUTRANKS PREVIEW on the one source that is both: cueing the
     thing already on air must not take its red bar away. */
  it('keeps the program bar on a source that is also cued', () => {
    expect(busFor({ on: live(FILM), mine: FILM, cued: FILM })).toBe('program');
  });

  /*
   * A KEYER IS NOT A SOURCE. The identity layer is drawn OVER whoever is
   * on program and never has the air to itself, so it gets its own bus —
   * and not the preview bus it used to share, because blue has to mean
   * one thing on a gallery wall.
   */
  it('gives the identity layer its own bus, over whatever is on', () => {
    expect(busFor({ on: live(ROOM), keyed: true })).toBe('key');
    expect(busFor({ on: live(FILM), keyed: true })).toBe('key');
  });

  it('keys nothing over a dark channel', () => {
    /* A lower third configured on a channel that is off air is not on
       anything, and saying KEY would be the grid claiming output. */
    expect(busFor({ on: off, keyed: true })).toBe(null);
  });

  it('leaves a tile with nothing behind it on no bus at all', () => {
    expect(busFor({ on: live(ROOM) })).toBe(null);
    expect(busFor({ on: live(ROOM), cued: FILM })).toBe(null);
  });
});

describe('what a tile says about itself (C-27, D-04)', () => {
  it('says the bus before anything else', () => {
    expect(saysFor('program', { ready: true })).toBe('LIVE');
    expect(saysFor('preview', { ready: true })).toBe('PREVIEW');
    expect(saysFor('key', {})).toBe('KEY');
  });

  /*
   * NO SIGNAL OUTRANKS READY, because a tile offering a cut to a dead
   * input is the tally lying in its quietest form.
   */
  it('reports a dead input rather than offering it', () => {
    expect(saysFor(null, { signal: false, ready: true })).toBe('NO SIGNAL');
  });

  /* And an empty tile is not a fault. Studio One with nothing finished
     in it is correctly reporting that there is nothing there, and
     dressing that as a fault teaches an operator to ignore faults. */
  it('does not dress an empty source as a broken one', () => {
    expect(saysFor(null, {})).toBe('—');
    expect(saysFor(null, { ready: true })).toBe('READY');
    expect(saysFor(null, { signal: true })).toBe('—');
  });

  it('never calls a dead input ready, whatever else is true', () => {
    expect(saysFor(null, { signal: false })).toBe('NO SIGNAL');
  });
});
