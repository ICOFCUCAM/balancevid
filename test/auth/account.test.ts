/**
 * One account, which owns everything.  [Doctrine U-24, D-06, Appendix B]
 *
 * The step being protected is small and the reason for it is not: every
 * document in this product was owned by "the instance" — an implicit owner
 * with no id and nowhere to write one down. The day a hosted edition grows
 * accounts and a local edition does not, the auth layer and every store path
 * acquire two versions. So an account exists now, there is exactly one of
 * it, and nothing else changes.
 *
 * These tests are therefore mostly about what did NOT change.
 */

import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  ACCOUNT_SCHEMA_VERSION, ANONYMOUS, OWNER_ACCOUNT_ID,
  isSignedIn, ownerAccount, principalFor,
} from '../../src/domain/account.js';
import { sessionStillValid } from '../../src/domain/account.js';
import { configureOwner, ownerCookie } from '../helpers/session.js';

/*
 * `paths.ts` resolves VAR_ROOT once, when it first loads, so the temporary
 * directory has to be in the environment before the module graph is — which
 * is why the store is imported here rather than at the top of the file.
 */
let root: string;
let theAccount: typeof import('../../src/store/accounts.js').theAccount;
let loadAccount: typeof import('../../src/store/accounts.js').loadAccount;
let saveAccount: typeof import('../../src/store/accounts.js').saveAccount;
let forget: typeof import('../../src/store/accounts.js').forgetAccountCache;
let revokeSessions: typeof import('../../src/store/accounts.js').revokeSessions;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-accounts-'));
  process.env['BALANCEVID_VAR'] = root;
  ({
    theAccount, loadAccount, saveAccount, forgetAccountCache: forget,
    revokeSessions,
  } = await import('../../src/store/accounts.js'));
});

afterAll(async () => {
  await rm(root, { recursive: true, force: true });
});

/* Each test starts from an instance that has never been asked the question. */
beforeEach(async () => {
  forget();
  await rm(join(root, 'accounts'), { recursive: true, force: true });
});

describe('the owner account', () => {
  /*
   * AN INSTANCE THAT HAS BEEN RUNNING FOR MONTHS HAS NO RECORD, and must
   * not need a migration, a wizard or a restart to acquire one. The first
   * thing that asks who the owner is gets an answer.
   */
  it('is created by the first thing that asks for it', async () => {
    const account = await theAccount();
    expect(account.id).toBe(OWNER_ACCOUNT_ID);
    expect(account.schemaVersion).toBe(ACCOUNT_SCHEMA_VERSION);

    /* And it is on disk, not merely in memory. */
    const raw = await readFile(
      join(root, 'accounts', OWNER_ACCOUNT_ID, 'account.json'), 'utf8');
    expect(JSON.parse(raw).id).toBe(OWNER_ACCOUNT_ID);
  });

  /*
   * THE RACE IS THE REASON THE ID IS FIXED. Several requests arriving
   * together all find no account and all try to create one. A random id
   * would make several; an exclusive write on a known path makes one, and
   * the losers read what the winner wrote.
   */
  it('is one account even when everything asks at once', async () => {
    const asked = await Promise.all(
      Array.from({ length: 8 }, () => {
        forget();
        return theAccount();
      }));
    const ids = new Set(asked.map((account) => account.id));
    expect(ids.size).toBe(1);
    /* Same record, not merely the same id: one createdAt won. */
    const stamps = new Set(asked.map((account) => account.createdAt));
    expect(stamps.size).toBe(1);
  });

  it('is the same account the second time it is asked for', async () => {
    const first = await theAccount();
    forget();
    const second = await theAccount();
    expect(second).toEqual(first);
  });

  /*
   * Forward-only, like every other document here. Reading a newer record
   * with older code is how user work gets corrupted. [U-25 §1]
   */
  it('refuses a record from a future version rather than guessing', async () => {
    await saveAccount({
      ...ownerAccount(new Date('2026-01-01T00:00:00.000Z')),
      schemaVersion: ACCOUNT_SCHEMA_VERSION + 1,
    });
    forget();
    await expect(loadAccount(OWNER_ACCOUNT_ID)).rejects.toThrow(/schema/);
  });

  it('is absent rather than an error when nothing has been written', async () => {
    expect(await loadAccount('acct_nobody')).toBeNull();
  });
});

