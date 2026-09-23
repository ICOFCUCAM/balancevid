/**
 * The AI boundary.  [Doctrine U-15, §20, INV-06, D-09]
 *
 * U-15's premise is that "the user remains the creator" erodes under product
 * pressure unless it is enforceable. These are the enforcement. The first
 * group is the one that matters most: a suggestion nobody accepted must not
 * be able to reach anything the author publishes — not the document, not the
 * article, not the bundle, not the manifest, not a render.
 */
import { describe, expect, it } from 'vitest';

import { buildAttribution, buildRenderPlan } from '../../src/domain/plan.js';
import { bindAcceptedClaim, decideClaim, EditError } from '../../src/domain/edit.js';
import { quoteHash } from '../../src/domain/ids.js';
import {
  AI_MAY_NOT, assertAcceptedOrigin, assertQuoteUnaltered, BoundaryViolation,
  groundedOnly, suggestionKey, type AiOrigin, type Suggestion,
} from '../../src/domain/suggestions.js';
import { generateArticle } from '../../src/article/generate.js';
import { renderMarkdown } from '../../src/article/markdown.js';
import { buildManifest } from '../../src/manifest/build.js';
import { buildBundle } from '../../src/publish/bundle.js';
import { claimsFor, detectClaims, reviewClaims } from '../../src/knowledge/index.js';
import { S, makeConversation, makeIntervention } from '../domain/fixtures.js';
import { sourceTextOf, transcriptOf, AT } from './fixtures.js';

const SENTENCES = [
  'according to the treasury the policy reduced unemployment by thirty percent',
  'the roman empire fell in four hundred and seventy six because of the goths',
  'it was a lovely afternoon and the weather was beautiful',
  'what do you think happened next',
];

function setup() {
  const transcript = transcriptOf(SENTENCES);
  const conversation = makeConversation(S(300), [makeIntervention(S(60), S(30))]);
  const suggestions = detectClaims(transcript, { generatedAt: AT });
  return { transcript, conversation, suggestions, sourceText: sourceTextOf(transcript) };
}

function originFor(suggestion: Suggestion, by = 'Ada'): AiOrigin {
  return { ...suggestion.provenance, suggestionId: suggestion.id, acceptedBy: by, acceptedAt: AT };
}

describe('an unaccepted suggestion cannot enter the record', () => {
  it('is not stored on the document at all', () => {
    const { conversation, suggestions } = setup();
    expect(suggestions.length).toBeGreaterThan(0);
    // The structural guarantee: there is nowhere on the Conversation for an
    // undecided suggestion to sit, so no writer has to remember to filter it.
    expect(JSON.stringify(conversation)).not.toContain('unemployment');
    expect(conversation.claimDecisions).toBeUndefined();
  });

  it('reaches neither the article nor its Markdown', () => {
    const { conversation, transcript, suggestions } = setup();
    const article = generateArticle({
      conversation, sourceTranscript: transcript, generatedAt: AT,
    });
    const markdown = renderMarkdown(article);
    const bound = article.exchanges.map((e) => e.claim?.hash).filter(Boolean);
    for (const suggestion of suggestions) {
      if (suggestion.payload.kind !== 'claim') continue;
      // The words may legitimately appear as transcript prose; what must not
      // appear is the suggestion presented as a claim the author bound.
      expect(bound).not.toContain(suggestion.payload.quoteHash);
      expect(markdown).not.toContain(suggestion.payload.quoteHash);
    }
    expect(bound).toHaveLength(0);
  });

  it('reaches neither the publication bundle nor its description', () => {
    const { conversation, transcript, suggestions } = setup();
    const bundle = buildBundle({
      conversation,
      sourceTranscript: transcript,
      generatedAt: AT,
      attribution: buildAttribution(conversation, AT).text,
    });
    const claims = suggestions
      .map((s) => (s.payload.kind === 'claim' ? s.payload.quote : ''))
      .filter(Boolean);
    // Titles are drawn from claims the author BOUND. An undecided suggestion
    // is not one, so no suggested wording may be proposed as a title.
    for (const claim of claims) {
      expect(bundle.suggestedTitles.join('\n')).not.toContain(claim);
      expect(bundle.description).not.toContain(claim);
      expect(JSON.stringify(bundle.thumbnails)).not.toContain(claim);
    }
  });

  it('reaches neither the manifest nor the render plan', () => {
    const { conversation, transcript, suggestions } = setup();
    const manifest = JSON.stringify(buildManifest({
      conversation, sourceTranscript: transcript, generatedAt: AT,
    }));
    const plan = JSON.stringify(buildRenderPlan(conversation));
    for (const suggestion of suggestions) {
      if (suggestion.payload.kind !== 'claim') continue;
      expect(plan).not.toContain(suggestion.payload.quote);
      expect(manifest).not.toContain(suggestion.payload.quoteHash);
    }
  });

  it('does not become author content merely by being detected twice', () => {
    const { transcript, conversation } = setup();
    const again = detectClaims(transcript, { generatedAt: AT });
    expect(reviewClaims(again, conversation.claimDecisions ?? [])
      .every((c) => c.status === 'suggested')).toBe(true);
  });
});

