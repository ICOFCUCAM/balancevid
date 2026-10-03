/**
 * A submission may carry several sources.
 *   [TAKE-DESKTOP B-2; Doctrine D-19, D-25, U-06]
 *
 * > *"`RecordingSink` gains a track dimension — `track: 0` meaning
 * > what no track meant … Judged on: the phone app is
 * > byte-identical in behaviour, and a two-track submission joins
 * > correctly on the server."*
 *
 * BOTH HALVES ARE TESTED HERE AND THEY PULL AGAINST EACH OTHER,
 * which is why they are in one file. Every assertion that a
 * four-camera capture arrives as four angles of one take is an
 * assertion about a code path a phone must never enter, and the
 * only way to know it never does is to drive the phone's own path
 * through the same route and read what it wrote.
 *
 * THE ROUTE IS CALLED, NOT READ. A source-text test would say the
 * word `track` appears in the right files; it would not have
 * caught the first draft of this stage, which parsed the track
 * list correctly and then dropped the phone's `hintSamples` on the
 * floor because they live at the top of the body and not inside a
 * track. The assertions below are on the request document that
 * came out.
 */

import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MOST_ANGLES } from '../../shared/src/capture.js';
import {
  type ParticipationRequest, type Submission, takesLeft, takesMade,
} from '../../src/domain/participation.js';
import { anglesOf, angleSays, captureSpread, isAngle } from '../../src/domain/angles.js';

/*
 * `paths.ts` resolves VAR_ROOT once, when it first loads, so the
 * temporary directory has to be in the environment before the module
 * graph is — which is why the store and the route are imported here
 * rather than at the top of the file.
 */
