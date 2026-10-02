/**
 * The join between two programmes.  [Doctrine CHANNEL §5, §6, §9,
 * §13, D-04, D-16, C-34]
 *
 *     …programme A ──┐                    ┌── programme B…
 *                    └ fade out · fade in ┘
 *                         400ms  400ms
 *
 * THE AUDIT'S ROW: *"Transitions | Cut only | Dissolve, wipe,
 * stinger."* A channel that hard-cuts from a music video to a
 * conversation is a channel that sounds like a mistake at every
 * join — and the audible click of a cut between two unrelated
 * waveforms is worse than the visual jump, because an ear notices a
 * discontinuity an eye forgives.
 *
 * A DIP TO BLACK, NOT A CROSS-DISSOLVE, and the reason is material
 * rather than taste. A cross-dissolve needs the two items to OVERLAP
 * — the outgoing one has to keep playing while the incoming one
 * starts — and at a programme boundary the outgoing item has usually
 * just ended, so there is nothing after it to dissolve from. Reading
 * past the end of a file produces the frozen frame or the black that
 * a dissolve was supposed to avoid.
 *
 * A dip needs nothing extra from either side: the last 400ms of what
 * was playing fades down, the first 400ms of what follows fades up,
 * and both happen inside material that already exists. It is also
 * what a broadcaster actually does between two unrelated programmes.
 * A true dissolve belongs where the two things genuinely overlap,
 * which is the vision mixer and not the playout engine.
 *
 * ──────────────────────────────────────────────────────────────────
 *
 * THE RULES MATTER MORE THAN THE EFFECT. Three joins must stay hard
 * cuts, and each of them is a case where half a second is worth less
 * than what it costs.
 */

import type { OnAir } from './channel.js';

/**
 * How long each side of the dip lasts.
 *
 * FOUR HUNDRED MILLISECONDS, which is about the shortest a dip can
 * be and still read as deliberate. Under a quarter-second it looks
 * like a dropped frame; past about a second it is a MIX, which is a
 * mood a continuity announcer sets and not something a schedule
 * should do to every join by itself.
 */
export const DIP_MS = 400;

/**
 * The shortest piece worth fading.
 *
 * A fade cannot be longer than the thing it is fading, and a piece
 * shorter than about a second is mostly fade — which is a flicker,
 * not a transition. Those pieces are cut, as they were.
 */
export const LEAST_PIECE_MS = 1_000;

/**
 * Is this join a cut, whatever else is true?
 *
 * THE EMERGENCY SOURCE IS NEVER FADED INTO. Somebody pressed a
 * button marked EMERGENCY, and the product answering with four
 * hundred milliseconds of a slow dip is the product deciding its
 * own polish is worth more than the reason they pressed it. Out of
 * it is the same: when an operator clears an emergency, the thing
 * they want back is the channel, now. [§9]
 *
 * A LIVE FEED IS NEVER FADED EITHER. Cutting to live is what a cut
 * is for — a gallery cuts to a camera, it does not mix to one from
 * the schedule — and fading a live feed means choosing to lose half
 * a second of something that is happening while it happens. [§6]
 *
 * AND NOTHING IS FADED INTO ITSELF. A boundary between two turns of
 * the same item, or a read split for any other reason, is not a
 * join: dipping there would put a hole in the middle of a
 * programme. This is the rule the other two are special cases of,
 * and it is the one a careless implementation gets wrong.
 */
export function isCut(leaving: OnAir, arriving: OnAir): boolean {
  for (const side of [leaving, arriving]) {
    if (side.kind === 'emergency' || side.kind === 'live') return true;
  }
  return sameThing(leaving, arriving);
}

/** What is on the wire, or nothing when the channel is off. */
function sourceOf(on: OnAir): unknown {
  return on.kind === 'off' ? undefined : on.source;
}

