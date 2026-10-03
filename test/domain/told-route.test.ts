/**
 * The link answers with what happened, and the installation
 * learns nothing.  [GO-VIRAL V-7; Doctrine D-03, D-25]
 *
 * > **Judged on:** *"A phone that entered a campaign and was closed
 * > is told the result without the installation ever holding
 * > anything that identifies its owner."*
 *
 * THE SECOND HALF IS WHAT THIS FILE IS FOR. It is easy to test
 * that a result comes back and hard to test that nothing was
 * written down — so the request document is read after the whole
 * exchange and compared, field for field, with what it was before
 * the device ever asked.
 */

import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Campaign } from '../../src/domain/campaign.js';
import type { RequestView } from '../../src/domain/participation.js';

let root: string;
type Link = { params: Promise<{ link: string }> };
type Id = { params: Promise<{ id: string }> };
type Req = { params: Promise<{ id: string; requestId: string }> };

let TAKE: (r: Request, c: Link) => Promise<Response>;
let MOVE: (r: Request, c: Id) => Promise<Response>;
let MARK: (r: Request, c: Id) => Promise<Response>;
let DECIDE: (r: Request, c: Req) => Promise<Response>;

let newCampaign: typeof import('../../src/domain/campaignEdit.js').newCampaign;
let newRequest: typeof import('../../src/domain/participationEdit.js').newRequest;
let consentFrom: typeof import('../../src/domain/consent.js').consentFrom;
let saveCampaign: typeof import('../../src/store/campaigns.js').saveCampaign;
let saveRequest: typeof import('../../src/store/requests.js').saveRequest;
let linkFor: typeof import('../../src/store/requests.js').linkFor;
let paths: typeof import('../../src/store/paths.js').paths;

