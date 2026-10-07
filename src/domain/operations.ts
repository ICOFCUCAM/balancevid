/**
 * Everything this installation holds, and what can be done to it.
 *   [Doctrine §19, D-04, D-13, D-18, D-19, D-21, U-02; GO-VIRAL V-8]
 *
 * *"We would need an admin in BalanceVid Admin where we can
 * perform other functions for BalanceVid, deleting and others
 * would be part of the functions."*
 *
 * WHAT WAS ACTUALLY MISSING WAS NOT POWER, IT WAS A VIEW. Almost
 * every operation an administrator wants already exists as a
 * route — delete a channel, a conversation, a performance;
 * publish and unpublish each of them; cut a channel away to an
 * emergency slide. What has never existed is a single place that
 * says WHAT THERE IS. An operator with seventeen channels had to
 * open seventeen pages to find out, and the control room's own
 * advice at 111% of real time — *"fewer channels"* — was
 * addressed to somebody with no inventory to choose from.
 *
 * SO THIS IS A LEDGER BEFORE IT IS A CONTROL PANEL. One row per
 * thing the installation holds, what state it is in, what it
 * weighs, and when it last changed. The actions hang off the rows
 * and are the routes that already existed; nothing here is a
 * second way to delete anything. [D-19]
 *
 * ONE INSTALLATION, AND DELIBERATELY NOT A TIER ABOVE ONE.
 * GO-VIRAL V-8 records a cross-installation registry as **not
 * built**, twice, from two briefs — *"the absence of a registry"*
 * is in its MUST NOT TOUCH list. This is the owner's desk for
 * their own installation, scoped by the same `isOwner` and
 * `requireStudio` as every other page here. An "admin" that
 * reached across installations would be the registry arriving
 * through a side door. [V-8, D-19]
 *
 * PURE. The gathering reads disks; this decides vocabulary,
 * order, and what may be done. Three surfaces asking "is this
 * channel live" must not each answer it. [D-14, C-31]
 */

/** What kind of thing a row is. */
export type Holds = 'channel' | 'conversation' | 'performance';

/**
 * What it is doing, in the one vocabulary.
 *
 *   live       on air now — a channel with the red button down
 *   published  reachable by the public, whether or not anybody
 *              is looking
 *   draft      exists, and only its owner can see it
 */
export type Doing = 'live' | 'published' | 'draft';

export interface Holding {
  kind: Holds;
  id: string;
  name: string;
  doing: Doing;
  /** What it owns on the volume, in bytes. */
  bytes: number;
  /** When it last changed, ISO. */
  at: string;
  /**
   * How many entries its own audit trail holds.
   *
   * THE TRAIL HAS BEEN WRITTEN SINCE THE BEGINNING AND READ BY
   * NOTHING. `readAudit` and `readChannelAudit` are both exported,
   * both correct, and no surface in this product has ever called
   * either — while every channel edit, every lost feed and every
   * recovered one has been appended to them. The product's claim
   * is accountability; `repository.ts` says so in the line above
   * `audit()`. A record nobody can read is not accountability.
   *   [D-13, D-21]
   */
  changes: number;
}

/**
 * What a record is doing, from the two fields every kind has.
 *
 * DECIDED ONCE. A channel is live if its session has not ended —
 * the same test `needsSegments` and `whatIsOn` make — and
 * published if it has a publication that was not withdrawn, which
 * is `isPublished` for a channel and the identical shape for the
 * other two. Writing that test a fourth time in a page component
 * is how two parts of one product come to disagree about whether
 * something is on air. [C-31]
 */
export function doingNow(
  record: {
    live?: { phase?: string } | undefined;
    publication?: { unpublishedAt?: string } | undefined;
  },
): Doing {
  if (record.live && record.live.phase !== 'ended') return 'live';
  if (record.publication && !record.publication.unpublishedAt) return 'published';
  return 'draft';
}

