'use client';

import type { Ask } from '../../Confirm.js';
import type { MenuEntry } from '../../Menu.js';
import type { PerformanceTake } from '../../../src/domain/performance.js';
import {
  HOUSE_FPS, HOUSE_SAMPLE_RATE, framesToSamples,
} from '../../../src/domain/time.js';

/**
 * Pushing a take earlier or later against the song.
 *   [STUDIO-TWO §10, MASTER-EDIT §2; S-3, INV-02, INV-14, D-19]
 *
 * THE WHOLE OF THIS WAS ALREADY BUILT EXCEPT THE WAY IN. `nudgeTake` writes
 * `alignment.nudgeSamples`; the planner adds it to the offset, the mixer
 * adds it to the audio, the player seeks by it and an invariant refuses a
 * fractional one. The API has taken `nudge-take` for months. Nothing on any
 * screen called it, so the one thing an author cannot do is the thing every
 * other layer is ready for. [D-19: check before building]
 *
 * TWO READINGS OF ONE CONTROL, and they want the same thing. A take that
 * came out a few frames late is a FAULT and this corrects it. A take
 * deliberately held back behind another is a PRODUCTION DECISION and this
 * makes it. The document cannot tell them apart and should not try: both
 * are "this take belongs a little earlier or later than where it sits", and
 * inventing two fields would mean two numbers the renderer has to add up.
 *
 * FRAMES, NOT MILLISECONDS. The product cuts on frames (INV-02) and every
 * other time control in the studio steps by one, so a nudge that moved by a
 * round number of milliseconds would land between two frames and read as
 * the control being broken. A second is offered beside the frame because a
 * production delay is a musical distance, not a sync correction.
 *
 * NEVER INTO THE MEASUREMENT. `nudgeTake`'s own docstring is the reason:
 * re-measuring must not discard a human's fix, and keeping the two apart is
 * the only way to see how far off the automatic answer was. So "back to the
 * measured sync" clears the nudge and leaves the measurement exactly where
 * it was.
 */

/** One frame at the house rate. The step a sync correction is made in. */
export const NUDGE_FRAME = framesToSamples(1);
/** The step a production delay is made in. */
export const NUDGE_SECOND = HOUSE_SAMPLE_RATE;

/**
 * How far this take has been pushed, in the author's words, or null.
 *
 * Null rather than "0 frames" when nothing has been done: a row that says
 * a take is on time is saying something about every take, and a rail of
 * them says nothing at all.
 */
export function nudgeSays(take: PerformanceTake): string | null {
  const samples = take.alignment.nudgeSamples ?? 0;
  if (samples === 0) return null;
  const size = Math.abs(samples);
  const frames = size / NUDGE_FRAME;
  /*
   * FRAMES UNDER A SECOND, SECONDS AT OR OVER ONE, because they are two
   * different sentences about two different intentions. A take three
   * frames late is a fault being corrected and frames are the unit the
   * fault is in; a take held back a second and a half is a production
   * decision and "45 frames later" is nobody's way of saying it.
   *
   * A NUDGE UNDER THE SYNC TOLERANCE IS STILL SHOWN. It is below the
   * point at which a sound and a picture stop being one event, so it
   * cannot be the correction of a visible fault — which makes it the
   * other reading: somebody meant it. Hiding it would hide exactly the
   * deliberate case.
   */
  const how = size < HOUSE_SAMPLE_RATE && Number.isInteger(frames)
    ? `${frames} frame${frames === 1 ? '' : 's'}`
    : `${(size / HOUSE_SAMPLE_RATE).toFixed(2)}s`;
  return samples > 0 ? `${how} later` : `${how} earlier`;
}

/**
 * The entries, built once for every menu that offers them.
 *
 * One list, two callers — the take rail and the multiview tile — because a
 * studio where right-clicking a take's picture offers different verbs from
 * right-clicking its row is a studio with two answers to one question.
 * [D-19]
 */
export function nudgeItems(
  take: PerformanceTake,
  patch: (body: Record<string, unknown>) => unknown,
  /* Required, not optional: an entry that silently does nothing when a
     caller forgot to pass the dialogue is worse than not offering it. */
  ask: (question: Ask) => void,
): MenuEntry[] {
  const now = take.alignment.nudgeSamples ?? 0;
  const said = nudgeSays(take);
  /*
   * MOVE, AND SAID SO. Moving a take, trimming a take and reframing
   * one are three operations on three different things — when it
   * plays, which part of it exists, what part of the picture shows —
   * and a flat list of fourteen verbs invites somebody to trim when
   * they meant to move. The heading is printed once above the group.
   */
  const MOVE = 'Move \u2014 when it plays';
  const by = (samples: number, label: string, hint: string): MenuEntry => ({
    section: MOVE,
    label,
    hint,
    onSelect: () => {
      void patch({
        action: 'nudge-take', takeId: take.id, nudgeSamples: now + samples,
      });
    },
  });

  return [
    by(NUDGE_FRAME, 'Push it a frame later',
      said ? `it is ${said} now` : `one frame of ${HOUSE_FPS}`),
    by(-NUDGE_FRAME, 'Pull it a frame earlier',
      said ? `it is ${said} now` : `one frame of ${HOUSE_FPS}`),
    by(NUDGE_SECOND, 'Hold it back a second',
      'a deliberate delay, not a sync correction'),
    by(-NUDGE_SECOND, 'Bring it in a second early',
      'a deliberate delay, not a sync correction'),
    /*
     * AND AN EXACT AMOUNT, because "move take 3 by +250 ms" is a real
     * instruction and 250 ms is seven and a half frames.
     *
     * MILLISECONDS HERE AND FRAMES ABOVE, which is not two units for
     * one thing: the steppers move by what a cut is made of, and this
     * is for when an author already knows the number. `nudgeSamples`
     * has always been SAMPLES — a twentieth of a millisecond each — so
     * neither the field nor the renderer has to round anything. Only
     * the typed figure is rounded to a whole sample, which INV-14
     * requires.
     */
    {
      section: MOVE,
      label: 'Move it by an exact amount\u2026',
      hint: said
        ? `it is ${said} now \u2014 in milliseconds, + is later`
        : 'in milliseconds, + is later and \u2212 is earlier',
      onSelect: () => ask({
        question: 'How far should this take move against the song? In '
          + 'milliseconds \u2014 a positive number holds it back, a negative '
          + 'one brings it in early. It adds to any push already on it.',
        field: {
          label: 'Milliseconds',
          initial: String(Math.round((now / HOUSE_SAMPLE_RATE) * 1000)),
        },
        verb: 'Move it',
        go: (typed) => {
          const ms = Number(typed);
          if (!Number.isFinite(ms)) return;
          void patch({
            action: 'nudge-take', takeId: take.id,
            nudgeSamples: Math.round((ms / 1000) * HOUSE_SAMPLE_RATE),
          });
        },
      }),
    },
    {
      section: MOVE,
      label: 'Back to the measured sync',
      hint: 'clears the push; the measurement underneath is untouched',
      ...(now === 0 ? { disabled: 'it has not been pushed' } as const : {}),
      onSelect: () => {
        void patch({ action: 'nudge-take', takeId: take.id, nudgeSamples: 0 });
      },
    },
  ];
}
