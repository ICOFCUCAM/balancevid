'use client';

import type { Ask } from '../../Confirm.js';
import type { MenuEntry } from '../../Menu.js';
import type { Performance } from '../../../src/domain/performance.js';
import { songSpan, songTrimmed } from '../../../src/domain/performance.js';
import { HOUSE_SAMPLE_RATE, formatMasterPosition } from '../../../src/domain/time.js';

/**
 * What can be done to the song.  [TIMELINE B6]
 *
 * "The master song shouldn't be treated as an immutable background
 * track." It is a lane on the timeline like any other now, and it is
 * operated the way every other lane in this studio is: right-click the
 * thing itself.
 *
 * THE SAME THREE GROUPS AS A TAKE, deliberately. Trim is which part of
 * it exists; Sound is how it is heard; the last group is the object
 * itself. An author who has learned the take menu has learned this one
 * — which is the whole argument for the distinction being named rather
 * than implied. [B5]
 *
 * WHAT IS NOT HERE, AND WHY. The brief lists eleven things; five of
 * them are below. Split, remove section and replace section all
 * RENUMBER the master clock — every scene, take and lyric after the
 * edit moves — and that is ripple editing, which is a different piece
 * of work with a different risk. Add audio, record and effects need a
 * second audio object, which the document does not have yet. Both are
 * written down in the ledger rather than stubbed here, because a menu
 * row that does nothing is worse than a row that is not there.
 */

/** One decibel step, which is about the smallest change anybody hears. */
const STEP_DB = 3;

export interface SongMenuHost {
  performance: Performance;
  patch: (body: Record<string, unknown>) => unknown;
  confirm: (ask: Ask) => void;
  /** Where the song is NOW, asked rather than remembered. */
  at: () => number;
  /**
   * Ask for a sound file and put it on the timeline here.  [B6h]
   *
   * Optional, because the menu is also raised in tests and in surfaces
   * that cannot upload — a row that is there and greyed says the
   * feature exists and is unavailable, which is this menu's own
   * convention, and is more honest than a row that vanishes.
   */
  addAudio?: ((at: number) => void) | undefined;
}

