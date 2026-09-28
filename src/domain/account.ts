/**
 * Who owns the work.  [Doctrine U-24, D-06, D-19, Appendix B]
 *
 * THIS IS NOT A NEW IDEA AND IT IS DELIBERATELY NOT A NEW FEATURE. U-24
 * names `users` and `accounts` in the canonical model under "Names are
 * binding", and Appendix B records a clause of U-31 §40 narrowed expressly
 * until they exist: "Responding creates a conversation and uploads a
 * recording, and this build has one owner and no accounts to attribute
 * either to… When accounts exist, 'anyone' means 'any signed-in person',
 * the write is attributable, and U-31 is satisfied as written."
 *
 * So this is a deferred commitment being taken up, and it is being taken up
 * in the smallest piece that is worth anything:
 *
 *   ONE ACCOUNT EXISTS. It owns everything. Nothing else changes.
 *
 * WHY NOW, WHEN NOTHING VISIBLY NEEDS IT. Because the alternative is a fork.
 * Every document in this product is currently owned by "the instance" — an
 * implicit owner with no name, no id, and nowhere to write one down. The day
 * a hosted edition grows accounts and a local edition does not, the auth
 * layer, every store path and every route acquire two versions, and the one
 * system with two modes becomes two systems. An account that exists with a
 * population of exactly one costs almost nothing today; introducing the
 * concept later means migrating live user work, which in this product is
 * irreplaceable recorded speech (U-24's own argument for why the model is
 * completed early rather than grown).
 *
 * WHAT IS DELIBERATELY ABSENT. No password, no billing, no quota, no
 * retention policy — U-24 lists those as what an account eventually carries,
 * not what it is. The single owner is still authenticated exactly as before,
 * by `BALANCEVID_PASSWORD_HASH` through `src/auth/`. Moving the credential
 * onto this record is a later step and a security-relevant one; doing it in
 * the same change that introduces the record would mean a step that cannot
 * be reviewed for one thing at a time, and a way to be locked out of your
 * own instance.
 */

import type { Id } from './ids.js';

export type AccountId = Id<'acct'>;

export const ACCOUNT_SCHEMA_VERSION = 1;

/**
 * THE FIRST ACCOUNT HAS A NAME YOU CAN TYPE, and the rest will not.
 *
 * Every other id in this product is random, because every other thing there
 * can be many of from the beginning. This one is a singleton that has to be
 * found before anything is known — by a process starting up, by a migration
 * moving `var/conversations` underneath it, by a person reading a directory
 * listing at three in the morning. A random id would mean discovering it by
 * listing a directory that is supposed to contain exactly one entry, and
 * creating it would need a lock to stop two requests making two.
 *
 * A fixed id makes creation idempotent and the layout legible. It is the
 * same reasoning that gives the first user on a Unix box uid 0 rather than a
 * number drawn from a hat.
 */
export const OWNER_ACCOUNT_ID = 'acct_owner' as AccountId;

export interface Account {
  schemaVersion: number;
  id: AccountId;
  /** What to call them. Display only; nothing keys off it. */
  name: string;
  createdAt: string;
}

/**
 * Who is asking.  [Doctrine D-06]
 *
 * The question `isOwner` has always answered as a yes-or-no, asked so that
 * the answer can grow a subject. Today it resolves to one of two things and
 * the union is honest about that rather than anticipating kinds that cannot
 * yet occur.
 *
 * A GUEST IS NOT HERE, and its absence is a design statement rather than an
 * omission. A guest's credential is signed by one room's invite token and
 * names one conversation inside its signature (`src/auth/guest.ts`), so
 * "which guest is this?" cannot be answered without knowing which
 * conversation is being asked about. That is `callerFor`'s question and it
 * already has an answer. This one is asked before the subject is known.
 */
export type Principal =
  | { kind: 'account'; account: AccountId }
  | { kind: 'anonymous' };

export const ANONYMOUS: Principal = { kind: 'anonymous' };

export function principalFor(account: AccountId): Principal {
  return { kind: 'account', account };
}

/** Narrowing helper, so call sites read as a question rather than a compare. */
export function isSignedIn(
  principal: Principal,
): principal is { kind: 'account'; account: AccountId } {
  return principal.kind === 'account';
}

/**
 * The account a fresh instance starts with.
 *
 * `now` is passed rather than read so the same call in a test produces the
 * same record, which is the difference between a fixture and a snapshot that
 * changes every time it is taken.
 */
export function ownerAccount(now: Date = new Date()): Account {
  return {
    schemaVersion: ACCOUNT_SCHEMA_VERSION,
    id: OWNER_ACCOUNT_ID,
    name: 'Owner',
    createdAt: now.toISOString(),
  };
}