let root: string;
type Called = { params: Promise<{ link: string; submissionId: string }> };
let POST: (r: Request, c: Called) => Promise<Response>;
let PUT: (r: Request, c: Called) => Promise<Response>;
let DELETE: (r: Request, c: Called) => Promise<Response>;
let newRequest: typeof import('../../src/domain/participationEdit.js').newRequest;
let openLink: typeof import('../../src/domain/participationEdit.js').open;
let saveRequest: typeof import('../../src/store/requests.js').saveRequest;
let loadRequest: typeof import('../../src/store/requests.js').loadRequest;
let linkFor: typeof import('../../src/store/requests.js').linkFor;
let paths: typeof import('../../src/store/paths.js').paths;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-tracks-'));
  process.env['BALANCEVID_VAR'] = root;
  ({ newRequest, open: openLink } = await import(
    '../../src/domain/participationEdit.js'));
  ({ saveRequest, loadRequest, linkFor } = await import('../../src/store/requests.js'));
  ({ paths } = await import('../../src/store/paths.js'));
  ({ POST, PUT, DELETE } = await import(
    '../../app/api/take/[link]/submissions/[submissionId]/route.js'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

const NOW = '2026-02-01T10:00:00.000Z';
const TOKEN = 'a-token-long-enough-to-be-a-credential';

let request: ParticipationRequest;
let link: string;

/** A performance request that will take four goes. */
async function openRequest(takes = 4): Promise<void> {
  request = newRequest({
    holder: { kind: 'performance', id: 'perf_one' },
    assignment: {
      kind: 'performance',
      asks: 'sing the second verse',
      reference: { title: 'the master', durationSamples: 48000 * 60 },
    },
    allowed: { video: true, audio: true, takes },
    token: TOKEN,
    now: NOW,
  });
  /* Somebody has followed the link, which is what the POST that
     declares a recording does before any of this. */
  openLink(request, NOW);
  await saveRequest(request);
  link = linkFor(request);
}

/** One segment, for one camera. */
async function chunk(
  submissionId: string, index: number, bytes: string, track?: number,
): Promise<Response> {
  const query = `?index=${index}${track === undefined ? '' : `&track=${track}`}`;
  return POST(
    new Request(`http://local/api/take/${link}/submissions/${submissionId}${query}`, {
      method: 'POST', body: bytes,
    }),
    { params: Promise.resolve({ link, submissionId }) },
  );
}

/** Send it. */
async function send(submissionId: string, body: unknown): Promise<Response> {
  return PUT(
    new Request(`http://local/api/take/${link}/submissions/${submissionId}`, {
      method: 'PUT', body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    }),
    { params: Promise.resolve({ link, submissionId }) },
  );
}

const submissions = async (): Promise<Submission[]> =>
  (await loadRequest(request.id)).submissions ?? [];

const mediaOf = async (assetId: string): Promise<string> =>
  readFile(paths.requestAsset(request.id, assetId, 'webm'), 'utf8');

beforeEach(async () => {
  await rm(join(root, 'accounts'), { recursive: true, force: true });
  await openRequest();
});

/* ------------------------------------------------------------------ *
 *  THE PHONE, WHICH MUST NOT HAVE CHANGED AT ALL.
 * ------------------------------------------------------------------ */

describe('one camera, which is every phone there is', () => {
  /*
   * THE WHOLE OF "BYTE-IDENTICAL IN BEHAVIOUR" IN ONE TEST. A phone
   * passes no track anywhere — not on the segment, not in the send —
   * and what lands is one submission under the submission's own id
   * with no membership on it at all. A capture of one is not a
   * capture; it is a recording, exactly as it was before captures
   * existed.
   */
  it('writes one asset under the submission id and joins no capture', async () => {
    const id = 'sub_phone';
    expect((await chunk(id, 0, 'hel')).status).toBe(202);
    expect((await chunk(id, 1, 'lo!')).status).toBe(202);
    const sent = await send(id, {
      hintSamples: 480, elapsedSamples: 96000, latencySamples: 12, device: 'a phone',
    });
    expect(sent.status).toBe(201);

    const [one, ...rest] = await submissions();
    expect(rest).toHaveLength(0);
    expect(one!.assetId).toBe(id);
    expect(one!.capturedIn).toBeUndefined();
    expect(isAngle(one as never)).toBe(false);
    /* The measurements are the ones at the top of the body. */
    expect(one!.offsetSamples).toBe(480);
    expect(one!.durationSamples).toBe(96000);
    expect(one!.device).toBe('a phone');
    /* And the segments were joined in their own order. */
    expect(await mediaOf(id)).toBe('hello!');

    /*
     * AND IT SPENDS A TAKE, which is the half of the capture count
     * that is easiest to lose: a recording belonging to no capture
     * counts itself, exactly as it did before captures existed.
     */
    const after = await loadRequest(request.id);
    expect(takesMade(after)).toBe(1);
    expect(takesLeft(after)).toBe(3);
    expect((await sent.json() as { request: { submitted: number } })
      .request.submitted).toBe(1);
  });

  /*
   * THE DIRECTORY IS THE ONE IT ALWAYS WAS, which is what lets a
   * recording already in flight when the server was upgraded still
   * join. Asserted on the path rather than on the join, because the
   * join would pass either way the first time and fail for the
   * upgrade case nobody can reproduce afterwards.
   */
  it('puts a trackless segment exactly where it always went', async () => {
    await chunk('sub_where', 0, 'x');
    const old = join(paths.request(request.id), 'chunks', 'sub_where', '000000.part');
    expect(await stat(old).then(() => true)).toBe(true);
    expect(paths.requestChunks(request.id, 'sub_where')).toBe(
      join(paths.request(request.id), 'chunks', 'sub_where'));
  });

  /* An empty send is the message it has always been. */
  it('refuses a send with nothing recorded', async () => {
    const sent = await send('sub_empty', { hintSamples: 0 });
    expect(sent.status).toBe(400);
    expect((await sent.json() as { error: string }).error).toBe('nothing was recorded');
  });
});

/* ------------------------------------------------------------------ *
 *  THE CAPTURE STATION.
 * ------------------------------------------------------------------ */

describe('four cameras, which is one take', () => {
  /** Four angles, each with its own bytes. */
  async function fourAngles(id = 'sub_station'): Promise<void> {
    for (const track of [0, 1, 2, 3]) {
      await chunk(id, 0, `cam${track}-a`, track);
      await chunk(id, 1, `cam${track}-b`, track);
    }
  }

  it('joins each camera into its own asset', async () => {
    const id = 'sub_station';
    await fourAngles(id);
    const sent = await send(id, {
      tracks: [
        { track: 0, offsetSamples: 0, elapsedSamples: 96000, device: 'Camera A' },
        { track: 1, offsetSamples: 19, elapsedSamples: 96000, device: 'Camera B' },
        { track: 2, offsetSamples: 24, elapsedSamples: 96000, device: 'Camera C' },
        { track: 3, offsetSamples: 29, elapsedSamples: 96000, device: 'Camera D' },
      ],
    });
    expect(sent.status).toBe(201);

    const made = await submissions();
    expect(made).toHaveLength(4);
    /*
     * TRACK 0 KEEPS THE SUBMISSION'S OWN ID and the rest are
     * suffixed, which is what every surface that already resolves a
     * submission's media expects to find.
     */
    expect(made.map((one) => one.assetId)).toEqual([
      'sub_station', 'sub_station-t1', 'sub_station-t2', 'sub_station-t3',
    ]);
    /* And no camera's bytes went into another camera's file. */
    expect(await mediaOf('sub_station')).toBe('cam0-acam0-b');
    expect(await mediaOf('sub_station-t3')).toBe('cam3-acam3-b');
    expect(made.map((one) => one.device)).toEqual(
      ['Camera A', 'Camera B', 'Camera C', 'Camera D']);
  });

  /*
   * BOUNDED, BECAUSE IT ARRIVES FROM SOMEWHERE ELSE. The device is
   * free text that nothing decides anything from, which is a reason
   * not to parse it and not a reason to write a kilobyte of it into
   * a producer's request document once per camera.
   */
  it('cuts a device name down to what a producer can read', async () => {
    const id = 'sub_shouty';
    await chunk(id, 0, 'x', 0);
    await send(id, { tracks: [{ track: 0, offsetSamples: 0, device: 'C'.repeat(500) }] });
    const [one] = await submissions();
    expect(one!.device).toHaveLength(120);
  });

  /*
   * AND A WHOLE USER AGENT IS NOT WHAT A PRODUCER CAN READ.
   *   [GO-VIRAL V-7; D-03]
   *
   * The Take App sent `navigator.userAgent`, so the request
   * document of somebody who was asked for no account held
   * eighty characters of build string, kept forever. The field
   * exists for *"which one is out"*, and the browser and the
   * platform answer it.
   *
   * SHORTENED AT THE SERVER, which is the half that matters: an
   * installed phone holds its own copy of the page, so a client
   * that has not updated is the one this has to cover. Driven
   * through the route for that reason. [`deviceSays`]
   */
  it('does not keep a whole user agent', async () => {
    const id = 'sub_agent';
    await chunk(id, 0, 'x');
    await send(id, {
      elapsedSamples: 96000,
      device: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36'
        + ' (KHTML, like Gecko) Chrome/153.0.8010.12 Mobile Safari/537.3',
    });
    const [one] = await submissions();
    expect(one!.device).toBe('Chrome on Android');
  });

  /* And a camera's name is still a camera's name. [B-2] */
  it('leaves a camera name alone', async () => {
    const id = 'sub_named';
    await chunk(id, 0, 'x', 0);
    await send(id, {
      tracks: [{ track: 0, offsetSamples: 0, device: 'Hall · front' }],
    });
    expect((await submissions())[0]!.device).toBe('Hall · front');
  });

  /*
   * THE POINT OF THE WHOLE STAGE. Four submissions that an inbox can
   * tell are four views of one performance rather than four goes at
   * it — which is B-1's question, asked of a submission instead of a
   * take, and answered by B-1's own functions because a submission
   * carrying the same field is the same shape. [D-19]
   */
  it('makes them angles of one capture, readable by B-1', async () => {
    const id = 'sub_station';
    await fourAngles(id);
    await send(id, {
      tracks: [
        { track: 0, offsetSamples: 0 },
        { track: 1, offsetSamples: 19 },
        { track: 2, offsetSamples: 24 },
        { track: 3, offsetSamples: 29 },
      ],
    });

    const made = await submissions();
    for (const one of made) {
      expect(one.capturedIn?.id).toBe(id);
      expect(isAngle(one as never)).toBe(true);
    }
    expect(made.map((one) => one.capturedIn?.offsetSamples)).toEqual([0, 19, 24, 29]);
    /* Worked out from the offsets, not taken from the client. */
    expect(captureSpread(made as never[])).toBe(29);
    expect(anglesOf(made as never[], made[2] as never)).toHaveLength(4);
    expect(angleSays(made as never[], made[2] as never)).toContain('3');
  });

  /*
   * A CAPTURE IS ONE GO, HOWEVER MANY CAMERAS SAW IT. Without this a
   * request that allows four takes would be full after the first
   * capture, and the performer would be told they had used four when
   * they had sung once.
   */
  it('spends one of the request’s takes, not four', async () => {
    const id = 'sub_station';
    await fourAngles(id);
    const sent = await send(id, {
      tracks: [0, 1, 2, 3].map((track) => ({ track, offsetSamples: track })),
    });
    const after = await loadRequest(request.id);
    expect(takesMade(after)).toBe(1);
    expect(takesLeft(after)).toBe(3);

    /*
     * AND THE PERFORMER IS TOLD THE SAME NUMBER. Found by running
     * this against the product rather than against the model: the
     * document said three takes left and the answer on the wire
     * said four sent, which is two numbers from one function
     * disagreeing — the worst of the three kinds of survivor, and
     * the only one neither of them is wrong on its own. [T-3]
     */
    const view = (await sent.json() as { request: { submitted: number } }).request;
    expect(view.submitted).toBe(1);
  });

  /*
   * A LIMIT IS ONLY TESTED AT THE LIMIT.  [T-5]
   *
   * The first version of this file allowed four takes and sent
   * one capture, so the count went from nothing to one and never
   * came near the boundary. A capture station found what that
   * missed, after it had uploaded 42 MB: the first angle of the
   * LAST permitted capture makes the count reach the limit, and
   * the second angle is then refused by a guard that is about to
   * start a take — which only the first of the four does.
   */
  it('takes the last capture a request allows, all of it', async () => {
    await openRequest(1);
    const id = 'sub_last';
    await fourAngles(id);
    const sent = await send(id, {
      tracks: [0, 1, 2, 3].map((track) => ({ track, offsetSamples: track * 9 })),
    });
    expect(sent.status).toBe(201);
    expect(await submissions()).toHaveLength(4);
    const after = await loadRequest(request.id);
    expect(takesMade(after)).toBe(1);
    expect(takesLeft(after)).toBe(0);
  });

  /*
   * AND A FULL REQUEST IS STILL FULL. "An angle joining a capture
   * is not a new take" must not become "a capture is not a take".
   */
  it('refuses a second capture when the request allowed one', async () => {
    await openRequest(1);
    await fourAngles('sub_first');
    await send('sub_first', {
      tracks: [0, 1, 2, 3].map((track) => ({ track, offsetSamples: track })),
    });
    await fourAngles('sub_second');
    const sent = await send('sub_second', {
      tracks: [0, 1, 2, 3].map((track) => ({ track, offsetSamples: track })),
    });
    expect(sent.status).toBe(409);
    expect((await sent.json() as { error: string }).error)
      .toBe('this request accepts 1 submission(s) and has them');
    expect(await submissions()).toHaveLength(4);
  });

  /*
   * AND THE WAY PAST THE LIMIT IS SHUT. "An angle joining a
   * capture is not a new take" plus a client that sends the same
   * capture twice would be a door straight through the take
   * limit — four more angles on a request that allowed one.
   *
   * SENDING THE SAME RECORDING TWICE WAS ALWAYS WRONG, captures
   * or not: two rows in a producer's inbox with the same
   * performance in both. Nothing had noticed because no client
   * does it on purpose.
   */
  it('refuses a recording that has already been sent', async () => {
    await openRequest(1);
    await fourAngles('sub_cap');
    const first = await send('sub_cap', {
      tracks: [0, 1, 2, 3].map((track) => ({ track, offsetSamples: track })),
    });
    expect(first.status).toBe(201);
    /* The same send again, from a client that retried after an
       answer it did not see. */
    const again = await send('sub_cap', {
      tracks: [0, 1, 2, 3].map((track) => ({ track, offsetSamples: track })),
    });
    expect(again.status).toBe(409);
    expect((await again.json() as { error: string }).error)
      .toBe('that recording has already been sent');
    expect(await submissions()).toHaveLength(4);
  });

  /* A phone's single recording, sent twice, is refused the same way. */
  it('refuses one recording sent twice, with no capture involved', async () => {
    await openRequest(2);
    await chunk('sub_once', 0, 'only');
    expect((await send('sub_once', { hintSamples: 0 })).status).toBe(201);
    const again = await send('sub_once', { hintSamples: 0 });
    expect(again.status).toBe(409);
    expect(await submissions()).toHaveLength(1);
  });

  /*
   * THREE ANGLES SUBMITTED AS THOUGH THEY WERE THE CAPTURE is a
   * producer cutting to a camera that is not there. Said by number,
   * and nothing is written.
   */
  it('refuses a capture with an angle missing, by number', async () => {
    const id = 'sub_gap';
    await chunk(id, 0, 'cam0', 0);
    await chunk(id, 0, 'cam1', 1);
    const sent = await send(id, {
      tracks: [{ track: 0, offsetSamples: 0 }, { track: 1, offsetSamples: 3 },
        { track: 2, offsetSamples: 9 }],
    });
    expect(sent.status).toBe(400);
    expect((await sent.json() as { error: string }).error)
      .toBe('nothing was recorded on track 2');
    expect(await submissions()).toHaveLength(0);
  });

  /*
   * DELETING A RECORDING DELETES ALL OF IT. The second camera's
   * segments live BENEATH the first's directory for exactly this
   * reason: one `rm -r` of one directory, and DELETE never learned
   * that tracks exist.
   */
  it('throws every angle away together', async () => {
    const id = 'sub_binned';
    await fourAngles(id);
    const gone = await DELETE(
      new Request(`http://local/api/take/${link}/submissions/${id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ link, submissionId: id }) });
    expect(gone.status).toBe(200);
    for (const track of [0, 1, 2, 3]) {
      await expect(stat(paths.requestChunks(request.id, id, track))).rejects.toThrow();
    }
  });
});

/* ------------------------------------------------------------------ *
 *  WHAT ARRIVES FROM SOMEWHERE ELSE IS REFUSED, NOT REPAIRED.
 * ------------------------------------------------------------------ */

describe('a track number is believed or refused', () => {
  /*
   * A station that asks for track 8 has a bug. Writing its ninth
   * camera into track 7 beside the eighth would join two
   * performances into one file, of a plausible length, that nobody
   * can tell from a good one until they watch it.
   */
  it('refuses a segment above the ceiling rather than clamping it', async () => {
    const refused = await chunk('sub_high', 0, 'x', MOST_ANGLES);
    expect(refused.status).toBe(400);
    expect((await refused.json() as { error: string }).error)
      .toBe(`a track is 0 to ${MOST_ANGLES - 1}`);
    /* And the last one it does accept is accepted. */
    expect((await chunk('sub_high', 0, 'x', MOST_ANGLES - 1)).status).toBe(202);
  });

  it('refuses a segment on a negative or fractional track', async () => {
    expect((await chunk('sub_bad', 0, 'x', -1)).status).toBe(400);
    const half = await POST(
      new Request(`http://local/api/take/${link}/submissions/sub_bad?index=0&track=1.5`,
        { method: 'POST', body: 'x' }),
      { params: Promise.resolve({ link, submissionId: 'sub_bad' }) });
    expect(half.status).toBe(400);
  });

  /*
   * A REPEATED TRACK NUMBER would join one camera's bytes into two
   * submissions and call them two angles of the same moment.
   */
  it('refuses a send that names a track twice', async () => {
    const id = 'sub_twice';
    await chunk(id, 0, 'cam0', 0);
    await chunk(id, 0, 'cam1', 1);
    const sent = await send(id, {
      tracks: [{ track: 0, offsetSamples: 0 }, { track: 0, offsetSamples: 9 }],
    });
    expect(sent.status).toBe(400);
    expect(await submissions()).toHaveLength(0);
  });

  /*
   * MORE ANGLES THAN A CAPTURE MAY HAVE IS REFUSED BY THE SAME RULE
   * and not by a count of its own. A list of nine distinct tracks
   * must contain one that is out of range, so there is nothing a
   * separate length bound could refuse that this does not — which
   * is why the length bound was written, measured, and deleted.
   */
  it('refuses a send with more angles than a capture may have', async () => {
    const sent = await send('sub_many', {
      tracks: Array.from({ length: MOST_ANGLES + 1 }, (_one, track) => ({ track })),
    });
    expect(sent.status).toBe(400);
    expect((await sent.json() as { error: string }).error)
      .toBe(`each angle is a different track, 0 to ${MOST_ANGLES - 1}`);
  });

  /*
   * AN EMPTY LIST IS NOT A PHONE: a phone sends no list at all, and
   * the two are told apart in words, because a station whose camera
   * list came out empty has a bug and a phone has not.
   */
  it('refuses an empty track list rather than reading it as one camera', async () => {
    await chunk('sub_none', 0, 'x');
    const sent = await send('sub_none', { tracks: [] });
    expect(sent.status).toBe(400);
    expect((await sent.json() as { error: string }).error)
      .toBe('a capture has at least one angle');
    expect(await submissions()).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 *  THE SEAM BETWEEN THE TWO.
 * ------------------------------------------------------------------ */

describe('a capture of one', () => {
  /*
   * A LIST OF LENGTH ONE IS STILL NOT A CAPTURE. A station with a
   * single camera has made a recording, and a membership of one is a
   * badge saying "1 of 1" on every surface B-1 touches. `angleSays`
   * is already silent below two — this makes sure nothing is written
   * for it to be silent about.
   */
  it('carries no membership when a station sends one angle', async () => {
    const id = 'sub_solo';
    await chunk(id, 0, 'only', 0);
    expect((await send(id, { tracks: [{ track: 0, offsetSamples: 0 }] })).status).toBe(201);
    const [one] = await submissions();
    expect(one!.assetId).toBe(id);
    expect(one!.capturedIn).toBeUndefined();
  });

  /*
   * AND A CAPTURE WHOSE CAMERAS ALL STARTED TOGETHER HAS NO SPREAD,
   * so there is no number to record. Zero and absent mean the same
   * thing here, and writing zero would put a measurement on a
   * document that was never measured.
   */
  it('records no spread when the angles started together', async () => {
    const id = 'sub_together';
    await chunk(id, 0, 'a', 0);
    await chunk(id, 0, 'b', 1);
    await send(id, {
      tracks: [{ track: 0, offsetSamples: 0 }, { track: 1, offsetSamples: 0 }],
    });
    const made = await submissions();
    expect(made).toHaveLength(2);
    expect(made[0]!.capturedIn?.id).toBe(id);
    expect(made[0]!.capturedIn?.spreadSamples).toBeUndefined();
    expect(captureSpread(made as never[])).toBeNull();
  });

  /*
   * THE SPREAD IS A GAP, NOT THE LARGEST OFFSET. Every angle a
   * capture station sends is measured from the earliest of them, so
   * the smallest offset is nearly always zero and the two numbers
   * are nearly always equal — which is exactly the arithmetic
   * coincidence a fixture has to break. Nothing on the server
   * requires a common origin of zero: the offsets are against each
   * other, and a client that measured them from somewhere else has
   * still said how far apart they are.
   */
  it('measures the spread between the angles, wherever their zero is', async () => {
    const id = 'sub_offset';
    for (const track of [0, 1, 2]) await chunk(id, 0, `c${track}`, track);
    await send(id, {
      tracks: [{ track: 0, offsetSamples: 100 }, { track: 1, offsetSamples: 119 },
        { track: 2, offsetSamples: 129 }],
    });
    const made = await submissions();
    /* Recorded as sent, not rebased: an origin is not a measurement. */
    expect(made.map((one) => one.capturedIn?.offsetSamples)).toEqual([100, 119, 129]);
    expect(made[0]!.capturedIn?.spreadSamples).toBe(29);
    expect(captureSpread(made as never[])).toBe(29);
  });

  /*
   * A SECOND CAPTURE IS A SECOND GO. Two captures of four cameras
   * each are two takes against a request that allows four, and the
   * two sets of angles do not run together.
   */
  it('keeps two captures apart', async () => {
    for (const id of ['sub_first', 'sub_second']) {
      await chunk(id, 0, `${id}-0`, 0);
      await chunk(id, 0, `${id}-1`, 1);
      await send(id, {
        tracks: [{ track: 0, offsetSamples: 0 }, { track: 1, offsetSamples: 7 }],
      });
    }
    const made = await submissions();
    expect(made).toHaveLength(4);
    const after = await loadRequest(request.id);
    expect(takesMade(after)).toBe(2);
    expect(takesLeft(after)).toBe(2);
    expect(anglesOf(made as never[], made[0] as never)).toHaveLength(2);
    expect(anglesOf(made as never[], made[3] as never)).toHaveLength(2);
  });
});
