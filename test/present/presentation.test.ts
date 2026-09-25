/**
 * The conversation, performed live.  [Doctrine D-16, INV-00, U-08, INV-05]
 *
 * Every other representation is the conversation ALREADY performed. This one
 * is a score: a person stands up, the source plays, it stops where the author
 * interrupted, and they say it out loud. Three claims are defended here.
 *
 *   THE STOP IS THE AUTHOR'S FRAME. Not a rounded second, not the nearest
 *   keyframe. A presentation that paused a third of a second late would pause
 *   after the sentence it is about to argue with.
 *
 *   EVERY INTERRUPTION IS A STOP, recorded or not. A presenter who marked a
 *   moment and has not recorded an answer still means to stop there — that is
 *   the whole reason to present rather than play a file.
 *
 *   AND NOTHING HERE IS AUTHORED. Every prompt is something the author
 *   already said, every document something they already attached.
 */
import { describe, expect, it } from 'vitest';

import { generatePresentation } from '../../src/present/generate.js';
import { renderPresentation } from '../../src/present/html.js';
import { HOUSE_FPS } from '../../src/domain/time.js';
import { addAnnotation } from '../../src/domain/edit.js';
import { S, makeConversation, makeIntervention, makeTake } from '../domain/fixtures.js';
import type {
  Annotation, AnnotationId, Conversation,
} from '../../src/domain/document.js';
import type { Transcript } from '../../src/transcribe/types.js';

const AT = '2026-01-01T00:00:00.000Z';

const spoken = (text: string): Transcript => ({
  engine: 'test', language: 'en', characteristics: {}, words: [],
  sentences: [{ text, startFrame: 0, endFrame: 600, words: [] }],
} as unknown as Transcript);

function talk(options: {
  stops?: number; record?: boolean; transcribe?: boolean; quote?: boolean;
} = {}): { conversation: Conversation; takes: Map<string, Transcript> } {
  const { stops = 3, record = true, transcribe = true, quote = true } = options;
  const conversation = makeConversation(S(600), Array.from({ length: stops }, (_, i) =>
    makeIntervention(S(60 * (i + 1)), S(20),
      quote ? { type: 'critique', quote: `Claim ${i + 1}.` } : { type: 'critique' })));
  conversation.source.mezzanineAssetId = 'asset_x';
  const takes = new Map<string, Transcript>();
  for (const [i, intervention] of conversation.interventions.entries()) {
    if (!record) {
      // Explicitly, because the fixture arrives with one: "nothing recorded"
      // has to be made true rather than assumed.
      intervention.takes = [];
      intervention.selectedTakeId = null;
      continue;
    }
    intervention.takes = [makeTake(S(20))];
    intervention.selectedTakeId = intervention.takes[0]!.id;
    if (transcribe) takes.set(intervention.takes[0]!.id, spoken(`Answer ${i + 1}.`));
  }
  return { conversation, takes };
}

const build = (o?: Parameters<typeof talk>[0]) => {
  const { conversation, takes } = talk(o);
  return generatePresentation({ conversation, takeTranscripts: takes, generatedAt: AT });
};

describe('where the source stops (U-08, INV-02)', () => {
  it('on the frame the author interrupted, converted once', () => {
    const doc = build();
    for (const stop of doc.stops) {
      expect(stop.atSeconds).toBeCloseTo(stop.atFrame / HOUSE_FPS, 5);
    }
    // The frame stays on the stop beside the seconds: it is the canonical
    // number, and a page that only had seconds could not be checked.
    expect(doc.stops.map((stop) => stop.atFrame))
      .toEqual([60, 120, 180].map((seconds) => seconds * HOUSE_FPS));
  });

  /*
   * A frame boundary is a knife edge. `atFrame / fps` at 30fps is 4.333333…,
   * and a seek rounded down by a third of a millisecond lands in the frame
   * BEFORE the one the author interrupted — which is the whole thing this
   * feature exists not to do. The browser run caught it; the first version
   * rounded to milliseconds and was wrong for two frames in three.
   */
  it('and holds the MIDDLE of that frame, so no rounding can miss it', () => {
    const doc = build();
    for (const stop of doc.stops) {
      const frame = 1 / HOUSE_FPS;
      expect(stop.holdSeconds).toBeGreaterThan(stop.atFrame / HOUSE_FPS);
      expect(stop.holdSeconds).toBeLessThan((stop.atFrame + 1) / HOUSE_FPS);
      // Half a frame of room on each side, at any precision a player has.
      expect(stop.holdSeconds - stop.atFrame / HOUSE_FPS).toBeCloseTo(frame / 2, 6);
    }
  });

  it('and the two numbers are not the same number', () => {
    // They answer different questions: one is "have we reached it", the other
    // is "where do we sit". Collapsing them is how the bug got in.
    for (const stop of build().stops) {
      expect(stop.holdSeconds).not.toBe(stop.atSeconds);
    }
  });

  /*
   * Not "every response" — every INTERVENTION. A presenter who marked a
   * moment and has not recorded an answer still means to stop there, and
   * dropping it would silently shorten the lecture.
   */
  it('at every interruption, whether or not anything was recorded', () => {
    expect(build({ stops: 4, record: false }).stops).toHaveLength(4);
    expect(build({ stops: 4 }).stops).toHaveLength(4);
  });

  it('in the order they happen', () => {
    const doc = build({ stops: 3 });
    const frames = doc.stops.map((stop) => stop.atFrame);
    expect([...frames].sort((a, b) => a - b)).toEqual(frames);
    expect(doc.stops.map((stop) => stop.index)).toEqual([1, 2, 3]);
  });
});