describe('the record itself', () => {
  /*
   * WHAT IS DELIBERATELY NOT ON IT. U-24 lists billing, quota and retention
   * as what an account eventually carries. None of that is here, and no
   * credential is here either: the owner is still authenticated by
   * BALANCEVID_PASSWORD_HASH exactly as before. Moving the password onto
   * this record is a later step and a security-relevant one, and a test
   * that fails when somebody quietly does it early is the point.
   */
  it('carries no credential', () => {
    const account = ownerAccount(new Date('2026-01-01T00:00:00.000Z'));
    expect(Object.keys(account).sort())
      .toEqual(['createdAt', 'id', 'name', 'schemaVersion']);
  });

  it('is the same record for the same moment', () => {
    const when = new Date('2026-01-01T00:00:00.000Z');
    expect(ownerAccount(when)).toEqual(ownerAccount(when));
  });

  /* The id has to survive `safe()`, which is what guards every path join. */
  it('has an id a path join will accept', () => {
    expect(OWNER_ACCOUNT_ID).toMatch(/^acct_[A-Za-z0-9_-]{1,120}$/);
  });
});

describe('who is asking', () => {
  it('names the account when somebody is signed in', () => {
    const principal = principalFor(OWNER_ACCOUNT_ID);
    expect(isSignedIn(principal)).toBe(true);
    if (isSignedIn(principal)) expect(principal.account).toBe(OWNER_ACCOUNT_ID);
  });

  it('is nobody when they are not', () => {
    expect(isSignedIn(ANONYMOUS)).toBe(false);
  });
});

/*
 * WHO AM I, over HTTP. The first caller in the product that asks WHICH
 * account rather than WHETHER there is an owner — which is the point of the
 * seam, and the reason it ships with a consumer instead of waiting for one.
 */
describe('/api/auth/me', () => {
  let GET: (request: Request) => Promise<Response>;
  let hash: string;

  beforeAll(async () => {
    hash = configureOwner();
    ({ GET } = await import('../../app/api/auth/me/route.js'));
  });

  it('names the account of a signed-in caller', async () => {
    const response = await GET(new Request('http://local/api/auth/me', {
      headers: { cookie: await ownerCookie(hash) },
    }));
    expect(response.status).toBe(200);
    const body = await response.json() as { account: { id: string; name: string } };
    expect(body.account.id).toBe(OWNER_ACCOUNT_ID);
    expect(body.account.name).toBe('Owner');
  });

  /*
   * A stranger is told nothing about the instance — not its account's name,
   * not when it was set up, not that it has one. [D-03, D-06]
   */
  it('tells a stranger only that they are not signed in', async () => {
    const response = await GET(new Request('http://local/api/auth/me'));
    expect(response.status).toBe(401);
    expect(JSON.stringify(await response.json())).not.toContain(OWNER_ACCOUNT_ID);
  });

  /*
   * And it carries no credential, because the record carries none. The
   * assertion is on the wire rather than on the type, because the type is
   * what a later change would alter first.
   */
  it('puts no secret on the wire', async () => {
    const response = await GET(new Request('http://local/api/auth/me', {
      headers: { cookie: await ownerCookie(hash) },
    }));
    const raw = JSON.stringify(await response.json());
    expect(raw).not.toMatch(/scrypt\$|passwordHash|password/i);
  });
});

/**
 * Ending every session.  [D-06, U-24]
 *
 * The gap this closes was written down in the sign-out route before the fix
 * existed: a stateless token could only be revoked by changing the instance
 * password, which ended every session everywhere — including the ones you
 * still wanted. A date on the account draws the line instead.
 */
describe('revoking sessions', () => {
  /*
   * NO LINE UNTIL ONE IS DRAWN. Defaulting the field to the creation date
   * looks tidier and voids every token that predates the field — which on
   * the deploy that adds it is every token in existence. The first person
   * to open the product after upgrading would be signed out for no reason.
   */
  it('starts with no line at all, not a line at the beginning', async () => {
    const account = await theAccount();
    expect(account.sessionsValidFrom).toBeUndefined();
    expect(sessionStillValid(account, Date.now())).toBe(true);
    /* Including a token too old to say when it was issued. */
    expect(sessionStillValid(account, undefined)).toBe(true);
  });

  it('voids what was issued before the line and keeps what comes after', async () => {
    const account = await theAccount();
    const at = new Date('2026-06-01T12:00:00.000Z');
    const line = Date.parse(at.toISOString());
    const revoked = { ...account, sessionsValidFrom: await revokeSessions(account.id, at) };

    expect(sessionStillValid(revoked, line - 1)).toBe(false);
    expect(sessionStillValid(revoked, line)).toBe(true);
    expect(sessionStillValid(revoked, line + 1)).toBe(true);
  });

  /*
   * A TOKEN WITH NO ISSUE TIME IS NOT HONOURED once a line exists. The older
   * formats did not record when they were made, so they cannot be shown to
   * be after the line — and "sign out everywhere" that left the oldest
   * sessions running would be the one case it was pressed for.
   */
  it('does not honour a token that cannot say when it was issued', async () => {
    const account = await theAccount();
    expect(sessionStillValid(account, undefined)).toBe(true);
    const revoked = {
      ...account,
      sessionsValidFrom: await revokeSessions(account.id, new Date()),
    };
    expect(sessionStillValid(revoked, undefined)).toBe(false);
  });

  it('persists, so a restart does not un-revoke anything', async () => {
    const at = new Date('2026-06-01T12:00:00.000Z');
    await revokeSessions(undefined, at);
    forget();
    expect((await theAccount()).sessionsValidFrom).toBe(at.toISOString());
  });

  /*
   * A record written before revocation existed has no line, and must read as
   * "nothing revoked" rather than as "everything revoked" — the second would
   * sign the owner out on the deploy that introduced the feature. [U-25 §1]
   */
  it('reads an older record as having revoked nothing', async () => {
    const account = await theAccount();
    await saveAccount(account);
    forget();
    const read = await loadAccount(account.id);
    expect(read?.sessionsValidFrom).toBeUndefined();
    expect(sessionStillValid(read!, undefined)).toBe(true);
  });
});

