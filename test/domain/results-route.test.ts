/**
 * The result in public, and the winner coming home.
 *   [GO-VIRAL V-6; Doctrine D-19, D-25, D-03]
 *
 * > **Judged on:** *"A winner's take is scheduled on a channel
 * > through the ordinary route with no campaign-specific code in
 * > the playout path; and a clip pasted into a messaging app
 * > shows the campaign and links back to it."*
 *
 * THE ACCEPT PATH IS DRIVEN RATHER THAN READ, because the claim
 * is about a boundary: a winning entry goes through the door a
 * producer already uses, picks up one fact on the way, and comes
 * out an ordinary take. A source-text test would say the field
 * is written; this says the take in the rail has it and that
 * nothing else about the take changed.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Campaign } from '../../src/domain/campaign.js';

let root: string;
type Id = { params: Promise<{ id: string }> };
type Req = { params: Promise<{ id: string; requestId: string }> };
type Handle = { params: Promise<{ handle: string }> };

let MOVE: (r: Request, c: Id) => Promise<Response>;
let MARK: (r: Request, c: Id) => Promise<Response>;
let DECIDE: (r: Request, c: Req) => Promise<Response>;
let PUBLIC: (r: Request, c: Handle) => Promise<Response>;
let CARD: (r: Request, c: Id) => Promise<Response>;

let newCampaign: typeof import('../../src/domain/campaignEdit.js').newCampaign;
let newRequest: typeof import('../../src/domain/participationEdit.js').newRequest;
let consentFrom: typeof import('../../src/domain/consent.js').consentFrom;
let saveCampaign: typeof import('../../src/store/campaigns.js').saveCampaign;
let saveRequest: typeof import('../../src/store/requests.js').saveRequest;
let listRequests: typeof import('../../src/store/requests.js').listRequests;
let loadPerformance: typeof import('../../src/store/performances.js').loadPerformance;
let performanceShareFor: typeof import('../../src/web/performanceShare.js').performanceShareFor;
let callsIn: typeof import('../../src/domain/performance.js').callsIn;
let paths: typeof import('../../src/store/paths.js').paths;

const SONG = 'perf_result000000000';
const HASH = 'd'.repeat(64);
const MADE = '2026-06-01T10:00:00.000Z';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-result-'));
  process.env['BALANCEVID_VAR'] = root;
  ({ newCampaign } = await import('../../src/domain/campaignEdit.js'));
  ({ newRequest } = await import('../../src/domain/participationEdit.js'));
  ({ consentFrom } = await import('../../src/domain/consent.js'));
  ({ saveCampaign } = await import('../../src/store/campaigns.js'));
  ({ saveRequest, listRequests } = await import('../../src/store/requests.js'));
  ({ loadPerformance } = await import('../../src/store/performances.js'));
  ({ performanceShareFor } = await import('../../src/web/performanceShare.js'));
  ({ callsIn } = await import('../../src/domain/performance.js'));
  ({ paths } = await import('../../src/store/paths.js'));
  ({ POST: MOVE } = await import('../../app/api/campaigns/[id]/route.js'));
  ({ POST: MARK } = await import(
    '../../app/api/campaigns/[id]/judgements/route.js'));
  ({ POST: DECIDE } = await import(
    '../../app/api/performances/[id]/requests/[requestId]/route.js'));
  ({ GET: PUBLIC } = await import('../../app/api/go/[handle]/route.js'));
  ({ GET: CARD } = await import('../../app/api/performances/[id]/card/route.js'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

async function aSong(): Promise<void> {
  await mkdir(paths.performance(SONG), { recursive: true });
  await writeFile(paths.performanceDocument(SONG), JSON.stringify({
    schemaVersion: 1, id: SONG, title: 'The Long Way Round',
    master: {
      assetId: 'asset_song', title: 'The Long Way Round', artist: 'The Band',
      class: 'own', durationSamples: 48000 * 180,
    },
    takes: [], scenes: [], plates: [],
    audio: { mode: 'music_and_mic' }, layoutProfileId: 'default',
    createdAt: MADE, updatedAt: MADE,
    publication: {
      publishedAt: MADE, respondable: true, access: 'anyone', planHash: 'r',
    },
  }), 'utf8');
}

const verb = async (id: string, body: unknown) => {
  const response = await MOVE(
    new Request(`http://local/api/campaigns/${id}`, {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id }) });
  return { status: response.status, body: await response.json() };
};

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

let arrived = 0;

async function anEntry(spec: {
  campaign?: string; submissionId: string; permits?: string[];
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
      reference: { title: 'The Long Way Round', durationSamples: 48000 * 180 },
    },
    allowed: { video: true, takes: 3 },
    token: 'a-token-long-enough-to-be-a-credential',
    ...(spec.campaign ? { campaign: spec.campaign as never } : {}),
    ...(spec.participant ? { participant: spec.participant } : {}),
    now: MADE,
  });
  if (consent) request.consent = consent;
  request.submissions = [{
    id: spec.submissionId as never, assetId: spec.submissionId,
    kind: 'video', at,
  }];
  request.state = 'submitted';
  request.history = [...request.history, { state: 'submitted', at: MADE }];
  await saveRequest(request);
  await mkdir(paths.requestAssets(request.id), { recursive: true });
  await writeFile(
    paths.requestAsset(request.id, spec.submissionId, 'webm'), 'a take', 'utf8');
  return request;
}

const use = (requestId: string, submissionId: string) => DECIDE(
  new Request(`http://local/api/performances/${SONG}/requests/${requestId}`, {
    method: 'POST',
    body: JSON.stringify({ action: 'accept', submissionId }),
    headers: { 'content-type': 'application/json' },
  }), { params: Promise.resolve({ id: SONG, requestId }) });

const seen = async (handle: string) => (await PUBLIC(
  new Request(`http://local/api/go/${handle}`),
  { params: Promise.resolve({ handle }) })).json();

beforeEach(async () => {
  await rm(join(root, 'accounts'), { recursive: true, force: true });
  arrived = 0;
  await aSong();
});

/* ------------------------------------------------------------------ *
 *  THE WINNER COMES HOME BY THE ORDINARY DOOR.
 * ------------------------------------------------------------------ */

