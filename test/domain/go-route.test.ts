/**
 * The competition layer, driven.
 *   [GO-VIRAL V-4, §10, §20; Doctrine D-03, D-19, D-25]
 *
 * > **Judged on:** *"A stranger with no account reaches a
 * > campaign, reads the rules, watches entries and enters, on a
 * > phone; and a campaign that is `listed: false` is reachable by
 * > its link and absent from every index."*
 *
 * THE ROUTES ARE CALLED, NOT READ. Whether an unlisted call stays
 * out of the index is a fact about what comes back from a GET, and
 * a source-text assertion that `publicCalls` appears in the file
 * is satisfied by a version that calls it and ignores the answer.
 *
 * AND THE ENTRY MEDIA IS THE ONE WORTH DRIVING TWICE. It is the
 * only route in this product that serves a stranger's recording to
 * another stranger, and what opens it is one predicate about one
 * tick box somebody pressed on a phone. Every way of not having
 * ticked it is a 404 below.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { Campaign } from '../../src/domain/campaign.js';
import type { ParticipationRequest } from '../../src/domain/participation.js';

let root: string;
type Handle = { params: Promise<{ handle: string }> };
type Entry = { params: Promise<{ handle: string; submissionId: string }> };

let INDEX: (r: Request) => Promise<Response>;
let CALL: (r: Request, c: Handle) => Promise<Response>;
let MEDIA: (r: Request, c: Entry) => Promise<Response>;
let ENTER: (r: Request, c: Handle) => Promise<Response>;
let OFFER: (r: Request) => Promise<Response>;
let TAKE_THIS: (
  r: Request, c: { params: Promise<{ kind: string; id: string }> },
) => Promise<Response>;

let newCampaign: typeof import('../../src/domain/campaignEdit.js').newCampaign;
let begin: typeof import('../../src/domain/campaignEdit.js').begin;
let setListed: typeof import('../../src/domain/campaignEdit.js').setListed;
let setTerms: typeof import('../../src/domain/campaignEdit.js').setTerms;
let newRequest: typeof import('../../src/domain/participationEdit.js').newRequest;
let consentFrom: typeof import('../../src/domain/consent.js').consentFrom;
let saveCampaign: typeof import('../../src/store/campaigns.js').saveCampaign;
let newChannel: typeof import('../../src/domain/channelEdit.js').newChannel;
let saveChannel: typeof import('../../src/store/channels.js').saveChannel;
let saveRequest: typeof import('../../src/store/requests.js').saveRequest;
let listRequests: typeof import('../../src/store/requests.js').listRequests;
let paths: typeof import('../../src/store/paths.js').paths;

const SONG = 'perf_gocall000000000';
const HASH = 'b'.repeat(64);
const NOW = '2026-06-01T10:00:00.000Z';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-go-'));
  process.env['BALANCEVID_VAR'] = root;
  ({
    newCampaign, begin, setListed, setTerms,
  } = await import('../../src/domain/campaignEdit.js'));
  ({ newRequest } = await import('../../src/domain/participationEdit.js'));
  ({ consentFrom } = await import('../../src/domain/consent.js'));
  ({ saveCampaign } = await import('../../src/store/campaigns.js'));
  ({ newChannel } = await import('../../src/domain/channelEdit.js'));
  ({ saveChannel } = await import('../../src/store/channels.js'));
  ({ saveRequest, listRequests } = await import('../../src/store/requests.js'));
  ({ paths } = await import('../../src/store/paths.js'));
  ({ GET: INDEX } = await import('../../app/api/go/route.js'));
  ({ GET: CALL } = await import('../../app/api/go/[handle]/route.js'));
  ({ GET: MEDIA } = await import(
    '../../app/api/go/[handle]/entries/[submissionId]/media/route.js'));
  ({ POST: ENTER } = await import('../../app/api/go/[handle]/enter/route.js'));
  ({ GET: OFFER } = await import('../../app/api/participate/route.js'));
  ({ POST: TAKE_THIS } = await import(
    '../../app/api/participate/[kind]/[id]/route.js'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A published song, open to anyone, as a producer would leave it. */
async function publishSong(listed = true): Promise<void> {
  await mkdir(paths.performance(SONG), { recursive: true });
  await writeFile(paths.performanceDocument(SONG), JSON.stringify({
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
    publication: {
      publishedAt: NOW, respondable: true, access: 'anyone', listed,
      planHash: 'gocall',
    },
  }), 'utf8');
}

