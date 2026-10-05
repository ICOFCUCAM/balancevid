/**
 * What this device's home is, assembled from what answered.
 *   [TAKE-PLATFORM U3, P16, P22, P23, P24, P25; GO-VIRAL V-8]
 *
 * *"A customer reaches it as a `Connection` and nothing more."*
 *
 * THE WHOLE OF V-8's THIRD CLAIM IS IN THIS FILE. *"Entering a
 * network campaign is the ordinary Take protocol, outbound,
 * against the network's origin."* There is no federation here, no
 * registry, and no second API: the device asks each installation
 * it remembers the same public question it asks the one that
 * served it, and puts the answers next to each other. The
 * BalanceVid public competition network is one more row in that
 * list, reached the way a friend's self-hosted studio is reached.
 *
 * AND THE FIRST CLAIM IS HERE TOO, AS A PROPERTY RATHER THAN A
 * FEATURE: *"a self-hosted installation with the network's origin
 * unreachable loses nothing of its own."* Nothing below can let a
 * remote answer remove, reorder away or replace anything local.
 * One that did not answer becomes a line saying so.
 *
 * SEPARATED FROM THE COMPONENT SO IT CAN BE TESTED AT ALL. The
 * merge used to live inside a `useEffect`, where the only way to
 * ask *what happens when the network is down* was to render a
 * page and stub a fetch. [D-19]
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import type { CallRow } from '../../src/domain/campaign.js';
import type { Connection, Instance } from '../../shared/src/connections.js';

/** One thing to take part in, as an installation listed it. */
export interface Row {
  kind: 'music' | 'video' | 'programme';
  /**
   * Which installation offered it, filled in by the client.
   *
   * NOT SENT BY THE SERVER. Each installation answers about itself; it
   * is this device that knows it asked three of them, and a row that
   * carried its own origin would be a row that could claim somebody
   * else's. [connections.ts]
   */
  from?: Instance;
  id: string;
  title: string;
  author?: string;
  publishedAt?: string;
  respondable: boolean;
  access: string | null;
  state: string;
  watch: string;
  /** The public address, where the thing has one. [N-4] */
  slug?: string;
  openToAnyone: boolean;
}

/** One call, with the installation it is being run by. */
export interface HomeCall extends CallRow {
  from?: Instance;
}

/** What one installation answered, or that it did not. */
export interface Answer {
  instance: Instance;
  rows: Row[];
  calls: CallRow[];
}

export interface Home {
  rows: Row[];
  calls: HomeCall[];
  /** The origins that did not answer, which are shown and not dropped. */
  asleep: string[];
}

/**
 * Where a row's link goes, from this device.
 *
 * SAME-ORIGIN STAYS A PATH AND A REMOTE ONE BECOMES A WHOLE URL,
 * which is not a cosmetic difference. A path is resolved against
 * whatever page is drawing it, so a remote call drawn as
 * `/go/spring-song` would send somebody to the WRONG
 * INSTALLATION'S call of that name — or to a 404 that looks like
 * the call was deleted. The origin is the one this device
 * actually reached, never one an answer claimed. [connections.ts]
 *
 * AND IT IS A PLAIN LINK, WHICH IS THE POINT OF THE CLAIM. The
 * person lands on the other installation's own `/go` page and
 * enters there, in its own session, under its own terms — the
 * ordinary Take protocol, outbound. Nothing is proxied, and this
 * installation is never told they went. [GO-VIRAL V-8, D-25]
 */
export function linkTo(at: string, origin?: string): string {
  if (!origin) return at;
  return `${origin}${at}`;
}

/**
 * Open calls first, soonest deadline first.
 *
 * ACROSS INSTALLATIONS, WHICH IS WHY IT IS DONE AGAIN HERE. Each
 * installation already sorted its own answer; three sorted lists
 * concatenated are not a sorted list, and a person with three
 * connections would see every call from the first before the one
 * closing in an hour on the third.
 *
 * `open` IS THE SERVER'S ANSWER AND NOT THIS FILE'S. Deriving it
 * from `state` and `clock` here would be a fourth reading of a
 * question `takingEntries` already answers. [D-19]
 */
function byUrgency(a: HomeCall, b: HomeCall): number {
  if (a.open !== b.open) return a.open ? -1 : 1;
  if (a.open) return (a.closesAt ?? '').localeCompare(b.closesAt ?? '');
  return (b.closesAt ?? '').localeCompare(a.closesAt ?? '');
}

/**
 * Everything this device can see, local first and never less than
 * local.
 *
 * THE LOCAL ANSWER IS TAKEN WHOLE BEFORE ANY OTHER IS LOOKED AT,
 * and that ordering is the test of V-8's first claim rather than
 * an implementation detail. A merge that built one list and then
 * filtered it would be a merge where a malformed remote answer
 * could take a local row out.
 */
export function homeFrom(
  local: { instance?: Instance; participate?: Row[]; calls?: CallRow[] } | null,
  others: { connection: Connection; answer: Answer | null }[] = [],
): Home {
  const where = local?.instance;
  const rows: Row[] = (local?.participate ?? []).map((row) => ({
    ...row, ...(where ? { from: where } : {}),
  }));
  /*
   * A LOCAL CALL KEEPS ITS PATH. `from` is still filled in,
   * because a device with three installations has to be able to
   * tell whose call it is looking at even when one of them is
   * the one that served the page.
   */
  const calls: HomeCall[] = (local?.calls ?? []).map((row) => ({
    ...row, ...(where ? { from: where } : {}),
  }));

  const asleep: string[] = [];
  for (const { connection, answer } of others) {
    if (!answer) { asleep.push(connection.origin); continue; }
    for (const row of answer.rows) rows.push({ ...row, from: answer.instance });
    for (const row of answer.calls) {
      calls.push({
        ...row, from: answer.instance,
        at: linkTo(row.at, answer.instance.origin),
      });
    }
  }

  rows.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
  calls.sort(byUrgency);
  return { rows, calls, asleep };
}
