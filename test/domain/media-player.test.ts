/**
 * The media player, which holds a selection and never a file.
 *   [CHANNEL §25, C-14; D-18, D-19]
 *
 * *"I would NOT create a separate music-loading system. BalanceVid already
 * has Library."* — so the thing under test is a state machine and two
 * readings, and the media stays where it was.
 *
 * The assertion that matters most is the last one in `may`: a take is what
 * puts something on the air, and the rule about when it is possible lives
 * in one place so four buttons cannot each get it slightly wrong.
 */

import { describe, expect, it } from 'vitest';

import {
  type PlayableItem, type PlayerState, IDLE,
  act, clock, kindOf, may, playerSays, search,
} from '../../src/domain/mediaPlayer.js';

describe('the duration column', () => {
  it('reads as a track listing, not as a clock', () => {
    expect(clock(4 * 60_000 + 4_000)).toBe('4:04');
    expect(clock(18_000)).toBe('0:18');
    expect(clock(12 * 60_000 + 44_000)).toBe('12:44');
  });

  it('grows an hours column only when there are hours', () => {
    expect(clock(59 * 60_000 + 59_000)).toBe('59:59');
    expect(clock(60 * 60_000)).toBe('1:00:00');
    expect(clock(62 * 60_000 + 44_000)).toBe('1:02:44');
  });

  it('rounds to the nearest second', () => {
    expect(clock(4_600)).toBe('0:05');
    expect(clock(4_400)).toBe('0:04');
  });

  it('says nothing rather than zero when it does not know', () => {
    /* `0:00` is a claim, and a wrong one: it is the length of nothing. */
    expect(clock(undefined)).toBe('—');
    expect(clock(Number.NaN)).toBe('—');
    expect(clock(-1)).toBe('—');
    /* A genuinely empty file is still zero, and says so. */
    expect(clock(0)).toBe('0:00');
  });
});

describe('what kind of thing it is', () => {
  it('is measured from the streams, not from the name', () => {
    expect(kindOf({ hasVideo: true, hasAudio: true })).toBe('video');
    expect(kindOf({ hasVideo: false, hasAudio: true })).toBe('audio');
  });

  it('calls a silent film a video', () => {
    expect(kindOf({ hasVideo: true, hasAudio: false })).toBe('video');
  });

  it('falls back only where there is nothing to measure', () => {
    expect(kindOf({}, 'image')).toBe('image');
    expect(kindOf({ hasVideo: false, hasAudio: false }, 'image')).toBe('image');
    expect(kindOf({})).toBe('video');
  });
});

describe('the picker’s search', () => {
  const items: PlayableItem[] = [
    { key: 'a', title: 'Worship Session', kind: 'video' },
    { key: 'b', title: 'Ancient Days', artist: 'Ron Kenoly', kind: 'audio' },
    { key: 'c', title: 'Interview', artist: 'Ico', kind: 'video' },
  ];

  it('keeps everything for an empty box', () => {
    /* An empty search box is not a filter that matches nothing. */
    expect(search(items, '')).toHaveLength(3);
    expect(search(items, '   ')).toHaveLength(3);
  });

  it('matches the title, ignoring case', () => {
    expect(search(items, 'worship').map((one) => one.key)).toEqual(['a']);
    expect(search(items, 'SESSION').map((one) => one.key)).toEqual(['a']);
  });

  it('matches the artist, which is the search people actually make', () => {
    expect(search(items, 'kenoly').map((one) => one.key)).toEqual(['b']);
  });

  it('matches nothing when nothing matches', () => {
    expect(search(items, 'zzz')).toEqual([]);
  });

  it('does not mutate the list it was given', () => {
    const copy = [...items];
    search(items, '');
    expect(items).toEqual(copy);
  });
});

