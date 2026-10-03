/**
 * The two-party corridor, driven through the doors.
 *   [GO-VIRAL V-8]
 *
 * > *"An installation BalanceVid operates, on which the network's
 * > campaigns live, and the four states that only mean something
 * > when there are two parties."*
 *
 * THE ROUTES ARE CALLED, NOT READ. Whether an installation that
 * is not the network can reach any of the four is a fact about
 * two modules agreeing — the flag read in the web layer and the
 * table in the domain — and no source-text assertion can check
 * that they agree.
 */

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let root: string;
type Id = { params: Promise<{ id: string }> };

let OPEN: (r: Request) => Promise<Response>;
let CALL: (r: Request, c: Id) => Promise<Response>;
let MOVE: (r: Request, c: Id) => Promise<Response>;
let INDEX: (r: Request) => Promise<Response>;
let OFFERS: (r: Request) => Promise<Response>;
let paths: typeof import('../../src/store/paths.js').paths;

const SONG = 'perf_network00000000';
const MADE = '2026-06-01T10:00:00.000Z';
const CLOSES = '2126-06-08T10:00:00.000Z';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-network-'));
  process.env['BALANCEVID_VAR'] = root;
  ({ paths } = await import('../../src/store/paths.js'));
  ({ POST: OPEN } = await import('../../app/api/campaigns/route.js'));
  ({ GET: CALL, POST: MOVE } = await import('../../app/api/campaigns/[id]/route.js'));
  ({ GET: INDEX } = await import('../../app/api/go/route.js'));
  ({ GET: OFFERS } = await import('../../app/api/participate/route.js'));
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
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

beforeEach(async () => {
  await rm(paths.campaigns(), { recursive: true, force: true });
});

afterEach(() => {
  delete process.env['BALANCEVID_REVIEW'];
});

async function open(title: string): Promise<{ id: string; state: string }> {
  const answer = await OPEN(new Request('https://studio.example/api/campaigns', {
    method: 'POST',
    body: JSON.stringify({
      title,
      track: { kind: 'performance', id: SONG },
      asks: 'Sing the second verse, outdoors',
      closesAt: CLOSES,
    }),
  }));
  const body = await answer.json() as { campaign?: { id: string; state: string } };
  expect(answer.status, JSON.stringify(body)).toBe(201);
  return { id: body.campaign!.id, state: body.campaign!.state };
}

async function move(id: string, action: string, by?: string): Promise<Response> {
  return MOVE(
    new Request(`https://studio.example/api/campaigns/${id}`, {
      method: 'POST',
      body: JSON.stringify({ action, ...(by ? { by } : {}) }),
    }),
    { params: Promise.resolve({ id }) });
}

async function stateOf(id: string): Promise<string> {
  const answer = await CALL(
    new Request(`https://studio.example/api/campaigns/${id}`),
    { params: Promise.resolve({ id }) });
  return ((await answer.json()) as { campaign: { state: string } }).campaign.state;
}

describe('an installation that is not the network', () => {
  it('opens a call straight into the calendar', async () => {
    expect((await open('Spring Song')).state).toBe('scheduled');
  });

  /*
   * AND CANNOT REACH THE FOUR, WITH NO CHECK ANYWHERE SAYING SO.
   * Its calls begin at SCHEDULED and `CAMPAIGN_NEXT` has no edge
   * back, so the state machine refuses every one of these in the
   * words it already uses. A guard in the route would be a second
   * answer to a question that is already answered. [D-19]
   */
  it('is refused every two-party verb, by the state machine', async () => {
    const { id } = await open('Spring Song');
    for (const action of ['submit', 'review', 'approve', 'back', 'schedule']) {
      const answer = await move(id, action);
      expect(answer.status, action).toBe(409);
      const said = (await answer.json() as { error: string }).error;
      expect(said, action).toMatch(/^a scheduled call cannot become /);
    }
    expect(await stateOf(id)).toBe('scheduled');
  });
});

