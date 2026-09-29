import {
  type StudioId, isSignedIn, isStudioId,
} from '../../../../src/domain/account.js';
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
 * So the name is editable. Nothing keys off it — `src/domain/account.ts`
 * says so where the field is declared — which is exactly why it is safe to
 * let them.
 *
 * AND WHICH STUDIOS THIS ACCOUNT HAS.  [MASTER-EDIT §11]
 *
 * That one plainly IS keyed off — `isOwner` refuses a studio route the
 * account does not hold — so letting the account set it needs a reason.
 * The reason is that there is no billing, and inventing a plan-management
 * surface for a product with nothing to charge would be inventing a
 * business model rather than building one. This instance has one owner who
 * owns the machine; they may say which studios they are running, and the
 * day there is a subscription this write moves behind it and the field,
 * the rule and every surface consulting it are already in place. That is
 * the whole point of doing it before the billing rather than after.
 *
 * TURNING THEM ALL OFF CANNOT LOCK ANYBODY OUT, and that is by
 * construction rather than by a guard: settings is not a studio path, so
 * `studioForPath` returns null for it and `isOwner` lets it through. There
 * is a test that says so, because "by construction" is a claim.
 */
export async function PATCH(request: Request): Promise<Response> {
  const principal = await whoIs(request);
  if (!isSignedIn(principal)) return fail(401, 'not signed in');

  type Patch = { name?: unknown; studios?: unknown };
  const body = await request.json().catch(() => ({})) as Patch;
  const account = await theAccount();
  const next = { ...account };

  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return fail(400, 'a name is needed');
    if (name.length > 80) return fail(400, 'that name is too long');
    next.name = name;
  }

  if (body.studios !== undefined) {
    /*
     * `null` puts the account back to having no plan, which MEANS all three
     * — the same distinction the record draws. An empty array is a real
     * answer and a different one: an account with nothing.
     */
    if (body.studios === null) delete next.studios;
    else {
      if (!Array.isArray(body.studios)) return fail(400, 'studios is a list');
      const wanted = [...new Set(body.studios)];
      for (const id of wanted) {
        if (typeof id !== 'string' || !isStudioId(id)) {
          return fail(400, `there is no studio called ${String(id)}`);
        }
      }
      next.studios = wanted as StudioId[];
    }
  }

  if (body.name === undefined && body.studios === undefined) {
    return fail(400, 'nothing to change');
  }

  await saveAccount(next);
  return json({ account: next });
}
