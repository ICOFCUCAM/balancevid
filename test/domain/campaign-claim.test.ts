/**
 * A hundred strangers, one call.
 *   [GO-VIRAL V-2; Doctrine D-25, D-19]
 *
 * > **Judged on:** *"A hundred claimed requests under one campaign
 * > are listed as one call in the inbox; every request made before
 * > this stage reads and behaves exactly as it did."*
 *
 * THE ROUTE IS CALLED, NOT READ. Whether a request is stamped with
 * the call it answers is a fact about what lands on disk when
 * somebody presses a button, and a source-text assertion that the
 * stamp appears in the file is satisfied by a version that stamps
 * the wrong thing. This drives the real door.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { entriesIn } from '../../src/domain/campaign.js';

let root: string;
let POST: (r: Request, c: { params: Promise<{ kind: string; id: string }> })
=> Promise<Response>;
let newCampaign: typeof import('../../src/domain/campaignEdit.js').newCampaign;
let begin: typeof import('../../src/domain/campaignEdit.js').begin;
let saveCampaign: typeof import('../../src/store/campaigns.js').saveCampaign;
let listRequests: typeof import('../../src/store/requests.js').listRequests;
let paths: typeof import('../../src/store/paths.js').paths;
let write: typeof import('node:fs/promises').writeFile;
let mkdir: typeof import('node:fs/promises').mkdir;
let claimable: typeof import('../../src/web/claim.js').claimable;
let readFile: typeof import('node:fs/promises').readFile;

const SONG = 'perf_v2call0000000000';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-call-'));
  process.env['BALANCEVID_VAR'] = root;
  ({ newCampaign, begin } = await import('../../src/domain/campaignEdit.js'));
  ({ saveCampaign } = await import('../../src/store/campaigns.js'));
  ({ listRequests } = await import('../../src/store/requests.js'));
  ({ paths } = await import('../../src/store/paths.js'));
  ({ writeFile: write, mkdir } = await import('node:fs/promises'));
  ({ POST } = await import('../../app/api/participate/[kind]/[id]/route.js'));
  ({ claimable } = await import('../../src/web/claim.js'));
  ({ readFile } = await import('node:fs/promises'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A published song, open to anyone, as a producer would leave it. */
async function publishSong(): Promise<void> {
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
    createdAt: '2026-05-01T10:00:00.000Z',
    updatedAt: '2026-05-01T10:00:00.000Z',
    publication: {
      publishedAt: '2026-05-01T10:00:00.000Z',
      respondable: true, access: 'anyone', planHash: 'deadbeef',
    },
  }), 'utf8');
}

/** A call on that song, live now. */
async function openCall(title = 'Sing the second verse'): Promise<string> {
  const now = new Date();
  const campaign = newCampaign({
    title,
    track: { kind: 'performance', id: SONG },
    rules: { asks: 'Sing the second verse, outdoors' },
    window: {
      respondable: true, access: 'anyone',
      opensAt: new Date(now.getTime() - 3_600_000).toISOString(),
      closesAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
    },
    now: now.toISOString(),
  });
  begin(campaign, now.toISOString());
  await saveCampaign(campaign);
  return campaign.id;
}

const press = () => POST(
  new Request(`http://local/api/participate/music/${SONG}`, { method: 'POST' }),
  { params: Promise.resolve({ kind: 'music', id: SONG }) },
);

beforeEach(async () => {
  await rm(join(root, 'accounts'), { recursive: true, force: true });
  await publishSong();
});

