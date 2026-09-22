/**
 * The publication bundle.  [Doctrine U-30, §39]
 *
 * What is being defended here is mostly negative: the bundle must not emit a
 * chapter list the platform will silently discard, must not invent prose the
 * author did not say, and must not change between two runs on one document.
 */
import { describe, expect, it } from 'vitest';

import {
  BUNDLE_VERSION, MAX_THUMBNAILS, MIN_CHAPTERS, TAKE_THUMBNAIL_OFFSET_FRAMES, buildBundle,
} from '../../src/publish/bundle.js';
import { HOUSE_FPS, RESPONSE_PAD_FRAMES } from '../../src/domain/time.js';
import { takeUsableFrames } from '../../src/domain/document.js';
import { S, makeConversation, makeIntervention } from '../domain/fixtures.js';

const NOW = '2026-09-22T12:00:00.000Z';
const ATTRIBUTION = 'Source: "The History of Europe" by Example Channel — https://example.org/video';

function bundle(conversation: Parameters<typeof buildBundle>[0]['conversation']) {
  return buildBundle({ conversation, generatedAt: NOW, attribution: ATTRIBUTION });
}

/** How long a response occupies the output clock: what was kept, plus its pads. */
function responseFrames(conversation: ReturnType<typeof makeConversation>, index: number) {
  const intervention = conversation.interventions[index]!;
  return takeUsableFrames(intervention.takes[0]!) + 2 * RESPONSE_PAD_FRAMES;
}

/** A conversation whose every segment clears the ten-second floor. */
function spacedConversation() {
  return makeConversation(S(300), [
    makeIntervention(S(60), S(30), { quote: 'Rome fell in 476.' }),
    makeIntervention(S(150), S(30), { type: 'context' }),
  ]);
}

describe('chapters', () => {
  it('runs on the output clock, not the source clock', () => {
    const conversation = spacedConversation();
    const b = bundle(conversation);
    // Source, response, source, response, source.
    expect(b.chapters.map((c) => c.kind))
      .toEqual(['source', 'response', 'source', 'response', 'source']);
    // The resumed source starts where the response ended — not at its source time.
    expect(b.chapters[1]!.startFrame).toBe(S(60));
    expect(b.chapters[2]!.startFrame).toBe(S(60) + responseFrames(conversation, 0));
    expect(b.chapters[2]!.startFrame).not.toBe(S(150));
    expect(b.chapters[1]!.timecode.startsWith('00:01:00')).toBe(true);
  });

  it('names the resumed source as a continuation, never as a second beginning', () => {
    const b = bundle(spacedConversation());
    expect(b.chapters[0]!.title).toBe('The History of Europe');
    expect(b.chapters[2]!.title).toBe('The History of Europe, continued');
  });

  it('puts the claim in the response chapter, so the bar reads as an exchange', () => {
    const b = bundle(spacedConversation());
    expect(b.chapters[1]!.title).toContain('Rome fell in 476.');
    expect(b.chapters[1]!.kind).toBe('response');
  });

  it('merges a segment shorter than ten seconds rather than emitting a list platforms drop', () => {
    // Two interventions five seconds apart: the source sliver between them cannot stand.
    const conversation = makeConversation(S(300), [
      makeIntervention(S(60), S(30), { quote: 'First claim.' }),
      makeIntervention(S(65), S(30), { quote: 'Second claim.' }),
    ]);
    const b = bundle(conversation);
    const gaps = b.chapters.slice(1).map((c, i) => c.startFrame - b.chapters[i]!.startFrame);
    expect(gaps.every((g) => g >= 10 * HOUSE_FPS)).toBe(true);
    // The specific thing survives the merge; the generic sliver is what goes.
    expect(b.chapters.some((c) => c.title.includes('Second claim.'))).toBe(true);
  });

  it('emits nothing, and says why, when too few chapters survive', () => {
    // Source 0-15s, a five-second answer, then five seconds of source: the
    // trailing sliver merges away and two chapters are not a chapter list.
    const b = bundle(makeConversation(S(20), [makeIntervention(S(15), S(5))]));
    expect(b.chapters).toEqual([]);
    expect(b.chaptersNote).toContain(String(MIN_CHAPTERS));
  });

  it('emits nothing when the list would not start at zero', () => {
    // An intervention at frame 0 leaves no source segment to open with.
    const b = bundle(makeConversation(S(300), [
      makeIntervention(0, S(30)),
      makeIntervention(S(100), S(30)),
      makeIntervention(S(200), S(30)),
    ]));
    if (b.chapters.length > 0) expect(b.chapters[0]!.startFrame).toBe(0);
  });
});

