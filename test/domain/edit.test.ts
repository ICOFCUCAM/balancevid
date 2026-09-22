import { describe, expect, it } from 'vitest';
import {
  EditError, MIN_TAKE_FRAMES, deleteIntervention, deleteTake, moveAnchor, resetTrim,
  selectTake, setLayout, setNote, setType, trimTake,
} from '../../src/domain/edit.js';
import { projectTimeline } from '../../src/domain/timeline.js';
import { assertTimelineInvariants } from '../../src/domain/invariants.js';
import { buildRenderPlan } from '../../src/domain/plan.js';
import { S, makeConversation, makeIntervention, makeTake } from './fixtures.js';

function fixture() {
  const conversation = makeConversation(S(600), [
    makeIntervention(S(100), S(20), { type: 'critique', quote: 'The policy worked.' }),
    makeIntervention(S(300), S(15), { type: 'context' }),
  ]);
  return { conversation, first: conversation.interventions[0]!, second: conversation.interventions[1]! };
}

describe('editing an intervention (§17)', () => {
  it('changes the type, which changes the look with no other input (U-11)', () => {
    const { conversation, first } = fixture();
    setType(conversation, first.id, 'fact_check');
    const shot = buildRenderPlan(conversation).shots.find(
      (s) => s.kind === 'response' && s.interventionId === first.id)!;
    expect(shot).toMatchObject({ layoutId: 'freeze_pip', lowerThird: 'FACT CHECK' });
  });

  it('overrides the layout, and restores the type default', () => {
    const { conversation, first } = fixture();
    setLayout(conversation, first.id, 'full_user');
    expect(first.layoutId).toBe('full_user');
    setLayout(conversation, first.id, null);
    expect(first.layoutId).toBeUndefined();
  });

  it('refuses a layout or type it does not have', () => {
    const { conversation, first } = fixture();
    expect(() => setLayout(conversation, first.id, 'nope')).toThrow(EditError);
    expect(() => setType(conversation, first.id, 'nope' as never)).toThrow(EditError);
  });

  it('keeps a note with the point (§26)', () => {
    const { conversation, first } = fixture();
    setNote(conversation, first.id, '  check the 2019 figure  ');
    expect(first.note).toBe('check the 2019 figure');
    setNote(conversation, first.id, '');
    expect(first.note).toBeUndefined();
  });
});

describe('moving an anchor (§18)', () => {
  it('moves the interruption and keeps the timeline exact', () => {
    const { conversation, first } = fixture();
    moveAnchor(conversation, first.id, S(150));
    const timeline = projectTimeline(conversation);
    assertTimelineInvariants(conversation, timeline);
    expect(first.anchor.tSourceFrame).toBe(S(150));
  });

  it('drops a claim it can no longer be standing on, rather than mis-citing (INV-12)', () => {
    const { conversation, first } = fixture();
    expect(first.anchor.quote).toBeDefined();
    moveAnchor(conversation, first.id, S(200));
    expect(first.anchor.quote).toBeUndefined();
    expect(first.anchor.quoteHash).toBeUndefined();
  });

  it('keeps the claim when the anchor does not actually move', () => {
    const { conversation, first } = fixture();
    moveAnchor(conversation, first.id, first.anchor.tSourceFrame);
    expect(first.anchor.quote).toBeDefined();
  });

  it('clamps to the source rather than dropping the point', () => {
    const { conversation, first } = fixture();
    moveAnchor(conversation, first.id, S(9999));
    expect(first.anchor.tSourceFrame).toBe(S(600));
    assertTimelineInvariants(conversation, projectTimeline(conversation));
  });

  it('reorders the conversation when one point is moved past another', () => {
    const { conversation, first } = fixture();
    moveAnchor(conversation, first.id, S(500));
    const anchors = projectTimeline(conversation).items
      .filter((i) => i.kind === 'response')
      .map((i) => (i as { anchorFrame: number }).anchorFrame);
    expect(anchors).toEqual([S(300), S(500)]);
  });
});

