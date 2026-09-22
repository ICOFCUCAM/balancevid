/**
 * The knowledge layer over HTTP.  [Doctrine §20, U-15, INV-06]
 *
 * The unit tests prove the domain rules. This proves the DOOR: that the only
 * routes able to move a suggestion towards the document actually enforce them,
 * against a real conversation on a real filesystem.
 *
 * It exists because the browser run cannot cover this path. The end-to-end
 * fixture's speech is literary narration, which correctly yields no claims at
 * all — a detector that fired on Hawthorne would be a worse detector. Here the
 * source can be made to assert something.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { S, makeConversation, makeIntervention } from '../domain/fixtures.js';
import { transcriptOf } from './fixtures.js';

const SENTENCES = [
  'according to the treasury the policy reduced unemployment by thirty percent',
  'the shortage happened because every port in the country was closed',
];

let dir: string;
let routes: typeof import('../../app/api/conversations/[id]/claims/route.js');
let interventions: typeof import('../../app/api/conversations/[id]/interventions/route.js');
let repo: typeof import('../../src/store/repository.js');
let conversationId: string;

/** A POST to the claims route, shaped like the browser's. */
const post = (id: string, body: unknown) => routes.POST(
  new Request('http://test/api', { method: 'POST', body: JSON.stringify(body) }),
  { params: Promise.resolve({ id }) },
);

const get = (id: string) => routes.GET(
  new Request('http://test/api'), { params: Promise.resolve({ id }) });

async function claims(id = conversationId) {
  return (await (await get(id)).json()) as {
    claims: any[]; detector: any; unavailable?: string;
  };
}

beforeAll(async () => {
  // VAR_ROOT is read when the store module first loads, so the environment is
  // set before anything that touches it is imported.
  dir = await mkdtemp(join(tmpdir(), 'balancevid-knowledge-'));
  process.env['BALANCEVID_VAR'] = dir;

  repo = await import('../../src/store/repository.js');
  routes = await import('../../app/api/conversations/[id]/claims/route.js');
  interventions = await import('../../app/api/conversations/[id]/interventions/route.js');
  const transcripts = await import('../../src/store/transcripts.js');

  const conversation = makeConversation(S(300), [makeIntervention(S(60), S(30))]);
  conversationId = conversation.id;
  await repo.saveConversation(conversation);
  await transcripts.saveTranscript(conversation.id, transcriptOf(SENTENCES));
}, 60_000);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('reading suggestions', () => {
  it('offers them, and names what produced them', async () => {
    const body = await claims();
    expect(body.claims.length).toBeGreaterThan(0);
    expect(body.detector.id).toBe('heuristic-claims');
    expect(body.detector.characteristics.semantic).toBe(false);
  });

  it('starts everything at "suggested" and puts none of it on the document', async () => {
    const body = await claims();
    expect(body.claims.every((c) => c.status === 'suggested')).toBe(true);
    const document = await repo.loadConversation(conversationId);
    expect(document.claimDecisions ?? []).toHaveLength(0);
    expect(JSON.stringify(document)).not.toContain('unemployment');
  });
});

