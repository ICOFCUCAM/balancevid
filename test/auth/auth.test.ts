/**
 * Authentication.  [Doctrine D-03, D-06, U-31]
 *
 * Two properties matter more than the rest and are tested first: an
 * unconfigured instance is LOCKED rather than open, and a route nobody
 * thought about is PRIVATE rather than public. Both are about what happens
 * when someone forgets something, which is the only interesting question an
 * auth system answers.
 */
import { describe, expect, it } from 'vitest';

import { hashPassword, isLocked, loadAuthConfig, verifyPassword } from '../../src/auth/config.js';
import {
  isPubliclyVisible, isPublicRepresentation, isAssetPath, mayBePublic,
} from '../../src/auth/policy.js';
import {
  clearedCookie, issueSession, readSession, sessionCookie, verifySession,
} from '../../src/auth/session.js';
import { OWNER_ACCOUNT_ID } from '../../src/domain/account.js';

const PASSWORD = 'correct-horse-battery-staple';
const HASH = hashPassword(PASSWORD);

describe('passwords', () => {
  it('accepts the right one and rejects the rest', () => {
    expect(verifyPassword(PASSWORD, HASH)).toBe(true);
    expect(verifyPassword('wrong', HASH)).toBe(false);
    expect(verifyPassword('', HASH)).toBe(false);
    expect(verifyPassword(`${PASSWORD} `, HASH)).toBe(false);
  });

  it('salts, so the same password twice is not the same hash', () => {
    expect(hashPassword(PASSWORD)).not.toBe(hashPassword(PASSWORD));
    expect(verifyPassword(PASSWORD, hashPassword(PASSWORD))).toBe(true);
  });

  it('never stores the password', () => {
    expect(HASH).not.toContain(PASSWORD);
    expect(HASH.startsWith('scrypt$')).toBe(true);
  });

  it('treats a corrupt hash as a wrong password, not as an error', () => {
    // A crash here and a rejection are distinguishable from outside, and the
    // difference tells an attacker whether a password is configured at all.
    for (const broken of ['', 'nonsense', 'scrypt$x$y$z', `scrypt$16384$8$1$salt$${'zz'}`]) {
      expect(verifyPassword(PASSWORD, broken)).toBe(false);
    }
  });

  it('compares the same way whatever the unicode form', () => {
    // A password typed on one keyboard and re-typed on another must match.
    const composed = 'café-passphrase-x';
    const decomposed = 'café-passphrase-x';
    expect(verifyPassword(decomposed, hashPassword(composed))).toBe(true);
  });
});

describe('an unconfigured instance', () => {
  it('is locked, not open', () => {
    expect(isLocked(loadAuthConfig({}))).toBe(true);
    expect(loadAuthConfig({}).passwordHash).toBeNull();
  });

  it('accepts a hash, or a plaintext password for the midnight case', () => {
    expect(isLocked(loadAuthConfig({ BALANCEVID_PASSWORD_HASH: HASH }))).toBe(false);
    const plain = loadAuthConfig({ BALANCEVID_PASSWORD: PASSWORD });
    expect(isLocked(plain)).toBe(false);
    expect(verifyPassword(PASSWORD, plain.passwordHash!)).toBe(true);
  });

  it('ignores whitespace-only configuration rather than locking on a space', () => {
    expect(isLocked(loadAuthConfig({ BALANCEVID_PASSWORD_HASH: '   ' }))).toBe(true);
  });
});

describe('sessions', () => {
  it('issues one that verifies', async () => {
    const { token } = await issueSession(HASH, 1);
    expect(await verifySession(token, HASH)).toBe(true);
  });

  it('refuses one that has expired', async () => {
    const now = Date.now();
    const { token } = await issueSession(HASH, 1, now);
    expect(await verifySession(token, HASH, now + 2 * 3600_000)).toBe(false);
  });

  it('refuses a tampered expiry, which is the obvious attack', async () => {
    const { token } = await issueSession(HASH, 1);
    const [version, , signature] = token.split('.');
    const forged = `${version}.${Date.now() + 10 ** 12}.${signature}`;
    expect(await verifySession(forged, HASH)).toBe(false);
  });

  it('refuses a token signed with a different password', async () => {
    const { token } = await issueSession(hashPassword('another-passphrase'), 1);
    expect(await verifySession(token, HASH)).toBe(false);
  });

  it('is invalidated by a password change, which is what a change is for', async () => {
    const { token } = await issueSession(HASH, 24);
    expect(await verifySession(token, HASH)).toBe(true);
    expect(await verifySession(token, hashPassword(PASSWORD))).toBe(false);
  });

  it('refuses nonsense without throwing', async () => {
    for (const bad of [undefined, null, '', 'x', 'a.b', 'a.b.c.d', 'v2.1.sig']) {
      expect(await verifySession(bad as string | undefined, HASH)).toBe(false);
    }
  });

  it('sets a cookie a script cannot read and a cross-site form cannot use', async () => {
    const { token, expiresAt } = await issueSession(HASH, 1);
    const cookie = sessionCookie(token, expiresAt, true);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('Path=/');
    // Plain HTTP (a local run) must not set Secure or the cookie is dropped.
    expect(sessionCookie(token, expiresAt, false)).not.toContain('Secure');
    expect(clearedCookie(true)).toContain('Max-Age=0');
  });
});

