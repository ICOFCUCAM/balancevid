/**
 * What the first release says about itself.  [TAKE-DESKTOP T-1]
 *
 * > *"It ships as an application that installs, opens a window,
 * > and says it is not connected to anything. That is a complete,
 * > honest first release."*
 *
 * THE SIX STEPS ARE DRAWN AND FIVE OF THEM ARE GREY, which is
 * the opposite of the usual first release and is the point. The
 * flow is frozen — CONNECT → CAMERAS → PREPARE → RECORD →
 * REVIEW → SUBMIT — and showing it with one step lit says
 * exactly where the application is. A window saying "coming
 * soon" says nothing a person can plan around.
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
 * somebody changes which cameras. Nothing else in the shell
 * changed either time. A release that lights a step it has not
 * built is a release that lies to the person who installed it.
 */
export const BUILT_TO: Step = 'RECORD';

/** Whether a step is something this build can actually do. */
export function reached(step: Step): boolean {
  return STEPS.indexOf(step) < STEPS.indexOf(BUILT_TO);
}

/**
 * What this build is, in one sentence a person can act on.
 *
 * NOT "NOT CONNECTED", which reads as a fault to fix. The
 * application has nothing to connect WITH yet, and saying so is
 * the difference between a first release and a broken one.
 */
export function standing(): string {
  return 'This build finds your cameras and says whether this machine '
    + 'can record them. Writing the files is the next thing it learns.';
}

/**
 * The agreement with the installation, as a line of numbers.
 *
 * Imported, never typed: see the file comment. [T-1]
 */
export function houseSays(): string {
  return `${HOUSE_SAMPLE_RATE} Hz · ${HOUSE_FPS} fps`;
}