describe('accepting an entry that came through a call', () => {
  /*
   * THE ORDINARY ACCEPT PATH, WITH ONE MORE FACT ON IT. The take
   * in the rail is an ordinary take — a label, an environment, a
   * colour, unplaced against the master — and it carries the one
   * thing that would otherwise be lost at the boundary.
   */
  it('puts an ordinary take in the rail, knowing where it came from', async () => {
    const call = await aCall();
    const request = await anEntry({
      campaign: call.id, submissionId: 'sub_one',
      permits: ['entry', 'display'], participant: 'Mo',
    });
    expect((await use(request.id, 'sub_one')).status).toBe(202);

    const [take] = (await loadPerformance(SONG)).takes;
    expect(take!.fromCall).toBe(call.id);
    expect(take!.label).toContain('Mo');
    expect(take!.environment).toEqual({ kind: 'original' });
    expect(callsIn(await loadPerformance(SONG))).toEqual([call.id]);
  });

  /*
   * AND AN INVITED TAKE IS BYTE FOR BYTE WHAT IT WAS, which is
   * every take this product has ever made.
   */
  it('leaves an invited take with no call on it', async () => {
    const request = await anEntry({ submissionId: 'sub_one' });
    expect((await use(request.id, 'sub_one')).status).toBe(202);
    const [take] = (await loadPerformance(SONG)).takes;
    expect(take).not.toHaveProperty('fromCall');
    expect(callsIn(await loadPerformance(SONG))).toEqual([]);
  });
});