describe('what the holder of a Take link may reach', () => {
  const LINK = 'req_3f2a9c.H2jPiPA4GtdaquygrH1zSj0QBflud3PXteS72HPw96k';

  /*
   * THE SECOND SET OF PATHS A STRANGER MAY REACH, and the claim is the
   * room's, not the published-work one: reachable WITHOUT THE OWNER'S
   * SESSION, because the link is sent over WhatsApp to somebody with no
   * account. The route then checks the link itself. [D-25]
   */
  it('lets the page, its own API and the song through', () => {
    expect(mayBePublic(`/take/${LINK}`, 'GET')).toBe(true);
    expect(mayBePublic(`/api/take/${LINK}`, 'GET')).toBe(true);
    /* The one file the request lets them hear. [T6] */
    expect(mayBePublic(`/api/take/${LINK}/reference`, 'GET')).toBe(true);
  });

  /*
   * THE METHOD IS PART OF THE RULE, which this product learned from a
   * real hole: a path-only allowance on interventions also answered
   * DELETE. A participant may say they are recording, begin a
   * submission, send its bytes, and throw away a recording they have
   * not sent — and nothing else.
   */
  it('lets them record, submit and discard, and nothing else', () => {
    expect(mayBePublic(`/api/take/${LINK}`, 'POST')).toBe(true);
    expect(mayBePublic(`/api/take/${LINK}/submissions`, 'POST')).toBe(true);
    expect(mayBePublic(`/api/take/${LINK}/submissions/sub_1`, 'POST')).toBe(true);
    expect(mayBePublic(`/api/take/${LINK}/submissions/sub_1`, 'PUT')).toBe(true);
    /*
     * THE DELETE IS ONE PATH AND ONE THING.  [TAKE-APP T4]
     *
     * "Take 3 doesn't have to reach the server at all if they delete
     * it locally" — it does reach it, in segments, so discarding is
     * an explicit act. It is added as its OWN rule rather than by
     * loosening one, and it reaches a recording's segments and
     * nothing else; the route then refuses one already sent, because
     * what a performer may undo is their own decision not yet acted
     * on, never a producer's. [D-25]
     */
    expect(mayBePublic(`/api/take/${LINK}/submissions/sub_1`, 'DELETE'))
      .toBe(true);
    expect(mayBePublic(`/api/take/${LINK}`, 'DELETE')).toBe(false);
    expect(mayBePublic(`/api/take/${LINK}/submissions`, 'DELETE')).toBe(false);
    for (const method of ['PATCH']) {
      expect(mayBePublic(`/api/take/${LINK}`, method), method).toBe(false);
      expect(mayBePublic(`/api/take/${LINK}/submissions/sub_1`, method), method)
        .toBe(false);
    }
  });

  /*
   * AND NOTHING THE PRODUCER OWNS. The request's own routes are the only
   * ones the link opens; the performance it was issued for, the inbox
   * and every other request stay behind the session.
   */
  it('reaches nothing of the studio it came from', () => {
    for (const path of [
      '/api/performances/perf_one',
      '/api/performances/perf_one/requests',
      '/p/perf_one',
      '/api/take',
      '/api/take/',
    ]) {
      expect(mayBePublic(path, 'GET'), path).toBe(false);
      expect(mayBePublic(path, 'POST'), path).toBe(false);
    }
  });

  /* A link with no secret in it is not a link. */
  it('does not let a bare id through', () => {
    expect(mayBePublic('/take/req_3f2a9c', 'GET')).toBe(false);
    expect(mayBePublic('/api/take/req_3f2a9c', 'GET')).toBe(false);
    expect(mayBePublic('/api/take/req_3f2a9c', 'POST')).toBe(false);
  });
});

