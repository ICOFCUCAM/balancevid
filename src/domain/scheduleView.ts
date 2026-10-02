/**
 * Looking at the schedule.  [Doctrine CHANNEL §2, §10, §18, D-04,
 * D-22, U-08, C-31, C-46]
 *
 *     20:30 ──────────────┼──────────────────── 23:00
 *     PROGRAM     │ The live studio        │
 *     GRAPHICS    ▌                        ← eight seconds, three pixels
 *
 * THE WINDOW WAS A CONSTANT, AND THE COMMENT ABOVE IT WAS RIGHT.
 * `WINDOW_MS = 2.5 * HOUR`, with:
 *
 *   *"a whole day compressed into a strip makes a five-minute ident
 *   two pixels wide, and the thing an operator actually needs to see
 *   is the join between what is on now and what follows it."*
 *
 * Both halves are true, which is what makes a fixed window the wrong
 * answer: a day is unreadable AND an eight-second lower third is
 * 0.09% of two and a half hours — a three-pixel sliver nobody can
 * inspect, in a lane whose whole purpose is to show where the
 * identity draws. **The answer to a trade you cannot win is not to
 * pick a side. It is to let the operator move.**
 *
 * ZOOM IS A VIEW AND NOTHING ELSE, which is Studio Two's rule for
 * its own timeline and the same one here: it is not in the document,
 * it changes no schedule, and a channel transmits identically
 * whatever is on screen. [U-08]
 *
 * AND THE ARITHMETIC IS DIFFERENT THERE FOR A REASON. A song has a
 * length, so Studio Two zooms by a MULTIPLE of it. A channel runs
 * for ever, so this zooms by a SPAN — how much wall clock is on
 * screen — and the stops are durations a broadcaster already thinks
 * in.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import type { OnAir } from './channel.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * HOW MUCH CLOCK IS ON SCREEN, at each stop.
 *
 * Durations a broadcaster already thinks in, from "inspect this
 * join" to "show me the day". Ten minutes is the tightest because
 * it makes an eight-second graphic 1.3% of the width — a block with
 * an edge you can see rather than the minimum-width sliver every
 * short thing collapses to.
 */
export const SPANS = [
  10 * MINUTE, 30 * MINUTE, HOUR, 2.5 * HOUR, 6 * HOUR, 12 * HOUR, 24 * HOUR,
] as const;

/** What the window has always been, and still is until somebody moves it. */
export const DEFAULT_SPAN = 2.5 * HOUR;

/**
 * HOW MUCH HISTORY THE WINDOW KEEPS, as a fraction of itself.
 *
 * Ten per cent, which at the old fixed window is the fifteen minutes
 * it has always kept — so nothing moves for somebody who never
 * touches the zoom. A fixed fifteen minutes would be impossible in a
 * ten-minute window and invisible in a day.
 */
export const BEHIND = 0.1;

/** The ladder a ruler step is chosen from. Round numbers only. */
const STEPS = [
  MINUTE, 2 * MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE,
  HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR,
] as const;

/**
 * HOW MUCH ROOM A CLOCK READING NEEDS.
 *
 * `21:30` in the readout face is about thirty-four pixels, and a
 * ruler whose numbers touch is a ruler nobody reads. Ninety leaves
 * the gap the eye needs to tell which tick a number belongs to —
 * and it is the floor, not the target: the step chosen is the
 * smallest round one that clears it.
 */
export const MIN_LABEL_PX = 90;

/**
 * The ruler step for this span at this width.
 *
 * CHOSEN, NOT FIXED. A thirty-minute step is right for two and a
 * half hours and absurd for ten minutes — one label — and invisible
 * in a day, which would want forty-eight of them. The smallest
 * round step whose labels clear each other is the one a measuring
 * instrument uses.
 */
export function stepFor(spanMs: number, widthPx: number): number {
  const most = Math.max(1, Math.floor(widthPx / MIN_LABEL_PX));
  for (const step of STEPS) {
    if (spanMs / step <= most) return step;
  }
  return STEPS[STEPS.length - 1]!;
}

/** The next stop in or out, or the same one at either end. */
export function zoomed(spanMs: number, by: 1 | -1): number {
  const at = nearestStop(spanMs);
  /* `by: 1` means IN, which is a SMALLER span. The sign is the
     operator's word, not the arithmetic's. */
  const next = at - by;
  return SPANS[Math.max(0, Math.min(SPANS.length - 1, next))]!;
}

function nearestStop(spanMs: number): number {
  let best = 0;
  for (let at = 1; at < SPANS.length; at += 1) {
    if (Math.abs(SPANS[at]! - spanMs) < Math.abs(SPANS[best]! - spanMs)) best = at;
  }
  return best;
}

/** Can it go further in this direction? For a button that says so. */
export function canZoom(spanMs: number, by: 1 | -1): boolean {
  return zoomed(spanMs, by) !== SPANS[nearestStop(spanMs)];
}

/**
 * The window, from the span and whatever the view is anchored to.
 *
 * SNAPPED TO THE STEP, so the labels are round numbers rather than
 * 20:37. The anchor — now, or the instant somebody pinned — keeps
 * its tenth of the window behind it at every zoom, which is what
 * makes zooming feel like moving a lens rather than jumping.
 */