describe('signing out everywhere, over HTTP', () => {
  let POST: (request: Request) => Promise<Response>;
  let hash: string;

  beforeAll(async () => {
    hash = configureOwner();
    ({ POST } = await import('../../app/api/auth/signout/route.js'));
  });

  const signOut = async (body: unknown, cookie?: string) => POST(
    new Request('http://local/api/auth/signout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }));

  /* The ordinary press is unchanged: this browser, nothing else. */
  it('clears only this cookie by default', async () => {
    const before = (await theAccount()).sessionsValidFrom;
    expect(before).toBeUndefined();
    const response = await signOut({}, await ownerCookie(hash));
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
    forget();
    expect((await theAccount()).sessionsValidFrom).toBe(before);
  });

  it('draws the line when asked to end everything', async () => {
    const before = (await theAccount()).sessionsValidFrom;
    const response = await signOut({ everywhere: true }, await ownerCookie(hash));
    expect(response.status).toBe(200);
    forget();
    const after = (await theAccount()).sessionsValidFrom;
    expect(after).toBeDefined();
    expect(after).not.toBe(before);
    /* And this session goes with the rest: the cookie is cleared too. */
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  });

  /*
   * A STRANGER MUST NOT BE ABLE TO DO THIS. Without a caller it is a URL
   * anybody can POST at to sign the owner out of every device they own.
   */
  it('refuses a stranger, and changes nothing', async () => {
    const before = (await theAccount()).sessionsValidFrom;
    const response = await signOut({ everywhere: true });
    expect(response.status).toBe(401);
    forget();
    expect((await theAccount()).sessionsValidFrom).toBe(before);
  });

  it('treats anything but true as the ordinary sign out', async () => {
    const before = (await theAccount()).sessionsValidFrom;
    for (const body of [{ everywhere: 'true' }, { everywhere: 1 }, {}]) {
      const response = await signOut(body, await ownerCookie(hash));
      expect(response.status, JSON.stringify(body)).toBe(200);
    }
    forget();
    expect((await theAccount()).sessionsValidFrom).toBe(before);
  });
});

/**
 * The whole loop, which is the only proof that matters.  [D-06]
 *
 * Every piece above can pass while the feature does nothing: a date written
 * to a file that no check reads is a date written to a file. This signs in,
 * confirms the request is the owner's, revokes, and confirms it is nobody's.
 */
describe('a revoked session stops authenticating', () => {
  let hash: string;
  let whoIs: typeof import('../../src/auth/request.js').whoIs;
  let isOwner: typeof import('../../src/auth/request.js').isOwner;

  beforeAll(async () => {
    hash = configureOwner();
    ({ whoIs, isOwner } = await import('../../src/auth/request.js'));
  });

  const asOwner = async () => new Request('http://local/anything', {
    headers: { cookie: await ownerCookie(hash) },
  });

  it('is the owner before, and nobody after', async () => {
    const request = await asOwner();
    expect(await isOwner(request)).toBe(true);
    expect((await whoIs(request)).kind).toBe('account');

    /*
     * A second in the future, because a token issued in the same
     * millisecond as the line is ON the line and stays valid — which is the
     * correct boundary, and not the one this test is about.
     */
    await revokeSessions(OWNER_ACCOUNT_ID, new Date(Date.now() + 1000));
    forget();

    expect(await isOwner(request)).toBe(false);
    expect((await whoIs(request)).kind).toBe('anonymous');
  });

  /*
   * AND THE NEXT SIGN-IN WORKS. A revocation that locked the account out
   * permanently would be a very thorough bug.
   */
  it('lets a fresh session straight back in', async () => {
    await revokeSessions(OWNER_ACCOUNT_ID, new Date(Date.now() - 1000));
    forget();
    expect(await isOwner(await asOwner())).toBe(true);
  });

  /*
   * NINETY-ODD CALL SITES GET THIS FOR FREE because `isOwner` now reads the
   * full answer rather than checking a signature on its own. A test that
   * only exercised `whoIs` would pass while every route in the product
   * still honoured a revoked token.
   */
  it('reaches the check that every route in the product already calls', async () => {
    await revokeSessions(OWNER_ACCOUNT_ID, new Date(Date.now() + 1000));
    forget();
    expect(await isOwner(await asOwner())).toBe(false);
  });
});

/*
 * STUDIOS ARE SEPARABLE, AND THE SEPARATION IS IN THE STORE.
 * [MASTER-EDIT §11, D-06, D-19]
 *
 * "A customer buying Studio One only must not automatically receive Studio
 * Two guest functionality, Online TV guest functionality, or a broadcast
 * channel."
 *
 * THE FIRST ATTEMPT PUT THIS IN `isOwner`, because ninety-odd routes call
 * it and it already loads the account — which is how `sessionsValidFrom`
 * above reached them all with no diff at any of them. It passed its unit
 * tests and did nothing in the product, and the browser found it: with
 * Studio Two turned off, `/api/performances/<id>` still answered 200.
 *
 * Two reasons, both instructive. Half the studio routes never call
 * `isOwner` at all — the middleware is their session check, and it cannot
 * read a plan out of the account document. And the studio had to be
 * derived from the request's path, while server components pass their
 * cookie as `new Request('http://local/', { headers })` — a request with no
 * path, which the check read as "no studio" and waved through. A test that
 * builds `http://local/api/performances/perf_1` by hand proves the
 * derivation works and proves nothing about the product.
 *
 * So the gate is in the store, where D-06 says isolation goes, and these
 * assert the thing the product actually does.
 */
describe('a studio this account does not have', () => {
  let loadPerformance: typeof import('../../src/store/performances.js').loadPerformance;
  let listPerformances: typeof import('../../src/store/performances.js').listPerformances;
  let savePerformance: typeof import('../../src/store/performances.js').savePerformance;
  let listConversations: typeof import('../../src/store/repository.js').listConversations;
  let StudioNotHeld: typeof import('../../src/store/entitlement.js').StudioNotHeld;

  beforeAll(async () => {
    ({ loadPerformance, listPerformances, savePerformance } =
      await import('../../src/store/performances.js'));
    ({ listConversations } = await import('../../src/store/repository.js'));
    ({ StudioNotHeld } = await import('../../src/store/entitlement.js'));
  });

  const plan = async (studios: string[] | undefined) => {
    const account = await theAccount();
    const next = { ...account, studios: studios as never };
    if (studios === undefined) delete (next as { studios?: unknown }).studios;
    await saveAccount(next);
    forget();
  };

  it('refuses at the read, which is the only way in', async () => {
    await plan(['studio-one']);
    await expect(loadPerformance('perf_1')).rejects.toThrow(StudioNotHeld);
    await expect(listPerformances()).rejects.toThrow(/does not have Studio Two/);
    /* And the write, or a route could create what it may not read. */
    await expect(savePerformance({ id: 'perf_1' } as never))
      .rejects.toThrow(StudioNotHeld);
    /* The studio it does have still answers. */
    await expect(listConversations()).resolves.toBeInstanceOf(Array);
  });

  it('comes back the moment the studio does', async () => {
    await plan(['studio-one']);
    await expect(listPerformances()).rejects.toThrow(StudioNotHeld);
    await plan(['studio-one', 'studio-two']);
    await expect(listPerformances()).resolves.toEqual([]);
  });

  /*
   * THE DEPLOY THAT ADDS THIS MUST TAKE NOTHING AWAY. An instance running
   * today has no such field, and a default of "none" would lock its owner
   * out of every studio on upgrade.
   */
  it('is nothing at all for an account with no plan', async () => {
    await plan(undefined);
    await expect(listPerformances()).resolves.toEqual([]);
    await expect(listConversations()).resolves.toEqual([]);
  });

  /*
   * AND SIGNING IN IS NOT A STUDIO. An owner who turns all three off has to
   * be able to turn one back on, and the account routes do not go through
   * any studio's store.
   */
  it('never closes the door an owner turns them back on with', async () => {
    await plan([]);
    await expect(listPerformances()).rejects.toThrow(StudioNotHeld);
    await expect((await theAccount()).id).toBe(OWNER_ACCOUNT_ID);
    await plan(['online-tv']);
    expect((await theAccount()).studios).toEqual(['online-tv']);
  });
});