describe('what the presenter is given (INV-05, INV-06)', () => {
  it('a bound statement, marked as quotable', () => {
    const stop = build().stops[0]!;
    expect(stop.claim).toEqual({ text: 'Claim 1.', quoted: true });
  });

  /*
   * With nothing bound there is nothing that hashes to what was said, so the
   * sentence the source was on is context for the person speaking — and the
   * page must not put it on a wall in quotation marks.
   */
  it('and never a quotable one where the author bound nothing', () => {
    const doc = build({ quote: false });
    for (const stop of doc.stops) {
      expect(stop.claim?.quoted ?? false).toBe(false);
    }
  });

  it('their own words as a prompt, not as a script', () => {
    expect(build().stops[1]!.prompt).toBe('Answer 2.');
  });

  it('and no prompt at all rather than an invented one', () => {
    const doc = build({ transcribe: false });
    expect(doc.stops[0]!.prompt).toBeUndefined();
    // The stop still exists. The stop is the anchor, not the note.
    expect(doc.stops).toHaveLength(3);
  });

  it('how long they took last time, which is what a lecture is budgeted in', () => {
    const doc = build();
    expect(doc.stops[0]!.recordedSeconds).toBeCloseTo(20, 1);
    expect(doc.budget.recordedSeconds).toBe(60);
    expect(doc.budget.stops).toBe(3);
  });

  it('the recording itself, for a stop they would rather play than say again', () => {
    expect(build().stops[0]!.takeSrc).toMatch(/\/takes\/.+\/media$/);
    expect(build({ record: false }).stops[0]!.takeSrc).toBeUndefined();
  });

  it('their documents, with the retrieval date a citation needs', () => {
    const { conversation, takes } = talk({ stops: 1 });
    (conversation.interventions[0] as { evidence?: unknown[] }).evidence = [{
      id: 'ev_1', title: 'A yearbook', url: 'https://example.org/y',
      locator: { page: 214, quote: 'Fourth.' },
      retrievedAt: '2026-01-02T00:00:00.000Z', archived: false,
    }];
    const stop = generatePresentation({
      conversation, takeTranscripts: takes, generatedAt: AT }).stops[0]!;
    expect(stop.evidence).toEqual([{
      title: 'A yearbook', url: 'https://example.org/y', page: 214,
      quote: 'Fourth.', retrievedAt: '2026-01-02T00:00:00.000Z', archived: false,
    }]);
  });

  it('and how many marks are on the frame, so they know to point at it', () => {
    const { conversation, takes } = talk({ stops: 2 });
    const mark = (): Annotation => ({
      id: 'ann_1' as AnnotationId, kind: 'ellipse',
      points: [{ x: 0.2, y: 0.3 }, { x: 0.5, y: 0.6 }], style: {}, z: 0,
    });
    addAnnotation(conversation, conversation.interventions[0]!.id, mark());
    const doc = generatePresentation({ conversation, takeTranscripts: takes, generatedAt: AT });
    expect(doc.stops[0]!.marks).toBe(1);
    expect(doc.stops[1]!.marks).toBe(0);
  });
});

describe('the page', () => {
  it('says plainly that it needs a script, and hands over the document', () => {
    /*
     * Unlike the article and the interactive page, this one cannot degrade:
     * it is a control surface for a live performance. What it does instead is
     * say so and point at the thing that is a document. [D-04]
     */
    const html = renderPresentation(build(), { articleHref: '/c/x/article' });
    expect(html).toContain('<noscript>');
    expect(html).toMatch(/needs JavaScript/i);
    expect(html).toContain('/c/x/article');
    // And the stops are listed there too, so a reader without one still
    // learns what the presentation would have done.
    expect(html).toMatch(/Claim 1\./);
  });

  it('is not indexed and carries no share card — it is a lectern, not a link', () => {
    const html = renderPresentation(build());
    expect(html).toContain('name="robots" content="noindex"');
    expect(html).not.toContain('og:title');
  });

  it('never omits the attribution, on the screen the room is looking at', () => {
    const doc = build();
    expect(renderPresentation(doc)).toContain('class="credit"');
    expect(doc.attribution.length).toBeGreaterThan(0);
  });

  it('lets the server decide the video type', () => {
    /*
     * The source route serves the WebM proxy by default and the MP4
     * mezzanine on request. A declared `type="video/mp4"` made the browser
     * reject the proxy WITHOUT REQUESTING IT — no error, no network entry.
     */
    const html = renderPresentation(build());
    expect(html).toMatch(/<video id="v"[^>]*src="[^"]+"/);
    expect(html).not.toMatch(/<source[^>]*type="video/);
  });

  it('escapes everything, because all of it is somebody else\'s text', () => {
    const { conversation, takes } = talk({ stops: 1, quote: false });
    conversation.title = '</script><img src=x onerror=alert(1)>';
    conversation.interventions[0]!.anchor.quote = '"</script>" & <b>';
    const html = renderPresentation(generatePresentation({
      conversation, takeTranscripts: takes, generatedAt: AT }));
    expect(html).not.toContain('<img src=x');
    // Including inside the JSON the script reads: a `</script>` in a title
    // would otherwise end the block early and put the rest on the page.
    expect(html).not.toMatch(/<\/script><img/);
  });

  it('is reproducible from its inputs alone (D-16)', () => {
    const { conversation, takes } = talk();
    const once = generatePresentation({ conversation, takeTranscripts: takes, generatedAt: AT });
    const twice = generatePresentation({ conversation, takeTranscripts: takes, generatedAt: AT });
    expect(renderPresentation(once)).toBe(renderPresentation(twice));
  });
});
