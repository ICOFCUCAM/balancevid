import { describe, expect, it } from 'vitest';
import type { Annotation, AnnotationId } from '../../src/domain/document.js';
import {
  EditError, MIN_ANNOTATION_FRAMES, addAnnotation, annotationsAt, removeAnnotation,
  setAnnotationWindow, updateAnnotation,
} from '../../src/domain/edit.js';
import { buildRenderPlan } from '../../src/domain/plan.js';
import { S, makeConversation, makeIntervention, makeTake } from './fixtures.js';

let counter = 0;
function mark(overrides: Partial<Annotation> = {}): Annotation {
  return {
    id: `ann_${++counter}` as AnnotationId,
    kind: 'ellipse',
    points: [{ x: 0.2, y: 0.3 }, { x: 0.5, y: 0.6 }],
    style: { color: '#ffcc00', width: 0.005 },
    z: 0,
    ...overrides,
  };
}

function fixture() {
  const conversation = makeConversation(S(600), [makeIntervention(S(100), S(20))]);
  return { conversation, intervention: conversation.interventions[0]! };
}

describe('annotations are vector and normalised (§14, U-12 §1)', () => {
  it('stores points in the frame, not in pixels', () => {
    const { conversation, intervention } = fixture();
    addAnnotation(conversation, intervention.id, mark());
    expect(intervention.annotations![0]!.points).toEqual([
      { x: 0.2, y: 0.3 }, { x: 0.5, y: 0.6 },
    ]);
  });

  it('clamps a mark dragged off the frame', () => {
    const { conversation, intervention } = fixture();
    addAnnotation(conversation, intervention.id, mark({
      points: [{ x: -0.3, y: 0.5 }, { x: 1.4, y: 0.9 }],
    }));
    expect(intervention.annotations![0]!.points).toEqual([
      { x: 0, y: 0.5 }, { x: 1, y: 0.9 },
    ]);
  });

  it('refuses a shape with too few points to be one', () => {
    const { conversation, intervention } = fixture();
    expect(() => addAnnotation(conversation, intervention.id, mark({ points: [{ x: 0.1, y: 0.1 }] })))
      .toThrow(/needs at least/);
  });

  it('refuses a text annotation with no text', () => {
    const { conversation, intervention } = fixture();
    expect(() => addAnnotation(conversation, intervention.id,
      mark({ kind: 'text', points: [{ x: 0.1, y: 0.1 }], text: '  ' })))
      .toThrow(EditError);
  });

  it('stays editable: moving one changes nothing else', () => {
    const { conversation, intervention } = fixture();
    const one = mark();
    addAnnotation(conversation, intervention.id, one);
    updateAnnotation(conversation, intervention.id, one.id, {
      points: [{ x: 0.4, y: 0.4 }, { x: 0.6, y: 0.6 }], style: { color: '#ff0000' },
    });
    expect(intervention.annotations![0]!.points[0]).toEqual({ x: 0.4, y: 0.4 });
    expect(intervention.annotations![0]!.style.color).toBe('#ff0000');
    expect(intervention.annotations![0]!.style.width).toBe(0.005);
  });

  it('removes cleanly', () => {
    const { conversation, intervention } = fixture();
    const one = mark();
    addAnnotation(conversation, intervention.id, one);
    removeAnnotation(conversation, intervention.id, one.id);
    expect(intervention.annotations).toHaveLength(0);
  });
});

describe('a mark has its own timing (U-12 §2)', () => {
  it('is up for the whole response until a window is set', () => {
    const { conversation, intervention } = fixture();
    const one = mark();
    addAnnotation(conversation, intervention.id, one);
    expect(annotationsAt(intervention, 0)).toHaveLength(1);
    expect(annotationsAt(intervention, S(999))).toHaveLength(1);
  });

  it('appears and goes on its window', () => {
    const { conversation, intervention } = fixture();
    const one = mark();
    addAnnotation(conversation, intervention.id, one);
    setAnnotationWindow(conversation, intervention.id, one.id, {
      appearOffset: S(2), dismissOffset: S(5),
    });
    expect(annotationsAt(intervention, S(1))).toHaveLength(0);
    expect(annotationsAt(intervention, S(3))).toHaveLength(1);
    expect(annotationsAt(intervention, S(5))).toHaveLength(0);
  });

  it('refuses a window too short to point at anything', () => {
    const { conversation, intervention } = fixture();
    const one = mark();
    addAnnotation(conversation, intervention.id, one);
    expect(() => setAnnotationWindow(conversation, intervention.id, one.id, {
      appearOffset: 10, dismissOffset: 10 + MIN_ANNOTATION_FRAMES - 1,
    })).toThrow(/at least/);
  });

  it('returns overlapping marks in draw order', () => {
    const { conversation, intervention } = fixture();
    addAnnotation(conversation, intervention.id, mark({ z: 2 }));
    addAnnotation(conversation, intervention.id, mark({ z: 1 }));
    expect(annotationsAt(intervention, 0).map((a) => a.z)).toEqual([1, 2]);
  });

  it('records how fast the stroke was drawn (U-12 §3)', () => {
    const { conversation, intervention } = fixture();
    const one = mark({ kind: 'freehand', points: [{ x: 0.1, y: 0.1 }, { x: 0.4, y: 0.5 }] });
    addAnnotation(conversation, intervention.id, one);
    updateAnnotation(conversation, intervention.id, one.id, { drawFrames: 18 });
    expect(intervention.annotations![0]!.drawFrames).toBe(18);
  });
});