describe('the clip somebody pastes into a messaging app', () => {
  /*
   * > *"A clip pasted into a messaging app shows the campaign and
   * > links back to it."*
   *
   * THE WHOLE URL, FROM THE ORIGIN THE BROWSER REACHED. A share
   * card is fetched by whatever the link was pasted into, and a
   * hostname this product invented would send every reader to
   * the wrong installation. [`originOf`]
   */
  it('says which call it answered, with a link back', async () => {
    const call = await aCall();
    const request = await anEntry({
      campaign: call.id, submissionId: 'sub_one', permits: ['entry'],
    });
    await use(request.id, 'sub_one');

    const share = await performanceShareFor(
      new Request('https://studio.example/p/x/watch'),
      await loadPerformance(SONG));
    expect(share?.card.call).toContain('Sing the second verse');
    expect(share?.card.call)
      .toContain('https://studio.example/go/sing-the-second-verse');
    /* And the attribution is still the line that is never dropped. */
    expect(share?.card.attribution).toBeTruthy();
  });

  /*
   * AND THE ROUTE A CHAT APP ACTUALLY FETCHES SAYS IT TOO.
   *
   * FOUND IN A BROWSER RUN. `buildPerformanceCard` had three
   * callers — the share metadata, the worker drawing the
   * picture, and this route, which serves both the card and the
   * image — and V-6's first draft taught two of them. The
   * preview said nothing about the competition the video won.
   * There is one lookup now, and this drives the caller that
   * was missed. [D-19]
   */
  it('says it on the route the preview is fetched from', async () => {
    const call = await aCall();
    const request = await anEntry({
      campaign: call.id, submissionId: 'sub_one', permits: ['entry'],
    });
    await use(request.id, 'sub_one');

    const answer = await CARD(
      new Request(`https://studio.example/api/performances/${SONG}/card`),
      { params: Promise.resolve({ id: SONG }) });
    const body = await answer.json();
    expect(body.card.call).toContain('Sing the second verse');
    expect(body.card.call)
      .toContain('https://studio.example/go/sing-the-second-verse');
  });

  it('says nothing about a call for a performance that answered none', async () => {
    const request = await anEntry({ submissionId: 'sub_one' });
    await use(request.id, 'sub_one');
    const share = await performanceShareFor(
      new Request('https://studio.example/p/x/watch'),
      await loadPerformance(SONG));
    expect(share?.card).not.toHaveProperty('call');
  });

  /*
   * AND A CALL WHOSE FILE HAS GONE DRAWS THE CARD IT WOULD HAVE
   * DRAWN BEFORE CAMPAIGNS EXISTED, rather than failing to draw
   * one. A link preview that 500s is a link nobody clicks.
   */
  it('still draws a card when the call has been deleted', async () => {
    const call = await aCall();
    const request = await anEntry({ campaign: call.id, submissionId: 'sub_one' });
    await use(request.id, 'sub_one');
    await rm(paths.campaign(call.id), { recursive: true, force: true });

    const share = await performanceShareFor(
      new Request('https://studio.example/p/x/watch'),
      await loadPerformance(SONG));
    expect(share?.card.title).toBe('The Long Way Round');
    expect(share?.card).not.toHaveProperty('call');
  });
});

/* ------------------------------------------------------------------ *
 *  THE RESULT, IN PUBLIC.
 * ------------------------------------------------------------------ */

