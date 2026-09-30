/**
 * Which take, over this stretch of song, and why.
 * [MASTER-EDIT §12 P3; Doctrine STUDIO-TWO §7, §8, U-02, U-15, U-19, D-19]
 *
 * §12's P3 list had four partials left on it — automatic repair
 * suggestions, best-take suggestions, automatic audio cleanup, and an AI
 * first cut — and measured against the product they turn out to be ONE
 * missing piece wearing four names. Every one of them is a sentence of the
 * form "over this stretch, this take rather than that one, because ___":
 *
 *   BEST TAKE is that question asked about a scene;
 *   A REPAIR's "choose a take" is it asked about a hole — the list already
 *   said which takes reach across the gap and could not say which of them
 *   an author should want;
 *   A FIRST CUT is it asked once per section of the song and strung
 *   together;
 *   AUTOMATIC CLEANUP is the same shape one layer down: pick the row that
 *   fits what was measured.
 *
 * So there is one ranking, four callers, and no second opinion anywhere in
 * the product about what makes a take good. [D-19]
 *
 * MEASURED FACTS ONLY, NEVER TASTE. This will not tell an author which
 * performance is better — nothing here can hear a vocal, and a product
 * that scored takes on "energy" would be inventing an opinion and dressing
 * it as a measurement. What it scores is what the document actually knows,
 * every bit of it put there by something that looked: coverage, whether
 * the sync was measured or assumed, whether there is sound, and the colour
 * reading `measureColour` took. A take wins here for reasons an author can
 * check. [U-02]
 *
 * AND EVERY SCORE CARRIES ITS REASONS, which is not decoration. A ranked
 * list with no reasons is an oracle, and U-15's whole position is that the
 * machine proposes and the author decides — which they cannot do if the
 * proposal will not say why. The reasons are what the interface shows; the
 * number is only what sorts them.
 *
 * NOTHING HERE APPLIES ANYTHING. Every function returns a proposal. The
 * first cut in particular produces scenes that do not exist until an author
 * accepts them, because an arrangement written into the document by a
 * heuristic is the machine editing somebody's performance. [U-15, AI_MAY]
 */

import {
  type Performance, type PerformanceTake, type RenderProblem,
  coversSpan, effectiveOffset, orderedScenes,
} from './performance.js';
import type { TakeId } from './document.js';
import { type Samples, HOUSE_SAMPLE_RATE } from './time.js';
import { isMeasured } from './colour.js';
import { formatMasterPosition } from './time.js';


export interface TakeScore {
  takeId: string;
  label: string;
  /** Higher is better. Only meaningful against the others in this list. */
  score: number;
  /**
   * Why, in the author's words, best first.
   *
   * Both kinds: what recommends this take and what is wrong with it. A
   * ranking that only lists virtues reads as advertising, and the thing an
   * author most needs to know about the take at the top is what it costs.
   */
  says: string[];
  /** Did it cover the whole stretch. Anything false cannot be chosen. */
  covers: boolean;
}

/*
 * THE WEIGHTS, WRITTEN DOWN SO THEY CAN BE ARGUED WITH.
 *
 * Not tuned — there is nothing to tune against, because there is no corpus
 * of "the take the author chose" to fit to. They are an ordering of how
 * much each fact matters, and the ordering is the claim: a take whose sync
 * was guessed is a worse problem than a take that is slightly dark,
 * because being out of sync is visible to everybody and a stop of
 * exposure is visible to nobody.
 */
const WEIGHT = {
  /** Placed against the song at all. The one that actually ruins a take. */
  placed: 40,
  /** It has sound in it at all. */
  hasAudio: 20,
  /** A colour reading exists, so it can be matched to the others. */
  measured: 6,
  /** Contrast, scaled. A flat picture is the commonest phone-video fault. */
  contrast: 18,
  /** Exposure, scaled. Penalised at both ends. */
  exposure: 12,
  /** The author already said this one is shaky, and had it steadied. */
  stabilised: 4,
} as const;