describe('annotations in the plan', () => {
  it('shows the frame the mark points at, without being asked (U-11)', () => {
    const { conversation, intervention } = fixture();
    addAnnotation(conversation, intervention.id, mark());
    const shot = buildRenderPlan(conversation).shots
      .find((s) => s.kind === 'response') as { layoutId: string };
    expect(shot.layoutId).toBe('freeze_pip');
  });

  it('does not draw a mark when the layout shows no frame to mark', () => {
    const { conversation, intervention } = fixture();
    intervention.layoutId = 'full_user';
    addAnnotation(conversation, intervention.id, mark());
    const shot = buildRenderPlan(conversation).shots
      .find((s) => s.kind === 'response') as { annotations?: any[] };
    // Drawing it over the canvas anyway would land it on the author's face.
    expect(shot.annotations).toBeUndefined();
  });

  it('places the mark in the panel the source occupies, not the whole canvas', () => {
    const { conversation, intervention } = fixture();
    intervention.layoutId = 'side_by_side'; // source is the left half, y 0.25–0.75
    addAnnotation(conversation, intervention.id, mark({
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    }));
    const shot = buildRenderPlan(conversation).shots
      .find((s) => s.kind === 'response') as { annotations?: any[] };
    expect(shot.annotations![0]!.points).toEqual([
      { x: 0, y: 0.25 }, { x: 0.5, y: 0.75 },
    ]);
  });

  /**
   * Timing belongs to the response, not to the recording. [U-12 §2]
   *
   * Storing a mark's window in media frames ties it to one take: trimming the
   * head or switching to a re-record silently moves every mark somewhere else,
   * or out of the video entirely. The marks stay in the document and simply
   * stop appearing, which is the worst way for work to go missing (D-07).
   */
  it('keeps its place when the take is trimmed', () => {
    const { conversation, intervention } = fixture();
    const one = mark();
    addAnnotation(conversation, intervention.id, one);
    setAnnotationWindow(conversation, intervention.id, one.id,
      { appearOffset: 15, dismissOffset: 60 });

    const before = (buildRenderPlan(conversation).shots
      .find((s) => s.kind === 'response') as any).annotations[0];

    // The author trims two seconds off the head of what they kept.
    intervention.takes[0]!.mediaInFrame += S(2);
    const after = (buildRenderPlan(conversation).shots
      .find((s) => s.kind === 'response') as any).annotations[0];

    expect(after.startFrame).toBe(before.startFrame);
    expect(after.endFrame).toBe(before.endFrame);
  });

  it('keeps its place when the response is re-recorded', () => {
    const { conversation, intervention } = fixture();
    const one = mark();
    addAnnotation(conversation, intervention.id, one);
    setAnnotationWindow(conversation, intervention.id, one.id,
      { appearOffset: 15, dismissOffset: 60 });
    const before = (buildRenderPlan(conversation).shots
      .find((s) => s.kind === 'response') as any).annotations[0];

    // A second attempt, with a different amount of pre-roll in front of it.
    const second = makeTake(S(20));
    second.mediaInFrame = S(3);
    second.mediaOutFrame = second.durationFrames;
    intervention.takes.push(second);
    intervention.selectedTakeId = second.id;

    const after = (buildRenderPlan(conversation).shots
      .find((s) => s.kind === 'response') as any).annotations[0];
    expect(after.startFrame).toBe(before.startFrame);
  });

  it('clips a mark that runs past the end of what was kept', () => {
    const { conversation, intervention } = fixture();
    const take = intervention.takes[0]!;
    const kept = take.mediaOutFrame - take.mediaInFrame;
    const one = mark();
    addAnnotation(conversation, intervention.id, one);
    setAnnotationWindow(conversation, intervention.id, one.id,
      { appearOffset: kept - 10, dismissOffset: kept + 500 });
    const cue = (buildRenderPlan(conversation).shots
      .find((s) => s.kind === 'response') as any).annotations[0];
    const shot = buildRenderPlan(conversation).shots.find((s) => s.kind === 'response') as any;
    expect(cue.endFrame).toBe(shot.padHeadFrames + kept);
  });
});