async function openCall(spec: {
  title?: string; listed?: boolean; terms?: string; live?: boolean;
} = {}): Promise<Campaign> {
  const at = new Date();
  const campaign = newCampaign({
    title: spec.title ?? 'Sing the second verse',
    track: { kind: 'performance', id: SONG },
    rules: {
      asks: 'Sing the second verse, outdoors',
      criteria: 'Tuning, feel, and whether it sounds like you',
      prize: 'A day in the studio',
    },
    window: {
      respondable: true, access: 'anyone',
      opensAt: new Date(at.getTime() - 3_600_000).toISOString(),
      closesAt: new Date(at.getTime() + 7 * 86_400_000).toISOString(),
    },
    now: at.toISOString(),
  });
  if (spec.live !== false) begin(campaign, at.toISOString());
  if (spec.listed === false) setListed(campaign, false);
  if (spec.terms) setTerms(campaign, spec.terms, at.toISOString());
  await saveCampaign(campaign);
  return campaign;
}

/** Somebody who entered, with the media on disk. */
async function anEntry(spec: {
  campaign: string; permits?: string[]; withdrawn?: boolean;
  submissionId?: string; claimed?: boolean;
}): Promise<ParticipationRequest> {
  const consent = spec.permits
    ? consentFrom({ termsHash: HASH, permits: spec.permits }, NOW) : null;
  if (consent && spec.withdrawn) consent.withdrawnAt = NOW;
  const submissionId = spec.submissionId ?? 'sub_one';
  const request = newRequest({
    holder: { kind: 'performance', id: SONG },
    assignment: {
      kind: 'performance',
      asks: 'sing',
      reference: { title: 'The Long Way Round', durationSamples: 48000 * 60 },
    },
    allowed: { video: true, takes: 3 },
    token: 'a-token-long-enough-to-be-a-credential',
    campaign: spec.campaign as never,
    ...(spec.claimed ? { claimed: true } : {}),
    now: NOW,
  });
  if (consent) request.consent = consent;
  request.submissions = [{
    id: submissionId as never, assetId: submissionId, kind: 'video', at: NOW,
  }];
  await saveRequest(request);
  await mkdir(paths.requestAssets(request.id), { recursive: true });
  await writeFile(
    paths.requestAsset(request.id, submissionId, 'webm'), 'a recording', 'utf8');
  return request;
}

const index = async () => (await INDEX(
  new Request('http://local/api/go'))).json();

const page = async (handle: string) => {
  const response = await CALL(
    new Request(`http://local/api/go/${handle}`),
    { params: Promise.resolve({ handle }) });
  return { status: response.status, body: await response.json() };
};

const media = (handle: string, submissionId: string) => MEDIA(
  new Request(`http://local/api/go/${handle}/entries/${submissionId}/media`),
  { params: Promise.resolve({ handle, submissionId }) });

const enter = (handle: string) => ENTER(
  new Request(`http://local/api/go/${handle}/enter`, { method: 'POST' }),
  { params: Promise.resolve({ handle }) });

beforeEach(async () => {
  await rm(join(root, 'accounts'), { recursive: true, force: true });
  await publishSong();
});

/* ------------------------------------------------------------------ *
 *  REACHABLE BY ITS LINK, ABSENT FROM EVERY INDEX.
 * ------------------------------------------------------------------ */

describe('the directory', () => {
  it('lists a call that was opened and listed', async () => {
    const call = await openCall();
    const { calls } = await index();
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe(call.id);
    expect(calls[0].at).toBe(`/go/${call.slug}`);
    expect(calls[0].listed).toBe(true);
  });

  /*
   * THE SECOND JUDGING CLAUSE, AND BOTH HALVES OF IT. Out of
   * every index, still at its address — the two properties that
   * must not collapse into each other.
   */
  it('leaves an unlisted call out, and its page still answers', async () => {
    const call = await openCall({ listed: false });
    expect((await index()).calls).toEqual([]);
    expect((await OFFER(new Request('http://local/api/participate'))
      .then((r) => r.json())).calls).toEqual([]);

    const bySlug = await page(call.slug!);
    expect(bySlug.status).toBe(200);
    expect(bySlug.body.call.id).toBe(call.id);
    expect(bySlug.body.call.listed).toBe(false);
  });

  /* And the same answer by id, for a call that never named an address. */
  it('answers by id as well as by slug', async () => {
    const call = await openCall();
    expect((await page(call.id)).body.call.id).toBe(call.id);
    expect((await page(call.slug!)).body.call.id).toBe(call.id);
  });

  it('says nothing about a call that is not there', async () => {
    const missing = await page('camp_nothing');
    expect(missing.status).toBe(404);
    expect(missing.body.error).toBe('no such call');
  });

  /*
   * AND THE CALLS JOIN THE ANSWER THE TAKE APP ALREADY FETCHES,
   * rather than becoming a second feed. [§10]
   */
  it('joins the offer the Take App already asks for', async () => {
    const call = await openCall();
    const offered = await (await OFFER(
      new Request('http://local/api/participate'))).json();
    expect(offered.calls.map((one: { id: string }) => one.id)).toEqual([call.id]);
    /* And the three kinds of thing are still where they were. */
    expect(Array.isArray(offered.participate)).toBe(true);
  });

  /*
   * THE TRACK IS WITHHELD FROM BOTH. A directory of competitions
   * that named the performances behind them would be a directory
   * of this installation's unpublished work. [D-03]
   */
  it('names no document anywhere in either index', async () => {
    await openCall();
    expect(JSON.stringify(await index())).not.toContain(SONG);
    expect(JSON.stringify(await (await OFFER(
      new Request('http://local/api/participate'))).json()
      .then((o: { calls: unknown }) => o.calls))).not.toContain(SONG);
  });
});