describe('a stranger pressing "Take this song"', () => {
  /*
   * THE WHOLE OF THE JUDGING CRITERION. Three presses, one call,
   * one row — and before this stage the same three presses were
   * three rows that looked exactly like three people the producer
   * had invited by name.
   */
  it('answers the call that is open, and the inbox shows one', async () => {
    const call = await openCall();
    for (let n = 0; n < 3; n += 1) expect((await press()).status).toBe(201);

    const made = await listRequests();
    expect(made).toHaveLength(3);
    for (const one of made) expect(one.campaign).toBe(call);

    const groups = entriesIn(made);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.campaign).toBe(call);
    expect(groups[0]!.requests).toHaveLength(3);
  });

  /*
   * AND A SONG WITH NO CALL IS WHAT EVERY SONG WAS. The request
   * carries no campaign, the inbox draws it as its own row, and
   * nothing about it reads differently from a request issued
   * before campaigns existed.
   */
  it('answers no call where there is none, exactly as before', async () => {
    expect((await press()).status).toBe(201);
    const [one] = await listRequests();
    expect(one!.campaign).toBeUndefined();
    expect(one!.claimed).toBe(true);
    expect(entriesIn(await listRequests())).toHaveLength(1);
  });

  /*
   * A CALL THAT HAS NOT OPENED CLAIMS NOTHING. The song is still
   * open to anyone — that is the producer's own setting and V-1's
   * clock governs it — but the entry belongs to no competition,
   * because the competition has not started.
   */
  it('answers no call that is only scheduled', async () => {
    const now = new Date();
    const campaign = newCampaign({
      title: 'Next week',
      track: { kind: 'performance', id: SONG },
      rules: { asks: 'sing' },
      window: {
        respondable: true, access: 'anyone',
        opensAt: new Date(now.getTime() + 86_400_000).toISOString(),
        closesAt: new Date(now.getTime() + 7 * 86_400_000).toISOString(),
      },
      now: now.toISOString(),
    });
    await saveCampaign(campaign);
    expect((await press()).status).toBe(201);
    expect((await listRequests())[0]!.campaign).toBeUndefined();
  });

  /*
   * WITH TWO CALLS OPEN, A STRANGER HAS NOT CHOSEN. This door
   * names a song, not a call; guessing would put somebody's entry
   * in a competition they never read the rules of. They still get
   * to sing. [GO-VIRAL §3, V-4]
   */
  it('answers neither of two open calls, and still lets them sing', async () => {
    await openCall('France launch');
    await openCall('Global challenge');
    expect((await press()).status).toBe(201);
    const [one] = await listRequests();
    expect(one!.campaign).toBeUndefined();
  });

  /*
   * A CALL CLOSING DOES NOT SHUT A SONG ITS PRODUCER LEFT OPEN,
   * and the 201 here is right rather than a leak.
   *
   * TWO CLOCKS, TWO MEANINGS. The song's window is the producer
   * saying *anybody may send me a take of this*; the call's is a
   * competition on that song with its own deadline. When the
   * competition shuts, somebody may still sing — they are simply
   * not in it, and the entry carries no call. A producer who
   * wants both to shut together sets both, which is what V-1
   * gave them.
   *
   * Found by watching the real door: the fourth press after the
   * deadline answered 201, and reading why is what turned an
   * implicit behaviour into a stated one.
   */
  it('still lets somebody sing after the call has closed, outside it', async () => {
    const call = await openCall();
    expect((await press()).status).toBe(201);

    /* The organiser brings the deadline forward. */
    const { loadCampaign, saveCampaign: save } =
      await import('../../src/store/campaigns.js');
    const shut = await loadCampaign(call);
    shut.window = {
      ...shut.window,
      closesAt: new Date(Date.now() - 60_000).toISOString(),
    };
    await save(shut);

    expect((await press()).status).toBe(201);
    const made = (await listRequests()).sort(
      (a, b) => a.createdAt.localeCompare(b.createdAt));
    expect(made).toHaveLength(2);
    expect(made[0]!.campaign).toBe(call);
    expect(made[1]!.campaign).toBeUndefined();
    /* And the call's own count did not move. */
    expect(made.filter((one) => one.campaign === call)).toHaveLength(1);
  });

  /*
   * AND A CALL ON A DIFFERENT SONG IS NOT THIS SONG'S. Obvious,
   * and the kind of thing a filter gets backwards once.
   */
  it('answers no call belonging to something else', async () => {
    const now = new Date();
    const elsewhere = newCampaign({
      title: 'Another song entirely',
      track: { kind: 'performance', id: 'perf_somewhere_else0' },
      rules: { asks: 'sing' },
      window: {
        respondable: true, access: 'anyone',
        opensAt: new Date(now.getTime() - 3_600_000).toISOString(),
        closesAt: new Date(now.getTime() + 86_400_000).toISOString(),
      },
      now: now.toISOString(),
    });
    begin(elsewhere, now.toISOString());
    await saveCampaign(elsewhere);
    expect((await press()).status).toBe(201);
    expect((await listRequests())[0]!.campaign).toBeUndefined();
  });
});

