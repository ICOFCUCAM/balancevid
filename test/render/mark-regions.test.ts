/**
 * A caption goes where the scene has room for it.
 * [Doctrine CHANNEL §27, C-18, C-20; D-06]
 *
 * *"The logo region and the lower-third region are described and not yet
 * drawn."*
 *
 * A CORNER IS THE RIGHT ANSWER FOR AN EMPTY ROOM and the wrong one for a
 * set. Every `VirtualSet` has carried a `logo` and a `lowerThird`
 * rectangle since the sets were drawn — tested to clear the furniture,
 * and read by nothing. `bottom-left` in News Desk is the front of the
 * desk, so the station's own lower third landed on the one surface in
 * the picture guaranteed to be in front of it.
 *
 * TWO HALVES, TESTED APART. `marksFor` decides WHERE A MARK BELONGS and
 * knows nothing about ffmpeg; `markFilters` turns that into a filter
 * string and knows nothing about sets. The second matters more than it
 * looks: a wrong drawtext expression does not produce a wrong caption,
 * it fails the segment and puts the channel to black.
 */
import { describe, expect, it } from 'vitest';

import { newChannel, goLive, setIdentity } from '../../src/domain/channelEdit.js';
import { DEFAULT_IDENTITY, marksFor } from '../../src/domain/identity.js';
import type { Mark } from '../../src/domain/identity.js';
import { setById, VIRTUAL_SETS } from '../../src/domain/virtualSet.js';
import { STREAM, markFilters } from '../../src/playout/segment.js';

const AT = '2026-09-25T09:00:00.000Z';
const title = () => 'Everlasting Love';

function channelOn(setId: string | undefined) {
  const c = newChannel('BalanceVid TV', 'UTC', AT);
  setIdentity(c, {
    bug: { text: 'BV', corner: 'top-right', opacity: 0.8 },
    ...(setId ? { setId } : {}),
  });
  goLive(c, 'Studio', AT);
  return c;
}

const live = (c: ReturnType<typeof channelOn>) =>
  marksFor(c.identity, { kind: 'live', session: c.live! } as never, 0,
    title, 'The Nine O’Clock News');

describe('a set says where its own captions go (§27)', () => {
  it('gives the bug the set’s logo region', () => {
    const marks = live(channelOn('news_desk'));
    const bug = marks.find((one) => one.kind === 'bug')!;
    expect(bug.at).toEqual(setById('news_desk')!.logo);
  });

  it('gives the lower third and its NEXT the set’s strip', () => {
    const marks = live(channelOn('news_desk'));
    const strip = setById('news_desk')!.lowerThird;
    for (const kind of ['lower-third', 'next'] as const) {
      expect(marks.find((one) => one.kind === kind)!.at,
        `${kind} should sit in the set's strip`).toEqual(strip);
    }
  });

  it('gives a cited contributor\u2019s name the strip too', () => {
    /* The caption most likely to land on a desk, because it is the one
       that goes up unbidden: somebody's answer is playing and the
       station names them over their own face. It replaces the title
       rather than joining it, so it is a separate branch and needs
       saying separately. [D-25] */
    const c = channelOn('news_desk');
    c.live!.citing = { name: 'Amina Yusuf', asks: 'What did you make of it?',
      at: AT };
    const cited = live(c).find((one) => one.kind === 'lower-third')!;
    expect(cited.text).toContain('Amina Yusuf');
    expect(cited.at).toEqual(setById('news_desk')!.lowerThird);
  });

  it('leaves the LIVE lamp in its corner', () => {
    /* The one mark that is a statement of fact about the transmission
       rather than part of the room's design. A viewer checking whether
       this is live should find it in the same place on every channel. */
    const lamp = live(channelOn('news_desk')).find((one) => one.kind === 'lamp')!;
    expect(lamp.at).toBeUndefined();
    expect(lamp.corner).toBe('top-left');
  });

  it('places nothing when the channel has no set', () => {
    /* The behaviour every channel had before this existed. */
    for (const mark of live(channelOn(undefined))) {
      expect(mark.at, `${mark.kind} should have no region`).toBeUndefined();
    }
  });

  it('names a region only for a set that exists', () => {
    /* Two doors, and both are shut. `setIdentity` refuses to store an id
       that names no scene, so a channel document cannot hold one -- and
       `marksFor` takes an identity from anywhere, so it checks again
       rather than trusting that. A mark pointing at a scene nobody drew
       would be a rectangle of zero everything. */
    const c = newChannel('BalanceVid TV', 'UTC', AT);
    expect(() => setIdentity(c, { setId: 'no_such_set' }))
      .toThrow(/unknown virtual set/);

    const marks = marksFor(
      { ...DEFAULT_IDENTITY, setId: 'no_such_set' },
      { kind: 'off' }, 0, title);
    expect(marks.every((one) => one.at === undefined)).toBe(true);
  });
});