/* ------------------------------------------------------------------ *
 *  READS THE RULES.
 * ------------------------------------------------------------------ */

describe('the call page', () => {
  it('carries the rules, the criteria and the prize', async () => {
    const call = await openCall();
    const { body } = await page(call.slug!);
    expect(body.call.asks).toContain('Sing the second verse');
    expect(body.call.criteria).toContain('Tuning');
    expect(body.call.prize).toBe('A day in the studio');
    expect(body.call.says).toBeTruthy();
    expect(typeof body.call.msLeft).toBe('number');
  });

  /*
   * IT SAYS WHETHER ENTERING MEANS AGREEING, AND NOT TO WHAT. The
   * words are long and belong on the surface where somebody is
   * about to agree to them; a page promising nothing and then
   * meeting a wall of terms would be worse than one that says so.
   * [V-3]
   */
  it('says that terms will be asked for, without printing them', async () => {
    const plain = await openCall({ title: 'Plain' });
    expect((await page(plain.slug!)).body.call.asksConsent).toBe(false);

    const asked = await openCall({ title: 'Asked', terms: 'The exact words' });
    const { body } = await page(asked.slug!);
    expect(body.call.asksConsent).toBe(true);
    expect(JSON.stringify(body)).not.toContain('The exact words');
  });

  it('reports the loop, and no number it cannot take', async () => {
    const call = await openCall();
    await anEntry({ campaign: call.id, claimed: true, permits: ['entry'] });
    const { body } = await page(call.slug!);
    expect(body.numbers).toEqual({
      entries: 1, finishers: 1, arrivals: 1, arrivalsWhoEntered: 1,
    });
    expect(body.numbers).not.toHaveProperty('shares');
  });
});

/* ------------------------------------------------------------------ *
 *  WATCHES ENTRIES.
 * ------------------------------------------------------------------ */

describe('an entry on the wall', () => {
  it('is shown and plays when its maker agreed it could be', async () => {
    const call = await openCall();
    await anEntry({ campaign: call.id, permits: ['entry', 'display'] });

    const { body } = await page(call.slug!);
    expect(body.wall).toHaveLength(1);
    expect(body.wall[0].media)
      .toBe(`/api/go/${call.slug}/entries/sub_one/media`);

    const played = await media(call.slug!, 'sub_one');
    expect(played.status).toBe(200);
    expect(played.headers.get('content-type')).toContain('webm');
    expect(await played.text()).toBe('a recording');
  });

  /*
   * AND EVERY WAY OF NOT HAVING AGREED IS THE SAME 404, driven
   * against the route rather than the predicate: this is the only
   * place in the product that serves a stranger's recording to
   * another stranger.
   */
  it('is refused when its maker agreed to entry and not display', async () => {
    const call = await openCall();
    await anEntry({ campaign: call.id, permits: ['entry'] });
    expect((await page(call.slug!)).body.wall).toEqual([]);
    expect((await media(call.slug!, 'sub_one')).status).toBe(404);
  });

  it('is refused when there is no agreement at all', async () => {
    const call = await openCall();
    await anEntry({ campaign: call.id });
    expect((await page(call.slug!)).body.wall).toEqual([]);
    expect((await media(call.slug!, 'sub_one')).status).toBe(404);
  });

  /* And it stops being served the moment they take it back. [V-3] */
  it('stops playing once it is taken back', async () => {
    const call = await openCall();
    await anEntry({
      campaign: call.id, permits: ['entry', 'display'], withdrawn: true,
    });
    expect((await page(call.slug!)).body.wall).toEqual([]);
    expect((await media(call.slug!, 'sub_one')).status).toBe(404);
  });

  /* And another call's entry is not this call's to serve. */
  it('is refused through a call it does not belong to', async () => {
    const mine = await openCall({ title: 'Mine' });
    const theirs = await openCall({ title: 'Theirs' });
    await anEntry({ campaign: theirs.id, permits: ['entry', 'display'] });
    expect((await page(mine.slug!)).body.wall).toEqual([]);
    expect((await media(mine.slug!, 'sub_one')).status).toBe(404);
    expect((await media(theirs.slug!, 'sub_one')).status).toBe(200);
  });
});

