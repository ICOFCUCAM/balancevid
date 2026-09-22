import { describe, expect, it } from 'vitest';
import { isRespondable, lineageDepth } from '../../src/domain/document.js';
import { EditError } from '../../src/domain/edit.js';
import {
  ConsentError, MAX_CHAIN_DEPTH, assertRespondable, chainAttribution, lineageFor,
  publish, unpublish,
} from '../../src/domain/publish.js';
import { buildRenderPlan } from '../../src/domain/plan.js';
import { S, makeConversation, makeIntervention } from './fixtures.js';

const AT = '2026-09-22T12:00:00.000Z';

function published(respondable = true) {
  const conversation = makeConversation(S(600), [makeIntervention(S(100), S(20))]);
  publish(conversation, {
    planHash: 'abc123', respondable, author: 'Chama Meyembi', publishedAt: AT,
  });
  return conversation;
}

/**
 * "A published conversation is a Class A source. Anyone can open it and
 *  respond to it. That single property turns the product from a tool into a
 *  network." [U-31]
 */
describe('publishing and consent (U-31)', () => {
  it('records the publisher\'s decision rather than assuming one', () => {
    expect(isRespondable(published(true))).toBe(true);
    expect(isRespondable(published(false))).toBe(false);
  });

  it('refuses to publish nothing', () => {
    const empty = makeConversation(S(600), []);
    expect(() => publish(empty, { planHash: 'x', respondable: true, publishedAt: AT }))
      .toThrow(EditError);
  });

  it('lets anyone answer a respondable conversation', () => {
    expect(() => assertRespondable(published(true))).not.toThrow();
  });

  it('refuses when the author did not allow responses', () => {
    expect(() => assertRespondable(published(false)))
      .toThrow(/not allowed responses/);
  });

  it('refuses when it is not published at all', () => {
    const draft = makeConversation(S(600), [makeIntervention(S(100), S(20))]);
    expect(() => assertRespondable(draft)).toThrow(/not published/);
  });

  it('refuses once withdrawn', () => {
    const conversation = published(true);
    unpublish(conversation, AT);
    expect(isRespondable(conversation)).toBe(false);
    expect(() => assertRespondable(conversation)).toThrow(ConsentError);
  });
});

describe('lineage (U-31, §40)', () => {
  it('records what a response is answering', () => {
    const parent = published();
    const lineage = lineageFor(parent);
    expect(lineage.parentConversationId).toBe(parent.id);
    expect(lineage.chain).toHaveLength(1);
    expect(lineage.chain[0]).toMatchObject({
      conversationId: parent.id, title: parent.title,
      author: 'Chama Meyembi', sourceTitle: 'The History of Europe',
    });
  });

  it('extends the chain, oldest first, so an exchange traces to its origin', () => {
    const first = published();
    const second = makeConversation(S(600), [makeIntervention(S(50), S(10))]);
    second.title = 'My response to the response';
    second.lineage = lineageFor(first);
    publish(second, { planHash: 'def', respondable: true, author: 'Someone', publishedAt: AT });

    const third = lineageFor(second);
    expect(third.chain.map((e) => e.conversationId)).toEqual([first.id, second.id]);
    expect(lineageDepth({ ...second, lineage: third } as never)).toBe(2);
  });

  it('copies the chain rather than looking it up, so it survives the parent', () => {
    const parent = published();
    const lineage = lineageFor(parent);
    // The parent is later retitled and withdrawn; the response still knows
    // what it answered.
    parent.title = 'something else entirely';
    unpublish(parent, AT);
    expect(lineage.chain[0]!.title).toBe('My Response to "The History of Europe"');
  });

  it('stops a chain that nobody could follow', () => {
    const deep = published();
    deep.lineage = {
      parentConversationId: 'conv_x',
      chain: Array.from({ length: MAX_CHAIN_DEPTH }, (_, i) => ({
        conversationId: `conv_${i}`, title: `r${i}`, sourceTitle: 'root',
      })),
    };
    expect(() => assertRespondable(deep)).toThrow(/deep/);
  });
});

describe('attribution down a chain (U-21, U-31)', () => {
  it('credits the conversation being answered and the original source', () => {
    const parent = published();
    const child = makeConversation(S(600), [makeIntervention(S(50), S(10))]);
    child.lineage = lineageFor(parent);

    const text = chainAttribution(child, AT);
    expect(text).toContain('Responding to');
    expect(text).toContain('Chama Meyembi');
    expect(text).toContain('Original source: "The History of Europe"');
    expect(text).toContain('https://example.org/video');
  });

  it('says how deep the chain runs once it is more than one', () => {
    const child = makeConversation(S(600), [makeIntervention(S(50), S(10))]);
    child.lineage = {
      parentConversationId: 'conv_b',
      chain: [
        { conversationId: 'conv_a', title: 'first', sourceTitle: 'The History of Europe' },
        { conversationId: 'conv_b', title: 'second', sourceTitle: 'The History of Europe' },
      ],
    };
    expect(chainAttribution(child, AT)).toContain('2 responses deep');
  });

  it('puts the chain into the render, where it cannot be removed (INV-07)', () => {
    const parent = published();
    const child = makeConversation(S(600), [makeIntervention(S(50), S(10))]);
    child.lineage = lineageFor(parent);
    const plan = buildRenderPlan(child);
    expect(plan.attribution.text).toContain('Responding to');
    expect(plan.attribution.text).toContain('Original source');
  });
});