describe('acceptance', () => {
  it('records who accepted it, when, and what produced it', () => {
    const { conversation, suggestions } = setup();
    const suggestion = suggestions[0]!;
    const decision = decideClaim(conversation, {
      suggestionKey: suggestionKey(suggestion.payload),
      status: 'accepted', by: 'Ada', at: AT, provenance: suggestion.provenance,
    });
    expect(decision.by).toBe('Ada');
    expect(decision.provenance.model).toBe('heuristic-claims');
    expect(decision.provenance.promptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(conversation.claimDecisions).toHaveLength(1);
  });

  it('refuses an anonymous decision, which is how INV-06 fails first', () => {
    const { conversation, suggestions } = setup();
    expect(() => decideClaim(conversation, {
      suggestionKey: 'k', status: 'accepted', by: '  ', at: AT,
      provenance: suggestions[0]!.provenance,
    })).toThrow(EditError);
  });

  it('carries the origin onto the quote it binds, and only then', () => {
    const { conversation, suggestions, sourceText } = setup();
    const suggestion = suggestions[0]!;
    if (suggestion.payload.kind !== 'claim') throw new Error('expected a claim');
    const intervention = conversation.interventions[0]!;
    expect(intervention.anchor.origin).toBeUndefined();

    bindAcceptedClaim(conversation, intervention.id, {
      quote: suggestion.payload.quote,
      sourceText,
      startFrame: suggestion.payload.startFrame,
      origin: originFor(suggestion),
    });
    const origin = conversation.interventions[0]!.anchor.origin!;
    expect(origin.acceptedBy).toBe('Ada');
    expect(origin.model).toBe('heuristic-claims');
    expect(origin.suggestionId).toBe(suggestion.id);
    // And the quote still hashes to its own text (INV-05).
    expect(conversation.interventions[0]!.anchor.quoteHash)
      .toBe(quoteHash(suggestion.payload.quote));
  });

  it('is what makes a claim reach the bundle at all', () => {
    const { conversation, transcript, suggestions, sourceText } = setup();
    const suggestion = suggestions[0]!;
    if (suggestion.payload.kind !== 'claim') throw new Error('expected a claim');
    bindAcceptedClaim(conversation, conversation.interventions[0]!.id, {
      quote: suggestion.payload.quote, sourceText,
      startFrame: suggestion.payload.startFrame, origin: originFor(suggestion),
    });
    const bundle = buildBundle({
      conversation, sourceTranscript: transcript, generatedAt: AT,
      attribution: buildAttribution(conversation, AT).text,
    });
    expect(bundle.suggestedTitles.join('\n')).toContain(suggestion.payload.quote.slice(0, 30));
  });
});

describe('editing', () => {
  it('lets the author narrow a claim to the clause that matters', () => {
    const { conversation, suggestions, sourceText } = setup();
    const suggestion = suggestions[0]!;
    if (suggestion.payload.kind !== 'claim') throw new Error('expected a claim');
    const narrowed = suggestion.payload.quote.split(' ').slice(-6).join(' ');

    const decision = decideClaim(conversation, {
      suggestionKey: suggestionKey(suggestion.payload),
      status: 'edited', by: 'Ada', at: AT,
      provenance: suggestion.provenance, editedQuote: narrowed,
    });
    expect(decision.editedQuote).toBe(narrowed);
    expect(decision.editedQuoteHash).toBe(quoteHash(narrowed));

    // And it binds, because a narrowed span is still the source's words.
    bindAcceptedClaim(conversation, conversation.interventions[0]!.id, {
      quote: narrowed, sourceText, startFrame: suggestion.payload.startFrame,
      origin: originFor(suggestion),
    });
    expect(conversation.interventions[0]!.anchor.quote).toBe(narrowed);
  });

  it('refuses a paraphrase, because a quote the source never said misquotes them', () => {
    const { conversation, suggestions, sourceText } = setup();
    expect(() => bindAcceptedClaim(conversation, conversation.interventions[0]!.id, {
      quote: 'The policy was a total disaster and everyone knows it',
      sourceText, startFrame: S(10), origin: originFor(suggestions[0]!),
    })).toThrow(/actually said|not in the transcript/i);
  });

  it('requires the edited text to exist', () => {
    const { conversation, suggestions } = setup();
    expect(() => decideClaim(conversation, {
      suggestionKey: 'k', status: 'edited', by: 'Ada', at: AT,
      provenance: suggestions[0]!.provenance, editedQuote: '   ',
    })).toThrow(EditError);
  });

  it('shows the source, the suggestion and the author\'s wording as three things', () => {
    const { conversation, suggestions } = setup();
    const suggestion = suggestions[0]!;
    if (suggestion.payload.kind !== 'claim') throw new Error('expected a claim');
    const narrowed = suggestion.payload.quote.split(' ').slice(-6).join(' ');
    decideClaim(conversation, {
      suggestionKey: suggestionKey(suggestion.payload), status: 'edited',
      by: 'Ada', at: AT, provenance: suggestion.provenance, editedQuote: narrowed,
    });
    const [reviewed] = reviewClaims([suggestion], conversation.claimDecisions);
    // What the machine proposed is still legible next to what the author chose.
    expect(reviewed!.suggestion.payload).toMatchObject({ quote: suggestion.payload.quote });
    expect(reviewed!.effectiveQuote).toBe(narrowed);
    expect(reviewed!.status).toBe('edited');
  });
});

describe('rejection', () => {
  it('is recorded, so a dismissed claim stays dismissed across re-detection', () => {
    const { conversation, transcript, suggestions } = setup();
    const key = suggestionKey(suggestions[0]!.payload);
    decideClaim(conversation, {
      suggestionKey: key, status: 'rejected', by: 'Ada', at: AT,
      provenance: suggestions[0]!.provenance,
    });
    // Detection runs again from scratch; the decision must survive it.
    const fresh = detectClaims(transcript, { generatedAt: '2026-10-01T00:00:00.000Z' });
    const reviewed = reviewClaims(fresh, conversation.claimDecisions);
    expect(reviewed.find((c) => c.key === key)?.status).toBe('rejected');
  });

  it('keeps the rejected claim visible rather than making it vanish', () => {
    const { conversation, suggestions } = setup();
    const key = suggestionKey(suggestions[0]!.payload);
    decideClaim(conversation, {
      suggestionKey: key, status: 'rejected', by: 'Ada', at: AT,
      provenance: suggestions[0]!.provenance,
    });
    expect(reviewClaims(suggestions, conversation.claimDecisions).map((c) => c.key))
      .toContain(key);
  });

  it('does not put a rejected claim into the bundle', () => {
    const { conversation, transcript, suggestions } = setup();
    const suggestion = suggestions[0]!;
    if (suggestion.payload.kind !== 'claim') throw new Error('expected a claim');
    decideClaim(conversation, {
      suggestionKey: suggestionKey(suggestion.payload), status: 'rejected',
      by: 'Ada', at: AT, provenance: suggestion.provenance,
    });
    const bundle = buildBundle({
      conversation, sourceTranscript: transcript, generatedAt: AT,
      attribution: buildAttribution(conversation, AT).text,
    });
    expect(bundle.suggestedTitles.join('\n')).not.toContain(suggestion.payload.quote);
  });

  it('replaces an earlier decision rather than accumulating contradictions', () => {
    const { conversation, suggestions } = setup();
    const key = suggestionKey(suggestions[0]!.payload);
    const common = { suggestionKey: key, by: 'Ada', at: AT, provenance: suggestions[0]!.provenance };
    decideClaim(conversation, { ...common, status: 'accepted' });
    decideClaim(conversation, { ...common, status: 'rejected' });
    expect(conversation.claimDecisions).toHaveLength(1);
    expect(conversation.claimDecisions![0]!.status).toBe('rejected');
  });
});

describe('the forbidden list, as code', () => {
  it('has no payload that produces recorded speech or a verdict', () => {
    // U-15's MAY NOT list is enforced by the absence of a variant, so this
    // asserts the absence rather than trusting a comment to hold.
    const kinds = ['claim', 'evidence', 'structure'];
    expect(kinds).not.toContain('take');
    expect(kinds).not.toContain('narration');
    expect(kinds).not.toContain('verdict');
    expect(AI_MAY_NOT).toContain('assert a fact-check verdict as the product\'s own');
  });

  it('rejects a claim suggestion whose text was altered after hashing', () => {
    const { suggestions } = setup();
    const suggestion = suggestions[0]!;
    if (suggestion.payload.kind !== 'claim') throw new Error('expected a claim');
    const tampered = { ...suggestion.payload, quote: `${suggestion.payload.quote} probably` };
    expect(() => assertQuoteUnaltered(tampered)).toThrow(BoundaryViolation);
    expect(() => assertQuoteUnaltered(suggestion.payload)).not.toThrow();
  });

  it('rejects an origin missing any of the four fields INV-06 requires', () => {
    const { suggestions } = setup();
    const full = originFor(suggestions[0]!);
    expect(() => assertAcceptedOrigin(full, 'x')).not.toThrow();
    for (const field of ['model', 'version', 'promptHash', 'acceptedBy', 'acceptedAt'] as const) {
      expect(() => assertAcceptedOrigin({ ...full, [field]: '' }, 'x'))
        .toThrow(BoundaryViolation);
    }
    // Absent entirely means "a person made this", which is the normal case.
    expect(() => assertAcceptedOrigin(undefined, 'x')).not.toThrow();
  });

  it('drops an ungrounded research result rather than showing it with a caveat', () => {
    // U-34 §1: not returned with a caveat, not greyed out. Not returned.
    const grounded: Suggestion = {
      id: 'sug_a', provenance: suggestions0().provenance,
      payload: {
        kind: 'evidence', url: 'https://example.org/p', title: 'A page',
        retrievedAt: AT, excerpt: 'x', stance: 'contradicts',
      },
    };
    const ungrounded: Suggestion = {
      id: 'sug_b', provenance: suggestions0().provenance,
      payload: {
        kind: 'evidence', url: '', title: 'Something I recall',
        retrievedAt: '', excerpt: 'x', stance: 'supports',
      },
    };
    expect(groundedOnly([grounded, ungrounded])).toEqual([grounded]);
  });
});

function suggestions0() { return setup().suggestions[0]!; }

describe('source class', () => {
  it('finds claims for a Class A source', async () => {
    const { conversation, transcript } = setup();
    const result = await claimsFor(conversation, transcript);
    expect(result.unavailable).toBeUndefined();
    expect(result.claims.length).toBeGreaterThan(0);
    expect(result.detector?.id).toBe('heuristic-claims');
  });

  it('says plainly why a Class B source has none, rather than showing an empty list', async () => {
    // Nothing is ever downloaded from an embedded provider (U-35 §6), so there
    // is no transcript to read. Empty and unavailable are different answers.
    const embedded = makeConversation(S(300), [], {
      class: 'B', embedUrl: 'https://www.youtube-nocookie.com/embed/x',
    });
    const result = await claimsFor(embedded, null);
    expect(result.claims).toEqual([]);
    expect(result.unavailable).toMatch(/own platform/i);
    // Said for the creator. The rule is in the code and in these tests; the
    // person reading it is trying to answer a video. [D-13]
    expect(result.unavailable).not.toMatch(/U-\d|INV-\d|Class [AB]|§/);
  });

  it('distinguishes "not transcribed yet" from "cannot be transcribed"', async () => {
    const { conversation } = setup();
    const result = await claimsFor(conversation, null);
    expect(result.unavailable).toMatch(/still listening/i);
    // Still coming and never coming are different answers, and the author
    // needs to know which one they are looking at.
    const embedded = makeConversation(S(300), [], {
      class: 'B', embedUrl: 'https://www.youtube-nocookie.com/embed/x',
    });
    expect((await claimsFor(embedded, null)).unavailable)
      .not.toBe(result.unavailable);
  });
});
