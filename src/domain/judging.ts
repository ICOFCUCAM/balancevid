/**
 * Judging is people, and every score carries its reason.
 *   [GO-VIRAL V-5; Doctrine U-15, D-19, D-03]
 *
 * > *"Publish the criteria before the campaign opens, not after it
 * > closes."*
 *
 * THIS PRODUCT ALREADY RANKS THINGS AND MUST NOT RANK THESE.
 * `src/domain/takeRanking.ts` scores takes on measured facts and
 * says so in its own first paragraph: *"this will not tell an
 * author which performance is better — nothing here can hear a
 * vocal, and a product that scored takes on 'energy' would be
 * inventing an opinion and dressing it as a measurement."* A
 * competition is entirely the thing it refuses to do. So there is
 * no shared code, no shared number, and deliberately no seeding:
 * **a panel handed a machine's score has been anchored by a
 * measurement that cannot hear.** `takeRanking` is untouched by
 * this stage in both directions.
 *
 * WHAT IS BORROWED IS ITS POSTURE, WHICH IS THE OPPOSITE OF ITS
 * CODE. *"Every score carries its reasons, which is not
 * decoration. A ranked list with no reasons is an oracle."* The
 * same sentence with the actor changed: a panel that produced
 * numbers and no words would be an oracle with people in it, and
 * nobody could review a decline or reverse one on grounds.
 *
 * A RESULT IS DERIVED AND NEVER STORED. `resultsFor` is a pure
 * function of the judgements, so a result can be recomputed, a
 * judgement can be corrected, and nothing in this product can
 * hold a standing that its own records do not produce. [D-19]
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import type { Id } from './ids.js';

/* ------------------------------------------------------------------ *
 *  What a call is judged on.
 * ------------------------------------------------------------------ */

/** Out of ten, unless the organiser says otherwise. */
export const MARK_OUT_OF = 10;

/** The longest a criterion's wording may be, because it is a label. */
export const CRITERION_LONGEST = 120;

/** The longest a judge's reason may be. Long, because it is the point. */
export const REASON_LONGEST = 4000;

/**
 * One thing a panel marks.
 *
 * SEPARATE FROM `rules.criteria`, AND THE TWO ARE NOT THE SAME
 * FIELD WEARING TWO HATS. `rules.criteria` is a paragraph an
 * entrant reads before deciding whether to enter — *"tuning,
 * feel, and whether it sounds like you rather than like the
 * record"* — and collapsing it into a list would force the
 * organiser's own sentence into bullet points. These are what a
 * JUDGE fills in: each needs an id a judgement can name and a
 * scale to be out of, neither of which a paragraph has.
 *
 * THE PARAGRAPH IS ALREADY FROZEN, because nothing can edit it:
 * `newCampaign` writes `rules` and no verb changes them. These
 * freeze at LIVE, which is the rule this stage adds and the one
 * an organiser could otherwise break.
 */
export interface Criterion {
  id: Id<'crit'>;
  /** What it is called, on the form and in the result. */
  says: string;
  /** The top mark. Ten unless the organiser said otherwise. */
  outOf: number;
}

/**
 * Somebody who may mark.  [GO-VIRAL V-5, §4]
 *
 * A NAME AND NOT AN ACCOUNT, which is the same decision
 * `ParticipationRequest.participant` records and for the same
 * reason: one account exists on an installation
 * (`OWNER_ACCOUNT_ID`), and inventing a second kind of login so
 * three people can mark eleven videos would be a user system
 * built for a panel. The organiser enters what the panel decided,
 * and each judgement says which of them decided it.
 *
 * WHICH IS HONEST ABOUT WHAT IT PROVES. This records WHO a
 * judgement is attributed to; it does not prove they typed it.
 * A product that implied otherwise would be worse than one that
 * says so — and a panel of named people whose reasons are on
 * record is already further than a score with nobody's name on
 * it. Judge accounts are recorded in **Not built**.
 */
export interface Judge {
  id: Id<'judge'>;
  name: string;
}

/* ------------------------------------------------------------------ *
 *  What one judge said about one entry.
 * ------------------------------------------------------------------ */

/** One mark, against one published criterion. */
export interface Mark {
  criterion: Id<'crit'>;
  score: number;
}

/**
 * One judge, one entry, a score per criterion, and a reason.
 *
 * THE REASON IS REQUIRED AND THERE IS ONE OF IT. *"No score
 * exists without a reason"* is the judging criterion, and it is
 * satisfied by a reason that cannot be omitted rather than by one
 * per mark: a judge made to write four paragraphs about one entry
 * writes the same sentence four times, which is a form that
 * produces words and not reasons.
 *
 * THE ENTRY IS A SUBMISSION, which is the unit the public wall
 * already draws — one row per capture, however many cameras saw
 * it. A judgement that named a REQUEST would be a judgement of
 * somebody's three takes at once, and a competition marks a
 * performance. [V-4 `wallOf`]
 */
export interface Judgement {
  id: Id<'judg'>;
  /** The submission being marked. */
  entry: string;
  /** Which of the panel. */
  by: Id<'judge'>;
  at: string;
  marks: Mark[];
  /** Why, in their own words. Never empty. */
  says: string;
}