/* ------------------------------------------------------------------ *
 *  AND ENTERS.
 * ------------------------------------------------------------------ */

describe('entering from the call page', () => {
  /*
   * THE DOOR THAT NAMES THE CALL, which is what V-2 said was
   * missing: *"with two live, a stranger pressing Take this song
   * has not chosen."* Two calls on one song, and the request still
   * lands in the right one.
   */
  it('stamps the call the page is, even with two open on one song', async () => {
    const mine = await openCall({ title: 'Mine' });
    await openCall({ title: 'Theirs' });

    const made = await enter(mine.slug!);
    expect(made.status).toBe(201);
    const body = await made.json();
    expect(body.take).toBe(`/take/${body.link}`);

    const [request] = await listRequests();
    expect(request!.campaign).toBe(mine.id);
    expect(request!.claimed).toBe(true);
  });

  /*
   * AND THE PERSON IS TOLD WHAT THE CALL ASKED FOR, NOT WHAT THE
   * SONG ASKS FOR.  [GO-VIRAL V-4, V-5; D-19]
   *
   * THE MOST FUNDAMENTAL JOIN IN THE FEATURE, AND IT WAS BROKEN.
   * An organiser writes an instruction, V-4 prints it on the
   * public page under WHAT TO DO, V-5 publishes the criteria a
   * panel will mark it against — and entering replaced it with
   * `claim`'s hardcoded `Sing along to "<title>"`. The entrant
   * recorded against a brief they were never given and was
   * judged on the one they were.
   *
   * ASSERTED ON WHAT REACHES THE RECORDER, which is
   * `assignment.asks` on the stored request: that is the string
   * the Take surface prints above the camera, so it is the only
   * place this claim can honestly be made.
   */
  it('gives the recorder the call\'s instruction, not the song\'s', async () => {
    const call = await openCall({ title: 'Outdoors, one take' });
    expect((await enter(call.slug!)).status).toBe(201);

    const [request] = await listRequests();
    expect(request!.assignment.asks).toBe('Sing the second verse, outdoors');
    expect(request!.assignment.asks).not.toMatch(/Sing along to/);
  });

  /*
   * AND A CALL IS THE ONLY THING THAT OVERRIDES IT. Somebody
   * arriving at the published song itself has no call and no
   * instruction, so the track's own sentence is the right thing
   * to say to them — and the fallback has to still be there.
   */
  it('leaves the song\'s own sentence where there is no call', async () => {
    expect((await TAKE_THIS(
      new Request(`https://studio.example/api/participate/music/${SONG}`,
        { method: 'POST' }),
      { params: Promise.resolve({ kind: 'music', id: SONG }) },
    )).status).toBe(201);
    const [request] = await listRequests();
    expect(request!.assignment.asks).toMatch(/^Sing along to /);
    expect(request!.campaign).toBeUndefined();
  });

  /* And it hands over the words, so the Take surface can show them. [V-3] */
  it('carries the terms into the Take surface', async () => {
    const call = await openCall({ terms: 'What you are agreeing to' });
    const body = await (await enter(call.slug!)).json();
    expect(body.request.terms.text).toBe('What you are agreeing to');
  });

  /*
   * AN UNLISTED CALL IS STILL ENTERABLE BY WHOEVER HAS THE
   * ADDRESS. That is what unlisted means, and a door that refused
   * would make it mean private.
   */
  it('works for an unlisted call', async () => {
    const call = await openCall({ listed: false });
    expect((await enter(call.slug!)).status).toBe(201);
  });

  /*
   * AND SAYS WHY WHEN IT WILL NOT. The page already prints the
   * state and the deadline, so the refusal leaks nothing and
   * saves somebody staring at a button that answered *no such
   * thing* about a page they are reading.
   */
  it('refuses a call that has not been opened, in its own words', async () => {
    const call = await openCall({ live: false });
    const refused = await enter(call.slug!);
    expect(refused.status).toBe(409);
    expect((await refused.json()).error).toBe('Not open yet.');
    expect(await listRequests()).toEqual([]);
  });

  it('says nothing about a call that is not there', async () => {
    expect((await enter('camp_nothing')).status).toBe(404);
  });

  /*
   * AND A KIND THIS PRODUCT DOES NOT HAVE IS NOT A CHANNEL.
   *   [GO-VIRAL V-4]
   *
   * FOUND BY MUTATION. `src/web/claim.ts` loads a performance, a
   * conversation or — last, with nothing left to test — a
   * channel. `isClaimKind` is what stops an unknown word reaching
   * that last branch, and with it always answering true,
   * `/api/participate/banana/<id>` minted a CHANNEL request
   * against a performance id. Nothing in the suite noticed,
   * because nothing had ever asked the door for a kind that does
   * not exist.
   */
  it('refuses a kind this product does not have', async () => {
    /*
     * AND IT IS ASKED AGAINST A CHANNEL, which is the fixture
     * that makes this mean anything. A bogus kind pointed at a
     * PERFORMANCE id is refused whatever the code does, because
     * `loadChannel` will not find it — so a suite that only ever
     * asked that way would pass over a door that treats every
     * unknown word as *programme*. The id below IS a published
     * channel, open to anyone: with the fall-through, this mints
     * a request. [T-5: a limit is only tested at the limit]
     */
    const channel = newChannel('The Evening Programme', 'UTC', NOW);
    channel.publication = {
      publishedAt: NOW, respondable: true, access: 'anyone', listed: true,
    } as never;
    await saveChannel(channel);
    expect((await TAKE_THIS(
      new Request(`http://local/api/participate/programme/${channel.id}`,
        { method: 'POST' }),
      { params: Promise.resolve({ kind: 'programme', id: channel.id }) })).status)
      .toBe(201);
    expect(await listRequests()).toHaveLength(1);

    for (const kind of ['banana', 'performance', 'channel', '']) {
      const asked = await TAKE_THIS(
        new Request(`http://local/api/participate/${kind}/${channel.id}`,
          { method: 'POST' }),
        { params: Promise.resolve({ kind, id: channel.id }) });
      expect(asked.status, kind).toBe(404);
    }
    expect(await listRequests(), 'nothing else was minted').toHaveLength(1);
  });

  /*
   * AND NOTHING ABOUT THE TRACK, EVER. A call whose performance
   * was unpublished under it answers in the other door's words,
   * because the existence of that document is not this call's to
   * disclose. [D-03]
   */
  it('refuses in the track\'s own voice when the song was withdrawn', async () => {
    const call = await openCall();
    await rm(paths.performance(SONG), { recursive: true, force: true });
    const refused = await enter(call.slug!);
    expect(refused.status).toBe(404);
    expect((await refused.json()).error)
      .toBe('that is not open for anybody to take part in');
  });
});

