/**
 * Where a person's own work stands, in their own words.
 *   [TAKE-APP T16, P5; Doctrine D-19, D-21, U-19, U-02]
 *
 * > *"My Takes. Drafts — private until you choose to send. Sent
 * > to studio — submission status from the owning installation.
 * > Published — creator copies and share permissions."*
 *
 * THE SPLIT THE LIBRARY ALREADY HAD THE DATA FOR AND DID NOT
 * DRAW. `/api/take/<link>` answers with `state` and `submitted`
 * on every row, the Library fetches both on every row, and it
 * kept neither — every take sat in one undifferentiated list
 * whatever had happened to it. A person who has sent nine takes
 * to four studios could not tell which ones were still waiting
 * on them.
 *
 * TEN STATES, THREE SHELVES, AND THAT IS NOT A SIMPLIFICATION.
 * `REQUEST_STATES` is the studio's vocabulary — `received`,
 * `reviewed`, `attached` are things that happen in a control
 * room, and the difference between them is the studio's
 * business. What a performer needs to know is whose move it is:
 * mine, theirs, or finished. [D-04]
 *
 * AND THE FOURTH SHELF IS NOT IN THE BENCHMARK, because the
 * benchmark has no word for a take a studio turned down. This
 * product does — `rejected` is a real state a real request
 * reaches — and folding it into "sent" would leave somebody
 * waiting for an answer that has already come. A shelf nobody
 * wants to land on is still better than a lie. [U-19]
 */

import type { RequestState } from './participation.js';

export type Shelf = 'mine' | 'theirs' | 'done' | 'closed';

export interface Standing {
  shelf: Shelf;
  /** What has happened, to the person it happened to. */
  says: string;
}

/**
 * The shelves, in the order a person reads them.
 *
 * WHOSE MOVE IT IS, FIRST. A take that still needs recording is
 * the only row on this page anybody can act on, so it is the
 * only one that belongs at the top. The rest is a record.
 */
export const SHELVES: { shelf: Shelf; says: string; under: string }[] = [
  {
    shelf: 'mine',
    says: 'Still yours',
    under: 'Not sent. Nobody has seen these but you.',
  },
  {
    shelf: 'theirs',
    says: 'Sent to the studio',
    under: 'With the installation that asked for them.',
  },
  {
    shelf: 'done',
    says: 'Used',
    under: 'Your take is in something they finished.',
  },
  {
    shelf: 'closed',
    says: 'Not used',
    under: 'The studio decided not to use these.',
  },
];

/**
 * WHERE ONE TAKE STANDS.
 *
 * `submitted` DECIDES THE FIRST SHELF AND THE STATE DOES NOT,
 * which is the one subtle line here. A request moves to
 * `recording` the moment somebody opens the recorder and points
 * a camera at themselves; a request that reached `recording` and
 * was never sent is still entirely private, and calling it "sent
 * to the studio" because of a state transition the performer
 * never saw would be this page lying about who has their face.
 * [D-03, U-19]
 *
 * A COUNT IS NOT A PROMISE OF MEDIA EITHER WAY. `submitted`
 * counts takes the studio HAS; the queue on the device may hold
 * segments that have not landed yet, and those are the
 * recorder's business and shown there. This answers one
 * question: has anything of mine arrived?
 */
export function standingOf(
  { state, submitted, published }: {
    state: RequestState | undefined;
    submitted: number | undefined;
    /** A finished piece this take is in, where the studio published one. */
    published: boolean;
  },
): Standing {
  if (published) {
    return { shelf: 'done', says: 'Published — you can watch and share it' };
  }
  if (state === 'rejected') {
    return { shelf: 'closed', says: 'Not used this time' };
  }
  if (state === 'accepted' || state === 'attached') {
    return { shelf: 'done', says: 'Accepted by the studio' };
  }

  const sent = submitted ?? 0;
  if (sent > 0) {
    /*
     * HOW MANY, BECAUSE THEY SENT THEM ONE AT A TIME AND
     * REMEMBER DOING IT. "Sent" under a row where somebody sent
     * three is a page that has not been paying attention.
     */
    const many = sent === 1 ? 'One take sent' : `${sent} takes sent`;
    if (state === 'reviewed') return { shelf: 'theirs', says: `${many} · being reviewed` };
    if (state === 'received') return { shelf: 'theirs', says: `${many} · received` };
    return { shelf: 'theirs', says: `${many} · waiting on the studio` };
  }

  if (state === 'recording') {
    return { shelf: 'mine', says: 'Started, not sent' };
  }
  return { shelf: 'mine', says: 'Not recorded yet' };
}

/**
 * A SHELF WITH NOTHING ON IT IS NOT DRAWN.
 *
 * The benchmark draws all three headings with a dash beside
 * each, which is a design showing its own structure. A person
 * with one take and nothing else does not need to be told that
 * they have no published work and nothing rejected; this
 * product's own rule about a section of headings with nothing
 * under them applies to its own app. [D-04, U-19]
 */
export function shelvesWith<T>(
  rows: T[], standing: (row: T) => Standing,
): { shelf: Shelf; says: string; under: string; rows: T[] }[] {
  return SHELVES
    .map((one) => ({
      ...one,
      rows: rows.filter((row) => standing(row).shelf === one.shelf),
    }))
    .filter((one) => one.rows.length > 0);
}
