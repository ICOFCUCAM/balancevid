/**
 * The deck nobody checked.  [CHANNEL §20, §21, §5, D-04, C-26, C-36]
 *
 * `slideProblems` has run on the slide being TYPED since C-26, and on
 * nothing else. The moment the author pressed Add the judgement
 * stopped: the deck held nine slides and the product had no opinion
 * about any of them. `slideReady` — written for exactly this, with
 * the comment *"the line between DRAFT and READY"* — was never called
 * by anything but its own test.
 *
 * And two faults cannot be seen from a slide at all, because both
 * need the deck's surroundings: a channel that changed colour after
 * the slide was drawn, and a picture deleted from the library after
 * the slide was made from it.
 */

import { describe, expect, it } from 'vitest';

import type { Deck, House, Slide } from '../../src/domain/deck.js';
import {
  deckStanding, slideFaults, standingOf, toCheck,
} from '../../src/domain/deck.js';
import { sameColour } from '../../src/domain/graphic.js';

const AT = '2026-09-25T09:00:00.000Z';

/** A slide this product composed, clean, on a channel with this look. */
function composed(over: Partial<Slide['spec']> = {}, page = 1): Slide {
  return {
    assetId: `asset_${page}`,
    page,
    spec: {
      layout: 'text', heading: 'The heading', body: 'A line of text.',
      accent: '#ee2233', channel: 'BalanceVid TV', ...over,
    },
  };
}

/** A page of somebody's PowerPoint: no definition, never composed here. */
function given(page = 1): Slide {
  return { assetId: `given_${page}`, page };
}

const HOUSE: House = { accent: '#ee2233', channel: 'BalanceVid TV' };

function deckOf(...slides: Slide[]): Deck {
  return {
    id: 'deck_1' as Deck['id'], title: 'A talk', slides,
    origin: 'talk.pptx', createdAt: AT,
  };
}

describe('where a slide stands (C-36)', () => {
  it('says nothing about a slide with nothing wrong', () => {
    expect(slideFaults(composed(), HOUSE)).toEqual([]);
    expect(standingOf(composed(), HOUSE)).toBe('ready');
  });

  /* The check that stopped running the moment the author pressed Add. */
  it('still finds a fault the editor found while it was being typed', () => {
    const wordy = composed({ heading: 'x'.repeat(80) });
    expect(slideFaults(wordy, HOUSE).map((one) => one.code))
      .toContain('long-heading');
    expect(standingOf(wordy, HOUSE)).toBe('draft');
  });

  /* A graphic that would transmit the words "no picture". */
  it('calls a slide that would transmit broken, broken', () => {
    const empty = composed({ layout: 'picture', heading: 'A heading' });
    expect(standingOf(empty, HOUSE)).toBe('broken');
    expect(slideFaults(empty, HOUSE).some((one) => one.blocking)).toBe(true);
  });

  /*
   * NOT OURS TO JUDGE. A page of somebody's PowerPoint has no
   * definition here, so this product cannot say whether its heading
   * is too long — and saying "draft" about somebody else's finished
   * work would be inventing a judgement it has no basis for.
   */
  it('has no opinion about a slide it holds no definition for', () => {
    expect(standingOf(given(), HOUSE)).toBe('as-is');
    expect(slideFaults(given(), HOUSE)).toEqual([]);
  });
});

describe('the picture that was deleted underneath it (C-36)', () => {
  const withPicture = composed({
    layout: 'picture', heading: 'A caption', picture: 'asset_photo',
  });

  it('says so when the library no longer has it', () => {
    const faults = slideFaults(withPicture, {
      ...HOUSE, pictures: new Set(['asset_other']),
    });
    expect(faults.map((one) => one.code)).toContain('lost-picture');
  });

  it('says nothing when the library still has it', () => {
    const faults = slideFaults(withPicture, {
      ...HOUSE, pictures: new Set(['asset_photo']),
    });
    expect(faults.map((one) => one.code)).not.toContain('lost-picture');
  });

  /*
   * "I DO NOT KNOW" IS NOT "IT IS GONE". A caller with no library
   * list to hand gets no opinion about pictures rather than a wrong
   * one — otherwise every picture slide on every such surface reads
   * as broken.
   */
  it('does not guess when it was not given the library', () => {
    const faults = slideFaults(withPicture, HOUSE);
    expect(faults.map((one) => one.code)).not.toContain('lost-picture');
    expect(standingOf(withPicture, HOUSE)).toBe('ready');
  });

  /*
   * AND IT IS NOT BLOCKING. The slide on air is a PNG drawn when the
   * picture existed and is exactly as good as it ever was. Calling a
   * correct graphic broken is the same lie as calling a broken one
   * correct, pointed the other way.
   */
  it('does not call a slide that still transmits broken', () => {
    const house = { ...HOUSE, pictures: new Set(['asset_other']) };
    expect(standingOf(withPicture, house)).toBe('draft');
    expect(slideFaults(withPicture, house)
      .find((one) => one.code === 'lost-picture')?.blocking).toBe(false);
  });

  /* The sentence has to say both halves or it is an alarm. */
  it('says it still transmits and says what cannot be done', () => {
    const says = slideFaults(withPicture, {
      ...HOUSE, pictures: new Set<string>(),
    }).find((one) => one.code === 'lost-picture')?.says ?? '';
    expect(says).toContain('still transmits');
    expect(says).toContain('corrected');
  });
});

