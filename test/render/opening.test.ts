/**
 * What a clip opens with, as the renderer will draw it.  [U-22 §2, INV-05]
 *
 * The domain tests prove which words are chosen. This proves the one thing
 * that only shows up at the point of drawing: WHETHER THEY ARE IN QUOTATION
 * MARKS.
 *
 * That is not typography. A statement is the source's own sentence and the
 * clip plays it a moment later, so the marks are a claim the viewer can check.
 * A hook is the author's line over the source's own picture, and quoted it
 * would read as something the source said. The flag travels from the document
 * through the plan to here so that no layer gets to decide it locally.
 */
import { describe, expect, it } from 'vitest';

import { buildClipPlan } from '../../src/domain/clips.js';
import { setOpening } from '../../src/domain/edit.js';
import { buildAss } from '../../src/render/subtitles.js';
import { S, makeConversation, makeIntervention } from '../domain/fixtures.js';

const OPEN_QUOTE = '“';
const CLOSE_QUOTE = '”';

const pair = () => makeConversation(S(600), [
  makeIntervention(S(100), S(20), { type: 'critique', quote: 'The policy worked.' }),
]);

/** The events held from the very first frame: the opening card. */
function openingLines(ass: string): string[] {
  return ass.split('\n').filter((line) => line.startsWith('Dialogue: 0,0:00:00.00,'));
}

describe('the opening card, drawn', () => {
  it('quotes the statement, because the clip then plays it', () => {
    const conversation = pair();
    const ass = buildAss(buildClipPlan(conversation, conversation.interventions[0]!.id));
    const opening = openingLines(ass).find((l) => l.includes('The policy worked.'));
    expect(opening).toBeDefined();
    expect(opening).toContain(`${OPEN_QUOTE}The policy worked.${CLOSE_QUOTE}`);
  });

  it('and never quotes the author\'s own line (INV-05)', () => {
    const conversation = pair();
    setOpening(conversation, conversation.interventions[0]!.id, {
      card: { kind: 'text', text: 'This number is doing a lot of work.' },
    });
    const ass = buildAss(buildClipPlan(conversation, conversation.interventions[0]!.id));
    const opening = openingLines(ass)
      .find((l) => l.includes('This number is doing a lot of work.'));
    expect(opening).toBeDefined();
    expect(opening).not.toContain(OPEN_QUOTE);
    expect(opening).not.toContain(CLOSE_QUOTE);
  });

  it('while the statement still appears where the response begins', () => {
    // The hook replaces the opening card, not the claim card over the cut:
    // the viewer still sees what is being answered, in quotation marks.
    const conversation = pair();
    setOpening(conversation, conversation.interventions[0]!.id, {
      card: { kind: 'text', text: 'Watch this.' },
    });
    const ass = buildAss(buildClipPlan(conversation, conversation.interventions[0]!.id));
    expect(ass).toContain(`${OPEN_QUOTE}The policy worked.${CLOSE_QUOTE}`);
  });

  it('and opens on nothing when that is what was asked for', () => {
    const conversation = pair();
    setOpening(conversation, conversation.interventions[0]!.id, { card: { kind: 'none' } });
    const ass = buildAss(buildClipPlan(conversation, conversation.interventions[0]!.id));
    expect(openingLines(ass).some((l) => l.includes('The policy worked.'))).toBe(false);
  });
});
