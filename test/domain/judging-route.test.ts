/**
 * The panel's doors, driven.
 *   [GO-VIRAL V-5, G8; Doctrine D-19, D-25]
 *
 * > **Judged on:** *"The result recomputes exactly from the stored
 * > judgements; no score exists without a reason; and a criterion
 * > cannot be added after LIVE."*
 *
 * THE ROUTES ARE CALLED, NOT READ. Whether the panel marks the
 * same entries the public can see is a fact about what comes back
 * from a GET, and the one that matters most — an entry that was
 * withdrawn cannot be marked — is a fact about two modules
 * agreeing, which no source-text assertion can check.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Campaign } from '../../src/domain/campaign.js';
import type { Criterion, Judge } from '../../src/domain/judging.js';

let root: string;
type Id = { params: Promise<{ id: string }> };
type Req = { params: Promise<{ id: string; requestId: string }> };

let CALL: (r: Request, c: Id) => Promise<Response>;
let MOVE: (r: Request, c: Id) => Promise<Response>;
let MARKS: (r: Request, c: Id) => Promise<Response>;
let MARK: (r: Request, c: Id) => Promise<Response>;
let DECIDE: (r: Request, c: Req) => Promise<Response>;
let INBOX: (r: Request, c: Id) => Promise<Response>;

let newCampaign: typeof import('../../src/domain/campaignEdit.js').newCampaign;
let newRequest: typeof import('../../src/domain/participationEdit.js').newRequest;
let consentFrom: typeof import('../../src/domain/consent.js').consentFrom;
let saveCampaign: typeof import('../../src/store/campaigns.js').saveCampaign;
let loadCampaign: typeof import('../../src/store/campaigns.js').loadCampaign;
let saveRequest: typeof import('../../src/store/requests.js').saveRequest;
let paths: typeof import('../../src/store/paths.js').paths;

const SONG = 'perf_judge0000000000';
const HASH = 'c'.repeat(64);
const MADE = '2026-06-01T10:00:00.000Z';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-judge-'));
  process.env['BALANCEVID_VAR'] = root;
  ({ newCampaign } = await import('../../src/domain/campaignEdit.js'));
  ({ newRequest } = await import('../../src/domain/participationEdit.js'));
  ({ consentFrom } = await import('../../src/domain/consent.js'));
  ({ saveCampaign, loadCampaign } = await import('../../src/store/campaigns.js'));
  ({ saveRequest } = await import('../../src/store/requests.js'));
  ({ paths } = await import('../../src/store/paths.js'));
  ({ GET: CALL, POST: MOVE } = await import('../../app/api/campaigns/[id]/route.js'));
  ({ GET: MARKS, POST: MARK } = await import(
    '../../app/api/campaigns/[id]/judgements/route.js'));
  ({ POST: DECIDE } = await import(
    '../../app/api/performances/[id]/requests/[requestId]/route.js'));
  ({ GET: INBOX } = await import('../../app/api/performances/[id]/requests/route.js'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function aSong(): Promise<void> {
  await mkdir(paths.performance(SONG), { recursive: true });
  await writeFile(paths.performanceDocument(SONG), JSON.stringify({
    schemaVersion: 1, id: SONG, title: 'The Long Way Round',
    master: {
      assetId: 'asset_song', title: 'The Long Way Round',
      class: 'own', durationSamples: 48000 * 60,
    },
    takes: [], scenes: [], plates: [],
    audio: { mode: 'music_and_mic' }, layoutProfileId: 'default',
    createdAt: MADE, updatedAt: MADE,
  }), 'utf8');
}

/**
 * A call that opened a week ago and closes a week from now.
 *
 * BOTH DATES IN RANGE, because `begin` refuses a call whose
 * window has already shut and `mayJudge` refuses one whose window
 * is still open — so a fixture cannot be born in the state the
 * marking tests need. `shutIt` below moves the deadline into the
 * past through the route that exists for exactly that, which is
 * how an organiser closes a call early and is deterministic in a
 * way a sleep is not.
 */