/* ------------------------------------------------------------------ *
 *  THE ONE CONDITION THE TWO DOORS DO NOT SHARE.
 * ------------------------------------------------------------------ */

describe('a song its producer did not list', () => {
  beforeEach(async () => {
    await rm(join(root, 'accounts'), { recursive: true, force: true });
    await publishSong(false);
  });

  /*
   * `listed` IS THE DISCOVERY DOOR'S CONDITION AND NOT THE CALL
   * PAGE'S, and this is the only behavioural difference between
   * the two ways in. It is driven rather than read because
   * `src/web/claim.ts` made everything else about them one
   * function, and the one thing that stayed different is
   * therefore the one thing a refactor could quietly lose.
   *
   * THE REASON FOR EACH ANSWER IS DIFFERENT, WHICH IS WHY BOTH
   * ARE RIGHT. An unlisted song a stranger reached by guessing an
   * id is not a thing to let them write to — discovery and
   * authorization are separate questions and that door needs both
   * answers. A call page IS a listing: its organiser published
   * it, and the track behind it is theirs to point at.
   */
  it('is refused by the discovery door and entered from the call page', async () => {
    const call = await openCall();

    const guessed = await TAKE_THIS(
      new Request(`http://local/api/participate/music/${SONG}`, { method: 'POST' }),
      { params: Promise.resolve({ kind: 'music', id: SONG }) });
    expect(guessed.status).toBe(404);
    expect(await listRequests()).toEqual([]);

    const entered = await enter(call.slug!);
    expect(entered.status).toBe(201);
    expect((await listRequests())[0]!.campaign).toBe(call.id);
  });

  /* And the song is still absent from the listing it was unlisted from. */
  it('is still absent from the offer', async () => {
    await openCall();
    const offered = await (await OFFER(
      new Request('http://local/api/participate'))).json();
    expect(offered.participate).toEqual([]);
  });
});
