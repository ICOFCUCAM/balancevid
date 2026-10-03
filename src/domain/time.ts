/**
 * The clocks — moved, not copied.  [Doctrine U-08, TAKE-DESKTOP T-1]
 *
 * THIS FILE IS A DOOR, AND ITS CONTENTS ARE IN `shared/src/time.ts`.
 *
 * Take Software for desktop records to its own disk and aligns
 * what it records, and the brief's own rule about that is the one
 * thing this move exists to hold:
 *
 * > *"`align.ts` and `time.ts` are depended on, not pasted. Two
 * > copies of alignment arithmetic is two answers."*
 *
 * A desktop application that carried its own `HOUSE_SAMPLE_RATE`
 * would be a capture station that disagrees with the installation
 * it submits to, and the disagreement would be measured in
 * samples by somebody looking at a waveform six months later.
 *
 * THE DOOR RATHER THAN A SWEEP, because a hundred and twenty-one
 * files import this path. Rewriting all of them would be a
 * hundred and twenty-one chances to fumble an import in a commit
 * whose subject is a directory move, and it would put the desktop
 * application's layout into every file in the product. The path
 * stays; what is behind it moved one directory.
 *
 * THERE IS EXACTLY ONE COPY and that is asserted rather than
 * promised — see `test/domain/shared-library.test.ts`, which
 * fails if the arithmetic ever reappears under `src/`.
 */

export * from '../../shared/src/time.js';
