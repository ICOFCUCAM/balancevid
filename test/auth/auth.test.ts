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
import { clearedCookie, issueSession, sessionCookie, verifySession } from '../../src/auth/session.js';

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

describe('what a stranger may reach', () => {
  it('lets a published conversation be read', () => {
    expect(mayBePublic('/c/conv_abc/watch', 'GET')).toBe(true);
    expect(mayBePublic('/c/conv_abc/article', 'GET')).toBe(true);
    expect(mayBePublic('/api/conversations/conv_abc/representations', 'GET')).toBe(true);
    expect(mayBePublic('/api/conversations/conv_abc/source', 'GET')).toBe(true);
    expect(mayBePublic('/api/published', 'GET')).toBe(true);
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