describe('trimming is non-destructive (§17, U-04, U-06)', () => {
  it('moves markers without touching the media', () => {
    const { conversation, first } = fixture();
    const take = first.takes[0]!;
    const before = take.durationFrames;
    trimTake(conversation, first.id, take.id, { mediaInFrame: S(2), mediaOutFrame: S(10) });
    expect(take.mediaInFrame).toBe(S(2));
    expect(take.mediaOutFrame).toBe(S(10));
    expect(take.durationFrames).toBe(before);
  });

  it('can recover speech from before the key press', () => {
    const { conversation, first } = fixture();
    const take = first.takes[0]!;
    expect(take.mediaInFrame).toBeGreaterThan(0); // pre-roll hidden by default
    trimTake(conversation, first.id, take.id, { mediaInFrame: 0 });
    expect(take.mediaInFrame).toBe(0);
  });

  it('restores the full take, pre-roll included', () => {
    const { conversation, first } = fixture();
    const take = first.takes[0]!;
    trimTake(conversation, first.id, take.id, { mediaInFrame: S(3), mediaOutFrame: S(5) });
    resetTrim(conversation, first.id, take.id);
    expect(take.mediaInFrame).toBe(0);
    expect(take.mediaOutFrame).toBe(take.durationFrames);
  });

  it('refuses a trim outside the media, or one that keeps nothing', () => {
    const { conversation, first } = fixture();
    const take = first.takes[0]!;
    expect(() => trimTake(conversation, first.id, take.id, { mediaOutFrame: take.durationFrames + 1 }))
      .toThrow(/outside the take/);
    expect(() => trimTake(conversation, first.id, take.id, {
      mediaInFrame: 10, mediaOutFrame: 10 + MIN_TAKE_FRAMES - 1,
    })).toThrow(/at least/);
  });

  it('keeps the timeline exact after a trim', () => {
    const { conversation, first } = fixture();
    // The default trim already starts after the 8s pre-roll, so a shorter
    // out-point has to stay beyond it or nothing is kept.
    const take = first.takes[0]!;
    trimTake(conversation, first.id, take.id, { mediaOutFrame: take.mediaInFrame + S(6) });
    assertTimelineInvariants(conversation, projectTimeline(conversation));
  });
});

describe('takes (U-06)', () => {
  it('auditions another attempt without losing the first', () => {
    const { conversation, first } = fixture();
    const second = makeTake(S(12));
    first.takes.push(second);
    selectTake(conversation, first.id, second.id);
    expect(first.selectedTakeId).toBe(second.id);
    expect(first.takes).toHaveLength(2);
  });

  it('never deletes the last take — the point goes instead', () => {
    const { conversation, first } = fixture();
    expect(() => deleteTake(conversation, first.id, first.takes[0]!.id))
      .toThrow(/at least one take/);
  });

  it('re-selects when the selected take is deleted', () => {
    const { conversation, first } = fixture();
    const second = makeTake(S(12));
    first.takes.push(second);
    selectTake(conversation, first.id, second.id);
    deleteTake(conversation, first.id, second.id);
    expect(first.selectedTakeId).toBe(first.takes[0]!.id);
  });
});

describe('deleting a point (§17)', () => {
  it('removes it and leaves the rest exact', () => {
    const { conversation, first, second } = fixture();
    deleteIntervention(conversation, first.id);
    expect(conversation.interventions.map((i) => i.id)).toEqual([second.id]);
    assertTimelineInvariants(conversation, projectTimeline(conversation));
  });

  it('leaves a conversation with no points renderable as the source alone', () => {
    const { conversation, first, second } = fixture();
    deleteIntervention(conversation, first.id);
    deleteIntervention(conversation, second.id);
    const timeline = projectTimeline(conversation);
    assertTimelineInvariants(conversation, timeline);
    expect(timeline.totalOutputFrames).toBe(S(600));
  });

  it('complains about an id it does not know', () => {
    const { conversation } = fixture();
    expect(() => deleteIntervention(conversation, 'ivn_nope')).toThrow(EditError);
  });
});
