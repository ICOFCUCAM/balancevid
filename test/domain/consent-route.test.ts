/**
 * The doors, driven.  [GO-VIRAL V-3; Doctrine D-03, D-25]
 *
 * > **Judged on:** *"An entry with no consent record cannot be
 * > accepted into a campaign; an ordinary submission with no consent
 * > record behaves exactly as today; a withdrawal removes the entry
 * > from every public surface and leaves the audit intact."*
 *
 * THE ROUTES ARE CALLED, NOT READ. Whether a recording can be sent
 * into a call that asks a question is a fact about what the server
 * does when somebody presses Send, and a source-text assertion that
 * `entryProblem` appears in the file is satisfied by a version that
 * calls it and ignores the answer. These drive the real doors and
 * read the request document that came out.
 *
 * AND THE ORDINARY REQUEST IS DRIVEN THROUGH THE SAME FILE, because
 * every assertion that a call refuses something is an assertion
 * about a code path four years of ordinary requests must never
 * enter. Testing the two apart is how one of them quietly changes.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { ParticipationRequest, RequestView } from '../../src/domain/participation.js';

let root: string;
type Link = { params: Promise<{ link: string }> };
type Piece = { params: Promise<{ link: string; submissionId: string }> };

let TAKE: (r: Request, c: Link) => Promise<Response>;
let AGREE: (r: Request, c: Link) => Promise<Response>;
let UNAGREE: (r: Request, c: Link) => Promise<Response>;
let DECLARE: (r: Request, c: Link) => Promise<Response>;
let CHUNK: (r: Request, c: Piece) => Promise<Response>;
let SEND: (r: Request, c: Piece) => Promise<Response>;
let DECIDE: (
  r: Request, c: { params: Promise<{ id: string; requestId: string }> },
) => Promise<Response>;

let newRequest: typeof import('../../src/domain/participationEdit.js').newRequest;
let openLink: typeof import('../../src/domain/participationEdit.js').open;
let newCampaign: typeof import('../../src/domain/campaignEdit.js').newCampaign;
let setTerms: typeof import('../../src/domain/campaignEdit.js').setTerms;
let termsHashOf: typeof import('../../src/domain/campaignEdit.js').termsHashOf;
let begin: typeof import('../../src/domain/campaignEdit.js').begin;
let saveCampaign: typeof import('../../src/store/campaigns.js').saveCampaign;
let saveRequest: typeof import('../../src/store/requests.js').saveRequest;
let loadRequest: typeof import('../../src/store/requests.js').loadRequest;
let linkFor: typeof import('../../src/store/requests.js').linkFor;
let loadPerformance: typeof import('../../src/store/performances.js').loadPerformance;
let paths: typeof import('../../src/store/paths.js').paths;
let write: typeof import('node:fs/promises').writeFile;
let mkdir: typeof import('node:fs/promises').mkdir;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-consent-'));
  process.env['BALANCEVID_VAR'] = root;
  ({ newRequest, open: openLink } = await import(
    '../../src/domain/participationEdit.js'));
  ({
    newCampaign, setTerms, termsHashOf, begin,
  } = await import('../../src/domain/campaignEdit.js'));
  ({ saveCampaign } = await import('../../src/store/campaigns.js'));
  ({ saveRequest, loadRequest, linkFor } = await import(
    '../../src/store/requests.js'));
  ({ GET: TAKE } = await import('../../app/api/take/[link]/route.js'));
  ({ POST: AGREE, DELETE: UNAGREE } = await import(
    '../../app/api/take/[link]/consent/route.js'));
  ({ POST: DECLARE } = await import(
    '../../app/api/take/[link]/submissions/route.js'));
  ({ POST: CHUNK, PUT: SEND } = await import(
    '../../app/api/take/[link]/submissions/[submissionId]/route.js'));
  ({ POST: DECIDE } = await import(
    '../../app/api/performances/[id]/requests/[requestId]/route.js'));
  ({ paths } = await import('../../src/store/paths.js'));
  ({ writeFile: write, mkdir } = await import('node:fs/promises'));
  ({ loadPerformance } = await import('../../src/store/performances.js'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const NOW = '2026-06-01T10:00:00.000Z';
const TOKEN = 'a-token-long-enough-to-be-a-credential';
const WORDS = 'Your video may be judged and may be shown on the results page.';

let request: ParticipationRequest;
let link: string;

/** A call on a song, live now, asking people to agree to something. */
async function openCall(words: string | null = WORDS): Promise<string> {
  const now = new Date();
  const campaign = newCampaign({
    title: 'Sing the second verse',
    track: { kind: 'performance', id: 'perf_one' },
    rules: { asks: 'Sing it outdoors' },
    window: {
      respondable: true,
      access: 'anyone',
      opensAt: new Date(now.getTime() - 3_600_000).toISOString(),
      closesAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    },
    now: now.toISOString(),
  });
  begin(campaign, now.toISOString());
  if (words !== null) setTerms(campaign, words, now.toISOString());
  await saveCampaign(campaign);
  return campaign.id;
}