/** Mid-grey, in `signalstats`' own units, which is what a reading is in. */
const IDEAL_Y = 128;
/** A spread this wide or better scores the lot. */
const GOOD_SPREAD = 100;

/**
 * Score one take over one stretch.
 *
 * A take that does not cover the stretch scores zero and says so. It is
 * still returned rather than filtered out, because "this take does not
 * reach" is the most useful thing the list can tell an author who was
 * expecting it to.
 */
export function scoreTake(
  performance: Performance, take: PerformanceTake,
  fromSample: Samples, toSample: Samples,
): TakeScore {
  const song = performance.master.durationSamples;
  const covers = take.durationSamples > 0
    && coversSpan(take, fromSample, toSample, song);
  const says: string[] = [];

  if (!covers) {
    return {
      takeId: take.id,
      label: take.label,
      score: 0,
      covers: false,
      says: [`no picture from ${formatMasterPosition(fromSample)} `
        + `to ${formatMasterPosition(toSample)}`],
    };
  }

  let score = 0;

  /*
   * SYNC FIRST, because it is the one fault that ruins a take outright: a
   * performance a few frames out reads as badly mimed.
   *
   * AND `unplaced` IS THE ONLY BAD ANSWER, which the first version of this
   * got wrong. It rewarded `measured` alone and penalised the other four —
   * but `AlignmentMethod` says in its own docstring that `calibrated` is
   * BETTER than measured, `heard` is best, and `manual` "always wins, never
   * overwritten" because the author placed it. Only `unplaced` is not a
   * measurement, and it says so: "it sits at zero because something has to,
   * and zero is not a measurement". [INV-14]
   */
  if (take.alignment.method === 'unplaced') {
    says.push('nobody has placed it against the song — it sits at zero');
  } else {
    score += WEIGHT.placed;
  }

  if (take.hasAudio === false) {
    says.push('no sound in it — picture only');
  } else {
    score += WEIGHT.hasAudio;
  }

  const colour = take.colour;
  if (isMeasured(colour)) {
    score += WEIGHT.measured;
    /*
     * CONTRAST AND EXPOSURE, AND NOTHING CLEVERER. These are the two things
     * a reading can honestly say about a picture: how much range it has,
     * and whether it sits near the middle. Anything further — is it
     * flattering, is it in focus — is not in the numbers, and inventing it
     * would be the ranking making things up.
     */
    const spread = Math.min(1, colour!.ySpread / GOOD_SPREAD);
    score += WEIGHT.contrast * spread;
    if (spread < 0.55) says.push('flat — little contrast in the picture');
    else if (spread >= 0.8) says.push('plenty of contrast');

    const off = Math.abs(colour!.y - IDEAL_Y) / IDEAL_Y;
    score += WEIGHT.exposure * Math.max(0, 1 - off);
    if (colour!.y < IDEAL_Y * 0.55) says.push('dark');
    else if (colour!.y > IDEAL_Y * 1.45) says.push('bright, close to clipping');
    else if (off <= 0.2) says.push('well exposed');
  } else {
    says.push('colour not measured — match it to another take to find out');
  }

  if (take.stabilize) {
    score += WEIGHT.stabilised;
    says.push('steadied');
  }

  /*
   * A LIST OF FAULTS UNDER "MEASURES BEST HERE" READS AS A CONTRADICTION,
   * and until the screenshot there was nothing else it could contain.
   *
   * The interface says a name and then the reasons, so the reasons were
   * carrying the whole argument for the take — and every line above except
   * `steadied` was a COST. The recommendation came out as "Measures best
   * here: Beach. dark." An author reading that cannot tell whether the
   * ranking is recommending the take or warning them off it.
   *
   * So the two facts a reading can state in the take's favour are now
   * stated. They are the same numbers already being scored, said out
   * loud — not new opinions, and nothing here is scored for being said.
   *
   * The fallback needed the same correction: "nothing measured against
   * it" was meant as "no measurement counts against this take" and reads
   * as "nothing was measured", which is its opposite.
   */
  if (says.length === 0) says.push('nothing measured counts against it');

  return { takeId: take.id, label: take.label, score, covers, says };
}