export function windowFor(
  spanMs: number, anchorMs: number, stepMs: number,
): { from: number; to: number } {
  const from = Math.floor((anchorMs - spanMs * BEHIND) / stepMs) * stepMs;
  return { from, to: from + spanMs };
}

/** What the zoom control says it is showing. */
export function spanSays(spanMs: number): string {
  if (spanMs < HOUR) return `${Math.round(spanMs / MINUTE)} min`;
  const hours = spanMs / HOUR;
  const said = Number.isInteger(hours) ? String(hours)
    : hours === 2.5 ? '2½' : hours.toFixed(1);
  return `${said} ${hours === 1 ? 'hour' : 'hours'}`;
}

/* ------------------------------------------------------------------------ *
 *  What a block on the strip means.  [§2, §18, D-21, C-31, C-46]
 * ------------------------------------------------------------------------ */

export type Tone = 'missing' | 'hole' | 'live' | 'standby' | 'programme'
  | 'loop';

/**
 * WHAT KIND OF BLOCK THIS IS, which decides how it is drawn.
 *
 * A HOLE WAS DRAWN AS A PROGRAMME. Off air and a turn of the loop
 * both fell through to the same faint blue, so a gap in the schedule
 * — the single thing an operator most needs to find at a glance —
 * looked like a quiet programme. The word "Off air" was on it, and a
 * schedule lane is SCANNED rather than read: colour is what the eye
 * gets first and the colour said "something is on".
 *
 * That is C-31's fault in a third place. A surface showing the
 * answer to one question in the shape of another.
 *
 * MISSING STILL WINS. A slot with a title and no media behind it is
 * the one fault a listing cannot show by looking right, so it keeps
 * the top of the order.
 */
export function blockTone(on: OnAir, broken: boolean): Tone {
  if (broken) return 'missing';
  switch (on.kind) {
    case 'off': return 'hole';
    case 'live': return 'live';
    case 'emergency': case 'backup': return 'standby';
    case 'programme': return 'programme';
    default: return 'loop';
  }
}

/**
 * How long is left of the thing on air, or nothing.
 *
 * THE BLOCK SAID ITS DURATION AND NOT ITS END. "2:30:00" is how long
 * the programme is; at 21:02 the numbers a gallery needs are when it
 * finishes and how much of it is left. Neither was anywhere on the
 * panel, on the one surface whose job is to say what happens next.
 *
 * Null for a stretch that is not the current one, so only the block
 * under the playhead carries a countdown — a lane of forty blocks
 * each counting down is a lane nobody reads. [D-04]
 */
export function leftOf(
  stretch: { fromMs: number; toMs: number }, nowMs: number,
): number | null {
  if (nowMs < stretch.fromMs || nowMs >= stretch.toMs) return null;
  return stretch.toMs - nowMs;
}

/**
 * WHICH WAY A RULER LABEL SHIFTS, so neither end is cut.
 *
 * Every label was centred on its tick except the first, which meant
 * the LAST one hung half its width past the right edge and was
 * clipped: `23:0`. A measuring instrument whose last number is
 * shaved is a measuring instrument you cannot trust at the end of
 * the scale, which is exactly where a schedule is read. [C-38's
 * argument, one surface along]
 */
export function labelNudge(index: number, count: number): 'start' | 'middle' | 'end' {
  if (index === 0) return 'start';
  if (index >= count - 1) return 'end';
  return 'middle';
}

/**
 * Is there programme audio under this block, or generated silence?
 *
 * THE AUDIO LANE WAS A LABEL PRETENDING TO BE A TRACK: one bar the
 * width of the window reading "Master Audio (Program)", drawn
 * identically over a programme, a hole and a dead reference. It is
 * the only lane that claimed something was continuous, and the one
 * lane where it is false in the way that matters — the engine puts
 * `anullsrc` on the wire for a hole and for a missing render alike
 * (`black()`, §11), so those four seconds really are silence.
 *
 * ONLY WHERE IT IS CERTAIN. A programme whose file happens to have
 * no audio track is also silent, and nothing on this page can know
 * that without probing the media. So the lane says "Silence" for
 * the two cases the engine decides and says nothing about the rest
 * — a track that guesses is worse than a track that is quiet.
 */
export function carriesSound(tone: Tone): boolean {
  return tone !== 'hole' && tone !== 'missing';
}

/**
 * THREE STATES, NOT TWO.  [brief point 3, §11, D-21, C-47]
 *
 * > *"I'd eventually add a very subtle indication of: active /
 * > muted / fault / audio level."*
 *
 * Silence the schedule asked for and silence caused by a fault
 * are the same four seconds of `anullsrc` on the wire and are
 * opposite facts about the channel. A lane that painted them
 * alike told an operator that the dead reference at 21:40 was a
 * planned gap.
 *
 * AND THERE IS NO `muted`, BECAUSE THERE IS NO MUTE. Nothing in
 * the channel document can mute the master bus, so there is no
 * state to report and nothing here invents one: a lane with a
 * `muted` colour that can never be reached is a lane claiming a
 * control the product does not have. When a mute exists it gets
 * a case here and the lane draws it.
 *
 * NO METER EITHER, and the brief says why — *"don't clutter the
 * timeline with meters. The audio mixer belongs elsewhere."* A
 * level is a measurement of decoded audio, and nothing on this
 * page has decoded anything.
 */