/** Somebody holding a link to that call, or to nothing at all. */
async function openRequest(campaign?: string): Promise<void> {
  request = newRequest({
    holder: { kind: 'performance', id: 'perf_one' },
    assignment: {
      kind: 'performance',
      asks: 'sing the second verse',
      reference: { title: 'the master', durationSamples: 48000 * 60 },
    },
    allowed: { video: true, takes: 3 },
    token: TOKEN,
    ...(campaign ? { campaign: campaign as ParticipationRequest['campaign'] } : {}),
    now: NOW,
  });
  openLink(request, NOW);
  await saveRequest(request);
  link = linkFor(request);
}

const at = () => ({ params: Promise.resolve({ link }) });
const on = (submissionId: string) => (
  { params: Promise.resolve({ link, submissionId }) });

const look = async (): Promise<RequestView> => {
  const response = await TAKE(
    new Request(`http://local/api/take/${link}`), at());
  return (await response.json()).request as RequestView;
};

const agree = (body: unknown) => AGREE(
  new Request(`http://local/api/take/${link}/consent`, {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }), at());

const unagree = () => UNAGREE(
  new Request(`http://local/api/take/${link}/consent`, { method: 'DELETE' }),
  at());

const declare = () => DECLARE(
  new Request(`http://local/api/take/${link}/submissions`, { method: 'POST' }),
  at());

/** Record and send one take, which is what a phone does. */
async function record(id: string): Promise<Response> {
  await CHUNK(
    new Request(`http://local/api/take/${link}/submissions/${id}?index=0`, {
      method: 'POST', body: 'hello',
    }), on(id));
  return SEND(
    new Request(`http://local/api/take/${link}/submissions/${id}`, {
      method: 'PUT', body: JSON.stringify({ elapsedSamples: 96000 }),
      headers: { 'content-type': 'application/json' },
    }), on(id));
}

const said = async (response: Response): Promise<string> =>
  String((await response.json()).error ?? '');

beforeEach(async () => {
  await rm(join(root, 'accounts'), { recursive: true, force: true });
});

/* ------------------------------------------------------------------ *
 *  THE ORDINARY REQUEST, WHICH MUST NOT HAVE CHANGED AT ALL.
 * ------------------------------------------------------------------ */

describe('a request that is part of no call', () => {
  /*
   * THE WHOLE OF *"an ordinary submission with no consent record
   * behaves exactly as today"*. No terms arrive, nothing is asked,
   * and a take goes through on the first press — which is every
   * request this product has ever issued.
   */
  it('is asked nothing and sends exactly as before', async () => {
    await openRequest();
    const view = await look();
    expect(view.terms).toBeUndefined();
    expect(view.consent).toBeUndefined();

    expect((await declare()).status).toBe(201);
    expect((await record('sub_plain')).status).toBe(201);
    expect((await loadRequest(request.id)).submissions).toHaveLength(1);
  });

  /* And there is nothing for it to agree to, so it may not. */
  it('has nothing to agree to', async () => {
    await openRequest();
    const refused = await agree({ termsHash: termsHashOf(WORDS), permits: ['entry'] });
    expect(refused.status).toBe(409);
    expect(await said(refused)).toBe('there is nothing to agree to here');
  });

  /*
   * AND NEITHER DOES ONE UNDER A CALL THAT ASKS NOTHING. A campaign
   * is not by itself a thing to sign: requiring consent is the
   * organiser writing terms, and a call with none behaves like no
   * call at all.
   */
  it('is unchanged under a call with no terms', async () => {
    await openRequest(await openCall(null));
    expect((await look()).terms).toBeUndefined();
    expect((await record('sub_nocall')).status).toBe(201);

    /*
     * AND IT SAYS THAT, RATHER THAN THAT THE WORDS ARE WRONG.
     *
     * A mutation run found this: with the *nothing to agree to*
     * guard removed the door still refused, because a call with no
     * terms has no hash to match — so the only thing that changed
     * was what the person was told, from *there is nothing to agree
     * to here* to *those are not the terms of this call*. The
     * second is a sentence about a document that does not exist. A
     * refusal is also an answer, and the test for a guard whose
     * effect is the wording has to read the wording.
     */
    const refused = await agree({
      termsHash: termsHashOf(WORDS), permits: ['entry'],
    });
    expect(refused.status).toBe(409);
    expect(await said(refused)).toBe('there is nothing to agree to here');
  });
});

