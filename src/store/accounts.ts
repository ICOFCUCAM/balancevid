/**
 * The Account store.  [Doctrine U-24, U-25, D-06, INV-00]
 *
 * A directory and a JSON file, like every other document in this product.
 * No database, deliberately: a local edition that needed PostgreSQL running
 * before it could tell you who you are would not be a local edition, and
 * D-14's `accounts` row describes what an account eventually carries, not
 * what it must be stored in.
 *
 *   var/accounts/acct_owner/account.json
 *
 * CREATED ON FIRST READ, AND EXACTLY ONCE. An instance that has been running
 * for months has no account record and must not need a migration step, a
 * setup wizard or a restart to acquire one — the first thing that asks who
 * the owner is should get an answer. That makes creation a race between
 * however many requests arrive together, so the record is written in full
 * and then linked into place — an operation that publishes a complete file
 * under a name that cannot be taken twice. A lost race is not an error: the
 * other writer's record is as good as ours and we read it back.
 */

import { link, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import {
  ACCOUNT_SCHEMA_VERSION, type Account, type AccountId,
  OWNER_ACCOUNT_ID, ownerAccount,
} from '../domain/account.js';
import { paths, safe } from './paths.js';

/**
 * Held for the life of the process.
 *
 * The owner's account is read on the way through every authenticated
 * request, and it changes approximately never. Re-reading a file per request
 * to be told the same four fields is work with no reader.
 */
let cached: Account | null = null;

export async function saveAccount(account: Account): Promise<void> {
  await mkdir(paths.account(account.id), { recursive: true });
  const target = paths.accountDocument(account.id);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(account, null, 2), 'utf8');
  await rename(temp, target);
  if (account.id === OWNER_ACCOUNT_ID) cached = account;
}

export async function loadAccount(id: string): Promise<Account | null> {
  let raw: string;
  try {
    raw = await readFile(paths.accountDocument(safe(id)), 'utf8');
  } catch {
    return null;
  }
  const parsed = JSON.parse(raw) as Account;
  if (parsed.schemaVersion > ACCOUNT_SCHEMA_VERSION) {
    /* Forward-only, as every other document in this product is (U-25 §1). */
    throw new Error(
      `account ${id} is schema v${parsed.schemaVersion}; `
      + `this build understands v${ACCOUNT_SCHEMA_VERSION}`);
  }
  return parsed;
}

/**
 * The account this instance belongs to, created if it is not there yet.
 *
 * There is exactly one today and the signature says so. When there are many,
 * this becomes "the account this REQUEST belongs to" and the callers that
 * already ask it stop being wrong — which is the whole reason it exists in
 * this shape now rather than as a constant somebody reaches for directly.
 */
export async function theAccount(): Promise<Account> {
  if (cached) return cached;

  const existing = await loadAccount(OWNER_ACCOUNT_ID);
  if (existing) {
    cached = existing;
    return existing;
  }

  const fresh = ownerAccount();
  await mkdir(paths.account(fresh.id), { recursive: true });
  const target = paths.accountDocument(fresh.id);
  const temp = `${target}.${process.pid}.${Math.random().toString(36).slice(2)}`;

  /*
   * WRITTEN IN FULL, THEN LINKED INTO PLACE — not `writeFile` with `wx`.
   *
   * Both refuse to overwrite, which is what makes the race safe at all: one
   * request creates the record and the others read what it wrote. But `wx`
   * creates the file EMPTY and fills it a moment later, so a loser can open
   * the winner's path in that moment and parse nothing. `link` publishes a
   * name that is already complete, and fails if the name is taken. A rename
   * would do neither — it clobbers, so the last writer would win and two
   * requests would disagree about when the instance was created.
   */
  await writeFile(temp, JSON.stringify(fresh, null, 2), 'utf8');
  try {
    await link(temp, target);
    cached = fresh;
    return fresh;
  } catch {
    /* Somebody else got there. Theirs is as good as ours. */
    const won = await loadAccount(OWNER_ACCOUNT_ID);
    if (!won) throw new Error('the owner account could not be created');
    cached = won;
    return won;
  } finally {
    await unlink(temp).catch(() => undefined);
  }
}

/**
 * Draw the line: every session issued before now is void.
 *
 * Returns the moment, because the caller usually wants to say when. The
 * cached record is replaced by `saveAccount`, so the very next request is
 * already checked against the new line rather than a stale one — which
 * matters, since the point of pressing this is that something is wrong now.
 */
export async function revokeSessions(
  id: AccountId = OWNER_ACCOUNT_ID, at: Date = new Date(),
): Promise<string> {
  const account = await loadAccount(id) ?? await theAccount();
  const sessionsValidFrom = at.toISOString();
  await saveAccount({ ...account, sessionsValidFrom });
  return sessionsValidFrom;
}

/** For tests, which need a process to forget what it has already read. */
export function forgetAccountCache(): void {
  cached = null;
}

export type { Account, AccountId };