describe('the door refuses what U-15 forbids', () => {
  it('refuses an anonymous decision (INV-06)', async () => {
    const { claims: list } = await claims();
    const response = await post(conversationId, {
      key: list[0]!.key, status: 'accepted', by: '   ',
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/INV-06/);
  });

  it('refuses a status it does not recognise', async () => {
    const { claims: list } = await claims();
    const response = await post(conversationId, {
      key: list[0]!.key, status: 'published', by: 'Ada',
    });
    expect(response.status).toBe(400);
  });

  it('refuses a key that is not among the current suggestions', async () => {
    const response = await post(conversationId, {
      key: 'not-a-real-key', status: 'accepted', by: 'Ada',
    });
    expect(response.status).toBe(404);
  });

  it('refuses to bind a paraphrase as a source quote', async () => {
    const { claims: list } = await claims();
    const document = await repo.loadConversation(conversationId);
    const response = await post(conversationId, {
      key: list[0]!.key, status: 'edited', by: 'Ada',
      editedQuote: 'the policy was a catastrophe that ruined the country',
      interventionId: document.interventions[0]!.id,
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/actually said|not in the transcript/i);
  });
});

describe('deciding', () => {
  it('records a rejection that survives the next detection run', async () => {
    const { claims: list } = await claims();
    const key = list.at(-1)!.key;
    expect((await post(conversationId, { key, status: 'rejected', by: 'Ada' })).ok).toBe(true);

    const after = await claims();
    expect(after.claims.find((c) => c.key === key)!.status).toBe('rejected');
    // And it is a decision, not a deletion: the claim is still listed.
    expect(after.claims).toHaveLength(list.length);
  });

  it('accepts and binds with the four fields INV-06 requires', async () => {
    const { claims: list } = await claims();
    const claim = list.find((c) => c.status === 'suggested')!;
    const document = await repo.loadConversation(conversationId);
    const interventionId = document.interventions[0]!.id;

    const response = await post(conversationId, {
      key: claim.key, status: 'accepted', by: 'Ada Lovelace', interventionId,
    });
    expect(response.ok).toBe(true);

    const after = await repo.loadConversation(conversationId);
    const origin = after.interventions.find((i) => i.id === interventionId)!.anchor.origin!;
    expect(origin.model).toBe('heuristic-claims');
    expect(origin.version).toBeTruthy();
    expect(origin.promptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(origin.acceptedBy).toBe('Ada Lovelace');
    expect(origin.acceptedAt).toBeTruthy();
  });

  it('writes an audit entry naming the human and the model', async () => {
    const entries = await repo.readAudit(conversationId);
    const accepted = entries.find((e) => e.action === 'claim.accepted');
    expect(accepted?.acceptedBy).toBe('Ada Lovelace');
    expect(accepted?.detail?.['model']).toBe('heuristic-claims');
    expect(entries.some((e) => e.action === 'claim.rejected')).toBe(true);
  });

  it('lets a narrowed claim bind, because it is still the source\'s words', async () => {
    const { claims: list } = await claims();
    const claim = list[0]!;
    const narrowed = String(claim.suggested.quote).split(' ').slice(-5).join(' ');
    const document = await repo.loadConversation(conversationId);

    const response = await post(conversationId, {
      key: claim.key, status: 'edited', by: 'Ada', editedQuote: narrowed,
      interventionId: document.interventions[0]!.id,
    });
    expect(response.ok).toBe(true);

    const after = await claims();
    const reviewed = after.claims.find((c) => c.key === claim.key)!;
    expect(reviewed.status).toBe('edited');
    // The three voices stay distinguishable.
    expect(reviewed.suggested.quote).toBe(claim.suggested.quote);
    expect(reviewed.effectiveQuote).toBe(narrowed);
  });
});

describe('answering a suggestion opens an intervention that carries its origin', () => {
  it('binds provenance in the same write that creates the point', async () => {
    const { claims: list } = await claims();
    const claim = list.find((c) => c.status === 'suggested') ?? list[0]!;

    const response = await interventions.POST(
      new Request('http://test/api', {
        method: 'POST',
        body: JSON.stringify({
          tSourceFrame: claim.suggested.endFrame,
          type: 'critique',
          claimKey: claim.key,
          by: 'Grace',
        }),
      }),
      { params: Promise.resolve({ id: conversationId }) },
    );
    expect(response.status).toBe(201);
    const { interventionId } = await response.json();

    const after = await repo.loadConversation(conversationId);
    const created = after.interventions.find((i) => i.id === interventionId)!;
    expect(created.anchor.quote).toBeTruthy();
    expect(created.anchor.origin?.acceptedBy).toBe('Grace');
    // The acceptance landed with it, not afterwards.
    expect(after.claimDecisions?.some((d) => d.suggestionKey === claim.key)).toBe(true);
  });

  it('refuses to answer a suggestion anonymously', async () => {
    const { claims: list } = await claims();
    const response = await interventions.POST(
      new Request('http://test/api', {
        method: 'POST',
        body: JSON.stringify({
          tSourceFrame: 10, type: 'critique', claimKey: list[0]!.key,
        }),
      }),
      { params: Promise.resolve({ id: conversationId }) },
    );
    expect(response.status).toBe(400);
  });

  it('still lets an author bind their own highlighted quote with no origin', async () => {
    const response = await interventions.POST(
      new Request('http://test/api', {
        method: 'POST',
        body: JSON.stringify({
          tSourceFrame: 20, type: 'context', quote: 'According to the treasury',
        }),
      }),
      { params: Promise.resolve({ id: conversationId }) },
    );
    expect(response.status).toBe(201);
    const { interventionId } = await response.json();
    const after = await repo.loadConversation(conversationId);
    const created = after.interventions.find((i) => i.id === interventionId)!;
    expect(created.anchor.quote).toBe('According to the treasury');
    expect(created.anchor.origin).toBeUndefined();
  });
});
