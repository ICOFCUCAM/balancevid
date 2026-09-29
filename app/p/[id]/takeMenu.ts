'use client';

import type { Ask } from '../../Confirm.js';
import type { MenuEntry } from '../../Menu.js';
import type { Performance, PerformanceTake } from '../../../src/domain/performance.js';
import { coverage, effectiveOffset } from '../../../src/domain/performance.js';
import { formatMasterPosition } from '../../../src/domain/time.js';
import { nudgeItems } from './takeNudge.js';

/**
 * What can be done to a take, in one list.
 *   [MASTER-EDIT §2, §4; STUDIO-TWO §7, §10; D-19, U-15, U-18]
 *
 * "Every take should be a real media object" — and it nearly was: the
 * document has held the trim, the push and the loop for months, and the
 * rail offered four of them while the take's own PICTURE in the multiview
 * offered none. The gap was never the model, it was that a take could only
 * be operated on from one place, and that place was a row of text in the
 * left column.
 *
 * SO THERE IS ONE LIST AND TWO WAYS TO RAISE IT: right-click the row, or
 * right-click the picture. A studio where those two differ is a studio
 * with two answers to one question, and the first time they drift is the
 * first time somebody learns the rail's menu and finds the monitor's menu
 * missing the verb they came for. [D-19]
 *
 * WHAT THE HOST SUPPLIES is everything that is not a property of the take:
 * where the playhead is, what a cut means here, which take the panels are
 * editing. The list itself — the verbs, their order, their reasons for
 * being greyed — lives here, because that is the part that must not have
 * two versions.
 *
 * GREYED WITH THE REASON, NEVER HIDDEN. A menu whose contents change
 * between visits is a menu nobody learns, so "End it here" is present and
 * greyed when the playhead is before the take's start, and says so.
 */

export interface TakeMenuHost {
  performance: Performance;
  patch: (body: Record<string, unknown>) => unknown;
  confirm: (ask: Ask) => void;
  /** Where the song is NOW, on the master clock — asked, not remembered. */
  at: () => number;
  /** Put this take on screen from the playhead, the way a cut does. */
  place: (takeId: string) => void;
  /** Its number key, or null for a take that cannot go on screen yet. */
  keyOf: (takeId: string) => number | null;
  /** Which take the stage is showing on its own, if any. */
  solo: string | null;
  onSolo: (takeId: string | null) => void;
  /** Put the stage into drawing a crop over this take's picture. */
  onReframe?: ((takeId: string) => void) | undefined;
  /** Which take the Background and Effects panels are editing. */
  chosen?: string | null | undefined;
  onChoose?: ((takeId: string) => void) | undefined;
}

