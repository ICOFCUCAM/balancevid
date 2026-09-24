/**
 * The share card.  [Doctrine U-30, U-31, D-16, INV-05]
 *
 * This is the one artefact in the product that is read by people who have not
 * watched anything. It is what a link becomes in a message, and it is seen far
 * more often than the video is. So what is defended here is almost entirely
 * negative: it must not quote what was never bound, must not invent a line
 * that exists nowhere else, must not promise what the conversation does not
 * contain, and must not exist at all for something unpublished.
 *
 * A product that argues against work overstating itself cannot ship a card
 * that overstates.
 */
import { describe, expect, it } from 'vitest';

import { CARD_HEIGHT, CARD_WIDTH, buildShareCard } from '../../src/publish/card.js';
import { isPublicRepresentation } from '../../src/auth/policy.js';
import { findRepresentation } from '../../src/representations/registry.js';
import { S, makeConversation, makeIntervention } from '../domain/fixtures.js';

const ATTRIBUTION = 'Source: "The History of Europe" by Example Channel — https://example.org/video';

const card = (conversation: Parameters<typeof buildShareCard>[0]['conversation'],
  totalOutputFrames?: number) => buildShareCard({
  conversation, attribution: ATTRIBUTION,
  ...(totalOutputFrames ? { totalOutputFrames } : {}),
});

describe('what the card may say', () => {
  it('quotes a statement the author bound', () => {
    const conversation = makeConversation(S(300), [
      makeIntervention(S(60), S(30), { quote: 'Rome fell in 476.' }),
    ]);
    const made = card(conversation);
    expect(made.hero).toEqual({ text: 'Rome fell in 476.', quoted: true });
  });

  it('and never quotes one it merely inferred (INV-05)', () => {
    /*
     * The central rule. A sentence taken from the transcript is good enough
     * to open a CLIP on, because the clip then plays it and the viewer hears
     * whether it is right. A still picture plays nothing, so quotation marks
     * on it are a claim about the source that nothing backs.
     */
    const conversation = makeConversation(S(300), [
      makeIntervention(S(60), S(30)), // no quote bound
    ]);
    const made = card(conversation);
    expect(made.hero.quoted).toBe(false);
    expect(made.hero.text).toBe(conversation.title);
  });

  it('prefers the first bound statement over an earlier unbound one', () => {
    const conversation = makeConversation(S(300), [
      makeIntervention(S(60), S(30)),
      makeIntervention(S(150), S(30), { quote: 'The treaty changed nothing.' }),
    ]);
    expect(card(conversation).hero)
      .toEqual({ text: 'The treaty changed nothing.', quoted: true });
  });

  it('ignores a response with nothing recorded in it', () => {
    // A statement somebody bound and then never answered is not a thing to
    // put on a card: the link would promise a reply the video does not have.
    const conversation = makeConversation(S(300), [
      makeIntervention(S(60), S(30), { quote: 'Rome fell in 476.' }),
    ]);
    conversation.interventions[0]!.takes = [];
    conversation.interventions[0]!.selectedTakeId = undefined as never;
    expect(card(conversation).hero.quoted).toBe(false);
    expect(card(conversation).scale).toBe('0 responses');
  });

  it('says nothing that is not already in the conversation (D-16)', () => {
    const conversation = makeConversation(S(300), [
      makeIntervention(S(60), S(30), { quote: 'Rome fell in 476.' }),
    ]);
    const made = card(conversation, S(120));
    const known = [
      conversation.title, conversation.source.title,
      conversation.source.creator ?? '', 'Rome fell in 476.', ATTRIBUTION,
    ];
    // Every word of the hero and the eyebrow traces to something the document
    // already holds. "a clip has a title that exists nowhere else" is a
    // forbidden shape, and so is a card with one.
    expect(known.some((k) => k.includes(made.hero.text))).toBe(true);
    expect(made.eyebrow).toBe(`Answering \u201C${conversation.source.title}\u201D`);
    expect(known).toContain(made.attribution);
  });
});

describe('what the card counts', () => {
  const two = () => makeConversation(S(300), [
    makeIntervention(S(60), S(30), { quote: 'Rome fell in 476.' }),
    makeIntervention(S(150), S(30), { type: 'context' }),
  ]);

  it('the responses, and the runtime when there is one', () => {
    expect(card(two(), S(252)).scale).toBe('2 responses · 04:12');
  });

  it('and leaves the runtime out rather than guessing at it', () => {
    // Before anything is composed there is no runtime. A card claiming one
    // would be claiming a video that does not exist yet.
    expect(card(two()).scale).toBe('2 responses');
  });

  it('counting one as one', () => {
    const conversation = makeConversation(S(300), [makeIntervention(S(60), S(30))]);
    expect(card(conversation).scale).toBe('1 response');
  });
});

describe('what fits', () => {
  it('a long statement is cut at a word, and says it was cut', () => {
    const long = `Rome ${'did not simply fall it was transformed over centuries '.repeat(6)}`;
    const conversation = makeConversation(S(300), [
      makeIntervention(S(60), S(30), { quote: long }),
    ]);
    const hero = card(conversation).hero.text;
    expect(hero.length).toBeLessThanOrEqual(150);
    expect(hero.endsWith('…')).toBe(true);
    // Cut at a space, not mid-word: a broken word reads as broken software.
    expect(hero.slice(0, -1)).toBe(hero.slice(0, -1).trimEnd());
    expect(long.startsWith(hero.slice(0, -1))).toBe(true);
  });

  it('the description stays inside what a preview shows', () => {
    const conversation = makeConversation(S(300), [
      makeIntervention(S(60), S(30), { quote: 'Rome fell in 476, and everything after it followed.' }),
    ]);
    expect(card(conversation, S(252)).description.length).toBeLessThanOrEqual(190);
  });

  it('and the picture is the shape every preview is read in', () => {
    const made = card(makeConversation(S(300), [makeIntervention(S(60), S(30))]));
    expect([made.image.width, made.image.height]).toEqual([CARD_WIDTH, CARD_HEIGHT]);
    expect([CARD_WIDTH, CARD_HEIGHT]).toEqual([1200, 630]);
  });

  it('with the card said in words for anyone who cannot see it (D-04)', () => {
    const conversation = makeConversation(S(300), [
      makeIntervention(S(60), S(30), { quote: 'Rome fell in 476.' }),
    ]);
    const made = card(conversation);
    expect(made.image.alt).toContain('Rome fell in 476.');
    expect(made.image.alt).toContain(conversation.title);
  });
});

describe('the card is a representation, not a page detail', () => {
  it('registered, so the picture and the metadata cannot drift apart (D-16)', () => {
    const registered = findRepresentation('share-card.json');
    expect(registered).toBeDefined();
    expect(registered!.mediaType).toBe('application/json');
  });

  it('and readable by whatever the link was pasted into (U-31)', () => {
    // A preview is fetched by a server with none of the sender's cookies. The
    // ROUTE still checks that the conversation is published; this only says
    // the representation is one a stranger is allowed to ask for.
    expect(isPublicRepresentation('share-card.json')).toBe(true);
    // And the working material still is not.
    expect(isPublicRepresentation('render-plan.json')).toBe(false);
    expect(isPublicRepresentation('bundle.json')).toBe(false);
  });

  it('generated the same way twice', () => {
    const conversation = makeConversation(S(300), [
      makeIntervention(S(60), S(30), { quote: 'Rome fell in 476.' }),
    ]);
    expect(card(conversation, S(252))).toEqual(card(conversation, S(252)));
  });
});
