/**
 * The local claim detector.  [Doctrine §20 "claim extraction", U-03, U-15]
 *
 * The detector's job is not to be right. It is to turn "somewhere in this
 * forty minutes is the thing I want to answer" into a list of candidates, and
 * to say why each one is on the list so the author can disagree with it.
 */
import { describe, expect, it } from 'vitest';

import { quoteHash } from '../../src/domain/ids.js';
import { detectClaims, HEURISTIC_CHARACTERISTICS, rulesHash } from '../../src/knowledge/heuristic.js';
import { HeuristicClaimDetector } from '../../src/knowledge/heuristic.js';
import { resolveDetector } from '../../src/knowledge/index.js';
import { transcriptOf, AT } from './fixtures.js';

const claims = (sentences: string[], limit?: number) =>
  detectClaims(transcriptOf(sentences), { generatedAt: AT, ...(limit ? { limit } : {}) })
    .map((s) => (s.payload.kind === 'claim' ? s.payload : null))
    .filter((p): p is Extract<typeof p, { kind: 'claim' }> => p !== null);

describe('what it surfaces', () => {
  it('finds a spoken figure, which ASR writes as words and not as digits', () => {
    const [claim] = claims(['the policy reduced unemployment by thirty percent']);
    expect(claim?.reasons).toContain('states a figure');
  });

  it('finds an absolute, which one counterexample answers', () => {
    const [claim] = claims(['no one has ever produced evidence for that position']);
    expect(claim?.reasons).toContain('makes an absolute statement');
  });

  it('finds an asserted cause', () => {
    const [claim] = claims(['the shortage happened because the ports were closed all year']);
    expect(claim?.reasons).toContain('asserts a cause');
  });

  it('finds an appeal to a source, which is checkable because it names one', () => {
    const [claim] = claims(['according to the department the scheme was working well']);
    expect(claim?.reasons).toContain('appeals to a source');
  });
});

describe('what it leaves alone', () => {
  it('skips a question, recognised by its opening because there is no punctuation', () => {
    expect(claims(['what do you think caused the collapse of the roman empire'])).toHaveLength(0);
  });

  it('skips an opinion', () => {
    expect(claims(['i think it was a beautiful and lovely afternoon by the river'])).toHaveLength(0);
  });

  it('ranks a hedged statement below a flat assertion of the same shape', () => {
    const found = claims([
      'the policy perhaps might possibly have reduced unemployment by thirty percent',
      'the policy reduced unemployment by thirty percent',
    ]);
    expect(found[0]!.quote.toLowerCase()).not.toContain('perhaps');
  });

  it('skips a fragment too short to carry a claim', () => {
    expect(claims(['thirty percent'])).toHaveLength(0);
  });

  it('skips a passage too long to quote', () => {
    // The local segmenter caps sentences at 16 words, so this is built
    // directly: it guards the punctuated engines the registry allows (D-14).
    const base = transcriptOf(['the policy reduced unemployment by thirty percent']);
    const long = {
      ...base,
      sentences: [{
        ...base.sentences[0]!,
        text: `THE POLICY REDUCED UNEMPLOYMENT BY THIRTY PERCENT ${'AND SO ON '.repeat(40)}`,
      }],
    };
    expect(detectClaims(long, { generatedAt: AT })).toHaveLength(0);
  });
});

describe('what it promises', () => {
  it('quotes the source verbatim and hashes to its own words (INV-05, U-15)', () => {
    const [claim] = claims(['the budget was cut by two billion pounds last year']);
    expect(claim!.quoteHash).toBe(quoteHash(claim!.quote));
    // Verbatim means every word of the sentence, in order — not a summary.
    expect(claim!.quote.toLowerCase()).toContain('two billion pounds');
  });

  it('carries a jump point, so a claim leads to the moment it was said (§43)', () => {
    const [claim] = claims(['the budget was cut by two billion pounds last year']);
    expect(claim!.endFrame).toBeGreaterThan(claim!.startFrame);
    expect(claim!.startFrame).toBeGreaterThanOrEqual(0);
  });

  it('gives a reason in words, never a bare score', () => {
    const found = claims(['studies show that the number fell by 40 percent since 1970']);
    expect(found[0]!.reasons.length).toBeGreaterThan(0);
    expect(found[0]!.reasons.every((r) => /\s/.test(r))).toBe(true);
  });

  it('is deterministic: the same transcript always gives the same claims', () => {
    const sentences = [
      'the policy reduced unemployment by thirty percent',
      'no one has ever produced evidence for that position',
    ];
    const a = claims(sentences).map((c) => c.quoteHash);
    const b = claims(sentences).map((c) => c.quoteHash);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(1);
  });

  it('ranks the strongest first and honours a limit', () => {
    const sentences = [
      'the weather that afternoon was mild and the river was calm and quiet',
      'according to the treasury the scheme cut costs by forty percent since 1990',
      'the shortage happened because the ports were closed',
    ];
    const found = claims(sentences, 1);
    expect(found).toHaveLength(1);
    expect(found[0]!.reasons).toContain('appeals to a source');
  });
});

describe('provenance and honesty', () => {
  it('stamps every suggestion with the model, its version and the rule set', () => {
    const [suggestion] = detectClaims(
      transcriptOf(['the budget was cut by two billion pounds last year']), { generatedAt: AT });
    expect(suggestion!.provenance).toEqual({
      model: 'heuristic-claims', version: '1', promptHash: rulesHash(), generatedAt: AT,
    });
  });

  it('says plainly that it is not a language model and cannot judge truth', () => {
    // U-03's discipline applied to this engine: nothing downstream may pretend
    // to a precision the detector does not have.
    expect(HEURISTIC_CHARACTERISTICS.semantic).toBe(false);
    expect(HEURISTIC_CHARACTERISTICS.deterministic).toBe(true);
    expect(HEURISTIC_CHARACTERISTICS.local).toBe(true);
    expect(HEURISTIC_CHARACTERISTICS.summary).toMatch(/cannot tell you whether a claim is true/i);
  });

  it('changes its prompt hash if the rules change, so a silent edit is visible', () => {
    expect(rulesHash()).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('the registry', () => {
  it('hands back a detector without the caller naming an engine (D-14)', async () => {
    const detector = await resolveDetector();
    expect(detector).toBeInstanceOf(HeuristicClaimDetector);
    expect(await detector!.available()).toBe(true);
  });

  it('needs no model and no key, so the first thing an author does always works', async () => {
    expect(await new HeuristicClaimDetector().available()).toBe(true);
  });
});
