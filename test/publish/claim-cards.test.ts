/**
 * A card per exchange, and what it is allowed to say.  [U-30, U-31, INV-05, INV-06]
 *
 * The share card's own tests defend one rule: only a bound statement goes in
 * quotation marks. These defend the same rule on a card that carries TWO
 * sentences instead of one — the source's and the author's — because the
 * second one comes out of a speech recogniser and the temptation to set it in
 * quotation marks is exactly as strong and exactly as wrong.
 *
 * A card travels without the conversation it came from. Whatever it claims,
 * it claims alone.
 */
import { describe, expect, it } from 'vitest';

import { buildClaimCards, CLAIM_CARD_HEIGHT, CLAIM_CARD_WIDTH, claimCardName }
  from '../../src/publish/claimCard.js';
import { claimCardAss } from '../../src/render/thumbnails.js';
import { HOUSE_FPS } from '../../src/domain/time.js';
import { S, makeConversation, makeIntervention, makeTake } from '../domain/fixtures.js';
import type { Conversation } from '../../src/domain/document.js';
import type { Transcript } from '../../src/transcribe/types.js';

const ATTRIBUTION = 'Source: “The History of Europe” by Someone. Responses by the author.';

function transcriptOf(text: string, frames = HOUSE_FPS * 20): Transcript {
  return {
    engine: 'test', language: 'en', characteristics: {},
    words: [],
    sentences: [{ text, startFrame: 0, endFrame: frames, words: [] }],
  } as unknown as Transcript;
}

/** A conversation with `n` answered interventions, each take 20s long. */
function answered(n: number, options: { quote?: string } = {}): Conversation {
  const conversation = makeConversation(
    S(600),
    Array.from({ length: n }, (_, i) => makeIntervention(S(60 * (i + 1)), S(20),
      options.quote ? { type: 'critique', quote: options.quote } : { type: 'critique' })),
  );
  for (const intervention of conversation.interventions) {
    intervention.takes = [makeTake(S(20))];
    intervention.selectedTakeId = intervention.takes[0]!.id;
  }
  return conversation;
}

describe('which exchanges get a card', () => {
  it('one per response that was actually recorded', () => {
    const cards = buildClaimCards({ conversation: answered(3), attribution: ATTRIBUTION });
    expect(cards).toHaveLength(3);
    expect(cards.map((card) => card.index)).toEqual([1, 2, 3]);
  });

  /*
   * A claim with no answer is a poster for the claim. This product exists to
   * argue with things; a card of somebody else's sentence, in this product's
   * typography, carrying this author's attribution, and no reply, argues for
   * it.
   */
  it('and none for a claim nobody answered', () => {
    const conversation = answered(2);
    conversation.interventions[1]!.takes = [];
    conversation.interventions[1]!.selectedTakeId = null;
    const cards = buildClaimCards({ conversation, attribution: ATTRIBUTION });
    expect(cards).toHaveLength(1);
  });

  it('names its own file, zero-padded so a directory sorts', () => {
    expect(claimCardName(1)).toBe('claim-01.png');
    expect(claimCardName(12)).toBe('claim-12.png');
  });
});