/**
 * Two answers naming one thing, which is not a join at all.
 *
 * WRITTEN WITHOUT GUARDS, after two attempts that had them. The
 * first spelled out both off-air cases; the second dropped one
 * because every mutation of it survived — and that verdict was
 * WRONG. The guard was narrowing the type, not deciding the answer,
 * and a mutant is never typechecked, so the method that has been
 * reliable here for eleven stages is blind to exactly this kind of
 * line. `tsc` caught it a minute later.
 *
 * The lesson is in the shape of the fix rather than in a comment
 * about it: naming the thing that is sometimes absent removes both
 * the guard and the question. Two channels that are off have no
 * source and compare equal; one that is off and one that is not
 * compare unequal, because a source stringifies and `undefined`
 * does not.
 */
export function sameThing(a: OnAir, b: OnAir): boolean {
  return JSON.stringify(sourceOf(a)) === JSON.stringify(sourceOf(b));
}

/**
 * How long to fade, given how much of the piece there is.
 *
 * Never more than a third of the piece, so a short one still shows
 * what it is before it starts leaving.
 */
export function dipMs(pieceMs: number, most = DIP_MS): number {
  if (pieceMs < LEAST_PIECE_MS) return 0;
  return Math.min(most, Math.floor(pieceMs / 3));
}

export interface Dip {
  /** Fade the end of the outgoing piece down over this long. */
  outMs: number;
  /** Fade the start of the incoming piece up over this long. */
  inMs: number;
}

/** Nothing on either side. */
export const CUT: Dip = { outMs: 0, inMs: 0 };

/**
 * What to do at one join.
 *
 * TAKES BOTH PIECES' LENGTHS, because the two sides are faded
 * independently and either can be too short to be worth it. A
 * programme ending four hundred milliseconds into a segment fades
 * out over what it has; the one beginning has four seconds and
 * fades in over the full dip.
 */
export function dipAt(
  { leaving, arriving, leavingMs, arrivingMs }: {
    leaving: OnAir; arriving: OnAir;
    leavingMs: number; arrivingMs: number;
  },
): Dip {
  if (isCut(leaving, arriving)) return CUT;
  return { outMs: dipMs(leavingMs), inMs: dipMs(arrivingMs) };
}

/**
 * The filters, in the order they have to go.
 *
 * BEFORE THE STATION'S MARKS, which is the part that is not
 * obvious. The bug and the lower third are composited onto the
 * outgoing frame by the same chain (§13, D-16), and a fade applied
 * after them takes the station's own identity down with the
 * picture. A viewer watching a channel dip between programmes sees
 * the picture go and the bug stay, because the bug is the channel
 * and the channel did not go anywhere.
 */
export function fadeFilters(
  { outMs, inMs }: Dip, pieceMs: number,
): string[] {
  const out: string[] = [];
  const seconds = (ms: number) => (ms / 1000).toFixed(3);
  if (inMs > 0) {
    out.push(`fade=t=in:st=0:d=${seconds(inMs)}`);
  }
  if (outMs > 0) {
    out.push(`fade=t=out:st=${seconds(pieceMs - outMs)}:d=${seconds(outMs)}`);
  }
  return out;
}

/**
 * And the same for the sound, which is the half that matters more.
 *
 * AN EAR NOTICES A DISCONTINUITY AN EYE FORGIVES. The click at a
 * hard cut between two unrelated waveforms is the most audible
 * fault a channel can have at a join, and it is the one thing here
 * that would be worth doing even if the picture cut hard.
 */
export function afadeFilters(
  { outMs, inMs }: Dip, pieceMs: number,
): string[] {
  const out: string[] = [];
  const seconds = (ms: number) => (ms / 1000).toFixed(3);
  if (inMs > 0) {
    out.push(`afade=t=in:st=0:d=${seconds(inMs)}`);
  }
  if (outMs > 0) {
    out.push(`afade=t=out:st=${seconds(pieceMs - outMs)}:d=${seconds(outMs)}`);
  }
  return out;
}
