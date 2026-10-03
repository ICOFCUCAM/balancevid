import { notFound } from 'next/navigation';

import { loadCampaign } from '../../../src/store/campaigns.js';
import Desk from '../Desk.js';
import { Building } from '../../Room.js';
import { theBuilding } from '../../building.js';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Call — BalanceVid' };

/**
 * One call, from the organiser's side.  [GO-VIRAL V-2, V-5]
 *
 * BEHIND THE SESSION BY DEFAULT, which is the whole value of
 * `middleware.ts` being default-closed: this path is in no public
 * list, so it is the owner's without anybody having to remember
 * to say so. `/go/<slug>` is the same call seen from outside.
 * [D-03]
 *
 * THE PAGE RESOLVES THE ID AND THE CLIENT DOES THE REST. What is
 * on it changes while somebody is looking at it — a mark
 * recorded, a state moved, a result recomputed — so the server's
 * job is to answer whether the call exists and hand over the id.
 * A server render of a form that posts to itself would be a
 * second copy of every rule on the page. [D-19]
 */
export default async function CallPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^camp_[A-Za-z0-9_-]{1,64}$/.test(id)) notFound();
  let call;
  try {
    call = await loadCampaign(id);
  } catch {
    notFound();
  }
  const building = await theBuilding();
  /*
   * INSIDE THE BUILDING, LIKE EVERY OTHER PLACE AN OWNER WORKS.
   *   [GO-VIRAL V-8; D-24]
   *
   * This page was a bare `<main>` on a black field for eight stages:
   * no rail, no breadcrumb, and no way back to the room the call is
   * about. The frame already existed — `Room.tsx` was written because
   * exactly this was said about Studio One — and the desk simply never
   * used it.
   *
   * THE BREADCRUMB NAMES THE CALL, not the word "Call": an organiser
   * running four of them needs the bar to say which one they are
   * standing in.
   */
  return (
    <Building owned={building.owned} space={building.space}
              libraryCount={building.libraryCount} current="calls"
              where={call.title}
              {...(building.heroHref ? { heroHref: building.heroHref } : {})}>
      <Desk id={id} />
    </Building>
  );
}