async function aCall(): Promise<Campaign> {
  const at = new Date();
  const campaign = newCampaign({
    title: 'Sing the second verse',
    track: { kind: 'performance', id: SONG },
    rules: { asks: 'Sing it outdoors' },
    window: {
      respondable: true, access: 'anyone',
      opensAt: new Date(at.getTime() - 7 * 86_400_000).toISOString(),
      closesAt: new Date(at.getTime() + 7 * 86_400_000).toISOString(),
    },
    now: new Date(at.getTime() - 7 * 86_400_000).toISOString(),
  });
  await saveCampaign(campaign);
  return campaign;
}

/** Pull the deadline into the past, as an organiser closing early does. */
const shutIt = (id: string) => verb(id, {
  action: 'deadline',
  closesAt: new Date(Date.now() - 3_600_000).toISOString(),
});

/*
 * `at` IS PER ENTRY AND NOT SHARED, because `wallOf` orders by it
 * and two entries recorded at the same instant come back in
 * whatever order the directory was read in. A fixture that gave
 * them one timestamp would be a test of `readdir`.
 */
let arrived = 0;

async function anEntry(spec: {
  campaign: string; submissionId: string; permits?: string[];
  withdrawn?: boolean; participant?: string;
}) {
  arrived += 1;
  const at = new Date(Date.parse(MADE) + arrived * 60_000).toISOString();
  const consent = spec.permits
    ? consentFrom({ termsHash: HASH, permits: spec.permits }, MADE) : null;
  if (consent && spec.withdrawn) consent.withdrawnAt = MADE;
  const request = newRequest({
    holder: { kind: 'performance', id: SONG },
    assignment: {
      kind: 'performance', asks: 'sing',
      reference: { title: 'The Long Way Round', durationSamples: 48000 * 60 },
    },
    allowed: { video: true, takes: 3 },
    token: 'a-token-long-enough-to-be-a-credential',
    campaign: spec.campaign as never,
    ...(spec.participant ? { participant: spec.participant } : {}),
    now: MADE,
  });
  if (consent) request.consent = consent;
  request.submissions = [{
    id: spec.submissionId as never, assetId: spec.submissionId,
    kind: 'video', at,
  }];
  /*
   * SENT, WHICH IS WHERE A DECISION CAN BE MADE FROM. `reject`
   * goes through `deciding`, and `REQUEST_NEXT` does not admit a
   * `created` request becoming `rejected` — a producer passing on
   * something nobody sent is not a thing that happens.
   */
  request.state = 'submitted';
  request.history = [...request.history, { state: 'submitted', at: MADE }];
  await saveRequest(request);
  /* The media, because accepting one copies it into the rail. */
  await mkdir(paths.requestAssets(request.id), { recursive: true });
  await writeFile(
    paths.requestAsset(request.id, spec.submissionId, 'webm'), 'a take', 'utf8');
  return request;
}

