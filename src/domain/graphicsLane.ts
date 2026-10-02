/**
 * What the identity layer draws, across a window.
 *   [Doctrine CHANNEL §2, §13, §18, D-19, D-21, C-40, C-44, C-47]
 *
 *     GRAPHICS  ┌──────────────────────────────────────────┐  BUG
 *               ▌       ▌        ▌         ▌        ▌         LOWER THIRD
 *                       └────────┘                            LIVE
 *
 * > *"You shouldn't build Slide graphics / Lower thirds / Channel
 * > bug / NEXT graphic / Programme title as five unrelated
 * > features."*
 *
 * They are not five features and never were: `marksFor` has
 * computed all four marks since the identity was written, and the
 * compositor draws them from one list. **The GRAPHICS lane drew
 * one of them.** Not because the others were missing — because
 * `marksFor` needs three inputs that lived inside the playout
 * worker as private functions, so the page could not call it at
 * all and drew lower thirds from the identity document instead.
 * A lane reporting one layer of a four-layer composite, by
 * reading the settings rather than by asking the thing that
 * draws.
 *
 * SAMPLED, NOT RE-DERIVED, AND THAT IS THE WHOLE DESIGN.
 *
 * This does not know that a lower third holds for eight seconds,
 * that a lamp follows `kind === 'live'`, or that NEXT rides with
 * the caption. Encoding any of that here would be the second
 * graphics system the brief forbids, and it would be wrong the
 * first time somebody changed `marksFor` — which is the fault
 * this lane already had.
 *
 * Instead it asks `marksFor` at every instant where its answer
 * can change — each join, and each join plus the hold — and reads
 * the intervals off the answers. A mark the compositor stops
 * emitting is a block that ends. Nothing about WHY.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import type { Channel, OnAir } from './channel.js';
import { whatIsOn } from './channel.js';
import type { Mark } from './identity.js';
import { marksFor } from './identity.js';
import { intoProgramme, nextUp, onAirTitle } from './onAir.js';

/** The rows, in the order a gallery reads them: ground up. */
export const LAYERS: Mark['kind'][] = ['bug', 'lamp', 'lower-third', 'next'];

export interface GraphicEvent {
  kind: Mark['kind'];
  fromMs: number;
  toMs: number;
  /** The mark's own text, so the block says what will be on screen. */
  says: string;
}

/** The default, and the only one the identity ships with. */
export const DEFAULT_HOLD_MS = 8000;

/**
 * EVERY INSTANT AT WHICH THE ANSWER CAN CHANGE.
 *
 * A join changes what is on air; a join plus the hold is when a
 * lower third set to `at-start` comes down. There is nothing else:
 * every other input to `marksFor` is the identity document, which
 * does not change during a window.
 *
 * ONLY WITHIN THE WINDOW, AND NOTHING ELSE IS GUARDED.
 *
 * A clause here also skipped a hold instant falling past the end
 * of its own stretch — a five-second ident under an eight-second
 * hold. It survived every mutation, and the reason is worth
 * keeping: **an extra sample cannot change the answer, only the
 * resolution.** `marksFor` is asked afresh at each instant, so a
 * redundant sample reports the same marks as its neighbour and
 * the two blocks merge straight back. It was never a correctness
 * guard; it was a guard against one cheap call, preventing
 * nothing anybody could measure. [the sixteenth]
 */
function askAt(
  stretches: readonly { fromMs: number; toMs: number }[],
  holdMs: number, fromMs: number, toMs: number,
): number[] {
  const at = new Set<number>([fromMs]);
  for (const stretch of stretches) {
    if (stretch.fromMs > fromMs && stretch.fromMs < toMs) at.add(stretch.fromMs);
    const down = stretch.fromMs + holdMs;
    if (down > fromMs && down < toMs) at.add(down);
  }
  return [...at].sort((a, b) => a - b);
}

/**
 * What the compositor will have drawn, over this window.
 *
 * Returned as blocks rather than as samples, because the lane
 * draws blocks — and because two adjacent samples with the same
 * mark are one mark that did not stop. The station bug becomes a
 * single bar across the window, which is the truth about it and
 * is the thing the old lane could not say at all.
 */
export function graphicsOver(
  channel: Channel, fromMs: number, toMs: number,
  stretches: readonly { fromMs: number; toMs: number; on: OnAir }[],
): GraphicEvent[] {
  const holdMs = channel.identity?.lowerThird?.holdMs ?? DEFAULT_HOLD_MS;
  const when = askAt(stretches, holdMs, fromMs, toMs);
  const open = new Map<string, GraphicEvent>();
  const done: GraphicEvent[] = [];

  for (let at = 0; at < when.length; at += 1) {
    const now = when[at]!;
    const until = when[at + 1] ?? toMs;
    const marks = marksFor(
      channel.identity,
      whatIsOn(channel, now),
      intoProgramme(channel, now),
      (on) => onAirTitle(channel, on),
      nextUp(channel, now),
      channel.name,
    );
    const here = new Map(marks.map((mark) => [keyOf(mark), mark]));
    /* Anything that stopped being drawn is a block that ended. */
    for (const [key, event] of [...open]) {
      if (!here.has(key)) { done.push(event); open.delete(key); }
    }
    /* Anything still drawn runs on; anything new starts here. */
    for (const [key, mark] of here) {
      const running = open.get(key);
      if (running) running.toMs = until;
      else open.set(key, { kind: mark.kind, fromMs: now, toMs: until, says: mark.text });
    }
  }
  return [...done, ...open.values()].sort((a, b) => a.fromMs - b.fromMs);
}

/**
 * WHAT MAKES TWO SAMPLES THE SAME MARK.
 *
 * The kind AND the words. A lower third that changes from one
 * programme's caption to the next programme's caption is two
 * blocks, not one long one — the lane's whole job is to show
 * where a graphic enters and leaves, and a caption replaced at a
 * join has left. The bug keeps its text all day and so stays one
 * bar, which is the same rule reaching the opposite answer.
 */
function keyOf(mark: Mark): string {
  return `${mark.kind}\u0000${mark.text}`;
}

/** What the lane writes on a block, which is not the mark's own text. */
export function layerSays(kind: Mark['kind']): string {
  switch (kind) {
    case 'bug': return 'Channel bug';
    case 'lamp': return 'LIVE';
    case 'lower-third': return 'Lower third';
    default: return 'Next';
  }
}