/* ------------------------------------------------------------------ *
 *  THE CALL THAT ASKS.
 * ------------------------------------------------------------------ */

describe('a call that asks entrants to agree', () => {
  beforeEach(async () => {
    await openRequest(await openCall());
  });

  /*
   * THE WORDS TRAVEL WITH THE ASSIGNMENT, because a hash the client
   * echoes back without anybody having read the text is a signature
   * on a sealed envelope. The one fetch the Take App already makes
   * carries them, and nothing else about the call crosses.
   */
  it('shows the words on the link the participant opens', async () => {
    const view = await look();
    expect(view.terms).toEqual({ hash: termsHashOf(WORDS), text: WORDS });
    expect(view.consent).toBeUndefined();
    expect(view).not.toHaveProperty('campaign');
  });

  /*
   * AND NOTHING IS SENT UNTIL THEY HAVE. The PUT is the rule: it is
   * the moment bytes become a submission and the moment a client
   * that invents a recording id cannot skip.
   */
  it('refuses a recording with no agreement', async () => {
    const refused = await record('sub_nope');
    expect(refused.status).toBe(409);
    expect(await said(refused)).toContain('agree to its terms');
    expect((await loadRequest(request.id)).submissions ?? []).toHaveLength(0);
  });

  /*
   * AND SAYS SO BEFORE THE SONG RATHER THAN AFTER IT. A performer
   * told no at the end of four minutes has sung for nothing.
   */
  it('refuses the recording before it begins', async () => {
    const refused = await declare();
    expect(refused.status).toBe(409);
    expect(await said(refused)).toContain('agree to its terms');
  });

  it('takes an agreement and then takes the recording', async () => {
    const given = await agree({
      termsHash: termsHashOf(WORDS), permits: ['entry', 'display'],
    });
    expect(given.status).toBe(201);
    const after = (await given.json()).request as RequestView;
    expect(after.consent?.permits).toEqual(['entry', 'display']);

    const stored = await loadRequest(request.id);
    expect(stored.consent?.termsHash).toBe(termsHashOf(WORDS));
    expect(stored.consent?.at).toBeTruthy();

    expect((await declare()).status).toBe(201);
    expect((await record('sub_yes')).status).toBe(201);
  });

  /*
   * A HASH THE CLIENT MADE UP IS NOT AN AGREEMENT. It has shown
   * nobody anything, which is the one thing a consent record is
   * supposed to prove.
   */
  it('refuses a hash the call has never used', async () => {
    const refused = await agree({
      termsHash: termsHashOf('something else entirely'), permits: ['entry'],
    });
    expect(refused.status).toBe(409);
    expect(await said(refused)).toBe('those are not the terms of this call');
    expect((await loadRequest(request.id)).consent).toBeUndefined();
  });

  /* And a tick on everything except the act itself is not one. */
  it('refuses an agreement that does not cover entering', async () => {
    const refused = await agree({
      termsHash: termsHashOf(WORDS), permits: ['display', 'broadcast'],
    });
    expect(refused.status).toBe(400);
    expect((await loadRequest(request.id)).consent).toBeUndefined();
  });

  /*
   * CHANGING YOUR MIND BEFORE RECORDING IS ALLOWED. An organiser
   * who improves their wording must not lock out everybody who had
   * already read the old one.
   */
  it('lets somebody agree again before anything is sent', async () => {
    await agree({ termsHash: termsHashOf(WORDS), permits: ['entry'] });
    const again = await agree({
      termsHash: termsHashOf(WORDS), permits: ['entry', 'broadcast'],
    });
    expect(again.status).toBe(201);
    expect((await loadRequest(request.id)).consent?.permits)
      .toEqual(['entry', 'broadcast']);
  });

  /*
   * AND NOT AFTERWARDS. Once a recording has been sent the record
   * is evidence rather than a setting: a second agreement would let
   * somebody who sent a video under *entry only* decide later that
   * they had agreed to broadcast all along.
   */
  it('will not let it be rewritten once something has been sent', async () => {
    await agree({ termsHash: termsHashOf(WORDS), permits: ['entry'] });
    expect((await record('sub_sent')).status).toBe(201);

    const refused = await agree({
      termsHash: termsHashOf(WORDS), permits: ['entry', 'broadcast'],
    });
    expect(refused.status).toBe(409);
    expect(await said(refused)).toContain('not rewritten');
    expect((await loadRequest(request.id)).consent?.permits).toEqual(['entry']);
  });
});

/* ------------------------------------------------------------------ *
 *  TAKING IT BACK.
 * ------------------------------------------------------------------ */

