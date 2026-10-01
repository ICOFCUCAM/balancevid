/**
 * Which tile is on which bus.  [Doctrine CHANNEL §24, §6, §5, D-04, D-22]
 *
 *     ┌1 CAMERA 1┬2 GUESTS  ┬3 STUDIO TWO┐
 *     ├4 STUDIO 1┼5 MEDIA   ┼6 GRAPHICS  ┤
 *
 * A multi-view's tally is the one thing on the page that must never be
 * wrong. Everything else on this grid is a convenience; the red bar is a
 * claim about the transmission, and an operator who catches it lying once
 * stops reading it — at which point the whole instrument is worse than
 * nothing. Its own component said so from the day it was written.
 *
 * THE FAULT THIS MODULE EXISTS TO FIX. The grid asked three separate
 * questions and got two of them wrong whenever a reference was rolled in
 * over a live show:
 *
 *   `whatIsOn` answers `kind: 'live'` with the ROLLED-IN SOURCE while a
 *   film plays over the room (channel.ts: *"A segment rolled into the
 *   live show is what goes out while it is up"*). The grid read the
 *   KIND and not the SOURCE, so it lit CAMERA 1 red — the room, which
 *   nobody could see — and left STUDIO TWO dark, which was the picture
 *   actually on the wire. Two tiles wrong at once, in opposite
 *   directions, and the guests wore a red tally under a music video:
 *   the exact thing their own comment forbade.
 *
 * SO THERE IS ONE QUESTION AND IT IS ASKED OF THE SOURCE. `whatIsOn`
 * already names what is going out — the same function the playout engine
 * uses — so comparing a tile's own source against it cannot disagree with
 * the transmitter. A tile is on PROGRAM when it IS what is going out, and
 * for no other reason. [D-22]
 *
 * AND IT IS PURE, like `identity.ts` and `guestGrid.ts`, because "is the
 * room on air while a film is rolled in" is a question about two values
 * and answering it inside a component is answering it where nobody can
 * test it.
 */

import type { OnAir, ProgrammeSource } from './channel.js';
import { sourceKey } from './channel.js';

/**
 * The three buses a tile can be on, and they are three different claims.
 *
 *   PROGRAM  this is what the audience can see, right now
 *   PREVIEW  this is what is cued to go next
 *   KEY      this is drawn OVER whatever is on program
 *
 * A keyer is deliberately not PROGRAM. The identity layer never has the
 * air to itself — it is composited on top of whoever does — and giving it
 * the program tally put two red bars in a grid whose entire job is to say
 * which single thing is on.
 *
 * AND IT IS NOT PREVIEW EITHER, which is what it used to wear. Blue has to
 * mean one thing on a gallery wall and the product's own PREVIEW (NEXT)
 * panel had already claimed it; a keyer sharing that colour meant an
 * operator reading blue could not tell "next" from "over the top". The
 * key bus takes the house's third state colour.
 */
export type Bus = 'program' | 'preview' | 'key';

/**
 * What is going out, as a source, or null when the channel is off.
 *
 * EVERY NON-OFF ANSWER CARRIES ONE. A live show, a scheduled programme, a
 * turn of the rotation, the emergency slide and the backup all name the
 * thing on the wire, and a rolled-in reference replaces the live feed
 * inside the live answer rather than beside it. Reading `on.source` is
 * therefore the whole of it, and reading `on.kind` — which is what the
 * grid did — answers a different question.
 */
export function programmeSource(on: OnAir): ProgrammeSource | null {
  return on.kind === 'off' ? null : on.source;
}

/** Is the room itself what is going out? Not merely "is a session up". */
export function roomOnProgram(on: OnAir): boolean {
  const source = programmeSource(on);
  return source !== null && source.kind === 'live';
}

/**
 * Which bus this tile is on, if any.
 *
 * `mine` is the source the tile STANDS FOR. A tile with nothing behind it
 * has none and is on no bus, which is the honest answer and not a
 * fallback: Studio Two before anybody has finished anything is not off
 * air, it is absent.
 */
export function busFor(
  { on, mine, cued, keyed }: {
    on: OnAir;
    /** What this tile would put on the wire. Absent when it has nothing. */
    mine?: ProgrammeSource | undefined;
    /** What is cued to go next, from the player or the schedule. */
    cued?: ProgrammeSource | undefined;
    /**
     * This tile is a keyer rather than a source — the identity layer.
     * True only when it is both configured AND something is on the wire
     * for it to be drawn over: a lower third with a dark channel under
     * it is not on anything.
     */
    keyed?: boolean | undefined;
  },
): Bus | null {
  if (keyed) return programmeSource(on) ? 'key' : null;
  if (!mine) return null;
  const out = programmeSource(on);
  if (out && sourceKey(out) === sourceKey(mine)) return 'program';
  if (cued && sourceKey(cued) === sourceKey(mine)) return 'preview';
  return null;
}

/**
 * What a tile says about itself, in one word.
 *
 * THE ORDER IS THE MEANING. A source that is on air says so before it
 * says anything else; a source that is cued says that before it says it
 * is merely available; and NO SIGNAL outranks READY because a tile that
 * offers a cut to a dead input is the tally lying in its quietest form.
 *
 * An empty dash is not a failure. Studio One with nothing finished in it
 * is a tile correctly reporting that there is nothing there, and dressing
 * that as a fault would teach an operator to ignore faults. [D-04]
 */
export type Says = 'LIVE' | 'PREVIEW' | 'KEY' | 'NO SIGNAL' | 'READY' | '—';

export function saysFor(
  bus: Bus | null,
  { signal, ready }: {
    /**
     * Undefined where the question does not apply — a tile standing for
     * a file has no signal to lose. False only where a picture was
     * expected and did not arrive.
     */
    signal?: boolean | undefined;
    /** There is something here and the operator could cut to it. */
    ready?: boolean | undefined;
  },
): Says {
  if (bus === 'program') return 'LIVE';
  if (bus === 'preview') return 'PREVIEW';
  if (bus === 'key') return 'KEY';
  if (signal === false) return 'NO SIGNAL';
  return ready ? 'READY' : '—';
}

/**
 * How many sources are on program at once.
 *
 * EXACTLY ONE, OR NONE. It is a count rather than a boolean because the
 * header shows it, and showing it is how the grid proves it is not
 * claiming two: *"a panel whose own header said '1 in mix'"* while three
 * tiles wore the tally is how the original fault was first visible. A
 * number that can only ever read 0 or 1 is a number that catches the bug
 * the moment it comes back.
 */
export function onProgramCount(buses: (Bus | null)[]): number {
  return buses.filter((bus) => bus === 'program').length;
}