describe('suggested titles', () => {
  it('quotes the author\'s own material and never writes prose for them', () => {
    const b = bundle(spacedConversation());
    expect(b.suggestedTitles[0]).toContain('Rome fell in 476.');
    expect(b.suggestedTitles.every((t) => t.length > 0)).toBe(true);
  });

  it('always offers something, even with no claims bound', () => {
    const b = bundle(makeConversation(S(300), [makeIntervention(S(60), S(30))]));
    expect(b.suggestedTitles.length).toBeGreaterThan(0);
    expect(b.suggestedTitles.some((t) => t.includes('The History of Europe'))).toBe(true);
  });

  it('does not repeat itself', () => {
    const b = bundle(spacedConversation());
    expect(new Set(b.suggestedTitles).size).toBe(b.suggestedTitles.length);
  });
});

describe('description', () => {
  it('carries the generated attribution block', () => {
    // [INV-07] Attribution is generated and not optional; the description is
    // the one field an author pastes without reading, so it has to be in there.
    expect(bundle(spacedConversation()).description).toContain(ATTRIBUTION);
  });

  it('writes chapters as HH:MM:SS, which is what platforms parse', () => {
    const b = bundle(spacedConversation());
    expect(b.description).toContain('00:01:00 ');
    expect(b.description).not.toMatch(/\d\d:\d\d:\d\d[:;]\d\d /);
  });

  it('omits the chapter block entirely when there are no chapters', () => {
    const b = bundle(makeConversation(S(20), [makeIntervention(S(15), S(5))]));
    expect(b.chapters).toEqual([]);
    expect(b.description).not.toContain('Chapters');
  });

  it('links to the article, so the conversation is readable as well as watchable', () => {
    const b = bundle(spacedConversation());
    expect(b.description).toContain(b.links.article);
  });
});

describe('thumbnail candidates', () => {
  it('offers the moment stopped at, the face answering, and the claim as typography', () => {
    const conversation = spacedConversation();
    const first = conversation.interventions[0]!.id;
    const b = bundle(conversation);
    const kinds = b.thumbnails.filter((t) => t.id.endsWith(first)).map((t) => t.kind);
    expect(kinds).toContain('frame');
    expect(kinds).toContain('take');
    expect(kinds).toContain('quote');
  });

  it('grabs the take frame a second in, past the worst frame of the take', () => {
    const conversation = spacedConversation();
    const take = conversation.interventions[0]!.takes[0]!;
    const candidate = bundle(conversation).thumbnails.find((t) => t.kind === 'take');
    expect(candidate!.takeFrame).toBe(take.mediaInFrame + TAKE_THUMBNAIL_OFFSET_FRAMES);
    expect(candidate!.takeId).toBe(take.id);
  });

  it('keeps the take frame inside what was actually kept', () => {
    // A take trimmed shorter than the offset must not point past its own end.
    const conversation = spacedConversation();
    const take = conversation.interventions[0]!.takes[0]!;
    take.mediaOutFrame = take.mediaInFrame + 5;
    const candidate = bundle(conversation).thumbnails.find((t) => t.kind === 'take');
    expect(candidate!.takeFrame).toBeLessThan(take.mediaOutFrame);
    expect(candidate!.takeFrame).toBeGreaterThanOrEqual(take.mediaInFrame);
  });

  it('stays a set the author can choose from rather than a contact sheet', () => {
    const many = Array.from({ length: 12 }, (_, i) =>
      makeIntervention(S(20 * (i + 1)), S(10), { quote: `Claim ${i}.` }));
    expect(bundle(makeConversation(S(600), many)).thumbnails.length)
      .toBeLessThanOrEqual(MAX_THUMBNAILS);
  });
});

describe('the bundle as a whole', () => {
  it('is the same bundle twice for the same document', () => {
    const conversation = spacedConversation();
    expect(bundle(conversation)).toEqual(bundle(conversation));
  });

  it('records its version and the output length it describes', () => {
    const b = bundle(spacedConversation());
    expect(b.version).toBe(BUNDLE_VERSION);
    expect(b.totalOutputFrames)
      .toBe(S(300) + responseFrames(spacedConversation(), 0) * 2);
    expect(b.generatedAt).toBe(NOW);
  });

  it('holds together with no interventions at all', () => {
    const b = bundle(makeConversation(S(300)));
    expect(b.chapters).toEqual([]);
    expect(b.thumbnails).toEqual([]);
    expect(b.description).toContain(ATTRIBUTION);
  });
});
