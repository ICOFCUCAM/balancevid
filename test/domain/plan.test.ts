import { describe, expect, it } from 'vitest';
import { buildRenderPlan, canonicalJson } from '../../src/domain/plan.js';
import { InvariantViolation } from '../../src/domain/invariants.js';
import { S, makeConversation, makeIntervention } from './fixtures.js';

describe('source class enforcement (INV-01)', () => {
  it('refuses a composed plan for a Class B source', () => {
    const conv = makeConversation(S(300), [makeIntervention(S(100), S(20))], {
      class: 'B', mezzanineAssetId: undefined,
    });
    expect(() => buildRenderPlan(conv, { mode: 'composed' })).toThrow(InvariantViolation);
    expect(() => buildRenderPlan(conv, { mode: 'composed' })).toThrow(/Class B/);
  });

  it('allows a companion plan for a Class B source', () => {
    const conv = makeConversation(S(300), [makeIntervention(S(100), S(20))], {
      class: 'B', mezzanineAssetId: undefined,
    });
    const plan = buildRenderPlan(conv, { mode: 'companion' });
    expect(plan.mode).toBe('companion');
    expect(plan.shots.some((s) => s.kind === 'response')).toBe(true);
  });

  it('refuses a composed plan with no normalised mezzanine (INV-04)', () => {
    const conv = makeConversation(S(300), [makeIntervention(S(100), S(20))], {
      mezzanineAssetId: undefined,
    });
    expect(() => buildRenderPlan(conv)).toThrow(/mezzanine/);
  });
});

describe('determinism and the shot cache (U-16)', () => {
  const conv = makeConversation(S(600), [
    makeIntervention(S(100), S(20)),
    makeIntervention(S(300), S(30)),
    makeIntervention(S(500), S(15)),
  ]);

  it('produces the same plan hash for the same document', () => {
    expect(buildRenderPlan(conv).planHash).toBe(buildRenderPlan(conv).planHash);
  });

  it('changes only the affected shot when one take is re-trimmed', () => {
    const before = buildRenderPlan(conv);
    const edited = structuredClone(conv);
    const take = edited.interventions[1]!.takes[0]!;
    take.mediaOutFrame -= S(5); // user trims five seconds off response 2
    const after = buildRenderPlan(edited);

    const changed = after.shots.filter((s, i) => s.hash !== before.shots[i]?.hash);
    // The re-trimmed response, plus nothing before it. Later shots shift in
    // output time, which is what makes them re-render; earlier ones are cached.
    expect(changed.some((s) => s.kind === 'response')).toBe(true);
    expect(before.shots[0]!.hash).toBe(after.shots[0]!.hash);
    expect(before.shots[1]!.hash).toBe(after.shots[1]!.hash);
    expect(after.planHash).not.toBe(before.planHash);
  });

  it('does not share a cache entry across export profiles', () => {
    const wide = buildRenderPlan(conv, { exportProfileId: 'youtube_16x9' });
    const tall = buildRenderPlan(conv, { exportProfileId: 'vertical_9x16' });
    expect(tall.shots[0]!.hash).not.toBe(wide.shots[0]!.hash);
  });

  it('serialises canonically regardless of key order', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } }))
      .toBe(canonicalJson({ a: { c: 3, d: 2 }, b: 1 }));
  });
});

describe('export invariants (INV-07)', () => {
  const conv = makeConversation(S(300), [makeIntervention(S(100), S(20))]);

  it('always carries caption sidecars', () => {
    expect(buildRenderPlan(conv).captions.sidecars).toEqual(['srt', 'vtt']);
  });

  it('always carries a generated attribution block the user did not type', () => {
    const { attribution } = buildRenderPlan(conv);
    expect(attribution.text).toContain('The History of Europe');
    expect(attribution.text).toContain('Example Channel');
    expect(attribution.text).toContain('https://example.org/video');
  });

  it('carries the loudness target on every plan (INV-11)', () => {
    expect(buildRenderPlan(conv).audio).toMatchObject({
      loudnessLufs: -14, truePeakDb: -1, matchSpeakers: true,
    });
  });
});

describe('type drives presentation (U-11)', () => {
  it('gives a critique a side-by-side layout and a hard cut, with no user input', () => {
    const conv = makeConversation(S(300), [makeIntervention(S(100), S(20), { type: 'critique' })]);
    const shot = buildRenderPlan(conv).shots.find((s) => s.kind === 'response')!;
    expect(shot).toMatchObject({ layoutId: 'side_by_side', lowerThird: 'CRITIQUE', transition: 'hard_cut' });
  });

  it('gives a correction a freeze-frame layout', () => {
    const conv = makeConversation(S(300), [makeIntervention(S(100), S(20), { type: 'correct' })]);
    const shot = buildRenderPlan(conv).shots.find((s) => s.kind === 'response')!;
    expect(shot).toMatchObject({ layoutId: 'freeze_pip', lowerThird: 'CORRECTION' });
  });

  it('honours a per-intervention layout override', () => {
    const conv = makeConversation(S(300), [makeIntervention(S(100), S(20), { type: 'critique' })]);
    conv.interventions[0]!.layoutId = 'full_user';
    const shot = buildRenderPlan(conv).shots.find((s) => s.kind === 'response')!;
    expect(shot.layoutId).toBe('full_user');
  });
});
