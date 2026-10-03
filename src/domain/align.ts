/**
 * Alignment — moved, not copied.  [Doctrine U-08, TAKE-DESKTOP T-1]
 *
 * THIS FILE IS A DOOR, AND ITS CONTENTS ARE IN `shared/src/align.ts`.
 *
 * > *"Where the sources share audible room sound — the case
 * > `align.ts` describes and never gets on a phone — correlation
 * > is offered as a check on the measured start."*
 *
 * T-4 is the stage that needs this on the desktop side, and it
 * needs the same arithmetic the installation uses to read what it
 * submits. Two implementations of a correlation would be two
 * answers to where a take starts, and the one thing a multi-camera
 * capture promises is that its angles agree.
 */

export * from '../../shared/src/align.js';