describe('the public result', () => {
  /** A judged call with two shown entries and one withdrawn. */
  async function judged(): Promise<{ call: Campaign; slug: string }> {
    const call = await aCall();
    await verb(call.id, { action: 'criterion', says: 'Tuning' });
    await verb(call.id, { action: 'begin' });
    const panel = await verb(call.id, { action: 'panel', name: 'Ada' });
    const ada = panel.body.panel[0].id;
    const tuning = panel.body.scorecard[0].id;
    await anEntry({
      campaign: call.id, submissionId: 'sub_one',
      permits: ['entry', 'display'], participant: 'Mo',
    });
    await anEntry({
      campaign: call.id, submissionId: 'sub_two',
      permits: ['entry', 'display'], participant: 'Jo',
    });
    await verb(call.id, {
      action: 'deadline',
      closesAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    await verb(call.id, { action: 'judge' });
    for (const [entry, score, says] of [
      ['sub_one', 4, 'Flat in the chorus.'],
      ['sub_two', 9, 'In tune the whole way.'],
    ] as const) {
      await MARK(new Request(`http://local/api/campaigns/${call.id}/judgements`, {
        method: 'POST',
        body: JSON.stringify({
          entry, by: ada, says, marks: [{ criterion: tuning, score }],
        }),
        headers: { 'content-type': 'application/json' },
      }), { params: Promise.resolve({ id: call.id }) });
    }
    return { call, slug: call.slug! };
  }

  /*
   * NOT BEFORE IT IS ANNOUNCED. A panel marking in the open is a
   * panel being argued with while it marks, and a standing that
   * moved under a reader every time a mark was corrected would
   * be a result nobody could cite.
   */
  it('is absent while the call is still being judged', async () => {
    const { slug } = await judged();
    const page = await seen(slug);
    expect(page.call.state).toBe('judging');
    expect(page).not.toHaveProperty('results');
  });

  it('appears once the organiser announces it, highest first', async () => {
    const { call, slug } = await judged();
    expect((await verb(call.id, { action: 'announce' })).status).toBe(200);

    const page = await seen(slug);
    expect(page.results.map((one: { entry: string }) => one.entry))
      .toEqual(['sub_two', 'sub_one']);
    expect(page.results[0].place).toBe(1);
    expect(page.results[0].score).toBe(9);
    expect(page.results[0].outOf).toBe(10);
    expect(page.results[1].place).toBe(2);
    expect(page.panel).toEqual(['Ada']);
  });

  /*
   * WITH THE WORDS AND THE NAMES, which is *"every score carries
   * its reason"* seen from outside. A public result that was
   * scores alone would be the oracle this layer exists not to be.
   */
  it('carries each judge\'s own words, with their name', async () => {
    const { call, slug } = await judged();
    await verb(call.id, { action: 'announce' });
    const page = await seen(slug);
    expect(page.results[0].said)
      .toEqual([{ judge: 'Ada', says: 'In tune the whole way.' }]);
    expect(page.results[0].byCriterion[0].says).toBe('Tuning');
  });

  /*
   * AND ONLY ENTRIES ON THE WALL ARE NAMED. Somebody who did not
   * agree to being shown — or who took it back — is not in a
   * public standing either. One predicate, every surface.
   * [V-3, V-4]
   */
  it('names nobody who did not agree to be shown', async () => {
    const { call, slug } = await judged();
    /* A third entry, whose maker never agreed to be displayed. */
    await anEntry({
      campaign: call.id, submissionId: 'sub_hidden', permits: ['entry'],
      participant: 'Private',
    });
    const page0 = await seen(slug);
    expect(page0.wall.map((one: { submissionId: string }) => one.submissionId))
      .toEqual(['sub_one', 'sub_two']);

    await verb(call.id, { action: 'announce' });
    const page = await seen(slug);
    expect(page.results.map((one: { entry: string }) => one.entry))
      .toEqual(['sub_two', 'sub_one']);
    expect(JSON.stringify(page.results)).not.toContain('sub_hidden');
  });

  /*
   * AND SOMEBODY WHO TAKES IT BACK AFTER BEING MARKED LEAVES THE
   * STANDING, JUDGEMENT AND ALL.
   *
   * FOUND BY MUTATION, AND IT IS THE CASE THAT MATTERS. An entry
   * nobody marked produces no verdict whatever the filter does,
   * so a fixture built that way tests nothing — the judgements
   * route already refuses to mark something that is not on the
   * wall. The real sequence is a withdrawal AFTER the marking,
   * which leaves a judgement attached to somebody who has gone;
   * the filter is the only thing standing between that judgement
   * and a public page with their name on it. [V-3, T-5]
   */
  it('drops a marked entry whose maker took it back', async () => {
    const { call, slug } = await judged();

    /* The winner withdraws between the marking and the result. */
    const requests = await listRequests();
    const winner = requests.find(
      (one) => (one.submissions ?? [])[0]?.assetId === 'sub_two');
    winner!.consent!.withdrawnAt = new Date().toISOString();
    await saveRequest(winner!);

    await verb(call.id, { action: 'announce' });
    const page = await seen(slug);
    expect(page.wall.map((one: { submissionId: string }) => one.submissionId))
      .toEqual(['sub_one']);
    expect(page.results.map((one: { entry: string }) => one.entry))
      .toEqual(['sub_one']);
    expect(page.results[0].place).toBe(1);
    expect(JSON.stringify(page.results)).not.toContain('In tune the whole way');
  });

  /* And it is still there once the call is closed for good. */
  it('stays after the call is completed', async () => {
    const { call, slug } = await judged();
    await verb(call.id, { action: 'announce' });
    await verb(call.id, { action: 'complete' });
    const page = await seen(slug);
    expect(page.call.state).toBe('completed');
    expect(page.results).toHaveLength(2);
  });
});
