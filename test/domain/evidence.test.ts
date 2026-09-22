import { describe, expect, it } from 'vitest';
import type { Evidence, EvidenceId } from '../../src/domain/document.js';
import {
  EditError, MIN_EVIDENCE_FRAMES, attachEvidence, detachEvidence, evidenceAt,
  setEvidenceLocator, setEvidenceWindow,
} from '../../src/domain/edit.js';
import { S, makeConversation, makeIntervention } from './fixtures.js';

function evidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: `ev_${Math.random().toString(16).slice(2, 10)}` as EvidenceId,
    kind: 'web',
    title: 'Office for National Statistics — unemployment',
    url: 'https://example.org/stats',
    retrievedAt: '2026-09-22T12:00:00.000Z',
    locator: {},
    archived: true,
    ...overrides,
  };
}

function fixture() {
  const conversation = makeConversation(S(600), [makeIntervention(S(100), S(20), { type: 'fact_check' })]);
  return { conversation, intervention: conversation.interventions[0]! };
}

describe('attaching evidence (§44, U-33)', () => {
  it('attaches and detaches', () => {
    const { conversation, intervention } = fixture();
    const item = evidence();
    attachEvidence(conversation, intervention.id, item);
    expect(intervention.evidence).toHaveLength(1);
    detachEvidence(conversation, intervention.id, item.id);
    expect(intervention.evidence).toHaveLength(0);
  });

  it('refuses evidence with no title — a citation needs a name', () => {
    const { conversation, intervention } = fixture();
    expect(() => attachEvidence(conversation, intervention.id, evidence({ title: '  ' })))
      .toThrow(EditError);
  });

  it('keeps the retrieval time and hash that make the citation verifiable', () => {
    const { conversation, intervention } = fixture();
    attachEvidence(conversation, intervention.id, evidence({ contentHash: 'abc123' }));
    expect(intervention.evidence![0]).toMatchObject({
      retrievedAt: '2026-09-22T12:00:00.000Z',
      contentHash: 'abc123',
      url: 'https://example.org/stats',
    });
  });
});

describe('locating the part that matters (U-33 §2)', () => {
  it('stores a region, a quote and a page', () => {
    const { conversation, intervention } = fixture();
    const item = evidence();
    attachEvidence(conversation, intervention.id, item);
    setEvidenceLocator(conversation, intervention.id, item.id, {
      region: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 },
      quote: '  unemployment fell by 3% ',
      page: 4,
    });
    expect(item.locator).toEqual({
      region: { x: 0.1, y: 0.2, w: 0.3, h: 0.1 },
      quote: 'unemployment fell by 3%',
      page: 4,
    });
  });

  it('clamps a region dragged past the edge rather than rejecting it', () => {
    const { conversation, intervention } = fixture();
    const item = evidence();
    attachEvidence(conversation, intervention.id, item);
    setEvidenceLocator(conversation, intervention.id, item.id, {
      region: { x: 0.8, y: -0.4, w: 0.9, h: 2 },
    });
    const region = item.locator.region!;
    expect(region.x).toBeCloseTo(0.8);
    expect(region.y).toBe(0);
    expect(region.x + region.w).toBeLessThanOrEqual(1.0001);
    expect(region.y + region.h).toBeLessThanOrEqual(1.0001);
  });

  it('refuses a page that is not a page', () => {
    const { conversation, intervention } = fixture();
    const item = evidence();
    attachEvidence(conversation, intervention.id, item);
    expect(() => setEvidenceLocator(conversation, intervention.id, item.id, { page: 0 }))
      .toThrow(/positive whole number/);
  });
});

describe('when the document is on screen (U-33 §3)', () => {
  it('shows for the whole response until a window is set', () => {
    const { conversation, intervention } = fixture();
    const item = evidence();
    attachEvidence(conversation, intervention.id, item);
    expect(evidenceAt(intervention, 0)).toBe(item);
    expect(evidenceAt(intervention, S(999))).toBe(item);
  });

  it('appears and dismisses on its window', () => {
    const { conversation, intervention } = fixture();
    const item = evidence();
    attachEvidence(conversation, intervention.id, item);
    setEvidenceWindow(conversation, intervention.id, item.id, {
      appearFrame: S(2), dismissFrame: S(6),
    });
    expect(evidenceAt(intervention, S(1))).toBeNull();
    expect(evidenceAt(intervention, S(3))).toBe(item);
    expect(evidenceAt(intervention, S(6))).toBeNull();
  });

  it('refuses a window too short to read', () => {
    const { conversation, intervention } = fixture();
    const item = evidence();
    attachEvidence(conversation, intervention.id, item);
    expect(() => setEvidenceWindow(conversation, intervention.id, item.id, {
      appearFrame: 10, dismissFrame: 10 + MIN_EVIDENCE_FRAMES - 1,
    })).toThrow(/at least/);
  });

  it('clears a window back to the whole response', () => {
    const { conversation, intervention } = fixture();
    const item = evidence();
    attachEvidence(conversation, intervention.id, item);
    setEvidenceWindow(conversation, intervention.id, item.id, { appearFrame: S(2), dismissFrame: S(6) });
    setEvidenceWindow(conversation, intervention.id, item.id, { appearFrame: null, dismissFrame: null });
    expect(item.appearFrame).toBeUndefined();
    expect(evidenceAt(intervention, 0)).toBe(item);
  });

  it('shows the most recently attached where windows overlap', () => {
    const { conversation, intervention } = fixture();
    const first = evidence({ title: 'first' });
    const second = evidence({ title: 'second' });
    attachEvidence(conversation, intervention.id, first);
    attachEvidence(conversation, intervention.id, second);
    for (const item of [first, second]) {
      setEvidenceWindow(conversation, intervention.id, item.id, {
        appearFrame: S(1), dismissFrame: S(5),
      });
    }
    expect(evidenceAt(intervention, S(2))?.title).toBe('second');
  });

  it('never shows evidence whose archive has not been made', () => {
    const { conversation, intervention } = fixture();
    const item = evidence({ archived: false });
    attachEvidence(conversation, intervention.id, item);
    // An unarchived citation is not yet verifiable, so it is not yet shown.
    expect(evidenceAt(intervention, 0)).toBeNull();
  });
});