describe('a call nobody has passed yet', () => {
  beforeEach(() => { process.env['BALANCEVID_REVIEW'] = '1'; });

  /*
   * NOT IN THE DIRECTORY IS NOT ENOUGH. A slug is set while a
   * call is being written, so a stranger who types the address
   * was served the whole call — found in a screenshot. A review
   * a guessed URL walks around is not a review. [D-03]
   */
  it('is not served to a stranger who has the address', async () => {
    const { id } = await open('Hidden draft');
    const AT = await import('../../app/api/go/[handle]/route.js');
    const ENTER = await import('../../app/api/go/[handle]/enter/route.js');
    type Handle = { params: Promise<{ handle: string }> };

    for (const handle of ['hidden-draft', id]) {
      const answer = await AT.GET(
        new Request(`https://studio.example/api/go/${handle}`),
        { params: Promise.resolve({ handle }) } as Handle);
      expect(answer.status, handle).toBe(404);
      /* And the door beside it answers the same way, rather than
         saying this call is not taking entries — which would
         confirm the call exists. */
      const door = await ENTER.POST(
        new Request(`https://studio.example/api/go/${handle}/enter`,
          { method: 'POST', body: '{}' }),
        { params: Promise.resolve({ handle }) } as Handle);
      expect(door.status, handle).toBe(404);
    }
  });

  /* And the moment it is passed, the address answers. */
  it('answers at its address once it is in the calendar', async () => {
    const { id } = await open('Hidden draft');
    for (const action of ['submit', 'review', 'approve', 'schedule']) {
      expect((await move(id, action)).status, action).toBe(200);
    }
    const AT = await import('../../app/api/go/[handle]/route.js');
    const answer = await AT.GET(
      new Request('https://studio.example/api/go/hidden-draft'),
      { params: Promise.resolve({ handle: 'hidden-draft' }) } as
        { params: Promise<{ handle: string }> });
    expect(answer.status).toBe(200);
  });
});

describe('the installation that reviews calls', () => {
  beforeEach(() => { process.env['BALANCEVID_REVIEW'] = '1'; });

  it('opens a call as a draft somebody has to hand in', async () => {
    expect((await open('Nationwide')).state).toBe('draft');
  });

  it('walks it in, looks at it, passes it and schedules it', async () => {
    const { id } = await open('Nationwide');
    for (const [action, became] of [
      ['submit', 'submitted'], ['review', 'review'],
      ['approve', 'approved'], ['schedule', 'scheduled'],
    ] as const) {
      const answer = await move(id, action, 'Kofi');
      expect(answer.status, action).toBe(200);
      expect(await stateOf(id), action).toBe(became);
    }
    /* And from there it is an ordinary call. */
    expect((await move(id, 'begin')).status).toBe(200);
    expect(await stateOf(id)).toBe('live');
  });

  it('sends one back to its author', async () => {
    const { id } = await open('Nationwide');
    await move(id, 'submit');
    await move(id, 'review', 'Kofi');
    expect((await move(id, 'back', 'Kofi')).status).toBe(200);
    expect(await stateOf(id)).toBe('draft');
  });

  /*
   * AND NOTHING IN THE CORRIDOR IS PUBLIC. *"The existence of a
   * draft is private."* Checked at both public doors, because
   * they are two listings and V-4's own lesson is that a field
   * added to one is a field missing from the other. [D-03, D-19]
   */
  it('shows none of the four at either public door', async () => {
    const { id } = await open('Nationwide');
    /* Listed by the organiser while they were writing it. */
    expect((await MOVE(
      new Request(`https://studio.example/api/campaigns/${id}`, {
        method: 'POST', body: JSON.stringify({ action: 'listed', listed: true }),
      }), { params: Promise.resolve({ id }) })).status).toBe(200);

    for (const action of ['submit', 'review', 'approve']) {
      const index = await (await INDEX(
        new Request('https://studio.example/api/go'))).json() as { calls: unknown[] };
      expect(index.calls, action).toEqual([]);
      const offers = await (await OFFERS(
        new Request('https://studio.example/api/participate'))).json() as
        { calls: unknown[] };
      expect(offers.calls, action).toEqual([]);
      await move(id, action);
    }

    /* And the moment it is in the calendar, both doors have it. */
    await move(id, 'schedule');
    const index = await (await INDEX(
      new Request('https://studio.example/api/go'))).json() as
      { calls: { id: string }[] };
    expect(index.calls.map((one) => one.id)).toEqual([id]);
    const offers = await (await OFFERS(
      new Request('https://studio.example/api/participate'))).json() as
      { calls: { id: string }[] };
    expect(offers.calls.map((one) => one.id)).toEqual([id]);
  });
});
