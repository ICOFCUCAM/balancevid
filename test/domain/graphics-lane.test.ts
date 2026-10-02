/**
 * What the identity layer draws, across a window.
 *   [CHANNEL §2, §13, §18, D-19, D-21, C-40, C-44, C-47]
 *
 * > *"You shouldn't build Slide graphics / Lower thirds / Channel
 * > bug / NEXT graphic / Programme title as five unrelated
 * > features."*
 *
 * They never were five features: `marksFor` has computed all four
 * marks since the identity was written. The GRAPHICS lane drew
 * ONE of them — because `marksFor` needs three inputs that lived
 * inside the playout worker, so the page could not call it and
 * read the identity document instead. A lane reporting one layer
 * of a four-layer composite by reading the settings rather than
 * by asking the thing that draws.
 *
 * Every assertion here is about what the COMPOSITOR says, not
 * about what this file believes the rules to be. That is the
 * point of sampling.
 */

import { describe, expect, it } from 'vitest';

import type { Channel } from '../../src/domain/channel.js';
import { airtime } from '../../src/domain/airtime.js';
import { newChannel } from '../../src/domain/channelEdit.js';
import {
  LAYERS, graphicsOver, layerSays,
} from '../../src/domain/graphicsLane.js';

const MIN = 60_000;
const AT = '2026-10-01T20:00:00.000Z';
const FROM = Date.parse(AT);

function channel(): Channel {
  const made = newChannel('BalanceVid TV', 'Europe/London', AT);
  made.identity = {
    bug: { text: 'BALANCEVID', corner: 'top-right', opacity: 0.85 },
    liveLamp: { corner: 'top-left', text: 'LIVE' },
    lowerThird: { show: 'at-start', holdMs: 8000, presenter: 'Ico' },
    ink: '#ffffff',
  };
  made.rotation = [
    { id: 'r1', title: 'Morning Music', durationMs: 10 * MIN,
      source: { kind: 'media', assetId: 'a1', form: 'video' } },
    { id: 'r2', title: 'History Discussion', durationMs: 10 * MIN,
      source: { kind: 'media', assetId: 'a2', form: 'video' } },
  ] as never;
  return made;
}

/** Thirty minutes, which is three turns of a twenty-minute loop. */
function over(made: Channel, minutes = 30) {
  const to = FROM + minutes * MIN;
  return graphicsOver(made, FROM, to, airtime(made, FROM, to));
}
const only = (made: Channel, kind: string, minutes = 30) =>
  over(made, minutes).filter((event) => event.kind === kind);
const secs = (at: number) => (at - FROM) / 1000;

describe('the lane draws what the compositor draws (C-47)', () => {
  /*
   * THE BUG IS ONE BAR AND THE OLD LANE COULD NOT SAY IT AT ALL.
   * It is up the whole time, across every join, and a lane that
   * drew it per stretch would be claiming the station's own mark
   * comes down and goes back up fourteen times an hour.
   */
  it('draws the station bug as one bar across the window', () => {
    const bug = only(channel(), 'bug');
    expect(bug).toHaveLength(1);
    expect(secs(bug[0]!.fromMs)).toBe(0);
    expect(secs(bug[0]!.toMs)).toBe(30 * 60);
    expect(bug[0]!.says).toBe('BALANCEVID');
  });

  /*
   * AND A LOWER THIRD IS A TICK AT EACH JOIN, which is what the
   * lane's own note has always claimed and what it drew from the
   * settings rather than from the compositor.
   */
  it('draws a lower third at each join, for as long as it holds', () => {
    const lower = only(channel(), 'lower-third');
    expect(lower.map((event) => secs(event.fromMs))).toEqual([0, 600, 1200]);
    for (const event of lower) {
      expect(event.toMs - event.fromMs).toBe(8000);
    }
  });

  /*
   * NEXT RIDES WITH THE TITLE, because the moment a viewer wants
   * to know what is next is the moment they are being told what
   * this is. The lane does not know that rule — it reads it off
   * the answers.
   */
  it('puts NEXT exactly where the compositor puts it', () => {
    const lower = only(channel(), 'lower-third');
    const next = only(channel(), 'next');
    expect(next.map((event) => [event.fromMs, event.toMs]))
      .toEqual(lower.map((event) => [event.fromMs, event.toMs]));
  });

  /* And it says what will be on the screen, not a label for it. */
  it('carries the words that will be on the picture', () => {
    const next = only(channel(), 'next');
    expect(next[0]!.says).toMatch(/^NEXT\s+\d\d:\d\d\s+History Discussion$/);
  });

  /*
   * THE LAMP IS NOT DRAWN, BECAUSE THE CHANNEL IS NOT LIVE. A LIVE
   * light on a repeat is the one piece of station branding that is
   * a lie rather than a decoration. [§13]
   */
  it('draws no LIVE lamp over a channel playing its loop', () => {
    expect(only(channel(), 'lamp')).toHaveLength(0);
  });
});

