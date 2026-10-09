import { allHoldings } from '../../src/store/holdings.js';
import { ledgerSays, orderHoldings } from '../../src/domain/operations.js';
import { bytesLabel, diskSpace } from '../../src/store/space.js';
import Admin from './Admin.js';

export const dynamic = 'force-dynamic';

/**
 * BalanceVid Admin — the operations desk.
 *   [Doctrine §19, D-04, D-13, D-18, D-19, D-21; GO-VIRAL V-8]
 *
 * *"We would need an admin in BalanceVid Admin where we can
 * perform other functions for BalanceVid, deleting and others
 * would be part of the functions."*
 *
 * WHAT WAS MISSING WAS NOT POWER. Nearly every operation already
 * existed as a route: delete a channel, a conversation, a
 * performance; publish and unpublish each; cut a channel to an
 * emergency slide. What has never existed is a page that says
 * WHAT THERE IS. An operator with seventeen channels had to open
 * seventeen pages to find out, and the control room's own advice
 * at 111% of real time — *"fewer channels"* — was addressed to
 * somebody with no inventory to choose from.
 *
 * SO IT IS A LEDGER FIRST. One row per thing the installation
 * holds, what it is doing, what it weighs, when it last changed,
 * and how many entries its audit trail has. The actions hang off
 * the rows and are the routes that already existed — there is no
 * second way to delete anything here. [D-19]
 *
 * AND IT FINALLY READS THE AUDIT TRAIL. `readAudit` and
 * `readChannelAudit` have both been exported and correct since
 * the beginning, appended to on every channel edit, every lost
 * feed and every recovered one — and called by no surface in this
 * product. The claim this product makes is accountability;
 * `repository.ts` writes that word in the line above `audit()`.
 * A record nobody can read is not accountability. [D-13]
 *
 * ONE INSTALLATION, AND NOT A TIER ABOVE ONE. GO-VIRAL V-8 lists
 * *"the absence of a registry"* under MUST NOT TOUCH, and records
 * a cross-installation index as not built twice from two briefs.
 * This is the owner's desk for their own installation, behind the
 * same `isOwner` as everything else. An admin that reached across
 * installations would be the registry arriving through a side
 * door. [V-8, D-19]
 *
 * READ-ONLY TO OPEN. Gathering the ledger walks directories and
 * writes nothing — not a timestamp, not a lock. This page is
 * opened while a broadcast is going out.
 */
export default async function AdminPage() {
  const [holdings, space] = await Promise.all([
    allHoldings().catch(() => []),
    diskSpace().catch(() => null),
  ]);
  const ordered = orderHoldings(holdings);
  return (
    <Admin
      holdings={ordered}
      says={ledgerSays(ordered)}
      space={space ? {
        used: bytesLabel(space.usedBytes),
        free: bytesLabel(space.freeBytes),
        total: bytesLabel(space.totalBytes),
      } : null}
    />
  );
}