describe('the channel that changed colour underneath it (C-36)', () => {
  /* A deck composed either side of a rebrand transmits two stations. */
  it('finds a slide drawn in the old colour', () => {
    const faults = slideFaults(composed({ accent: '#1166cc' }), HOUSE);
    expect(faults.map((one) => one.code)).toContain('off-identity');
  });

  /*
   * AND IT IS NOT BLOCKING EITHER. A slide in last month's colour is
   * a slide that goes out looking like last month, which is worth
   * saying and is not a broken graphic. Marking it broken would put
   * a red mark beside work that is doing its job.
   */
  it('does not call a slide in the old colour broken', () => {
    const old = composed({ accent: '#1166cc' });
    expect(standingOf(old, HOUSE)).toBe('draft');
    expect(slideFaults(old, HOUSE)
      .find((one) => one.code === 'off-identity')?.blocking).toBe(false);
  });

  it('finds one drawn before the channel had a colour at all', () => {
    const faults = slideFaults(composed({ accent: undefined }), HOUSE);
    expect(faults.map((one) => one.code)).toContain('off-identity');
  });

  it('finds one carrying the channel’s old name', () => {
    const faults = slideFaults(composed({ channel: 'Prof Class TV' }), HOUSE);
    expect(faults.map((one) => one.code)).toContain('off-identity');
  });

  /*
   * A CHANNEL WITH NO IDENTITY CANNOT HAVE DRIFTED FROM ONE. Asking
   * about a house that has not been described must not mark every
   * slide in it.
   */
  it('says nothing when there is nothing to differ from', () => {
    expect(slideFaults(composed({ accent: '#1166cc' }), {}))
      .toEqual([]);
    expect(standingOf(composed({ accent: '#1166cc' }), {})).toBe('ready');
  });

  /* `#e23` and `#ee2233` are one colour, and a check that said
     otherwise would mark every slide on a channel whose colour was
     typed twice. */
  it('reads the same colour written two ways as one colour', () => {
    expect(sameColour('#e23', '#ee2233')).toBe(true);
    expect(sameColour('#EE2233', '#ee2233')).toBe(true);
    expect(sameColour('#e23', '#1166cc')).toBe(false);
    expect(slideFaults(composed({ accent: '#E23' }), HOUSE)).toEqual([]);
  });

  /* Nothing is a colour too, and equal to itself. */
  it('reads two absent colours as agreeing', () => {
    expect(sameColour(undefined, undefined)).toBe(true);
    expect(sameColour('#ee2233', undefined)).toBe(false);
    expect(slideFaults(composed({ accent: undefined, channel: undefined }), {}))
      .toEqual([]);
  });

  /*
   * THE QUESTION IS "WOULD THESE DRAW THE SAME", NOT "ARE THESE THE
   * SAME STRING". `colourOr` turns anything that is not a hex colour
   * into the preset's own ink, so two different non-colours produce
   * one identical slide — and reporting a drift nobody can see would
   * send an author to redraw a slide that is already right.
   */
  it('compares what would be drawn rather than what was written', () => {
    expect(sameColour('red', '#ff0000')).toBe(false);
    expect(sameColour('red', 'blue')).toBe(true);
    expect(sameColour('red', undefined)).toBe(true);
  });
});

describe('the deck as a whole (C-36)', () => {
  const deck = deckOf(
    composed({}, 1),
    composed({ heading: 'x'.repeat(80) }, 2),
    composed({ layout: 'picture', heading: 'H' }, 3),
    given(4),
  );

  it('answers for every slide, in deck order', () => {
    expect(deckStanding(deck, HOUSE).map((one) => one.standing))
      .toEqual(['ready', 'draft', 'broken', 'as-is']);
    expect(deckStanding(deck, HOUSE).map((one) => one.assetId))
      .toEqual(deck.slides.map((one) => one.assetId));
  });

  /*
   * AND A DECK OF SOMEBODY'S POWERPOINT READS "40 SLIDES", NOT "40
   * TO CHECK". A count that is always alarming is a count nobody
   * reads.
   */
  it('counts what wants looking at and nothing else', () => {
    expect(toCheck(deckStanding(deck, HOUSE))).toBe(2);
    expect(toCheck(deckStanding(deckOf(given(1), given(2)), HOUSE))).toBe(0);
    expect(toCheck(deckStanding(deckOf(composed()), HOUSE))).toBe(0);
  });

  it('is quiet about a deck with nothing wrong with it', () => {
    const clean = deckOf(composed({}, 1), composed({}, 2));
    expect(deckStanding(clean, HOUSE).every((one) => one.standing === 'ready'))
      .toBe(true);
    expect(toCheck(deckStanding(clean, HOUSE))).toBe(0);
  });
});