export type Sound = 'programme' | 'silence' | 'fault';

export function audioState(tone: Tone): Sound {
  if (tone === 'missing') return 'fault';
  if (tone === 'hole') return 'silence';
  return 'programme';
}

/* ------------------------------------------------------------------------ *
 *  Is there room on screen for this?  [§2, D-04, C-46]
 * ------------------------------------------------------------------------ */

/**
 * A SHARE OF THE WINDOW, NOT A DURATION, and that distinction cost a
 * working filmstrip the first time the window stopped being a
 * constant.
 *
 * The video lane drew a frame for any stretch of eight minutes or
 * more. Eight minutes is five per cent of the window it was written
 * against and half a per cent of a day, so the first zoom out to
 * twenty-four hours mounted a `<video>` per stretch and Chromium
 * refused them in a block: *"too many WebMediaPlayers already in
 * existence."* The lane went blank at exactly the span somebody
 * zooms out to survey.
 *
 * NOTHING IN THE LANE WAS WRONG. What was wrong is that a number
 * measured against the window was written as though it were
 * measured against the clock, in a file where the window had always
 * been `const`. Expressed as a share it keeps the old behaviour at
 * the old span to the pixel — eight minutes is 1/18.75 of two and a
 * half hours — and the count it can ask for is bounded by the share
 * alone, at every span there will ever be.
 */
export const FRAME_SHARE = 1 / 18.75;

/** And a caption needs more room than a frame does, being words. */
export const CAPTION_SHARE = 1 / 8;

/**
 * Is a stretch this long worth drawing on, in a window this wide?
 *
 * THE RATIO, NOT THE PRODUCT, and the difference is a whole class
 * of block. Eight minutes is exactly 1/18.75 of two and a half
 * hours, and `9000000 * (1 / 18.75)` is 480000.00000000006 — so
 * written the other way round the stretch that defined the
 * threshold falls the wrong side of it, and the lane quietly
 * changes at the one span it was supposed to leave alone.
 *
 * A boundary that depends on which side of the comparison you
 * multiply is a boundary that moves.
 */
export function roomOnScreen(
  lengthMs: number, spanMs: number, share: number,
): boolean {
  return lengthMs / spanMs >= share;
}

/**
 * The most things a window can ask to be drawn at this share.
 *
 * Exported because it is the number that matters and the one
 * nothing was checking: a browser will mount about seventy-five
 * media elements and then refuse, silently, for the rest of the
 * page's life.
 */
export function mostOnScreen(share: number): number {
  return Math.floor(1 / share);
}

/**
 * HOW NARROW A BLOCK CAN GET AND STILL SAY ANYTHING.
 *
 * A clock reading in the readout face is about thirty-four pixels,
 * and a block narrower than one is a block whose caption is a
 * fragment: the strip at a day reads `2: 5: 4036 9:2: 5:` across a
 * hundred eight-pixel blocks, which is not small text — it is
 * NOISE with the shape of text, and it is harder to look past than
 * an empty block would be.
 *
 * MEASURED IN PIXELS, NOT IN MINUTES, because that is the question:
 * the eye does not care how long the programme is, it cares how
 * much glass the words have. The same five-minute item is legible
 * at ten minutes and is a sliver at a day, and one number covers
 * both.
 */
export const LEGIBLE_PX = 34;

/**
 * Is there room on this block for words rather than fragments?
 *
 * `readings` IS HOW MUCH TEXT, in clock readings, and it exists
 * because one threshold was not enough the first time this was
 * drawn. A block wide enough for `25:00` is not wide enough for
 * `ends 20:51 · 06:40 left`, and the countdown — added in this same
 * stage — wrapped over three lines and out of its own block on
 * every short item at the default span. One number for "can it say
 * anything" and nothing for "can it say THIS" is a gate that
 * passes the caption it cannot hold.
 */
export function fitsText(
  lengthMs: number, spanMs: number, widthPx: number, readings = 1,
): boolean {
  return (lengthMs / spanMs) * widthPx >= LEGIBLE_PX * readings;
}

/**
 * How much room `ends 20:51 · 06:40 left` needs, in clock readings.
 *
 * Four, counted off the string rather than guessed: two readings,
 * two words and a separator. Below it the block keeps the number
 * that cannot wait — a gallery needs how long is left before it
 * needs the wall-clock instant that follows from it.
 */
export const COUNTDOWN_READINGS = 4;

/**
 * And how much a title needs before the length joins it.
 *
 * Three: the length is four characters and the title needs room
 * to be a word rather than an ellipsis beside it. Gated on the
 * countdown's four, the one number the brief draws on the right
 * of the line vanished from every block in the lane — because a
 * different, longer string shares the block.
 */
export const LENGTH_READINGS = 3;