describe('the road to air', () => {
  const cued: PlayerState = { phase: 'loaded', key: 'a', atMs: 0 };

  it('starts with nothing loaded', () => {
    expect(IDLE.phase).toBe('empty');
    expect(IDLE.key).toBeNull();
  });

  it('loads, plays, and takes', () => {
    let state = act(IDLE, 'load', 'a');
    expect(state).toEqual({ phase: 'loaded', key: 'a', atMs: 0 });
    state = act(state, 'play');
    expect(state.phase).toBe('playing');
    state = act(state, 'take');
    expect(state.phase).toBe('taken');
  });

  it('will not play what is not loaded', () => {
    expect(may(IDLE, 'play')).toBe(false);
    expect(act(IDLE, 'play')).toEqual(IDLE);
  });

  it('will not take what is not loaded', () => {
    expect(may(IDLE, 'take')).toBe(false);
    expect(act(IDLE, 'take')).toEqual(IDLE);
  });

  it('takes a cued item without making the operator preview it first', () => {
    /* Thirty seconds before it has to go out is not the moment for a
       control that refuses. */
    expect(may(cued, 'take')).toBe(true);
    expect(act(cued, 'take').phase).toBe('taken');
  });

  it('will not take twice', () => {
    const taken = act(cued, 'take');
    expect(may(taken, 'take')).toBe(false);
    expect(act(taken, 'take')).toEqual(taken);
  });

  it('pauses only what is playing', () => {
    expect(may(cued, 'pause')).toBe(false);
    const playing = act(cued, 'play');
    expect(act(playing, 'pause').phase).toBe('loaded');
  });

  it('keeps the place when the same item is loaded again', () => {
    const along: PlayerState = { phase: 'playing', key: 'a', atMs: 91_000 };
    expect(act(along, 'load', 'a')).toEqual(along);
  });

  it('starts at the beginning for a different item', () => {
    const along: PlayerState = { phase: 'playing', key: 'a', atMs: 91_000 };
    expect(act(along, 'load', 'b')).toEqual({
      phase: 'loaded', key: 'b', atMs: 0 });
  });

  it('loads over anything, including a taken item', () => {
    const taken = act(cued, 'take');
    expect(may(taken, 'load')).toBe(true);
    expect(act(taken, 'load', 'b').phase).toBe('loaded');
  });

  it('ejects back to empty, and cannot eject nothing', () => {
    expect(may(IDLE, 'eject')).toBe(false);
    expect(act(cued, 'eject')).toEqual(IDLE);
  });

  it('refuses a load with no key rather than emptying itself', () => {
    expect(act(cued, 'load')).toEqual(cued);
  });
});

describe('what the tile says', () => {
  const titleOf = (key: string) => (key === 'a' ? 'Ancient Days' : undefined);

  it('says what the PLAYER is doing, not what the schedule is doing', () => {
    /* The whole of C-14's finding: "Idle" meant "nothing is scheduled"
       on a tile whose name promised something else. */
    expect(playerSays(IDLE, titleOf)).toBe('Nothing loaded');
    expect(playerSays(IDLE, titleOf, 'Evening Feature'))
      .toBe('Next: Evening Feature');
  });

  it('names the loaded item through each phase', () => {
    const cued: PlayerState = { phase: 'loaded', key: 'a', atMs: 0 };
    expect(playerSays(cued, titleOf)).toBe('Cued — Ancient Days');
    expect(playerSays({ ...cued, phase: 'playing' }, titleOf))
      .toBe('Preview — Ancient Days');
    expect(playerSays({ ...cued, phase: 'taken' }, titleOf))
      .toBe('On programme — Ancient Days');
  });

  it('does not go blank when the item has left the library', () => {
    /* A render deleted while cued: the phase is still true. */
    expect(playerSays({ phase: 'loaded', key: 'gone', atMs: 0 }, titleOf))
      .toBe('Cued — Loaded');
  });

  it('ignores the schedule once something is loaded', () => {
    expect(playerSays({ phase: 'loaded', key: 'a', atMs: 0 },
      titleOf, 'Evening Feature')).toBe('Cued — Ancient Days');
  });
});