describe('the honesty rules (INV-05, INV-06)', () => {
  it('quotes a bound statement, because it hashes to what was said', () => {
    const cards = buildClaimCards({
      conversation: answered(1, { quote: 'Growth was the highest in Europe.' }),
      attribution: ATTRIBUTION,
    });
    expect(cards[0]!.claim.quoted).toBe(true);
    expect(cards[0]!.claim.text).toBe('Growth was the highest in Europe.');
    // And the drawn card puts the marks on. Typography carries the claim.
    expect(claimCardAss(cards[0]!)).toContain('“Growth was the highest in Europe.”');
  });

  it('and never quotes an unbound one — it names the moment instead', () => {
    const cards = buildClaimCards({ conversation: answered(1), attribution: ATTRIBUTION });
    expect(cards[0]!.claim.quoted).toBe(false);
    expect(cards[0]!.claim.text).toMatch(/at \d+:\d\d/);
    expect(claimCardAss(cards[0]!)).not.toContain('“' + cards[0]!.claim.text);
  });

  /*
   * The author's own words, off a machine transcript nobody accepted. The
   * article already prints exactly this text as prose, so the card does too —
   * as the body, never in quotation marks. Quotation marks on a line no human
   * checked would be this product doing the thing it exists to argue against.
   */
  it('prints the response and does not put it in quotation marks', () => {
    const conversation = answered(1, { quote: 'Growth was the highest in Europe.' });
    const takeId = conversation.interventions[0]!.takes[0]!.id;
    const cards = buildClaimCards({
      conversation,
      attribution: ATTRIBUTION,
      takeTranscripts: new Map([[takeId, transcriptOf('That is true of one year only.')]]),
    });
    expect(cards[0]!.response.kind).toBe('spoken');
    expect(cards[0]!.response.text).toBe('That is true of one year only.');
    const ass = claimCardAss(cards[0]!);
    expect(ass).toContain('That is true of one year only.');
    expect(ass).not.toContain('“That is true of one year only.”');
  });

  it('says how long an untranscribed answer was rather than inventing one', () => {
    const cards = buildClaimCards({ conversation: answered(1), attribution: ATTRIBUTION });
    expect(cards[0]!.response.kind).toBe('unheard');
    expect(cards[0]!.response.text).toMatch(/20 seconds of critique, not transcribed\./);
  });

  it('carries the attribution on every card, without exception', () => {
    const cards = buildClaimCards({ conversation: answered(4), attribution: ATTRIBUTION });
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      expect(card.attribution).toBe(ATTRIBUTION);
      expect(claimCardAss(card)).toContain('Source');
    }
  });
});

describe('what a screen reader is told (D-04)', () => {
  it('describes the whole card, not the fact that there is one', () => {
    const conversation = answered(1, { quote: 'Growth was the highest in Europe.' });
    const takeId = conversation.interventions[0]!.takes[0]!.id;
    const cards = buildClaimCards({
      conversation,
      attribution: ATTRIBUTION,
      takeTranscripts: new Map([[takeId, transcriptOf('That is true of one year only.')]]),
    });
    const alt = cards[0]!.alt;
    expect(alt).toContain('Growth was the highest in Europe.');
    expect(alt).toContain('That is true of one year only.');
    expect(alt).toContain('Critique');
  });
});

describe('the canvas', () => {
  /*
   * Square because it is the one shape no platform crops. A card exists to
   * survive being passed on, and one that arrives with its attribution cut
   * off has failed at the only job it has. [INV-07]
   */
  it('is square, and says so in the card', () => {
    const cards = buildClaimCards({ conversation: answered(1), attribution: ATTRIBUTION });
    expect(cards[0]!.image).toEqual({
      width: CLAIM_CARD_WIDTH, height: CLAIM_CARD_HEIGHT,
    });
    expect(CLAIM_CARD_WIDTH).toBe(CLAIM_CARD_HEIGHT);
  });

  it('shrinks the type in steps, so a row of cards looks made rather than computed', () => {
    const short = buildClaimCards({
      conversation: answered(1, { quote: 'It did not.' }), attribution: ATTRIBUTION })[0]!;
    const long = buildClaimCards({
      conversation: answered(1, { quote: 'x'.repeat(175) }), attribution: ATTRIBUTION })[0]!;
    const sizeOf = (ass: string) => Number(/^Style: Claim,[^,]+,(\d+)/m.exec(ass)![1]);
    expect(sizeOf(claimCardAss(short))).toBeGreaterThan(sizeOf(claimCardAss(long)));
  });

  it('cuts a very long statement at a word and says it was cut', () => {
    const quote = `${'word '.repeat(60)}end`;
    const card = buildClaimCards({
      conversation: answered(1, { quote }), attribution: ATTRIBUTION })[0]!;
    expect(card.claim.text.endsWith('…')).toBe(true);
    expect(card.claim.text).not.toMatch(/wo…$/);
  });
});
