/**
 * What the first release says about itself.  [TAKE-DESKTOP T-1]
 *
 * > *"It ships as an application that installs, opens a window,
 * > and says it is not connected to anything. That is a complete,
 * > honest first release."*
 *
 * THE SIX STEPS ARE DRAWN AND FIVE OF THEM WERE GREY, which was
 * the opposite of the usual first release and was the point. The
 * flow is frozen — CONNECT → CAMERAS → PREPARE → RECORD →
 * REVIEW → SUBMIT — and showing it with one step lit said
 * exactly where the application was. A window saying "coming
 * soon" says nothing a person can plan around.
 *
 * AT T-5 ALL SIX ARE LIT, and the strip is the same strip. What
 * it said about an unfinished application and what it says about
 * a finished one are the same sentence read at two times, which
 * is the argument for having drawn it on the first day.
 *
 * IT PROVES THE SHARED LIBRARY IS WIRED, and that is the only
 * other thing T-1 is judged on that a person can see. The house
 * rates on screen are imported from `shared/`, not typed here —
 * if the door were ever filled in with a copy, this window would
 * still read 48000 and the test would be the only thing that
 * knew. So it prints them, and the person installing the first
 * release can see the two programs agree.
 */

import { HOUSE_FPS, HOUSE_SAMPLE_RATE } from '../../shared/src/time.js';

/** The flow, frozen. [TAKE-DESKTOP, PART ZERO] */
export const STEPS = [
  'CONNECT', 'CAMERAS', 'PREPARE', 'RECORD', 'REVIEW', 'SUBMIT',
] as const;

export type Step = (typeof STEPS)[number];

/**
 * How far the application has actually been built.
 *
 * ONE CONSTANT, BUMPED BY THE STAGE THAT EARNS IT. T-2 built
 * CONNECT; T-3 built CAMERAS and PREPARE together, because the
 * answer to "can this machine record them" changes every time
 * somebody changes which cameras; T-4 built RECORD on the same
 * screen, because the thing you press to start is the thing that
 * just told you whether you could; T-5 built REVIEW and SUBMIT
 * together, for the same reason CAMERAS and PREPARE are one.
 * Nothing else in the shell changed any of the four times. A
 * release that lights a step it has not built is a release that
 * lies to the person who installed it.
 *
 * AND NOW IT IS `null`, WHICH IS NOT A CONSTANT GOING AWAY. The
 * frozen flow has six steps and this build has all six; the
 * constant stays, because T-6 adds sources rather than steps and
 * the next stage to leave one unbuilt will need it back.
 */
export const BUILT_TO: Step | null = null;

/**
 * Whether a step is something this build can actually do.
 *
 * `null` MEANS ALL OF THEM, and T-5 is the stage that made that
 * a case. Every earlier stage bumped `BUILT_TO` to the first
 * step it had not built; T-5 built the last two, so there is no
 * such step and saying `'SUBMIT'` would grey out the thing that
 * now works. The flow is frozen and it is finished.
 */
export function reached(step: Step): boolean {
  return BUILT_TO === null || STEPS.indexOf(step) < STEPS.indexOf(BUILT_TO);
}

/**
 * What this build is, in one sentence a person can act on.
 *
 * NOT "NOT CONNECTED", which reads as a fault to fix. The first
 * release had nothing to connect WITH, and saying so was the
 * difference between a first release and a broken one.
 *
 * IT STILL NAMES WHAT IS NOT BUILT, now that nearly everything
 * is. T-6's other sources — NDI, a stream off the network — are
 * the one thing the brief asks for that this does not do, and a
 * sentence that stopped mentioning the gap the moment the gap
 * got small would be a sentence that had started selling.
 */
export function standing(): string {
  return 'This build connects to a studio, records every camera at once '
    + 'to this machine, and sends the set as one capture — resuming '
    + 'where it stopped if the connection goes. Sources beyond the '
    + 'cameras this machine already has are the next thing it learns.';
}

/**
 * The agreement with the installation, as a line of numbers.
 *
 * Imported, never typed: see the file comment. [T-1]
 */
export function houseSays(): string {
  return `${HOUSE_SAMPLE_RATE} Hz · ${HOUSE_FPS} fps`;
}
