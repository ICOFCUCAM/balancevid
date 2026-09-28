import { isSignedIn } from '../../../../src/domain/account.js';
import { whoIs } from '../../../../src/auth/request.js';
import { saveAccount, theAccount } from '../../../../src/store/accounts.js';
import { fail, json } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Who am I.  [Doctrine U-24, D-06]
 *
 * The first thing in the product that asks WHICH account rather than
 * WHETHER there is an owner, and the reason `whoIs` exists rather than
 * waiting: a seam nothing calls is a seam nobody has checked, and this
 * codebase has already been bitten once by a field two layers enforced and
 * nothing could set.
 *
 * It is also the endpoint an interface needs the moment an instance can
 * hold more than one account — "signed in as" has to come from somewhere —
 * so it is not scaffolding invented to justify the seam. Today it answers
 * with the single owner, which is the correct answer today.
 *
 * NOT PUBLIC. `policy.ts` lets `/api/auth/signin` and `/api/auth/signout`
 * through without a session because they are how you get one; this needs
 * one, and says 401 without it rather than describing the instance to a
 * stranger.
 */
export async function GET(request: Request): Promise<Response> {
  const principal = await whoIs(request);
  if (!isSignedIn(principal)) return fail(401, 'not signed in');

  const account = await theAccount();
  /*
   * The record, not the principal: the id alone would make every caller
   * fetch the name separately. Nothing secret is on it — no credential, by
   * construction (`src/domain/account.ts`) — so it goes back whole.
   */
  return json({ account });
}

/**
 * WHAT TO CALL THEM.  [Doctrine U-24]
 *
 * The account is created with the name "Owner", because at the moment it
 * is created nobody has been asked anything — it happens on the first
 * read, before the first sign-in, from a migration or a process starting
 * up. That default then becomes the word the whole building greets them
 * with: "Good evening, Owner."
 *
 * So the name is editable, and this is the only field on the account a
 * person may change. Nothing keys off it — `src/domain/account.ts` says
 * so where the field is declared — which is exactly why it is safe to
 * let them.
 */
export async function PATCH(request: Request): Promise<Response> {
  const principal = await whoIs(request);
  if (!isSignedIn(principal)) return fail(401, 'not signed in');

  const body = await request.json().catch(() => ({})) as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return fail(400, 'a name is needed');
  if (name.length > 80) return fail(400, 'that name is too long');

  const account = await theAccount();
  await saveAccount({ ...account, name });
  return json({ account: { ...account, name } });
}
