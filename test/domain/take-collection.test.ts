/**
 * What came back.  [TAKE-APP T16; Doctrine D-03, D-25, D-19]
 *
 * > *"My collection are already produced TAKE of the person that
 * > was produced by the balancevid studio and generated. The
 * > owner of take can download it or share it through their
 * > phones."*
 *
 * THE ROUTE IS CALLED, NOT READ. Whether a participant is handed
 * the address of a published piece is a fact about what crosses
 * the wire to somebody holding a link, and a source-text test
 * that the field appears is satisfied by a version that hands it
 * out for an unpublished document. This drives the real door.
 *
 * TWO CONDITIONS AND THEY FAIL IN OPPOSITE DIRECTIONS. Withheld
 * when it should be given is a person who cannot find their own
 * work; GIVEN when it should be withheld is a stranger handed
 * the address of somebody's unpublished film, which is the one
 * this product cannot afford. Both are asserted.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let root: string;
let GET: (r: Request, c: { params: Promise<{ link: string }> })
=> Promise<Response>;
let newRequest: typeof import('../../src/domain/participationEdit.js').newRequest;
let advance: typeof import('../../src/domain/participationEdit.js').advance;
let saveRequest: typeof import('../../src/store/requests.js').saveRequest;
let linkFor: typeof import('../../src/store/requests.js').linkFor;
let paths: typeof import('../../src/store/paths.js').paths;
let write: typeof import('node:fs/promises').writeFile;
let mkdir: typeof import('node:fs/promises').mkdir;

const SONG = 'perf_t16000000000000';
const HASH = 'aa11bb22';
const AT = '2026-05-01T10:00:00.000Z';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-t16-'));
  process.env['BALANCEVID_VAR'] = root;
  ({ newRequest, advance } = await import('../../src/domain/participationEdit.js'));
  ({ saveRequest, linkFor } = await import('../../src/store/requests.js'));
  ({ paths } = await import('../../src/store/paths.js'));
  ({ writeFile: write, mkdir } = await import('node:fs/promises'));
  ({ GET } = await import('../../app/api/take/[link]/route.js'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/** A song, published or not, as a producer would leave it. */
async function song(published: boolean, withdrawn = false): Promise<void> {
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
    createdAt: AT,
    updatedAt: AT,
    ...(published ? {
      publication: {
        publishedAt: AT, respondable: true, access: 'anyone', planHash: HASH,
        ...(withdrawn ? { unpublishedAt: '2026-06-01T10:00:00.000Z' } : {}),
      },
    } : {}),
  }), 'utf8');
}

/** A request on that song, in whatever state the producer left it. */
async function took(state: 'created' | 'accepted' | 'rejected'): Promise<string> {
  const request = newRequest({
    holder: { kind: 'performance', id: SONG },
    assignment: {
      kind: 'performance',
      asks: 'Sing the second verse',
      watch: 'asset_song',
      reference: {
        title: 'The Long Way Round', durationSamples: 48000 * 60,
      },
    },
    allowed: { video: true, takes: 3 },
    token: 'secret-token-0001',
    claimed: true,
    now: AT,
  });
  if (state !== 'created') {
    advance(request, 'opened', AT);
    advance(request, 'recording', AT);
    advance(request, 'submitted', AT);
    advance(request, 'received', AT);
    advance(request, state, AT);
  }
  await saveRequest(request);
  return linkFor(request);
}

async function askedFor(link: string) {
  const answer = await GET(
    new Request(`http://local/api/take/${link}`),
    { params: Promise.resolve({ link }) });
  expect(answer.status).toBe(200);
  return (await answer.json() as {
    request?: { collection?: { title: string; watch: string; file: string } };
  }).request;
}

beforeEach(async () => {
  await rm(join(root, 'accounts'), { recursive: true, force: true });
});

describe('the finished work a take is in (T16)', () => {
  /*
   * THE WHOLE POINT. A person who sang into something and was
   * told *your take was used* was told the least interesting
   * true thing: the piece exists, it is published, and it has
   * their voice in it.
   */
  it('hands over the published work once the take was used', async () => {
    await song(true);
    const link = await took('accepted');
    expect((await askedFor(link))?.collection).toEqual({
      title: 'The Long Way Round',
      watch: `/p/${SONG}/watch`,
      file: `/api/performances/${SONG}/renders/${HASH}/file`,
    });
  });

  /*
   * AND IT IS THE PUBLISHED PLAN HASH, which is what makes the
   * file address one a stranger can already reach: the route
   * serves exactly the render the publication names, to
   * anybody. A different hash would be an owner-only address
   * handed to somebody who is not the owner — the fault this
   * field is one line away from being. [D-03]
   */
  it('names the render the publication names, and no other', async () => {
    await song(true);
    const link = await took('accepted');
    const said = (await askedFor(link))!.collection!;
    expect(said.file).toContain(`/renders/${HASH}/`);
  });

  /*
   * NOTHING WHILE THE PRODUCER HAS NOT PUBLISHED. A producer
   * who accepted a take and is still editing has an
   * unpublished document, and the existence of a draft is
   * private — from the person who is in it as much as from
   * anybody. [D-03]
   */
  it('says nothing about an unpublished piece', async () => {
    await song(false);
    const link = await took('accepted');
    expect((await askedFor(link))?.collection).toBeUndefined();
  });

  /* And nothing once it is taken down again. */
  it('stops once the piece is withdrawn', async () => {
    await song(true, true);
    const link = await took('accepted');
    expect((await askedFor(link))?.collection).toBeUndefined();
  });

  /*
   * AND NOTHING FOR A TAKE THAT WAS NOT USED. The piece is
   * published and this person is not in it; handing them its
   * address as *theirs* would be telling them about somebody
   * else's work and calling it their collection. The address
   * is public either way — what is wrong is the claim. [D-25]
   */
  it('says nothing to a take that was passed over', async () => {
    await song(true);
    const link = await took('rejected');
    expect((await askedFor(link))?.collection).toBeUndefined();
  });

  /* Nor to one nobody has decided about. */
  it('says nothing while the producer has not decided', async () => {
    await song(true);
    const link = await took('created');
    expect((await askedFor(link))?.collection).toBeUndefined();
  });

  /*
   * A LINK THAT IS NOT A LINK ANSWERS AS IT ALWAYS DID. The
   * collection is one more field on an answer whose refusals
   * are unchanged — a wrong link and a link that never existed
   * are still the same 404. [D-03]
   */
  it('leaves the refusal exactly as it was', async () => {
    await song(true);
    await took('accepted');
    const answer = await GET(
      new Request('http://local/api/take/req_nope.wrong'),
      { params: Promise.resolve({ link: 'req_nope.wrong' }) });
    expect(answer.status).toBe(404);
  });
});