describe('a withdrawal', () => {
  beforeEach(async () => {
    await openRequest(await openCall());
    await agree({
      termsHash: termsHashOf(WORDS), permits: ['entry', 'display', 'broadcast'],
    });
  });

  /*
   * IT STOPS FUTURE USE AND UNMAKES NOTHING. The submission stays
   * on the request — that is the audit — and nothing further may be
   * sent under it.
   */
  it('leaves what was sent and stops what has not been', async () => {
    expect((await record('sub_one')).status).toBe(201);
    expect((await unagree()).status).toBe(200);

    const stored = await loadRequest(request.id);
    expect(stored.submissions).toHaveLength(1);
    expect(stored.consent?.withdrawnAt).toBeTruthy();
    expect(stored.consent?.permits).toEqual(['entry', 'display', 'broadcast']);
    expect(stored.consent?.at).toBeTruthy();

    const refused = await record('sub_two');
    expect(refused.status).toBe(409);
    expect(await said(refused)).toBe('that agreement was taken back');
    expect((await loadRequest(request.id)).submissions).toHaveLength(1);
  });

  /* The surface that asked is told, in the record's own words. */
  it('shows on the link that it was taken back', async () => {
    await unagree();
    const view = await look();
    expect(view.consent?.withdrawnAt).toBeTruthy();
    expect(view.terms?.hash).toBe(termsHashOf(WORDS));
  });

  it('is nothing to take back where nothing was agreed', async () => {
    await openRequest(await openCall());
    const refused = await unagree();
    expect(refused.status).toBe(409);
    expect(await said(refused)).toBe('nothing was agreed to here');
  });

  /* Pressing it twice does not move the date. */
  it('keeps the moment they said so', async () => {
    await unagree();
    const first = (await loadRequest(request.id)).consent?.withdrawnAt;
    await new Promise((settle) => { setTimeout(settle, 5); });
    expect((await unagree()).status).toBe(200);
    expect((await loadRequest(request.id)).consent?.withdrawnAt).toBe(first);
  });
});

/* ------------------------------------------------------------------ *
 *  AND THE OTHER DOOR, WHICH IS THE ONE THAT CANNOT BE UNDONE.
 * ------------------------------------------------------------------ */

const SONG = 'perf_one';

/** The song the request is against, as a producer would leave it. */
async function aSong(): Promise<void> {
  await mkdir(paths.performance(SONG), { recursive: true });
  await write(paths.performanceDocument(SONG), JSON.stringify({
    schemaVersion: 1,
    id: SONG,
    title: 'The Long Way Round',
    master: {
      assetId: 'asset_song', title: 'The Long Way Round',
      class: 'own', durationSamples: 48000 * 60,
    },
    takes: [], scenes: [], plates: [],
    audio: { mode: 'music_and_mic' },
    layoutProfileId: 'default',
    createdAt: NOW,
    updatedAt: NOW,
  }), 'utf8');
}

const accept = (assetId: string) => DECIDE(
  new Request(`http://local/api/performances/${SONG}/requests/${request.id}`, {
    method: 'POST', body: JSON.stringify({ action: 'accept', submissionId: assetId }),
    headers: { 'content-type': 'application/json' },
  }),
  { params: Promise.resolve({ id: SONG, requestId: request.id }) },
);

describe('a producer accepting an entry', () => {
  beforeEach(async () => {
    await aSong();
    await openRequest(await openCall());
    await agree({ termsHash: termsHashOf(WORDS), permits: ['entry', 'display'] });
    expect((await record('sub_entry')).status).toBe(201);
  });

  /*
   * THE GOOD CASE FIRST, because a guard that refuses everything
   * passes every test about refusing. An entry that agreed goes
   * into the production exactly as any submission does.
   */
  it('accepts one that agreed', async () => {
    expect((await accept('sub_entry')).status).toBe(202);
    expect((await loadPerformance(SONG)).takes).toHaveLength(1);
  });

  /*
   * A WITHDRAWAL BETWEEN SENDING AND ACCEPTING IS THE CASE THIS
   * EXISTS FOR, and it is not a rare one: taking it back is a thing
   * somebody does after they have sent it. Accepting is the one act
   * D-25 calls irreversible, so it is the last moment the question
   * can be asked and the one that matters most.
   */
  it('refuses one that was taken back after it was sent', async () => {
    expect((await unagree()).status).toBe(200);
    const refused = await accept('sub_entry');
    expect(refused.status).toBe(409);
    expect(await said(refused)).toBe('that agreement was taken back');
    expect((await loadPerformance(SONG)).takes).toHaveLength(0);
  });
});
