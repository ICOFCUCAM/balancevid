/**
 * Searching a conversation.  [Doctrine §43, §16, D-05, D-12]
 *
 * §43's example is the specification: "show me every time the speaker
 * mentions Norway", and every result is a frame you can jump to and answer
 * from. The tests follow that shape — what is found, where it points, and
 * what is deliberately not found.
 */
import { describe, expect, it } from 'vitest';

import { fold, matchLine, parseQuery } from '../../src/search/query.js';
import { searchConversation } from '../../src/search/search.js';
import { HOUSE_FPS } from '../../src/domain/time.js';
import { S, makeConversation, makeIntervention } from '../domain/fixtures.js';
import { transcriptOf } from '../knowledge/fixtures.js';

const SOURCE = [
  'norway exported more oil than sweden in nineteen ninety',
  'the delegation travelled to oslo that winter',
  'norway again became the subject of the debate',
  'nothing in this sentence is about scandinavia at all',
];

function setup() {
  const conversation = makeConversation(S(300), [
    makeIntervention(S(60), S(20), { quote: 'Norway exported more oil than Sweden' }),
    makeIntervention(S(150), S(20)),
  ]);
  conversation.interventions[1]!.note = 'check the production figures for Norway';
  return { conversation, transcript: transcriptOf(SOURCE) };
}

const run = (query: string) => {
  const { conversation, transcript } = setup();
  return searchConversation(query, { conversation, sourceTranscript: transcript });
};

describe('finding a word', () => {
  it('finds every time the source mentions it, with a frame for each (§43)', () => {
    const result = run('norway');
    const source = result.hits.filter((h) => h.kind === 'source');
    expect(source.length).toBe(2);
    for (const hit of source) {
      expect(hit.tSourceFrame).toBeGreaterThanOrEqual(0);
      expect(hit.timecode).toMatch(/^\d\d:\d\d:\d\d/);
    }
  });

  it('marks where it matched, so the word can be shown highlighted', () => {
    const [hit] = run('oslo').hits;
    const marked = hit!.text.slice(hit!.highlights[0]!.start, hit!.highlights[0]!.end);
    expect(marked.toLowerCase()).toBe('oslo');
  });

  it('searches what the author bound and wrote, not only the source', () => {
    const kinds = new Set(run('norway').hits.map((h) => h.kind));
    expect(kinds.has('claim')).toBe(true);
    expect(kinds.has('note')).toBe(true);
    expect(kinds.has('source')).toBe(true);
  });

  it('ranks a bound claim above a passing mention', () => {
    // The author already decided that one mattered.
    expect(run('norway').hits[0]!.kind).toBe('claim');
  });

  it('points a hit at the intervention it belongs to', () => {
    const claim = run('norway').hits.find((h) => h.kind === 'claim');
    expect(claim!.interventionId).toBeTruthy();
    expect(claim!.tSourceFrame).toBe(S(60));
  });

  it('finds nothing for a word nobody said', () => {
    const result = run('helicopter');
    expect(result.hits).toEqual([]);
    expect(result.total).toBe(0);
  });
});

describe('how it matches', () => {
  it('ignores case, because the transcriber shouts', () => {
    // The local engine emits upper case; a search box must not care.
    expect(run('NORWAY').total).toBe(run('norway').total);
  });

  it('matches whole words, so "art" does not light up "start"', () => {
    const { conversation } = setup();
    const transcript = transcriptOf(['the art of the start was particular to them']);
    const result = searchConversation('art', { conversation, sourceTranscript: transcript });
    const hit = result.hits.find((h) => h.kind === 'source');
    expect(hit?.highlights).toHaveLength(1);
  });

  it('folds diacritics, so "cafe" finds "café"', () => {
    const { conversation } = setup();
    const result = searchConversation('cafe', {
      conversation, sourceTranscript: transcriptOf(['they met at the café that evening']),
    });
    expect(result.hits.some((h) => h.kind === 'source')).toBe(true);
  });

  it('requires every bare term to appear', () => {
    expect(run('norway sweden').hits.some((h) => h.kind === 'claim')).toBe(true);
    // 'helicopter' appears nowhere, so no line is a complete match...
    const partial = run('norway helicopter');
    expect(partial.hits.every((h) => h.score < 10)).toBe(true);
  });

  it('keeps a quoted phrase together and in order', () => {
    const together = run('"exported more oil"');
    expect(together.hits.length).toBeGreaterThan(0);
    expect(run('"oil more exported"').hits).toEqual([]);
  });

  it('returns nothing for an empty query rather than everything', () => {
    for (const empty of ['', '   ', '""']) {
      expect(run(empty).hits).toEqual([]);
    }
  });
});

describe('the result list', () => {
  it('is the same list twice for the same query', () => {
    // One conversation, searched twice: `run` builds a fresh one each call,
    // and fresh ids would make this test pass or fail for the wrong reason.
    const { conversation, transcript } = setup();
    const once = searchConversation('norway', { conversation, sourceTranscript: transcript });
    const twice = searchConversation('norway', { conversation, sourceTranscript: transcript });
    expect(once).toEqual(twice);
  });

  it('honours a limit but still reports the true total', () => {
    const { conversation, transcript } = setup();
    const limited = searchConversation('norway', {
      conversation, sourceTranscript: transcript, limit: 1,
    });
    expect(limited.hits).toHaveLength(1);
    expect(limited.total).toBeGreaterThan(1);
  });

  it('works on a conversation with no transcript at all', () => {
    // A Class B source is never transcribed; its claims and notes still are.
    const { conversation } = setup();
    const result = searchConversation('norway', { conversation, sourceTranscript: null });
    expect(result.hits.some((h) => h.kind === 'claim')).toBe(true);
    expect(result.hits.some((h) => h.kind === 'source')).toBe(false);
  });

  it('stays inside the 200 ms budget on a long transcript (D-05)', () => {
    // Forty minutes of speech, which is the length the budget is written for.
    const sentences = Array.from({ length: 2400 }, (_, i) =>
      `sentence number ${i} about various things including norway sometimes`);
    const conversation = makeConversation(40 * 60 * HOUSE_FPS);
    const transcript = transcriptOf(sentences, 0.5);
    const started = performance.now();
    const result = searchConversation('norway', { conversation, sourceTranscript: transcript });
    const elapsed = performance.now() - started;
    expect(result.total).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200);
  }, 60_000);
});

describe('query parsing', () => {
  it('separates phrases from bare terms', () => {
    const parsed = parseQuery('oil "exported more" norway');
    expect(parsed.phrases).toEqual(['exported more']);
    expect(parsed.terms).toEqual(['oil', 'norway']);
  });

  it('knows when there is nothing to search for', () => {
    expect(parseQuery('   ').empty).toBe(true);
    expect(parseQuery('a').empty).toBe(false);
  });

  it('folds to a comparable form', () => {
    expect(fold('CAFÉ')).toBe('cafe');
    expect(fold('Straße'.normalize('NFC'))).toContain('stra');
  });

  it('returns no match rather than throwing on odd input', () => {
    for (const odd of ['((', '"unclosed', '\\', '.*']) {
      expect(() => matchLine('some text here', parseQuery(odd))).not.toThrow();
    }
  });

  it('treats a regex-looking query as literal text', () => {
    // A search box is not a regex engine, and ".*" must not match everything.
    const { conversation, transcript } = setup();
    expect(searchConversation('.*', { conversation, sourceTranscript: transcript }).hits)
      .toEqual([]);
  });
});