describe('the region becomes a filter (§27, C-20)', () => {
  const mark = (over: Partial<Mark>): Mark => ({
    kind: 'lower-third', text: 'Title', corner: 'bottom-left',
    opacity: 1, size: 26, ink: '#ffffff', ...over,
  });

  it('puts the text on the rectangle, in pixels', () => {
    const at = { x: 0.05, y: 0.6, w: 0.5, h: 0.1 };
    const [filter] = markFilters([mark({ at })]);
    expect(filter).toContain(`:x=${Math.round(0.05 * STREAM.width)}`);
    /* Sitting ON the floor of the region, so a taller line grows upward
       into the strip rather than down through it. */
    expect(filter).toContain(`:y=${Math.round(0.7 * STREAM.height)}-th`);
  });

  it('stacks a second mark up the region, not off the bottom of the frame', () => {
    const at = { x: 0.05, y: 0.6, w: 0.5, h: 0.1 };
    const [first, second] = markFilters([
      mark({ at }), mark({ kind: 'next', size: 18, at }),
    ]);
    const y = (filter: string | undefined) =>
      Number(/:y=(-?\d+)-th/.exec(filter ?? '')![1]);
    expect(y(second)).toBeLessThan(y(first));
    expect(first).not.toContain('h-th-');
  });

  it('leaves a mark with no region on its corner, exactly as before', () => {
    const [filter] = markFilters([mark({ corner: 'bottom-right' })]);
    expect(filter).toContain(':x=w-tw-28');
    expect(filter).toContain(':y=h-th-28');
  });

  it('does not let a region and a corner push each other about', () => {
    /* Two stacks, counted apart: a caption in the set's strip is not in
       the way of one in the frame's corner. */
    const at = { x: 0.05, y: 0.6, w: 0.5, h: 0.1 };
    const [inSet, inCorner] = markFilters([mark({ at }), mark({})]);
    expect(inSet).toContain(`:y=${Math.round(0.7 * STREAM.height)}-th`);
    expect(inCorner).toContain(':y=h-th-28');
  });

  it('every set’s regions land inside the frame', () => {
    /* A rectangle is a fraction, and a fraction over one is a caption
       nobody sees. Checked across the shelf rather than on one set. */
    for (const set of VIRTUAL_SETS) {
      for (const [name, at] of [['logo', set.logo],
        ['lowerThird', set.lowerThird]] as const) {
        const [filter] = markFilters([mark({ at })]);
        const x = Number(/:x=(-?\d+)/.exec(filter ?? '')![1]);
        const y = Number(/:y=(-?\d+)-th/.exec(filter ?? '')![1]);
        expect(x, `${set.id}'s ${name} starts off the frame`)
          .toBeGreaterThanOrEqual(0);
        expect(x, `${set.id}'s ${name} starts past the right edge`)
          .toBeLessThan(STREAM.width);
        expect(y, `${set.id}'s ${name} floor is off the frame`)
          .toBeGreaterThan(0);
        expect(y, `${set.id}'s ${name} floor is below the frame`)
          .toBeLessThanOrEqual(STREAM.height);
      }
    }
  });
});