/**
 * Why this judgement cannot be recorded, or nothing.
 *
 * ONE PREDICATE, ASKED WHERE IT IS WRITTEN AND WHERE IT IS SHOWN,
 * so a form that would be refused is a form that says so before
 * somebody fills it in. [D-19]
 *
 * EVERY PUBLISHED CRITERION, EXACTLY ONCE, AND NOTHING ELSE. A
 * judgement missing a mark is a judgement of a different
 * competition from the one beside it, and a result averaging the
 * two would be comparing a total out of thirty with a total out
 * of forty. A mark naming a criterion this call does not have is
 * the same error from the other side.
 */
export function judgementProblem(spec: {
  criteria: readonly Criterion[];
  panel: readonly Judge[];
  by: string;
  marks: readonly Mark[];
  says: string;
}): string {
  if (spec.criteria.length === 0) {
    return 'this call has nothing published to mark against';
  }
  if (!spec.panel.some((one) => one.id === spec.by)) {
    return 'that is not somebody on this call\'s panel';
  }
  if (!spec.says.trim()) {
    return 'a score without a reason is not a judgement';
  }
  const seen = new Set<string>();
  for (const mark of spec.marks) {
    const criterion = spec.criteria.find((one) => one.id === mark.criterion);
    if (!criterion) return 'that is not one of this call\'s criteria';
    if (seen.has(mark.criterion)) return 'that criterion was marked twice';
    seen.add(mark.criterion);
    if (!Number.isFinite(mark.score) || mark.score < 0
      || mark.score > criterion.outOf) {
      return `${criterion.says} is marked out of ${criterion.outOf}`;
    }
  }
  if (seen.size !== spec.criteria.length) {
    return 'every criterion has to be marked';
  }
  return '';
}

/* ------------------------------------------------------------------ *
 *  What the panel decided, worked out from what they wrote.
 * ------------------------------------------------------------------ */

/** One entry's standing, derived and never stored. */
export interface Verdict {
  entry: string;
  /** The mean of each judge's total, out of `outOf`. */
  score: number;
  outOf: number;
  /** How many of the panel marked it. */
  judges: number;
  /** The mean per criterion, so a result can be read and not just ranked. */
  byCriterion: { criterion: Id<'crit'>; says: string; score: number }[];
  /** Every reason given, in the order they were given. */
  says: string[];
}

/**
 * The standing, from the judgements and from nothing else.
 *
 * > **Judged on:** *"The result recomputes exactly from the stored
 * > judgements."*
 *
 * SO IT IS A PURE FUNCTION AND THE PRODUCT STORES NO RESULT. A
 * standing written into a document is a standing that can
 * disagree with the judgements under it — and the first time
 * somebody corrects a mark, it does.
 *
 * THE MEAN OF THE JUDGES AND NOT THE SUM, because a panel is not
 * always three people. An entry two judges could reach and a
 * third could not must not lose to one that happened to be
 * marked by everybody; the sum would make attendance a criterion.
 *
 * AND `judges` IS PRINTED BESIDE IT, because the mean of one is
 * not the mean of three and a reader is entitled to know which
 * they are looking at.
 *
 * TIES ARE NOT BROKEN HERE. Two entries with the same mean are
 * the same mean, and inventing a tiebreak — earlier, longer, more
 * judges — would be this module having an opinion. The order
 * among equals is the order they were entered in, which is the
 * one fact that is not a judgement.
 */
export function resultsFor(
  criteria: readonly Criterion[], judgements: readonly Judgement[],
): Verdict[] {
  const outOf = criteria.reduce((all, one) => all + one.outOf, 0);
  const entries = new Map<string, Judgement[]>();
  for (const one of judgements) {
    const already = entries.get(one.entry);
    if (already) already.push(one);
    else entries.set(one.entry, [one]);
  }

  const out: Verdict[] = [];
  for (const [entry, given] of entries) {
    const totals = given.map(
      (one) => one.marks.reduce((all, mark) => all + mark.score, 0));
    out.push({
      entry,
      score: mean(totals),
      outOf,
      judges: given.length,
      byCriterion: criteria.map((criterion) => ({
        criterion: criterion.id,
        says: criterion.says,
        score: mean(given.map((one) => one.marks
          .find((mark) => mark.criterion === criterion.id)?.score ?? 0)),
      })),
      says: given.map((one) => one.says),
    });
  }
  /*
   * HIGHEST FIRST, AND A STABLE SORT KEEPS THE REST. `Array.sort`
   * has been stable in every engine since ES2019, so equals come
   * back in insertion order — which is arrival order, because the
   * map above was filled in the order the judgements were made.
   */
  return out.sort((a, b) => b.score - a.score);
}

/**
 * A mean to one decimal place.
 *
 * ROUNDED, BECAUSE IT IS PRINTED. `7.333333333333333` out of
 * thirty is a number nobody reads and a number that changes when
 * the arithmetic is reordered. One place is as fine as a panel of
 * people can distinguish.
 */
function mean(numbers: readonly number[]): number {
  /*
   * NO GUARD FOR AN EMPTY LIST, and one was written and deleted.
   * Both callers pass a list built from `given`, which is a map
   * entry that exists only because a judgement was pushed into
   * it — so there is no list of none to divide by. A branch that
   * cannot change an answer is a branch nobody can check.
   * [the thirty-fourth]
   */
  const total = numbers.reduce((all, one) => all + one, 0);
  return Math.round((total / numbers.length) * 10) / 10;
}

/** What to tell somebody reading a standing. One line, no jargon. */
export function verdictSays(verdict: Verdict): string {
  const marked = verdict.judges === 1 ? '1 judge' : `${verdict.judges} judges`;
  return `${verdict.score} out of ${verdict.outOf}, from ${marked}.`;
}