const verb = async (id: string, body: unknown) => {
  const response = await MOVE(
    new Request(`http://local/api/campaigns/${id}`, {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
};

const marking = async (id: string) => (await MARKS(
  new Request(`http://local/api/campaigns/${id}/judgements`),
  { params: Promise.resolve({ id }) })).json();

const put = async (id: string, body: unknown) => {
  const response = await MARK(
    new Request(`http://local/api/campaigns/${id}/judgements`, {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
};

/** A call with two criteria, two judges and two entries, being judged. */
async function aPanel(): Promise<{
  id: string; tuning: Criterion; feel: Criterion; ada: Judge; ben: Judge;
}> {
  const call = await aCall();
  await verb(call.id, { action: 'criterion', says: 'Tuning' });
  await verb(call.id, { action: 'criterion', says: 'Feel', outOf: 5 });
  await verb(call.id, { action: 'begin' });
  await verb(call.id, { action: 'panel', name: 'Ada' });
  const after = await verb(call.id, { action: 'panel', name: 'Ben' });
  await shutIt(call.id);
  expect((await verb(call.id, { action: 'judge' })).status).toBe(200);
  await anEntry({
    campaign: call.id, submissionId: 'sub_one', permits: ['entry', 'display'],
    participant: 'Mo',
  });
  await anEntry({
    campaign: call.id, submissionId: 'sub_two', permits: ['entry', 'display'],
  });
  const [tuning, feel] = after.body.scorecard as Criterion[];
  const [ada, ben] = after.body.panel as Judge[];
  return { id: call.id, tuning: tuning!, feel: feel!, ada: ada!, ben: ben! };
}

beforeEach(async () => {
  await rm(join(root, 'accounts'), { recursive: true, force: true });
  arrived = 0;
  await aSong();
});

describe('publishing what a call is marked on', () => {
  it('is taken while it is a draft and refused once it opens', async () => {
    const call = await aCall();
    expect((await verb(call.id, { action: 'criterion', says: 'Tuning' })).status)
      .toBe(200);
    expect((await verb(call.id, { action: 'begin' })).status).toBe(200);

    const late = await verb(call.id, { action: 'criterion', says: 'Feel' });
    expect(late.status).toBe(409);
    expect(late.body.error).toContain('before a call opens');
    expect((await loadCampaign(call.id)).scorecard).toHaveLength(1);
  });

  it('reports the scorecard and the panel on the call itself', async () => {
    const { id } = await aPanel();
    const response = await CALL(
      new Request(`http://local/api/campaigns/${id}`),
      { params: Promise.resolve({ id }) });
    const body = await response.json();
    expect(body.scorecard.map((one: Criterion) => one.says))
      .toEqual(['Tuning', 'Feel']);
    expect(body.panel.map((one: Judge) => one.name)).toEqual(['Ada', 'Ben']);
  });

  it('refuses a verb with nothing to act on', async () => {
    const call = await aCall();
    expect((await verb(call.id, { action: 'criterion' })).status).toBe(409);
    expect((await verb(call.id, { action: 'panel' })).status).toBe(409);
    expect((await verb(call.id, { action: 'uncriterion' })).status).toBe(409);
  });
});

describe('what there is to mark', () => {
  /*
   * THE PANEL MARKS WHAT THE PUBLIC CAN SEE, AND THE TWO ARE ONE
   * QUESTION. An entry whose maker did not agree to it being
   * shown is not in a public competition, and a panel scoring it
   * would be scoring somebody who is not in the running. One
   * predicate, `wallOf`, decides both. [V-3, V-4]
   */
  it('is the public wall and nothing else', async () => {
    const { id } = await aPanel();
    await anEntry({
      campaign: id, submissionId: 'sub_private', permits: ['entry'],
    });
    await anEntry({
      campaign: id, submissionId: 'sub_gone',
      permits: ['entry', 'display'], withdrawn: true,
    });
    const seen = await marking(id);
    expect(seen.entries.map((one: { submissionId: string }) => one.submissionId))
      .toEqual(['sub_one', 'sub_two']);
    expect(seen.open).toBe(true);
  });

  it('carries each judge\'s own marks beside the entry', async () => {
    const { id, tuning, feel, ada } = await aPanel();
    await put(id, {
      entry: 'sub_one', by: ada.id, says: 'in tune',
      marks: [{ criterion: tuning.id, score: 9 }, { criterion: feel.id, score: 4 }],
    });
    const seen = await marking(id);
    const one = seen.entries.find(
      (e: { submissionId: string }) => e.submissionId === 'sub_one');
    expect(one.judgements).toHaveLength(1);
    expect(one.judgements[0].says).toBe('in tune');
  });
});

describe('marking an entry', () => {
  it('records the marks and hands back the recomputed standing', async () => {
    const { id, tuning, feel, ada, ben } = await aPanel();
    const first = await put(id, {
      entry: 'sub_one', by: ada.id, says: 'in tune and it moved',
      marks: [{ criterion: tuning.id, score: 10 }, { criterion: feel.id, score: 5 }],
    });
    expect(first.status).toBe(201);
    await put(id, {
      entry: 'sub_two', by: ada.id, says: 'flat in the chorus',
      marks: [{ criterion: tuning.id, score: 4 }, { criterion: feel.id, score: 2 }],
    });
    const last = await put(id, {
      entry: 'sub_two', by: ben.id, says: 'better than I expected',
      marks: [{ criterion: tuning.id, score: 8 }, { criterion: feel.id, score: 4 }],
    });

    expect(last.body.results.map((one: { entry: string }) => one.entry))
      .toEqual(['sub_one', 'sub_two']);
    expect(last.body.results[0].score).toBe(15);
    expect(last.body.results[1].score).toBe(9);
    expect(last.body.results[1].judges).toBe(2);

    /* And the GET recomputes the same thing from what is on disk. */
    const seen = await marking(id);
    expect(seen.results).toEqual(last.body.results);
    expect((await loadCampaign(id))).not.toHaveProperty('results');
  });

  it('refuses a score with no reason, in the domain\'s own words', async () => {
    const { id, tuning, feel, ada } = await aPanel();
    const refused = await put(id, {
      entry: 'sub_one', by: ada.id, says: '  ',
      marks: [{ criterion: tuning.id, score: 9 }, { criterion: feel.id, score: 4 }],
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('a score without a reason is not a judgement');
    expect((await marking(id)).judgements).toEqual([]);
  });

  it('refuses a form that misses a criterion', async () => {
    const { id, tuning, ada } = await aPanel();
    const refused = await put(id, {
      entry: 'sub_one', by: ada.id, says: 'good',
      marks: [{ criterion: tuning.id, score: 9 }],
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('every criterion has to be marked');
  });

  /*
   * AND AN ENTRY THAT IS NOT IN THIS CALL IS NOT MARKABLE, which
   * is the one rule the domain cannot enforce: `recordJudgement`
   * is handed a submission id and has no requests to look it up
   * in. After a withdrawal it is the rule that matters most.
   */
  it('refuses an entry that is not in this call', async () => {
    const { id, tuning, feel, ada } = await aPanel();
    await anEntry({
      campaign: id, submissionId: 'sub_gone',
      permits: ['entry', 'display'], withdrawn: true,
    });
    for (const entry of ['sub_gone', 'sub_elsewhere', '']) {
      const refused = await put(id, {
        entry, by: ada.id, says: 'good',
        marks: [{ criterion: tuning.id, score: 9 }, { criterion: feel.id, score: 4 }],
      });
      expect(refused.status, entry).toBe(404);
    }
    expect((await marking(id)).judgements).toEqual([]);
  });

  it('refuses a call that is still taking entries', async () => {
    const call = await aCall();
    await verb(call.id, { action: 'criterion', says: 'Tuning' });
    await verb(call.id, { action: 'begin' });
    const ada = (await verb(call.id, { action: 'panel', name: 'Ada' }))
      .body.panel[0];
    await anEntry({
      campaign: call.id, submissionId: 'sub_one', permits: ['entry', 'display'],
    });
    const crit = (await loadCampaign(call.id)).scorecard![0]!;
    const refused = await put(call.id, {
      entry: 'sub_one', by: ada.id, says: 'good',
      marks: [{ criterion: crit.id, score: 9 }],
    });
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('this call is not being judged');
  });
});

/* ------------------------------------------------------------------ *
 *  G8 · A DECLINE THAT SAYS WHY.
 * ------------------------------------------------------------------ */

describe('passing on an entry', () => {
  const pass = async (requestId: string, says?: string) => DECIDE(
    new Request(`http://local/api/performances/${SONG}/requests/${requestId}`, {
      method: 'POST',
      body: JSON.stringify({ action: 'reject', ...(says ? { says } : {}) }),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: SONG, requestId }) });

  const inbox = async () => (await INBOX(
    new Request(`http://local/api/performances/${SONG}/requests`),
    { params: Promise.resolve({ id: SONG }) })).json();

  /*
   * THE REASON IS WRITTEN ON THE LINE THAT RECORDS THE DECISION
   * and read back by the surface that shows it. A decline with no
   * reason is one nobody can review or reverse on grounds. [G8]
   */
  it('writes the reason, and the inbox carries it', async () => {
    const call = await aCall();
    const request = await anEntry({
      campaign: call.id, submissionId: 'sub_one', permits: ['entry'],
    });
    expect((await pass(request.id, '  Recorded indoors, which the call asked against.  '))
      .status).toBe(200);

    const [row] = (await inbox()).requests;
    expect(row.passedBecause)
      .toBe('Recorded indoors, which the call asked against.');
    expect(row.state).toBe('rejected');
  });

  /*
   * AND A PASS WITH NO REASON IS EXACTLY WHAT IT WAS. A producer
   * passing on a take in their own studio owes nobody minutes,
   * and every decline written before this field has none.
   */
  it('is unchanged when nobody gives one', async () => {
    const call = await aCall();
    const request = await anEntry({
      campaign: call.id, submissionId: 'sub_one', permits: ['entry'],
    });
    expect((await pass(request.id)).status).toBe(200);
    const [row] = (await inbox()).requests;
    expect(row.state).toBe('rejected');
    expect(row).not.toHaveProperty('passedBecause');
  });

  /*
   * THE LAST DECLINE, NOT THE FIRST. `REQUEST_NEXT` admits
   * `rejected → reviewed → rejected`: a producer may pass, look
   * again, and pass for a different reason. A fixture with one
   * decline tests neither end of that. [T-5]
   */
  it('shows the most recent reason when somebody passes twice', async () => {
    const call = await aCall();
    const request = await anEntry({
      campaign: call.id, submissionId: 'sub_one', permits: ['entry'],
    });
    await pass(request.id, 'Recorded indoors.');
    await DECIDE(
      new Request(`http://local/api/performances/${SONG}/requests/${request.id}`, {
        method: 'POST', body: JSON.stringify({ action: 'hold' }),
        headers: { 'content-type': 'application/json' },
      }), { params: Promise.resolve({ id: SONG, requestId: request.id }) });
    await pass(request.id, 'And the second verse is missing.');

    expect((await inbox()).requests[0].passedBecause)
      .toBe('And the second verse is missing.');
  });

  /*
   * AND IT STOPS BEING SHOWN WHEN THE DECISION IS REVERSED.
   *
   * FOUND BY MUTATION. `rejected → accepted` is in the table —
   * passing is not an end, which is the whole posture — and the
   * first draft of `rejectedBecause` read the history alone, so
   * a take that was passed over and then used still carried
   * *"Passed: recorded indoors"* in the inbox. The reason
   * belongs to the state, not to the history.
   */
  it('stops showing a reason once the producer changes their mind', async () => {
    const call = await aCall();
    const request = await anEntry({
      campaign: call.id, submissionId: 'sub_one', permits: ['entry'],
    });
    await pass(request.id, 'Recorded indoors.');
    expect((await inbox()).requests[0].passedBecause).toBe('Recorded indoors.');

    const used = await DECIDE(
      new Request(`http://local/api/performances/${SONG}/requests/${request.id}`, {
        method: 'POST',
        body: JSON.stringify({ action: 'accept', submissionId: 'sub_one' }),
        headers: { 'content-type': 'application/json' },
      }), { params: Promise.resolve({ id: SONG, requestId: request.id }) });
    expect(used.status).toBe(202);

    const [row] = (await inbox()).requests;
    expect(row.state).toBe('accepted');
    expect(row).not.toHaveProperty('passedBecause');
  });

  /*
   * AND A WITHDRAWN LINK DOES NOT ERASE IT.
   *
   * FOUND BY WORKING OUT WHY A MUTATION SURVIVED. `rotate` also
   * pushes a history line — carrying the state the request is
   * already in, with `by: ROTATED` and no words — so a producer
   * who passed on a take with a reason and then withdrew the
   * link would have found the newest `rejected` line was the
   * rotation's, and the reason gone.
   */
  it('keeps the reason when the link is withdrawn afterwards', async () => {
    const call = await aCall();
    const request = await anEntry({
      campaign: call.id, submissionId: 'sub_one', permits: ['entry'],
    });
    await pass(request.id, 'Recorded indoors.');
    const rotated = await DECIDE(
      new Request(`http://local/api/performances/${SONG}/requests/${request.id}`, {
        method: 'POST', body: JSON.stringify({ action: 'rotate' }),
        headers: { 'content-type': 'application/json' },
      }), { params: Promise.resolve({ id: SONG, requestId: request.id }) });
    expect(rotated.status).toBe(200);

    expect((await inbox()).requests[0].passedBecause).toBe('Recorded indoors.');
  });

  /* Whitespace is not a reason. */
  it('does not record a reason that is only spaces', async () => {
    const call = await aCall();
    const request = await anEntry({
      campaign: call.id, submissionId: 'sub_one', permits: ['entry'],
    });
    await pass(request.id, '   ');
    expect((await inbox()).requests[0]).not.toHaveProperty('passedBecause');
  });
});
