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

/**
 * THE THREE STUDIOS, AS THINGS THAT CAN BE SOLD SEPARATELY.
 * [MASTER-EDIT §11, D-14, U-24]
 *
 * The brief is explicit: a customer buying Studio One only must not
 * automatically receive Studio Two's takes, Online TV's broadcast guests, or
 * a channel. The underlying room technology is shared — one `RoomHost`, one
 * `roomEdit`, one `InvitePanel` — and the ENTITLEMENT is not.
 *
 * Named by the tab an author sees rather than by the document they hold,
 * because the tab is what is bought. `online-tv` and not `studio-three` for
 * the reason the bar already gives: the other two are named for what
 * somebody working in them is doing, and a channel is the only one of the
 * three that exists while nobody is in it. [CHANNEL §1, D-18]
 */
export type StudioId = 'studio-one' | 'studio-two' | 'online-tv';

export const STUDIOS: Record<StudioId, { label: string; holds: string }> = {
  'studio-one': { label: 'Studio One', holds: 'conversations' },
  'studio-two': { label: 'Studio Two', holds: 'performances' },
  'online-tv': { label: 'Online TV', holds: 'channels' },
};

export const ALL_STUDIOS: readonly StudioId[] =
  Object.keys(STUDIOS) as StudioId[];

export function isStudioId(value: string): value is StudioId {
  return Object.hasOwn(STUDIOS, value);
}

export interface Account {
  schemaVersion: number;
  id: AccountId;
  /** What to call them. Display only; nothing keys off it. */
  name: string;
  createdAt: string;
  /**
   * WHICH STUDIOS THIS ACCOUNT HAS.  [MASTER-EDIT §11]
   *
   * ABSENT MEANS ALL THREE, and that is the whole migration. The same
   * reasoning as `sessionsValidFrom` below and for the same reason: every
   * instance running today has no such field, and a default of "none" or
   * "the first one" would mean the deploy that adds this takes two studios
   * away from everybody who already had them. A field that says nothing
   * must mean what was true before it existed.
   *
   * So an empty array is a real answer — an account with nothing — and
   * `undefined` is the absence of a plan rather than a plan of nothing.
   * `studiosOf` is the only place that distinction is read, so it is the
   * only place it can be got wrong.
   */
  studios?: StudioId[];
  /**
   * SESSIONS ISSUED BEFORE THIS MOMENT ARE VOID.  [D-06]
   *
   * The gap it closes was written down in the sign-out route before it
   * existed: "the token is self-contained and stateless, so this clears the
   * cookie rather than revoking anything. A token that has genuinely leaked
   * is revoked by changing the password." Which is true, and a poor answer
   * to a laptop left on a train — the remedy for one lost session was to
   * change the instance's password and end every session everywhere,
   * including the ones on the machines you still have.
   *
   * A stamp is the smallest thing that fixes it and the only one that keeps
   * the token stateless: there is still no session table, still nothing to
   * keep, and a restart still signs nobody out. One date per account says
   * where the line is.
   *
   * It is also the mechanism a second account will need. A per-account
   * password change cannot revoke anything through the signing key, because
   * that key is the instance's and shared — so the line has to be drawn
   * here instead. [U-24]
   *
   * ABSENT UNTIL SOMETHING IS ACTUALLY REVOKED, and the difference is not
   * cosmetic. Defaulting it to the account's creation date looks tidier and
   * silently voids every token that predates this field — which is every
   * token in existence on the deploy that adds it. The first person to try
   * the product after the upgrade would be signed out for no reason. The
   * field means "a line has been drawn"; no line is no field.
   */
  sessionsValidFrom?: string;
}

/**
 * What this account actually has.
 *
 * Unknown entries are dropped rather than trusted, because the list is read
 * from a JSON file that a forward version of this product may have written
 * a fourth studio into, and a name this build does not understand is not a
 * permission this build can honour.
 */
export function studiosOf(account: Pick<Account, 'studios'>): StudioId[] {
  if (account.studios === undefined) return [...ALL_STUDIOS];
  return account.studios.filter((id) => isStudioId(id));
}

/**
 * May this account use that studio.
 *
 * The question every surface asks, so that none of them has to know how the
 * answer is stored. When there is billing it changes here and nowhere. [D-19]
 */
export function ownsStudio(
  account: Pick<Account, 'studios'>, studio: StudioId,
): boolean {
  return studiosOf(account).includes(studio);
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

/**
 * Whether a session issued at this moment is still one this account honours.
 *
 * A TOKEN WITH NO ISSUE TIME IS NOT HONOURED once a line has been drawn, and
 * that is the safe direction rather than an oversight: the pre-revocation
 * token formats did not record when they were made, so "revoke everything
 * before now" cannot be shown to exclude them. Treating them as older than
 * any line means a person who clicks sign out everywhere is actually signed
 * out everywhere, which is the only reading of that button worth having.
 */
export function sessionStillValid(
  account: Pick<Account, 'sessionsValidFrom'>, issuedAt: number | undefined,
): boolean {
  if (!account.sessionsValidFrom) return true; /* Nothing has been revoked. */
  const line = Date.parse(account.sessionsValidFrom);
  if (!Number.isFinite(line)) return true; /* Unreadable: refuse to lock out. */
  return issuedAt !== undefined && issuedAt >= line;
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