export function songMenuItems(host: SongMenuHost): MenuEntry[] {
  const master = host.performance.master;
  const at = Math.round(host.at());
  const span = songSpan(master);
  const sound = master.sound ?? {};
  const gain = sound.gainDb ?? 0;
  const length = span.toSample - span.fromSample;

  const seconds = (samples: number) => (samples / HOUSE_SAMPLE_RATE).toFixed(1);

  return [
    /*
     * TRIM, AT THE PLAYHEAD, exactly as a take's is — the author is
     * looking at the moment they mean and typing it back as a timecode
     * would be reading out what is already under the line. [B5]
     */
    {
      section: 'Trim — which part of the song exists',
      label: 'Start the song here',
      hint: `export nothing before ${formatMasterPosition(at)}`,
      ...(at === span.fromSample
        ? { disabled: 'it already starts there' } as const
        : at >= span.toSample
          ? { disabled: 'that would leave nothing of it' } as const : {}),
      onSelect: () => {
        void host.patch({ action: 'trim-song', useFromSample: at });
      },
    },
    {
      section: 'Trim — which part of the song exists',
      label: 'End the song here',
      hint: `export nothing after ${formatMasterPosition(at)}`,
      ...(at === span.toSample
        ? { disabled: 'it already ends there' } as const
        : at <= span.fromSample
          ? { disabled: 'that would leave nothing of it' } as const : {}),
      onSelect: () => {
        void host.patch({ action: 'trim-song', useToSample: at });
      },
    },
    {
      section: 'Trim — which part of the song exists',
      label: 'Use all of the song again',
      hint: 'the audio was never cut — a trim is two marks',
      ...(songTrimmed(master)
        ? {} : { disabled: 'none of it is trimmed' } as const),
      onSelect: () => {
        void host.patch({
          action: 'trim-song', useFromSample: null, useToSample: null,
        });
      },
    },

    /*
     * SOUND. The gain is a BALANCE and the hint says so, because every
     * export is mastered to a loudness target: on a song with no voice
     * over it, turning the music down changes the mix and not the
     * file. An author who hears no difference and was not told would
     * reasonably conclude the control is broken. [INV-11]
     */
    {
      section: 'Sound — how the song is heard',
      label: sound.muted ? 'Unmute the song' : 'Mute the song',
      hint: sound.muted
        ? 'let the music be heard again'
        : 'silent, and still the clock — the video stays as long',
      onSelect: () => {
        void host.patch({ action: 'song-sound', muted: !sound.muted });
      },
    },
    {
      section: 'Sound — how the song is heard',
      label: `Turn it down ${STEP_DB} dB`,
      hint: gain === 0
        ? 'quieter against the voices over it, not quieter overall'
        : `it is at ${gain > 0 ? '+' : ''}${gain} dB now`,
      ...(gain - STEP_DB < -24 ? { disabled: 'that is as far as it goes' } as const : {}),
      onSelect: () => {
        void host.patch({ action: 'song-sound', gainDb: gain - STEP_DB });
      },
    },
    {
      section: 'Sound — how the song is heard',
      label: `Turn it up ${STEP_DB} dB`,
      hint: gain === 0
        ? 'louder against the voices over it, not louder overall'
        : `it is at ${gain > 0 ? '+' : ''}${gain} dB now`,
      ...(gain + STEP_DB > 24 ? { disabled: 'that is as far as it goes' } as const : {}),
      onSelect: () => {
        void host.patch({ action: 'song-sound', gainDb: gain + STEP_DB });
      },
    },
    {
      section: 'Sound — how the song is heard',
      label: 'Back to as recorded',
      hint: 'no lift, no cut, no fades',
      ...(gain === 0 && !sound.fadeInSamples && !sound.fadeOutSamples
        ? { disabled: 'it already is' } as const : {}),
      onSelect: () => {
        void host.patch({
          action: 'song-sound',
          gainDb: null, fadeInSamples: null, fadeOutSamples: null,
        });
      },
    },

    /*
     * THE FADES TAKE A NUMBER, so they ask for one — the same dialogue
     * the exact-millisecond push uses. A pair of steppers would be two
     * more rows in a menu the last brief asked to keep short. [B9]
     */
    ...(['in', 'out'] as const).map((end) => {
      const key = end === 'in' ? 'fadeInSamples' : 'fadeOutSamples';
      const now = sound[key] ?? 0;
      return {
        section: 'Sound — how the song is heard',
        advanced: true,
        label: `Fade ${end}…`,
        hint: now > 0
          ? `${seconds(now)}s now`
          : `up from silence at the ${end === 'in' ? 'start' : 'end'} of the export`,
        onSelect: () => host.confirm({
          question: `How long should the song fade ${end}? In seconds, or `
            + `0 for none. The exported stretch is ${seconds(length)}s.`,
          field: { label: 'Seconds', initial: now > 0 ? seconds(now) : '2' },
          verb: `Fade ${end}`,
          go: (typed) => {
            const value = Number(typed);
            if (!Number.isFinite(value) || value < 0) return;
            void host.patch({
              action: 'song-sound',
              [key]: value === 0
                ? null : Math.round(value * HOUSE_SAMPLE_RATE),
            });
          },
        }),
      };
    }),

    /*
     * "ADD AUDIO." A second sound over the song — applause, a
     * voice-over, rain — which lands where the playhead is, because a
     * file knows nothing about the song and the only thing that can
     * say where the author meant it is where they were looking.
     * [B6h, B8]
     */
    {
      section: 'Sound — how the song is heard',
      label: 'Add a sound here\u2026',
      hint: `a second sound over the song, from ${formatMasterPosition(at)}`,
      ...(host.addAudio ? {} : { disabled: 'not from here' } as const),
      onSelect: () => host.addAudio?.(at),
    },

    /*
     * AND WHERE THE SONG IS TRIMMED TO, said in words rather than left
     * to be read off the ruler. A trimmed song looks exactly like a
     * short song, and the difference is one press. [U-04]
     */
    /*
     * AND WHAT THE TRIM ACTUALLY IS, said in words rather than left to
     * be read off a ruler: a trimmed song looks exactly like a short
     * song. Disabled, because it is a statement and not a verb —
     * which is this menu's own convention for a row that is there to
     * be read. [U-04]
     *
     * The row it replaced offered to "go to where the export starts"
     * and sent `{ action: 'seek' }`, which is not an action the API
     * has: a menu row that does nothing, written in one pass and
     * caught by a test in the next.
     */
    ...(songTrimmed(master) ? [{
      section: 'The song itself',
      label: 'Exporting '
        + `${formatMasterPosition(span.fromSample)}–`
        + `${formatMasterPosition(span.toSample)}`,
      disabled: `of ${formatMasterPosition(master.durationSamples)} recorded`,
    }] : []),
  ];
}

/** Exported for the tests, which assert what the steps are. */
export const SONG_GAIN_STEP_DB = STEP_DB;