describe('what a stranger may reach', () => {
  it('lets a published conversation be read', () => {
    expect(mayBePublic('/c/conv_abc/watch', 'GET')).toBe(true);
    expect(mayBePublic('/c/conv_abc/article', 'GET')).toBe(true);
    expect(mayBePublic('/api/conversations/conv_abc/representations', 'GET')).toBe(true);
    expect(mayBePublic('/api/conversations/conv_abc/source', 'GET')).toBe(true);
    expect(mayBePublic('/api/published', 'GET')).toBe(true);
  });

  /*
   * A CHANNEL IS WATCHED, NOT DOWNLOADED.  [CHANNEL §17, D-18]
   *
   * The four paths a viewer needs, and the much longer list of things that
   * would hand them the broadcaster's working material instead.
   */
  it('lets a published channel be watched', () => {
    expect(mayBePublic('/t/chan_abc/watch', 'GET')).toBe(true);
    expect(mayBePublic('/api/channels/chan_abc/playlist', 'GET')).toBe(true);
    expect(mayBePublic('/api/channels/chan_abc/stream/4291', 'GET')).toBe(true);
    expect(mayBePublic('/api/channels/chan_abc/now', 'GET')).toBe(true);
  });

  it('keeps the gallery, the schedule and the live ingest private', () => {
    /* The document: the schedule, the ingests, the destinations, and every
       reference on disk. */
    expect(mayBePublic('/api/channels/chan_abc', 'GET')).toBe(false);
    /* The control room itself. */
    expect(mayBePublic('/t/chan_abc', 'GET')).toBe(false);
    /* Everything that could be scheduled, which is every finished render. */
    expect(mayBePublic('/api/channels/library', 'GET')).toBe(false);
    expect(mayBePublic('/api/channels', 'GET')).toBe(false);
    /* The pipe a broadcast arrives down. */
    expect(mayBePublic('/api/channels/chan_abc/live', 'GET')).toBe(false);
    expect(mayBePublic('/api/channels/chan_abc/live', 'POST')).toBe(false);
    /* A segment is a number. A path pattern that took a name would be a
       pattern somebody could walk out of. */
    expect(mayBePublic('/api/channels/chan_abc/stream/live', 'GET')).toBe(false);
    expect(mayBePublic('/api/channels/chan_abc/stream/../live', 'GET')).toBe(false);
  });

  it('never lets a stranger change a channel', () => {
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(mayBePublic('/t/chan_abc/watch', method)).toBe(false);
      expect(mayBePublic('/api/channels/chan_abc/playlist', method)).toBe(false);
      expect(mayBePublic('/api/channels/chan_abc/now', method)).toBe(false);
      expect(mayBePublic('/api/channels/chan_abc', method)).toBe(false);
    }
  });

  it('keeps the studio, the drafts list and the job queue private', () => {
    expect(mayBePublic('/', 'GET')).toBe(false);
    expect(mayBePublic('/c/conv_abc', 'GET')).toBe(false);
    expect(mayBePublic('/api/conversations', 'GET')).toBe(false);
    expect(mayBePublic('/api/conversations/conv_abc', 'GET')).toBe(false);
    expect(mayBePublic('/api/conversations/conv_abc/claims', 'GET')).toBe(false);
    expect(mayBePublic('/api/conversations/conv_abc/bundle', 'GET')).toBe(false);
    expect(mayBePublic('/api/conversations/conv_abc/transcript', 'GET')).toBe(false);
    expect(mayBePublic('/api/jobs/job_abc', 'GET')).toBe(false);
  });

  it('never allows a write to a published artefact', () => {
    // Reading a published artefact is the whole point of publishing it.
    // Changing one is not.
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(mayBePublic('/c/conv_abc/watch', method)).toBe(false);
      expect(mayBePublic('/api/conversations/conv_abc/source', method)).toBe(false);
      expect(mayBePublic('/api/published', method)).toBe(false);
    }
    expect(mayBePublic('/api/auth/signin', 'POST')).toBe(true);
  });

  it('lets a room\'s own writes reach a route that can judge them', () => {
    /*
     * The narrow exception, and the reason it is narrow.  [ROOM §6, §10]
     *
     * A guest joins from a forwarded link and records themselves once the
     * host stages them, so these paths must be REACHABLE without the owner's
     * session. Reachable is not permitted: each route then verifies a guest
     * session against that room's invite token, and a stranger gets the same
     * answer they would get for a conversation that does not exist.
     */
    for (const path of [
      '/api/conversations/conv_abc/room/join',
      '/api/conversations/conv_abc/room/presence',
      '/api/conversations/conv_abc/room/voice',
      '/api/conversations/conv_abc/interventions',
      '/api/conversations/conv_abc/takes/take_x/chunks',
      '/api/conversations/conv_abc/takes/take_x/finalize',
    ]) {
      expect(mayBePublic(path, 'POST'), path).toBe(true);
    }
  });

  it('and the METHOD is part of that rule, not just the path', () => {
    /*
     * This cost a real hole. The interventions path also answers DELETE, and
     * an allowance written as a path alone handed guests the ability to
     * delete the author's responses. A rule that names a route without naming
     * what may be done to it is not a rule about anything.
     */
    for (const method of ['DELETE', 'PATCH', 'PUT']) {
      expect(mayBePublic('/api/conversations/conv_abc/interventions', method), method)
        .toBe(false);
      expect(mayBePublic('/api/conversations/conv_abc/room/join', method), method).toBe(false);
    }
  });

  /*
   * AND A CHANNEL'S OWN ROOM IS A ROOM.  [CHANNEL §6, ROOM §6]
   *
   * A broadcast can open a room instead of borrowing a conversation's, so a
   * guest arriving at one is a guest arriving at a room and reaches it by
   * the same rules. The handlers behind these paths ARE the conversation
   * ones, re-exported — but the POLICY is matched on the path, so a route
   * that exists and a path the policy admits are two different facts and
   * both have to be true.
   */
  it('admits a channel\'s own room by exactly the same rules', () => {
    for (const path of [
      '/api/channels/chan_abc/room',
      '/api/channels/chan_abc/room/presence',
      '/api/channels/chan_abc/room/signal',
    ]) {
      expect(mayBePublic(path, 'GET'), path).toBe(true);
    }
    for (const path of [
      '/api/channels/chan_abc/room/join',
      '/api/channels/chan_abc/room/presence',
      '/api/channels/chan_abc/room/voice',
      '/api/channels/chan_abc/room/signal',
    ]) {
      expect(mayBePublic(path, 'POST'), path).toBe(true);
    }
  });

  it('and no wider than that — the rest of a channel stays the owner\'s', () => {
    /*
     * The failure this is written against: widening the room by matching
     * `/api/channels/[id]/` and something, rather than the six paths that
     * are a room. A channel's schedule, its live session, its destinations
     * and its playlist are the broadcaster's own desk, and a guest holding
     * an invite to the room must not reach any of them.
     */
    for (const path of [
      '/api/channels/chan_abc',
      '/api/channels/chan_abc/live',
      '/api/channels/chan_abc/room/qr',
      '/api/channels/chan_abc/roomx',
      '/api/channels',
    ]) {
      for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
        expect(mayBePublic(path, method), `${method} ${path}`).toBe(false);
      }
    }
    /* And the method rule holds here too. */
    for (const method of ['DELETE', 'PATCH', 'PUT']) {
      expect(mayBePublic('/api/channels/chan_abc/room/join', method), method).toBe(false);
    }
  });

  it('is private by default, so a route added tomorrow is not exposed', () => {
    expect(mayBePublic('/api/conversations/conv_abc/something-new', 'GET')).toBe(false);
    expect(mayBePublic('/admin', 'GET')).toBe(false);
    expect(mayBePublic('/api/whatever', 'GET')).toBe(false);
  });

  it('is not fooled by a path that merely looks public', () => {
    expect(mayBePublic('/api/conversations/a/watch/../../../conversations', 'GET')).toBe(false);
    expect(mayBePublic('/c/conv_abc/watch/../..', 'GET')).toBe(false);
    expect(mayBePublic('/api/publishedX', 'GET')).toBe(false);
    expect(mayBePublic('/api/published/../conversations', 'GET')).toBe(false);
  });

  it('serves build output but never application data as an asset', () => {
    expect(isAssetPath('/_next/static/chunk.js')).toBe(true);
    expect(isAssetPath('/favicon.ico')).toBe(true);
    expect(isAssetPath('/api/conversations')).toBe(false);
  });
});