const SONG = 'perf_told00000000000';
const HASH = 'e'.repeat(64);
const MADE = '2026-06-01T10:00:00.000Z';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-told-'));
  process.env['BALANCEVID_VAR'] = root;
  ({ newCampaign } = await import('../../src/domain/campaignEdit.js'));
  ({ newRequest } = await import('../../src/domain/participationEdit.js'));
  ({ consentFrom } = await import('../../src/domain/consent.js'));
  ({ saveCampaign } = await import('../../src/store/campaigns.js'));
  ({ saveRequest, linkFor } = await import('../../src/store/requests.js'));
  ({ paths } = await import('../../src/store/paths.js'));
  ({ GET: TAKE } = await import('../../app/api/take/[link]/route.js'));
  ({ POST: MOVE } = await import('../../app/api/campaigns/[id]/route.js'));
  ({ POST: MARK } = await import(
    '../../app/api/campaigns/[id]/judgements/route.js'));
  ({ POST: DECIDE } = await import(
    '../../app/api/performances/[id]/requests/[requestId]/route.js'));
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
      class: 'own', durationSamples: 48000 * 180,
    },
    takes: [], scenes: [], plates: [],
    audio: { mode: 'music_and_mic' }, layoutProfileId: 'default',
    createdAt: MADE, updatedAt: MADE,
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
  participant?: string;
}) {
  arrived += 1;
  const at = new Date(Date.parse(MADE) + arrived * 60_000).toISOString();
  const consent = spec.permits
    ? consentFrom({ termsHash: HASH, permits: spec.permits }, MADE) : null;
  const made = newRequest({
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
  if (consent) made.consent = consent;
  made.submissions = [{
    id: spec.submissionId as never, assetId: spec.submissionId,
    kind: 'video', at,
  }];
  made.state = 'submitted';
  made.history = [...made.history, { state: 'submitted', at: MADE }];
  await saveRequest(made);
  await mkdir(paths.requestAssets(made.id), { recursive: true });
  await writeFile(
    paths.requestAsset(made.id, spec.submissionId, 'webm'), 'a take', 'utf8');
  return made;
}

const ask = async (link: string): Promise<RequestView> => {
  const answer = await TAKE(
    new Request(`http://local/api/take/${link}`),
    { params: Promise.resolve({ link }) });
  return (await answer.json()).request as RequestView;
};

const onDisk = (id: string) =>
  readFile(paths.requestDocument(id), 'utf8');

beforeEach(async () => {
  await rm(join(root, 'accounts'), { recursive: true, force: true });
  arrived = 0;
  await aSong();
});

/*
 * AND THE COUNT THE PAGE DRAWS FROM.  [TAKE-APP T4; V-7]
 *
 * FOUND IN A SCREENSHOT: the take counter read `kept.length + 1`,
 * which is right within one visit and forgets everything across a
 * reload — a performer who sent one take and opened the link a
 * week later was told *Take 1 of 3* about their second.
 * `submitted` is the server's own count and has been in the view
 * since B-2; it was never read by the counter.
 */
describe('what the server says has been sent', () => {
  it('survives the page being closed', async () => {
    const made = await anEntry({ submissionId: 'sub_one' });
    expect((await ask(linkFor(made))).submitted).toBe(1);
  });
});

describe('a link that has nothing to report', () => {
  it('says nothing, which is every request this product has issued', async () => {
    const made = await anEntry({ submissionId: 'sub_one' });
    expect(await ask(linkFor(made))).not.toHaveProperty('outcome');
  });
});

describe('a link whose take was decided', () => {
  const decide = (requestId: string, body: unknown) => DECIDE(
    new Request(`http://local/api/performances/${SONG}/requests/${requestId}`, {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }), { params: Promise.resolve({ id: SONG, requestId }) });

  it('says their take was used', async () => {
    const made = await anEntry({ submissionId: 'sub_one' });
    await decide(made.id, { action: 'accept', submissionId: 'sub_one' });
    const view = await ask(linkFor(made));
    expect(view.outcome).toEqual({
      state: 'accepted', says: 'Your take was used.',
    });
  });

  /* And a decline says why, where the producer said. [G8] */
  it('says it was passed over, in the words that were given', async () => {
    const made = await anEntry({ submissionId: 'sub_one' });
    await decide(made.id, { action: 'reject', says: 'Recorded indoors.' });
    expect((await ask(linkFor(made))).outcome?.says)
      .toBe('Not this time — Recorded indoors.');
  });
});

/* ------------------------------------------------------------------ *
 *  THE RESULT, AND WHAT IT COSTS THE PERSON ASKING.
 * ------------------------------------------------------------------ */

describe('a link in a call that has announced', () => {
  /** A judged call, two entries, the second one marked higher. */
  async function judged() {
    const call = await aCall();
    await verb(call.id, { action: 'criterion', says: 'Tuning' });
    await verb(call.id, { action: 'begin' });
    const panel = await verb(call.id, { action: 'panel', name: 'Ada' });
    const ada = panel.body.panel[0].id;
    const tuning = panel.body.scorecard[0].id;
    const mine = await anEntry({
      campaign: call.id, submissionId: 'sub_one',
      permits: ['entry', 'display'], participant: 'Mo',
    });
    const theirs = await anEntry({
      campaign: call.id, submissionId: 'sub_two',
      permits: ['entry', 'display'], participant: 'Jo',
    });
    await verb(call.id, {
      action: 'deadline',
      closesAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    await verb(call.id, { action: 'judge' });
    for (const [entry, score] of [['sub_one', 4], ['sub_two', 9]] as const) {
      await MARK(new Request(`http://local/api/campaigns/${call.id}/judgements`, {
        method: 'POST',
        body: JSON.stringify({
          entry: (entry === 'sub_one' ? mine : theirs).submissions![0]!.id,
          by: ada, says: 'because',
          marks: [{ criterion: tuning, score }],
        }),
        headers: { 'content-type': 'application/json' },
      }), { params: Promise.resolve({ id: call.id }) });
    }
    return { call, mine, theirs };
  }

  /* Not while the panel is still marking. [V-6] */
  it('says nothing before the organiser announces', async () => {
    const { mine } = await judged();
    expect(await ask(linkFor(mine))).not.toHaveProperty('outcome');
  });

  /*
   * > *"A phone that entered a campaign and was closed is told the
   * > result."*
   *
   * AND WHERE THEY CAME, WHICH IS WHAT THEY ENTERED FOR.
   */
  it('tells each of them where they came', async () => {
    const { call, mine, theirs } = await judged();
    await verb(call.id, { action: 'announce' });

    expect((await ask(linkFor(theirs))).outcome)
      .toEqual({
        state: 'result', place: 1, of: 2,
        says: 'The results are in — you came 1st of 2.',
      });
    expect((await ask(linkFor(mine))).outcome?.place).toBe(2);
  });

  /*
   * AND NOTHING ABOUT ANYBODY ELSE. A participant learns their own
   * place in a standing that is already public; they do not learn
   * who else entered, what the panel said about them, or which
   * performance any of this is. `viewFor` is still the one gate.
   * [D-25]
   */
  it('tells them nothing about the other entrant', async () => {
    const { call, mine } = await judged();
    await verb(call.id, { action: 'announce' });
    const view = await ask(linkFor(mine));
    const said = JSON.stringify(view);
    expect(said).not.toContain('Jo');
    expect(said).not.toContain('sub_two');
    expect(said).not.toContain(SONG);
    expect(said).not.toContain('Ada');
    expect(view).not.toHaveProperty('campaign');
  });

  /*
   * > *"…without the installation ever holding anything that
   * > identifies its owner."*
   *
   * THE DOCUMENT BEFORE AND AFTER, BYTE FOR BYTE. A device may ask
   * a hundred times and the request on disk is the request that
   * was there — no device id, no subscription, no last-seen, no
   * count of how often somebody looked. There is nowhere for an
   * address to be written, and this is the test that keeps it
   * that way.
   */
  it('writes nothing about the device that asked', async () => {
    const { call, mine } = await judged();
    await verb(call.id, { action: 'announce' });

    const before = await onDisk(mine.id);
    for (let n = 0; n < 5; n += 1) await ask(linkFor(mine));
    const after = await onDisk(mine.id);
    expect(after).toBe(before);
    expect(after).not.toMatch(/device|subscription|endpoint|push|email|phone/i);
  });

  /*
   * AND SOMEBODY WHO DID NOT AGREE TO BE SHOWN IS NOT IN THE
   * STANDING, so they are not told a place in one. Telling them
   * where they came in a list they are not in would be telling
   * them about somebody else's. [V-3, V-4, V-6]
   */
  it('tells no place to somebody who is not in the standing', async () => {
    const call = await aCall();
    await verb(call.id, { action: 'criterion', says: 'Tuning' });
    await verb(call.id, { action: 'begin' });
    await verb(call.id, { action: 'panel', name: 'Ada' });
    const quiet = await anEntry({
      campaign: call.id, submissionId: 'sub_quiet', permits: ['entry'],
    });
    await verb(call.id, {
      action: 'deadline',
      closesAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    await verb(call.id, { action: 'judge' });
    await verb(call.id, { action: 'announce' });

    expect(await ask(linkFor(quiet))).not.toHaveProperty('outcome');
  });

  /*
   * AND SOMEBODY WHO TAKES IT BACK AFTER BEING MARKED IS TOLD NO
   * PLACE, AND THE STANDING THEY LEFT IS SHORTER.
   *
   * FOUND BY MUTATION, and it is the case that matters. An entry
   * nobody marked produces no verdict whatever the filter does,
   * so the fixture above tests nothing about it. The real
   * sequence is a withdrawal AFTER the marking, which leaves a
   * judgement attached to somebody who has gone — and `of` is
   * the number that shows it, because a standing of two that
   * still counted them would tell the other entrant they came
   * first of two when they came first of one. [V-3, T-5]
   */
  it('tells no place to somebody who took it back, and shortens the rest',
    async () => {
      const { call, mine, theirs } = await judged();

      mine.consent!.withdrawnAt = new Date().toISOString();
      await saveRequest(mine);
      await verb(call.id, { action: 'announce' });

      expect(await ask(linkFor(mine))).not.toHaveProperty('outcome');
      expect((await ask(linkFor(theirs))).outcome)
        .toEqual({
          state: 'result', place: 1, of: 1,
          says: 'The results are in — you came 1st of 1.',
        });
    });

  /* And it is still there once the call is closed for good. */
  it('keeps telling them after the call is completed', async () => {
    const { call, theirs } = await judged();
    await verb(call.id, { action: 'announce' });
    await verb(call.id, { action: 'complete' });
    expect((await ask(linkFor(theirs))).outcome?.place).toBe(1);
  });
});
