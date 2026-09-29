/**
 * A studio this account does not have, refused at the data layer.
 * [MASTER-EDIT §11; Doctrine D-06, D-19]
 *
 * D-06: "Tenant isolation is enforced at the data layer, not in application
 * code alone." `tenancy.test.ts` already draws the conclusion for this
 * product — "on a filesystem store the data layer is the path, so this is
 * where that sentence either becomes true or stays an intention" — and an
 * entitlement is the same shape of claim as a tenancy: some documents are
 * not yours to read, and the place to say so is where they are read.
 *
 * THREE PLACES THIS COULD HAVE GONE, AND WHY IT IS HERE.
 *
 *   THE NAVIGATION BAR. A dimmed tab is a courtesy. The URL is still
 *   typeable and the API is still fetchable, and `performancePlan.ts`
 *   already wrote the rule down for a different gate: "a check in an
 *   interface is one refactor away from not being in the path".
 *
 *   `isOwner`. Tempting, because ninety-odd routes already call it and it
 *   already loads the account — which is how `sessionsValidFrom` reached
 *   them all with no diff at any of them. It was tried, and it does not
 *   work, for a reason worth recording: the studio would have to be derived
 *   from the request's path, and half the callers in this codebase build a
 *   request that has no path — `new Request('http://local/', { headers })`
 *   is how a server component passes its cookie in. Those calls would have
 *   read as protected and been nothing. A check that a synthetic URL can
 *   silently disable is worse than no check, because it stops anybody
 *   looking for the real one.
 *
 *   THE MIDDLEWARE. It sees every request with its real path and cannot be
 *   forgotten, which makes it the obvious answer — and its own opening
 *   paragraph rules it out: "whether a particular conversation is published
 *   is checked by the route that loads it, because that answer lives in the
 *   document and middleware has no business reading storage." A plan lives
 *   in the account document. The rule applies unchanged.
 *
 * So: the store. Every route, every page, every background job and every
 * test reaches a performance through `performances.ts` and a channel
 * through `channels.ts`, because there is nowhere else to get one from.
 *
 * IT THROWS RATHER THAN RETURNING EMPTY, and the callers already do the
 * right thing with that: a route's `catch` answers 404, a page's answers
 * `notFound()`, and a list's `.catch(() => [])` answers with nothing. Which
 * is also the answer D-03 wants — the existence of work you may not reach
 * is itself private, so a studio you do not have and a document that is not
 * there say the same thing.
 */

import { type StudioId, STUDIOS, ownsStudio } from '../domain/account.js';
import { theAccount } from './accounts.js';

export class StudioNotHeld extends Error {
  readonly studio: StudioId;

  constructor(studio: StudioId) {
    super(`this account does not have ${STUDIOS[studio].label}`);
    this.name = 'StudioNotHeld';
    this.studio = studio;
  }
}

/**
 * Refuse unless this account holds that studio.
 *
 * The account is read through `theAccount`, which holds it for the life of
 * the process and is replaced the moment it is written — so turning a studio
 * off takes effect on the next request rather than the next restart, and
 * this costs a map lookup rather than a file read.
 */
export async function requireStudio(studio: StudioId): Promise<void> {
  const account = await theAccount();
  if (!ownsStudio(account, studio)) throw new StudioNotHeld(studio);
}