describe('published means published', () => {
  const withPublication = (p: unknown) => ({ publication: p } as never);

  it('is visible once published and not before', () => {
    expect(isPubliclyVisible(withPublication(undefined))).toBe(false);
    expect(isPubliclyVisible(withPublication({ publishedAt: 'x' }))).toBe(true);
  });

  it('stops being visible when withdrawn', () => {
    expect(isPubliclyVisible(withPublication({ publishedAt: 'x', unpublishedAt: 'y' }))).toBe(false);
  });

  it('is visible even when the author refuses responses', () => {
    // Publishing and allowing responses are separate consents (U-31).
    expect(isPubliclyVisible(withPublication({ publishedAt: 'x', respondable: false }))).toBe(true);
  });

  it('shares the artefact but not the working material', () => {
    for (const id of ['manifest.json', 'article.html', 'captions.srt']) {
      expect(isPublicRepresentation(id)).toBe(true);
    }
    for (const id of ['render-plan.json', 'timeline.json', 'bundle.json', 'description.txt']) {
      expect(isPublicRepresentation(id)).toBe(false);
    }
    expect(isPublicRepresentation(null)).toBe(false);
  });
});

/**
 * The token names who it is for.  [U-24, D-06]
 *
 * One thing is bought here and it is worth being precise about what: a
 * request can now say WHICH account it belongs to, provably. Who may do what
 * is unchanged, and the signing key is still the instance's — a per-account
 * secret is unreachable from middleware, which has no filesystem.
 */
