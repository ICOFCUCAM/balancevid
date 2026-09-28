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

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-accounts-'));
  process.env['BALANCEVID_VAR'] = root;
  ({
    theAccount, loadAccount, saveAccount, forgetAccountCache: forget,
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