export function takeMenuItems(
  take: PerformanceTake, host: TakeMenuHost,
): MenuEntry[] {
  const at = Math.round(host.at());
  const key = host.keyOf(take.id);
  const span = coverage(take, host.performance.master.durationSamples);
  /*
   * WHERE ITS MEDIA BEGINS, which is not where its coverage begins once
   * it has been trimmed: `coverage` answers "what part of the song can
   * this fill", and the two alignments below move the MEDIA. Reading the
   * trimmed figure here would align the wrong edge and the hint would
   * describe an edge the action does not touch.
   */
  const starts = Math.max(0, effectiveOffset(take.alignment));
  /*
   * WHY NOT SIMPLY "IS THE PLAYHEAD INSIDE IT". Because the first
   * version was, and at the start of the song it told the truth in a
   * way that read as a bug: the playhead sat at 00:00, the take began
   * at 00:00, and both trims were greyed saying "the playhead is
   * outside this take". Zero is not outside a take that starts at
   * zero — it is its first sample, and what is actually wrong with
   * trimming there is different for each end.
   *
   * So each end says what would actually happen. `trimTake` refuses a
   * trim that leaves nothing of the take, and these two are that
   * refusal said BEFORE it is pressed rather than after. [U-04]
   */
  const wouldEmpty = (label: 'start' | 'end'): string | false =>
    (label === 'start' ? at >= span.toSample : at <= span.fromSample)
      ? 'that would leave nothing of it' : false;
  const soloed = host.solo === take.id;

  return [
    /*
     * PLAYING ONE TAKE IS A VIEW, NOT A SECOND PLAYER. The stage already
     * plays every take at once against the song on one clock; watching a
     * single one is that same stage showing one panel. Building a
     * separate preview window would have been a second transport, a
     * second clock and a second answer to "where are we". [D-19]
     */
    {
      section: 'This take',
      label: soloed ? 'Stop watching it on its own' : 'Play it on its own',
      hint: soloed
        ? 'back to the view you were in'
        : 'the whole stage, this take only, still on the song’s clock',
      ...(key === null
        ? { disabled: 'it is still assembling' } as const : {}),
      onSelect: () => host.onSolo(soloed ? null : take.id),
    },
    host.onChoose && {
      section: 'This take',
      label: 'Work on this take',
      hint: 'the background, the look and the sound panels follow it',
      ...(host.chosen === take.id ? { disabled: 'they already do' } as const : {}),
      onSelect: () => host.onChoose?.(take.id),
    },
    {
      section: 'This take',
      label: 'Put it on screen from here',
      hint: key === null
        ? 'nothing to put on screen yet'
        : `from ${formatMasterPosition(at)} — the same as pressing ${key}`,
      ...(key === null ? { disabled: 'it is still assembling' } as const : {}),
      onSelect: () => host.place(take.id),
    },

    /*
     * TRIM IS TWO MARKS AT THE PLAYHEAD, not a dialogue asking for two
     * timecodes. The author is looking at the moment they mean — it is
     * under the line — and typing it back in as numbers is asking them
     * to read out what they can already see. Both marks are on the
     * MASTER clock because that is the clock in front of them, which is
     * what `trimTake` already takes. [S-10]
     */
    {
      section: 'Trim — which part of it exists',
      label: 'Start it here',
      hint: `use nothing before ${formatMasterPosition(at)}`,
      ...(at === span.fromSample
        ? { disabled: 'it already starts there' } as const
        : wouldEmpty('start')
          ? { disabled: wouldEmpty('start') } as const : {}),
      onSelect: () => {
        void host.patch({
          action: 'trim-take', takeId: take.id, useFromSample: at,
        });
      },
    },
    {
      section: 'Trim — which part of it exists',
      label: 'End it here',
      hint: `use nothing after ${formatMasterPosition(at)}`,
      ...(at === span.toSample
        ? { disabled: 'it already ends there' } as const
        : wouldEmpty('end')
          ? { disabled: wouldEmpty('end') } as const : {}),
      onSelect: () => {
        void host.patch({
          action: 'trim-take', takeId: take.id, useToSample: at,
        });
      },
    },
    {
      section: 'Trim — which part of it exists',
      label: 'Use all of it again',
      hint: 'the media was never cut — a trim is two marks, and this '
        + 'takes them off',
      ...(take.useFromSample === undefined && take.useToSample === undefined
        ? { disabled: 'none of it is trimmed' } as const : {}),
      onSelect: () => {
        void host.patch({
          action: 'trim-take', takeId: take.id,
          useFromSample: null, useToSample: null,
        });
      },
    },

    /*
     * THE THIRD OPERATION, and it opens a tool rather than doing
     * something: a crop is a rectangle somebody draws over a picture,
     * and there is no sensible default rectangle for a menu to apply.
     * The host puts the stage into reframing for this take; the box is
     * drawn on the take's own monitor. [MASTER-EDIT §15]
     */
    host.onReframe && {
      section: 'Crop \u2014 what part of the picture shows',
      label: take.reframe ? 'Change the crop\u2026' : 'Crop / reframe\u2026',
      hint: take.reframe
        ? `keeping ${Math.round(take.reframe.w * 100)}% of the frame`
        : 'draw a box on its picture; the rest is not in the master',
      ...(key === null ? { disabled: 'it is still assembling' } as const : {}),
      onSelect: () => host.onReframe?.(take.id),
    },
    take.reframe && {
      section: 'Crop \u2014 what part of the picture shows',
      label: 'Use the whole frame again',
      hint: 'the media was never cut \u2014 a crop is four numbers',
      onSelect: () => {
        void host.patch({
          action: 'reframe-take', takeId: take.id, reframe: null,
        });
      },
    },

    /*
     * THE TWO ALIGNMENTS AN AUTHOR ACTUALLY ASKS FOR, and both of them
     * are the push with the arithmetic already done.
     *
     * "A take begins late, the editor should make the misalignment
     * obvious, and the user can drag it back" — dragging is the lane,
     * and these are the same move made exactly rather than by hand. A
     * take that starts two and a bit seconds into the song, pulled to
     * the song's start, is a nudge of minus its own offset; pulled to
     * the playhead, a nudge of the difference. Nobody should have to do
     * that subtraction with a stepper.
     *
     * STILL ONLY THE NUDGE. Neither of these writes the measurement:
     * how far off the automatic answer was stays visible underneath,
     * and a re-measure does not discard the author's fix. [S-3, INV-14]
     */
    {
      section: 'Move — when it plays',
      label: 'Align its start to the song’s',
      hint: starts > 0
        ? `it begins ${formatMasterPosition(starts)} into the song`
        : 'it already begins with the song',
      ...(starts === 0
        ? { disabled: 'it already begins with the song' } as const : {}),
      onSelect: () => {
        void host.patch({
          action: 'nudge-take', takeId: take.id,
          nudgeSamples: -take.alignment.offsetSamples,
        });
      },
    },
    {
      section: 'Move — when it plays',
      label: 'Align its start to the playhead',
      hint: `move its beginning to ${formatMasterPosition(at)}`,
      ...(starts === at
        ? { disabled: 'it already begins there' } as const : {}),
      onSelect: () => {
        void host.patch({
          action: 'nudge-take', takeId: take.id,
          nudgeSamples: at - take.alignment.offsetSamples,
        });
      },
    },

    /* Pushing it earlier or later by hand. One definition, in
       `takeNudge.ts`, and the two entries above are the same field
       written to with the sum worked out. */
    ...nudgeItems(take, host.patch, host.confirm),

    {
      section: 'The take itself',
      label: take.loop ? 'Stop looping it' : 'Loop it',
      hint: 'A looped take fills a scene longer than the take itself',
      onSelect: () => {
        void host.patch({
          action: 'set-loop', takeId: take.id, loop: !take.loop,
        });
      },
    },
    {
      section: 'The take itself',
      label: 'Rename…',
      onSelect: () => host.confirm({
        question: 'A take’s name is what the rail, the timeline and the '
          + 'lower third will all call it.',
        field: { label: 'What is this take called?', initial: take.label },
        verb: 'Rename it',
        go: (next) => {
          if (next && next !== take.label) {
            void host.patch({
              action: 'rename-take', takeId: take.id, label: next,
            });
          }
        },
      }),
    },
    {
      section: 'The take itself',
      label: 'Remove…',
      danger: true,
      onSelect: () => host.confirm({
        question: `Remove “${take.label}”? Every scene cut from it `
          + 'goes with it, and it cannot be undone.',
        verb: 'Remove the take',
        danger: true,
        go: () => {
          void host.patch({ action: 'remove-take', takeId: take.id });
        },
      }),
    },
  ];
}