describe('a session names its account', () => {
  it('carries the account, and hands it back on verification', async () => {
    const now = Date.now();
    const { token } = await issueSession(HASH, 1, now);
    expect(token.startsWith('v3.')).toBe(true);
    const claim = await readSession(token, HASH, now);
    expect(claim?.account).toBe(OWNER_ACCOUNT_ID);
    /* And WHEN, which is what a revocation line is compared against. */
    expect(claim?.issuedAt).toBe(now);
  });

  /*
   * The two older shapes still verify and still name the owner — nobody is
   * signed out by a deploy — but neither can say when it was made, so
   * neither can be placed after a revocation line. [account.ts]
   */
  it('reads the older shapes, which cannot say when they were issued', async () => {
    const { token: v2 } = await issueV2Token(HASH, 1);
    expect((await readSession(v2, HASH))?.account).toBe(OWNER_ACCOUNT_ID);
    expect((await readSession(v2, HASH))?.issuedAt).toBeUndefined();

    const v1 = await issueLegacyToken(HASH, 1);
    expect((await readSession(v1, HASH))?.issuedAt).toBeUndefined();
  });

  /*
   * INSIDE THE SIGNATURE, NOT BESIDE IT — the property the whole step rests
   * on. A subject the holder can edit is a suggestion, not a claim, and a
   * token that could be relabelled would be a way to become somebody else
   * the day there is somebody else to become.
   */
  it('cannot be relabelled to a different account', async () => {
    const { token } = await issueSession(HASH, 1);
    const [, , issued, expiry, signature] = token.split('.');
    const forged = `v3.acct_someoneelse.${issued}.${expiry}.${signature}`;
    expect(await verifySession(forged, HASH)).toBe(false);
    expect(await readSession(forged, HASH)).toBeNull();
  });

  /*
   * A DEPLOY MUST NOT SIGN EVERYBODY OUT. The change alters nothing a signed
   * in person can see, so ending their session would be a self-inflicted
   * outage in exchange for nothing. An unnamed token is the owner's: on an
   * instance with one account there is nobody else it could be.
   */
  it('still honours a token issued before accounts existed', async () => {
    const legacy = await issueLegacyToken(HASH, 1);
    expect(await verifySession(legacy, HASH)).toBe(true);
    expect((await readSession(legacy, HASH))?.account).toBe(OWNER_ACCOUNT_ID);
  });

  it('applies every other rule to a legacy token too', async () => {
    const now = Date.now();
    const expired = await issueLegacyToken(HASH, 1, now);
    expect(await verifySession(expired, HASH, now + 2 * 3600_000)).toBe(false);
    /* And a legacy token signed with another password is still nobody. */
    const other = await issueLegacyToken(hashPassword('another'), 1);
    expect(await verifySession(other, HASH)).toBe(false);
  });

  /*
   * The two shapes must not be confusable: a v1 body re-labelled v2, or a v2
   * body cut down to v1's length, would each be a parser disagreeing with a
   * signer about what was signed.
   */
  it('does not let one version be replayed as the other', async () => {
    const legacy = await issueLegacyToken(HASH, 1);
    const [, expiry, signature] = legacy.split('.');
    expect(await verifySession(`v2.${expiry}.${signature}`, HASH)).toBe(false);
    expect(await verifySession(
      `v2.${OWNER_ACCOUNT_ID}.${expiry}.${signature}`, HASH)).toBe(false);

    const { token } = await issueSession(HASH, 1);
    const parts = token.split('.');
    expect(await verifySession(
      `v1.${parts[3]}.${parts[4]}`, HASH)).toBe(false);
    expect(await verifySession(
      `v2.${parts[1]}.${parts[3]}.${parts[4]}`, HASH)).toBe(false);
  });

  /*
   * An id with a dot in it would split into the wrong fields, and a token
   * that parses as something other than what was signed is the worst kind of
   * bug to put in a gate. Refused at issue time, where it is somebody's
   * mistake rather than an attacker's input.
   */
  it('refuses to issue a token for an id that would break the format', async () => {
    for (const bad of ['acct_a.b', 'a/b', '', '..', 'x y']) {
      await expect(issueSession(HASH, 1, Date.now(), bad), bad).rejects.toThrow(/unsafe/);
    }
  });
});