/**
 * THE BUTTON AND THE DOOR, ASKED SEPARATELY AND REQUIRED TO
 * AGREE.  [GO-VIRAL V-4; D-19, D-21]
 *
 * The call page drew ENTER from `callRow` — the CALL's clock and
 * state — and the route refused on the TRACK's conditions, which
 * only `claim` knew. A campaign whose song had been unpublished,
 * or withdrawn from strangers, or filled to the producer's
 * ceiling showed a live call with a working-looking button and
 * answered *that is not open for anybody to take part in* when
 * somebody pressed it. Advertising what you do not have.
 *
 * `claimable` is that gate, extracted and exported so the page
 * can ask it. What these tests hold up is the AGREEMENT: a
 * second copy of the conditions on the page would pass a test
 * of the page and fail this one the first time a condition
 * changed on one side only.
 */
describe('what the page is told and what the door does', () => {
  const ask = () => claimable({
    kind: 'music', id: SONG, now: new Date().toISOString(),
  });

  /** The published song, edited where it stands. */
  async function amend(change: (doc: Record<string, unknown>) => void) {
    const at = paths.performanceDocument(SONG);
    const doc = JSON.parse(await readFile(at, 'utf8')) as Record<string, unknown>;
    change(doc);
    await write(at, JSON.stringify(doc), 'utf8');
  }

  it('says open, and the door opens', async () => {
    await openCall();
    expect(await ask()).toBe('open');
    expect((await press()).status).toBe(201);
  });

  /*
   * TAKEN DOWN. The organiser's call is still live and still
   * worth reading; there is simply nothing behind it to answer.
   */
  it('says missing when the track was unpublished, and the door refuses',
    async () => {
      await openCall();
      await amend((doc) => {
        (doc['publication'] as Record<string, unknown>)['unpublishedAt']
          = '2026-06-01T10:00:00.000Z';
      });
      expect(await ask()).toBe('missing');
      expect((await press()).status).toBe(404);
    });

  /*
   * STILL PUBLISHED, NO LONGER OPEN TO STRANGERS. This is the
   * one the page got most wrong: everything a reader can see
   * says the competition is running.
   */
  it('says closed when the producer shut the door, and the door refuses',
    async () => {
      await openCall();
      await amend((doc) => {
        (doc['publication'] as Record<string, unknown>)['access'] = 'invited';
      });
      expect(await ask()).toBe('closed');
      expect((await press()).status).toBe(404);
    });

  /*
   * AND AT THE CEILING. `claimsAllowed` is the producer's own
   * bound and `claimsSoFar` counts what came through, so the
   * hundred-and-first stranger is told before they record
   * rather than after. [V-2]
   */
  it('says closed once the producer\u2019s ceiling is full', async () => {
    await openCall();
    await amend((doc) => {
      (doc['publication'] as Record<string, unknown>)['claims'] = 2;
    });
    expect((await press()).status).toBe(201);
    expect(await ask()).toBe('open');
    expect((await press()).status).toBe(201);
    expect(await ask()).toBe('closed');
    expect((await press()).status).toBe(404);
  });
});
