/**
 * The conversation, to listen to.  [Doctrine U-22, D-16, INV-00, INV-11]
 *
 * "Not everything should become video." Two claims are tested: that the
 * chapters a listener gets are the chapters a viewer gets, and that the
 * product says what listening costs THIS conversation before anybody
 * publishes one in which a third of the argument points at a picture.
 */
import { describe, expect, it } from 'vitest';

import {
  PODCAST_LOUDNESS_LUFS, audioChapters, listeningCost, pointsAtPicture,
} from '../../src/domain/audioExport.js';
import { chapterMetadata } from '../../src/render/audioFile.js';
import { HOUSE_FPS } from '../../src/domain/time.js';
import { addAnnotation } from '../../src/domain/edit.js';
import { S, makeConversation, makeIntervention, makeTake } from './fixtures.js';
import type { Annotation, AnnotationId } from '../../src/domain/document.js';

describe('chapters a player can use', () => {
  it('turns the chapter list into milliseconds, ending where the next begins', () => {
    const chapters = audioChapters([
      { startFrame: 0, title: 'The source' },
      { startFrame: HOUSE_FPS * 30, title: 'A response' },
    ], HOUSE_FPS * 90);
    expect(chapters).toEqual([
      { startMs: 0, endMs: 30_000, title: 'The source' },
      { startMs: 30_000, endMs: 90_000, title: 'A response' },
    ]);
  });

  it('and drops one that starts where it ends', () => {
    // A player either ignores a zero-length chapter or draws an unreachable
    // marker. This list exists to be used without editing.
    const chapters = audioChapters([
      { startFrame: 0, title: 'First' },
      { startFrame: 0, title: 'Also first' },
    ], HOUSE_FPS * 10);
    expect(chapters).toHaveLength(1);
    expect(chapters[0]!.title).toBe('Also first');
  });

  it('orders them however they arrive', () => {
    const chapters = audioChapters([
      { startFrame: HOUSE_FPS * 10, title: 'Second' },
      { startFrame: 0, title: 'First' },
    ], HOUSE_FPS * 20);
    expect(chapters.map((c) => c.title)).toEqual(['First', 'Second']);
  });
});

describe('the metadata file', () => {
  it('writes chapters ffmpeg will actually read', () => {
    const meta = chapterMetadata(
      [{ startMs: 0, endMs: 1000, title: 'One' }], 'A conversation');
    expect(meta.startsWith(';FFMETADATA1')).toBe(true);
    expect(meta).toContain('[CHAPTER]');
    expect(meta).toContain('TIMEBASE=1/1000');
    expect(meta).toContain('title=One');
  });

  /*
   * A chapter is titled with something somebody said, and what somebody said
   * contains the characters this format reserves. An unescaped `=` in a quote
   * is a chapter that silently becomes a different tag.
   */
  it('and escapes a title that contains what a quote contains', () => {
    const meta = chapterMetadata([{
      startMs: 0, endMs: 1000,
      title: 'Growth = good; see #3 \\ page 4',
    }]);
    expect(meta).toContain('title=Growth \\= good\\; see \\#3 \\\\ page 4');
  });

  it('and never lets a newline end the line early', () => {
    const meta = chapterMetadata([{ startMs: 0, endMs: 1, title: 'One\nTwo' }]);
    expect(meta).toContain('title=One Two');
  });
});

describe('what listening costs (U-22)', () => {
  let counter = 0;
  const mark = (): Annotation => ({
    id: `ann_${++counter}` as AnnotationId,
    kind: 'ellipse',
    points: [{ x: 0.2, y: 0.3 }, { x: 0.5, y: 0.6 }],
    style: {},
    z: 0,
  });

  function conversationWith(responses: number): ReturnType<typeof makeConversation> {
    const interventions = Array.from({ length: responses }, (_, i) =>
      makeIntervention(S(60 * (i + 1)), S(20)));
    const conversation = makeConversation(S(600), interventions);
    for (const intervention of conversation.interventions) {
      intervention.takes = [makeTake(S(20))];
      intervention.selectedTakeId = intervention.takes[0]!.id;
    }
    return conversation;
  }

  it('says nothing when nothing is lost', () => {
    const cost = listeningCost(conversationWith(3));
    expect(cost.pointing).toBe(0);
    expect(cost.note).toBeUndefined();
  });

  /*
   * A response that circles something does not survive being heard: the words
   * are all there and the subject is not. The number is measured from the
   * document rather than guessed at from the prose.
   */
  it('counts the responses that point at something on screen', () => {
    const conversation = conversationWith(3);
    addAnnotation(conversation, conversation.interventions[0]!.id, mark());
    const cost = listeningCost(conversation);
    expect(cost.pointing).toBe(1);
    expect(cost.total).toBe(3);
    expect(cost.note).toMatch(/1 of your 3 response points/);
  });

  it('and counts a response that shows a document as one of them', () => {
    const conversation = conversationWith(2);
    (conversation.interventions[0] as { evidence?: unknown[] }).evidence = [{ id: 'ev_1' }];
    expect(pointsAtPicture(conversation.interventions[0]!)).toBe(true);
    expect(listeningCost(conversation).pointing).toBe(1);
  });

  it('ignores a response that was never recorded', () => {
    const conversation = conversationWith(2);
    conversation.interventions[1]!.takes = [];
    conversation.interventions[1]!.selectedTakeId = null;
    expect(listeningCost(conversation).total).toBe(1);
  });
});

describe('where spoken word is mastered', () => {
  it('is louder than the video, because of where it is listened to', () => {
    expect(PODCAST_LOUDNESS_LUFS).toBeGreaterThan(-18);
    expect(PODCAST_LOUDNESS_LUFS).toBeLessThan(-14);
  });
});