/** A token in the pre-accounts format, built the way that version built it. */
async function issueLegacyToken(
  hash: string, hours: number, now = Date.now(),
): Promise<string> {
  const payload = `v1.${now + hours * 3600_000}`;
  return `${payload}.${await signPayload(hash, payload)}`;
}

/** A token in the v2 format: named, but with no issue time. */
async function issueV2Token(
  hash: string, hours: number, now = Date.now(),
): Promise<{ token: string }> {
  const payload = `v2.${OWNER_ACCOUNT_ID}.${now + hours * 3600_000}`;
  return { token: `${payload}.${await signPayload(hash, payload)}` };
}

async function signPayload(hash: string, payload: string): Promise<string> {
  const { sessionKey } = await import('../../src/auth/session.js');
  const key = await sessionKey(hash);
  const bytes = new Uint8Array(await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(payload)));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('the television network is public, and adds no access (N-4)', () => {
  /*
   * A CHANNEL HAS BEEN WATCHABLE BY A STRANGER FOR A LONG TIME and
   * unfindable for exactly as long: every public channel path
   * needs an id somebody already has. These are the surfaces that
   * answer *which channels exist*.
   */
  it('lets a stranger reach the directory and a station page', () => {
    for (const path of ['/tv', '/tv/channels', '/tv/guide', '/tv/search',
      '/tv/channels/redemption-tv', '/api/tv/channels',
      '/api/tv/channels/redemption-tv']) {
      expect(mayBePublic(path, 'GET'), path).toBe(true);
    }
  });

  /*
   * `/tv` IS A PREFIX ON PURPOSE: a page added later must not ship
   * behind a password by accident. Nothing authenticated lives
   * under it and nothing ever should.
   */
  it('covers a page under /tv that does not exist yet', () => {
    expect(mayBePublic('/tv/countries/cm', 'GET')).toBe(true);
    expect(mayBePublic('/tv/anything/at/all', 'GET')).toBe(true);
  });

  /* It is a read-only surface. Nothing under it is writable. */
  it('is readable and never writable by a stranger', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(mayBePublic('/tv/channels', method), method).toBe(false);
      expect(mayBePublic('/api/tv/channels', method), method).toBe(false);
    }
  });

  /*
   * AND IT OPENS NOTHING ELSE. A prefix is a blunt instrument and
   * this is the assertion that keeps it from being the wrong one:
   * the production application, the library, the channel document
   * and every other channel route stay shut.
   */
  it('opens nothing a broadcaster works with', () => {
    for (const shut of ['/', '/t/chan_abc', '/api/channels',
      '/api/channels/chan_abc', '/api/library', '/settings',
      '/television', '/tvx', '/api/tvx/channels']) {
      expect(mayBePublic(shut, 'GET'), shut).toBe(false);
    }
  });

  /* An address is lower case, which is what the slug rules say. */
  it('does not open a station route for something that is not a slug', () => {
    expect(mayBePublic('/api/tv/channels/UPPER', 'GET')).toBe(false);
    expect(mayBePublic('/api/tv/channels/a/b', 'GET')).toBe(false);
  });
});