/**
 * The order the ledger is read in.
 *
 * WHAT IS ON AIR FIRST, because the one row that can be hurting
 * somebody right now must not be below the fold. Then by weight,
 * descending — this ledger's first job is to answer "what is
 * costing me", and an alphabetical list answers that for nobody.
 * Ties by name, so the order is stable between two reads of an
 * unchanged installation. [D-04]
 */
export function orderHoldings(holdings: readonly Holding[]): Holding[] {
  const rank: Record<Doing, number> = { live: 0, published: 1, draft: 2 };
  return [...holdings].sort((a, b) => rank[a.doing] - rank[b.doing]
    || b.bytes - a.bytes
    || a.name.localeCompare(b.name));
}

/** What the installation adds up to, for the line above the table. */
export function ledgerSays(holdings: readonly Holding[]): string {
  if (holdings.length === 0) {
    return 'Nothing has been made here yet.';
  }
  const live = holdings.filter((one) => one.doing === 'live').length;
  const published = holdings.filter((one) => one.doing === 'published').length;
  const bytes = holdings.reduce((sum, one) => sum + one.bytes, 0);
  const size = bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB`
    : bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB`
      : `${Math.round(bytes / 1e3)} kB`;
  const parts = [`${holdings.length} ${holdings.length === 1 ? 'thing' : 'things'}`,
    `${size} on the volume`];
  if (live > 0) parts.push(`${live} on air`);
  if (published > 0) parts.push(`${published} published`);
  return `${parts.join(' · ')}.`;
}

/**
 * May this be retired, and if not, why not?
 *
 * THE REFUSAL IS A SENTENCE, NOT A DISABLED BUTTON. A control
 * that is grey for a reason nobody states is a control somebody
 * files a bug about. The one thing this refuses is deleting what
 * is on air from a list — not because it cannot be done, but
 * because doing it from a table of rows is not where that
 * decision belongs: the channel's own room says IT IS ON AIR
 * RIGHT NOW and asks for its name. [D-21, §19]
 */
export function mayRetire(holding: Holding): { may: boolean; because: string } {
  if (holding.doing === 'live') {
    return {
      may: false,
      because: 'It is on air. End the broadcast, or retire it from its own '
        + 'room where that is said plainly.',
    };
  }
  return { may: true, because: '' };
}

/**
 * May this be suspended — taken off the air for the public?
 *
 * SUSPEND IS `unpublish`, AND IT IS NOT A NEW CONCEPT. The route
 * has existed since publishing did, and its own sentence is the
 * right one: the channel keeps transmitting, the link simply
 * stops working. A second mechanism called "suspend" that did
 * something subtly different would be two switches for one light.
 *   [D-19, §17]
 */
export function maySuspend(holding: Holding): { may: boolean; because: string } {
  if (holding.doing === 'draft') {
    return { may: false, because: 'It was never published, so there is '
      + 'nothing to take down. Only its owner can reach it.' };
  }
  return { may: true, because: '' };
}

/**
 * WHAT IS DELIBERATELY NOT HERE, recorded rather than stubbed.
 *
 * "PAUSE". A channel cannot be paused, and inventing a switch
 * that looked like it could would be the worst kind of control:
 * one that promises a thing the transmitter has no way to do. A
 * channel is a clock — `whatIsOn` answers from the wall clock,
 * not from a cursor — so "pause" would have to mean either stop
 * transmitting (that is suspend, above, plus taking it off the
 * air) or hold the schedule still, which would put every viewer
 * on a different programme the moment it resumed. The honest
 * controls are SUSPEND (the public link stops) and EMERGENCY (the
 * channel cuts to a slide and says why), and both exist.
 *
 * ACCOUNTS AND SEATS. There is one account per installation
 * (`theAccount`), so there is nobody to suspend. Multi-user
 * administration is a different product decision and belongs in
 * a brief, not in a page that quietly grows a user table.
 *
 * Both are written down here because a control panel's most
 * expensive failure is a button that does not do what its label
 * says, and the second most expensive is a section of headings
 * with nothing under them — which `app/settings` already states
 * as a rule: *"a settings page that is mostly headings is a
 * settings page that has been designed rather than needed."*
 */
export const NOT_BUILT = ['pause', 'accounts'] as const;