/**
 * Every take over this stretch, best first.
 *
 * Ties broken by label rather than by document order, so the same question
 * asked twice gives the same answer — a ranking whose order depends on
 * which take was uploaded first is a ranking an author cannot learn.
 */
export function rankTakes(
  performance: Performance, fromSample: Samples, toSample: Samples,
): TakeScore[] {
  return performance.takes
    .map((take) => scoreTake(performance, take, fromSample, toSample))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

/**
 * The best take over this stretch, or nothing.
 *
 * `null` when no take covers it — which is a hole, and a hole has repairs
 * rather than a best take.
 */
export function bestTake(
  performance: Performance, fromSample: Samples, toSample: Samples,
): TakeScore | null {
  const ranked = rankTakes(performance, fromSample, toSample)
    .filter((entry) => entry.covers);
  return ranked[0] ?? null;
}

/* ------------------------------------------------------------------------ *
 *  A first cut.  [MASTER-EDIT §12 P3, U-15, AI_MAY 'suggest structure']
 * ------------------------------------------------------------------------ */

export interface ProposedScene {
  fromSample: Samples;
  toSample: Samples;
  takeId: string;
  label: string;
  says: string[];
}

export interface FirstCut {
  scenes: ProposedScene[];
  /** What it did, so an author reads a method rather than a result. */
  says: string;
  /** Why it could not, when it could not. */
  refused?: string;
}

/**
 * Propose an arrangement over the whole song.
 * [MASTER-EDIT §12 P3; Doctrine U-15, U-04]
 *
 * A PROPOSAL AND NOT AN EDIT. Nothing here writes a scene. The doctrine's
 * own list of what AI may do has "suggest structure" on it and "alter what
 * the user recorded themselves saying" on the other list, and an
 * arrangement written into the document by a heuristic is closer to the
 * second than it looks: the cut IS the authorship in this studio. So this
 * returns scenes that do not exist, and something an author presses makes
 * them exist.
 *
 * IT CUTS ON THE BEAT GRID WHEN THERE IS ONE THE AUTHOR HAS ACCEPTED, and
 * otherwise in even sections. Not because even sections are good — they
 * are not — but because the alternative is inventing musical structure the
 * product cannot hear, and a first cut that pretends to know where the
 * chorus is will be wrong in a way that takes longer to fix than starting
 * from nothing. [INV-06: a detection is a suggestion until accepted]
 *
 * IT ALTERNATES WHERE IT CAN, which is the one piece of taste here and is
 * stated as such: a first cut that puts the same take on the whole song is
 * not a cut, it is a choice of take. So the best take that is not the
 * previous one wins each section, unless only one take covers it.
 */
export function proposeFirstCut(
  performance: Performance, sections = 8,
): FirstCut {
  const song = performance.master.durationSamples;
  if (song <= 0) return { scenes: [], says: '', refused: 'this song has no length' };
  if (performance.takes.length === 0) {
    return { scenes: [], says: '', refused: 'there are no takes to cut between' };
  }

  const beats = performance.beats;
  /*
   * ONLY AN ACCEPTED GRID COUNTS. A detected tempo is a suggestion until a
   * human says yes, and cutting a song on a period nobody confirmed is the
   * product acting on its own guess. [INV-06]
   */
  const accepted = Boolean(beats?.acceptedBy) && (beats?.bpm ?? 0) > 0;

  /*
   * THE BOUNDARIES. On an accepted grid they fall on beats — every Nth, so
   * a section is a bar-ish length rather than a beat, and a cut lands
   * where the song already turns. Otherwise even divisions, which is
   * honest rather than good.
   */
  const bounds: Samples[] = [0];
  if (accepted) {
    const perBeat = (60 / beats!.bpm) * HOUSE_SAMPLE_RATE;
    const phase = beats!.phaseSamples ?? 0;
    const total = Math.max(1, Math.floor((song - phase) / perBeat));
    const every = Math.max(1, Math.round(total / sections));
    for (let i = every; i * perBeat + phase < song; i += every) {
      const at = Math.round(i * perBeat + phase);
      if (at > (bounds[bounds.length - 1] ?? 0)) bounds.push(at);
    }
  } else {
    for (let i = 1; i < sections; i += 1) {
      bounds.push(Math.round((song * i) / sections));
    }
  }

  const scenes: ProposedScene[] = [];
  let previous: string | null = null;
  for (let i = 0; i < bounds.length; i += 1) {
    const from = bounds[i]!;
    const to = bounds[i + 1] ?? song;
    if (to <= from) continue;
    const ranked = rankTakes(performance, from, to).filter((entry) => entry.covers);
    if (ranked.length === 0) continue;
    /* Alternate where there is anything to alternate with. */
    const pick = ranked.find((entry) => entry.takeId !== previous) ?? ranked[0]!;
    previous = pick.takeId;
    scenes.push({
      fromSample: from,
      toSample: to,
      takeId: pick.takeId,
      label: pick.label,
      says: pick.says,
    });
  }

  if (scenes.length === 0) {
    return {
      scenes: [],
      says: '',
      refused: 'no take has picture across any stretch of this song',
    };
  }

  return {
    scenes,
    says: accepted
      ? `${scenes.length} sections on the beat grid you accepted, `
        + 'each on the best-measuring take that covers it'
      : `${scenes.length} even sections — there is no accepted beat grid, and `
        + 'guessing where the chorus is would be worse than dividing evenly',
  };
}

/**
 * Does this proposal differ from what is already there.
 *
 * SO THE OFFER CAN BE WITHDRAWN. A first cut offered over an arrangement
 * an author has already made is the product asking to throw their work
 * away, and the honest time to offer one is when there is nothing to lose.
 */
export function worthProposing(performance: Performance): boolean {
  return orderedScenes(performance).length === 0;
}

/* ------------------------------------------------------------------------ *
 *  The ways out of a hole.  [MASTER-EDIT §13, §12 P3]
 *
 *  MOVED HERE FROM `performance.ts`, and the move is the point rather than
 *  tidying. The `choose` repair used to say "3 take(s) have picture across
 *  all of it", which closes the hole and hands the author straight back the
 *  question they were stuck on — WHICH three, and which of them do I want.
 *  Answering that means ranking, ranking lives above the document, and a
 *  document module that imports its own suggestions is a cycle.
 *
 *  So the suggestion moved to where suggestions are. `performance.ts`
 *  describes what a performance IS and what is wrong with one;
 *  this module says what to do about it. [D-19]
 * ------------------------------------------------------------------------ */

/**
 * How a hole could be closed, offering only what would close it.
 * [MASTER-EDIT §13]
 *
 * THE BRIEF LISTS FIVE REMEDIES. Two of them cannot apply to a hole at the
 * start of a song — there is no previous take to extend and no previous
 * frame to freeze — and one of them ("add transition") is not a repair at
 * all: a transition between two shots does not put a shot where there is
 * none. Offering all five and failing on three is how a repair menu teaches
 * somebody to stop reading it.
 *
 * AND "CHOOSE A TAKE" IS ONLY WORTH OFFERING FOR TAKES THAT REACH. The
 * product already knows which ones do — `coversSpan` is the same question
 * the timeline asks — so the list is the takes that would actually cover
 * the stretch, and it says so when none of them would. A picker that lets
 * you choose a take that does not reach has moved the error, not fixed it.
 */
export interface Repair {
  id: 'use-next' | 'choose' | 'align-first' | 'use-previous' | 'freeze';
  label: string;
  /** Why it is offered, or why it is not. */
  says: string;
  available: boolean;
  /** For `choose`: the takes that would actually cover the stretch. */
  takeIds?: TakeId[];
  /** For `align-first`: the take to move, and the push that moves it. */
  takeId?: TakeId;
  nudgeSamples?: number;
}

export function repairsFor(
  performance: Performance, problem: RenderProblem,
): Repair[] {
  const song = performance.master.durationSamples;
  const from = problem.fromSample ?? 0;
  const to = problem.toSample ?? song;
  const scenes = orderedScenes(performance);
  const before = [...scenes].reverse().find((scene) => scene.fromSample < from);
  /* Ranked rather than listed: see the `choose` repair below. */
  const covering = rankTakes(performance, from, to)
    .filter((entry) => entry.covers);

  return [
    {
      id: 'use-next',
      label: 'Use the next take',
      available: Boolean(problem.extend),
      says: problem.extend
        ? 'start the scene that follows this stretch earlier'
        : 'nothing follows this stretch',
    },
    {
      id: 'choose',
      label: 'Choose a take',
      available: covering.length > 0,
      /*
       * WHICH ONE, AND NOT MERELY HOW MANY.  [MASTER-EDIT §12 P3]
       *
       * This used to say "3 take(s) have picture across all of it", which
       * closes the hole and hands the author back the question they were
       * stuck on. `rankTakes` is the same ranking best-take and the first
       * cut use, so a repair cannot recommend one take while the scene
       * beside it recommends another. [D-19]
       */
      says: covering.length > 0
        ? (() => {
          const best = covering[0]!;
          return `${covering.length} take(s) reach across it — `
            + `"${best.label}" measures best (${best.says[0]})`;
        })()
        : 'no take reaches across this stretch',
      takeIds: covering.map((entry) => entry.takeId as TakeId),
    },
    /*
     * ALIGN THE FIRST TAKE TO THE START OF THE SONG.  [TIMELINE B11]
     *
     * The author's own example, and the fault that prompted this whole
     * brief: "There is a 1.248 second gap at the beginning of the
     * master video... [Align first take to 00:00]". A performer who
     * started singing a second and a quarter late leaves a hole at the
     * top of the song, and the honest remedy is not to stretch
     * somebody else's scene over it — it is to move the take back to
     * where it was meant to begin.
     *
     * OFFERED ONLY FOR A HOLE AT THE VERY START, because that is the
     * only place the argument holds. A gap in the middle is not
     * somebody starting late; moving a take to close it would pull
     * everything they sang out of time with the song, which is the
     * one thing this product exists to keep.
     *
     * IT WRITES THE NUDGE, never the measurement — so how far out the
     * automatic answer was stays readable, and a re-measure does not
     * discard the fix. [S-3, INV-14]
     */
    ...(() => {
      if (from !== 0) return [];
      const first = [...performance.takes]
        .filter((take) => take.durationSamples > 0)
        .sort((a, b) => effectiveOffset(a.alignment) - effectiveOffset(b.alignment))[0];
      const starts = first ? Math.max(0, effectiveOffset(first.alignment)) : 0;
      return [{
        id: 'align-first' as const,
        label: 'Align the first take to 00:00',
        available: Boolean(first) && starts > 0,
        says: !first
          ? 'there is no take to align'
          : starts > 0
            ? `"${first.label}" begins ${formatMasterPosition(starts)} into the `
              + 'song; this moves it back to the start'
            : `"${first.label}" already begins with the song`,
        ...(first ? {
          takeId: first.id as TakeId,
          nudgeSamples: -first.alignment.offsetSamples,
        } : {}),
      }];
    })(),
    {
      id: 'use-previous',
      label: 'Extend the previous take',
      available: false,
      says: before
        ? 'a scene already runs up to this stretch — its TAKE is what falls '
          + 'short, so extend or replace the take'
        : 'nothing comes before this stretch',
    },
    {
      id: 'freeze',
      label: 'Freeze the previous frame',
      available: false,
      says: 'a still held from a take is not something the renderer can make yet',
    },
  ];
}