describe('the lane holds no rules of its own (C-47)', () => {
  /*
   * THIS IS THE ASSERTION THAT KEEPS IT ONE SYSTEM. Every answer
   * above must follow from the identity rather than from this
   * file, so changing the identity must change the lane — and a
   * lane that encoded the rules would keep drawing what it always
   * drew.
   */
  it('stops drawing a bug the channel has taken away', () => {
    const made = channel();
    delete made.identity!.bug;
    expect(only(made, 'bug')).toHaveLength(0);
    /* And the rest is untouched, so this is the bug and not the lane. */
    expect(only(made, 'lower-third')).toHaveLength(3);
  });

  it('stops drawing lower thirds a channel has switched off', () => {
    const made = channel();
    made.identity!.lowerThird = { show: 'never', holdMs: 8000 };
    expect(only(made, 'lower-third')).toHaveLength(0);
    expect(only(made, 'next')).toHaveLength(0);
    /* The bug is not a lower third and stays up. */
    expect(only(made, 'bug')).toHaveLength(1);
  });

  /*
   * `always` IS A DIFFERENT SHAPE, NOT A LONGER TICK: the caption
   * runs the length of each programme and changes at the join
   * rather than coming down between them.
   */
  it('runs a lower third the length of the programme when told to', () => {
    const made = channel();
    made.identity!.lowerThird = { show: 'always', holdMs: 8000, presenter: 'Ico' };
    const lower = only(made, 'lower-third');
    expect(lower.length).toBeGreaterThan(0);
    for (const event of lower) {
      expect(event.toMs - event.fromMs).toBeGreaterThan(8000);
    }
  });

  /* A hold the operator lengthened is a longer tick. */
  it('follows the hold the channel actually set', () => {
    const made = channel();
    made.identity!.lowerThird = { show: 'at-start', holdMs: 20_000, presenter: 'Ico' };
    for (const event of only(made, 'lower-third')) {
      expect(event.toMs - event.fromMs).toBe(20_000);
    }
  });
});

describe('what the lane can be asked for (C-47)', () => {
  /* Four layers, because `marksFor` emits four kinds. A fifth kind
     added there must be given a row here rather than vanishing. */
  it('has a row for every kind the compositor can emit', () => {
    expect(LAYERS).toEqual(['bug', 'lamp', 'lower-third', 'next']);
    for (const kind of LAYERS) expect(layerSays(kind)).toBeTruthy();
  });

  /* Nothing is drawn outside the window it was asked about. */
  it('never reports a graphic outside the window', () => {
    const to = FROM + 30 * MIN;
    for (const event of over(channel())) {
      expect(event.fromMs).toBeGreaterThanOrEqual(FROM);
      expect(event.toMs).toBeLessThanOrEqual(to);
      expect(event.toMs).toBeGreaterThan(event.fromMs);
    }
  });

  /* And a channel with no identity at all draws nothing, rather
     than throwing on the one surface an operator opens first. */
  it('draws nothing for a channel that has no identity yet', () => {
    const made = channel();
    delete made.identity;
    expect(over(made)).toEqual([]);
  });
});

describe('a caption replaced at a join has left (C-47)', () => {
  /*
   * MOST CHANNELS TYPE NO PRESENTER, and then the caption is the
   * programme's own title — so it is DIFFERENT either side of a
   * join, where a presenter's name is the same all day. Two
   * things the first fixture could not see depend on that, and
   * both survived every mutation until it existed.
   */
  function untitled(): Channel {
    const made = newChannel('BalanceVid TV', 'Europe/London', AT);
    made.identity = { lowerThird: { show: 'always', holdMs: 8000 }, ink: '#fff' };
    made.rotation = [
      { id: 'r1', title: 'Morning Music', durationMs: 10 * MIN,
        source: { kind: 'media', assetId: 'a1', form: 'video' } },
      { id: 'r2', title: 'History Discussion', durationMs: 10 * MIN,
        source: { kind: 'media', assetId: 'a2', form: 'video' } },
    ] as never;
    return made;
  }

  /*
   * THE FIRST IS THAT A BLOCK IS A KIND AND ITS WORDS. A lane that
   * merged by kind alone would draw one unbroken caption bar
   * across a whole day of different programmes — which is the
   * opposite of what this lane is for. Where the words do NOT
   * change, the same rule correctly gives one bar: that is the
   * station bug, above.
   */
  it('is three blocks where three programmes caption themselves', () => {
    const lower = only(untitled(), 'lower-third');
    expect(lower).toHaveLength(3);
    expect(lower.map((event) => event.says)).toEqual([
      'Morning Music  ·  Film',
      'History Discussion  ·  Film',
      'Morning Music  ·  Film',
    ]);
    /* Touching, not overlapping: the caption is replaced, not lifted. */
    expect(lower[0]!.toMs).toBe(lower[1]!.fromMs);
  });

  /*
   * THE SECOND IS WHOSE TITLE IT IS. The compositor is handed the
   * VIEWER'S title, not the control room's — and the control
   * room's would be invisible here, because `captionFor` drops a
   * title equal to the channel's own name to stop it being
   * printed under a bug that already says it. [C-42]
   */
  it('captions with the programme’s name, not the channel’s', () => {
    for (const event of only(untitled(), 'lower-third')) {
      expect(event.says).not.toContain('BalanceVid TV');
      expect(event.says).toMatch(/Morning Music|History Discussion/);
    }
  });
});
