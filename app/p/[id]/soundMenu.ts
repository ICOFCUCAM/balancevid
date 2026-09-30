'use client';

import type { Ask } from '../../Confirm.js';
import type { MenuEntry } from '../../Menu.js';
import type { SoundLayer, SoundTrack } from '../../../src/domain/performance.js';
import { soundOnSong, soundSpan } from '../../../src/domain/performance.js';
import {
  AUDIO_EFFECTS, AUDIO_EFFECT_IDS,
} from '../../../src/domain/audioEffect.js';
import { HOUSE_SAMPLE_RATE, formatMasterPosition } from '../../../src/domain/time.js';

/**
 * What can be done to a sound on the timeline.  [TIMELINE B8, B10a, B12]
 *
 * "Effects and sounds should also be timeline objects." A layer is a
 * timeline object or it is a setting, and the difference is whether you
 * can right-click it — which is the same argument the song's own lane
 * made [B6] and the same one the take's picture made before that.
 *
 * THE SAME FIVE GROUPS AS A TAKE, in the same order, saying the same
 * things. This is deliberate and it is the whole reason this studio is
 * learnable: Trim is which part of it exists, Move is when it plays,
 * Sound is how it is heard, and the last group is the object itself.
 * An author who has learned one menu here has learned all three.
 *
 * WHERE IT DIFFERS FROM A TAKE, AND WHY. A take is ALIGNED to the song,
 * so its trim marks are read on the master clock the author is looking
 * at. A layer has no alignment at all — it was placed, not measured —
 * so "start it a quarter second in" is a fact about the FILE. The rows
 * below therefore convert: the playhead is on the song, the mark is on
 * the layer, and the arithmetic between them is done here once rather
 * than in the author's head every time.
 */

/** One decibel step, the same one the song's fader moves by. [B6e] */
const STEP_DB = 3;

/** What each track is for, said in the menu rather than in a manual. */
const TRACKS: { id: SoundTrack; label: string; hint: string }[] = [
  { id: 'voice', label: 'Voice', hint: 'narration, a voice-over, a spoken intro' },
  { id: 'effect', label: 'Effect', hint: 'applause, an impact, a transition sound' },
  { id: 'ambience', label: 'Ambience', hint: 'rain, a room, a crowd underneath' },
  { id: 'music', label: 'Music', hint: 'a second musical layer over the song' },
];

export interface SoundMenuHost {
  patch: (body: Record<string, unknown>) => unknown;
  confirm: (ask: Ask) => void;
  /** Where the song is NOW, asked rather than remembered. */
  at: () => number;
  /** How long the song is, which is as far as a layer can be moved. */
  songSamples: number;
}

export function soundMenuItems(
  layer: SoundLayer, host: SoundMenuHost,
): MenuEntry[] {
  const at = Math.round(host.at());
  const on = soundOnSong(layer, host.songSamples);
  const media = soundSpan(layer);
  const gain = layer.gainDb ?? 0;
  const inside = at > on.fromSample && at < on.toSample;
  const seconds = (samples: number) => (samples / HOUSE_SAMPLE_RATE).toFixed(1);
  /*
   * THE PLAYHEAD, READ ON THE LAYER'S OWN CLOCK. However far into the
   * song the line is, it is this far into the file — which is the mark
   * a trim writes, and the conversion nobody should have to do.
   */
  const into = media.fromSample + (at - on.fromSample);

  return [
    {
      section: 'This sound',
      label: layer.muted ? 'Unmute it' : 'Mute it',
      hint: layer.muted
        ? 'let it be heard again'
        : 'silent, and still on the timeline where you left it',
      onSelect: () => {
        void host.patch({
          action: 'sound-layer', soundId: layer.id, muted: !layer.muted,
        });
      },
    },
    /*
     * A LOOPED LAYER RUNS TO THE END OF THE SONG — "ten seconds of rain
     * under a four-minute song". Its own length says nothing about how
     * long it is heard for, which is the argument footage already
     * makes about a ten-second clip filling a chorus. [S-29]
     */
    {
      section: 'This sound',
      label: layer.loop ? 'Play it once' : 'Loop it to the end',
      hint: layer.loop
        ? `${seconds(media.length)}s, once, where it sits`
        : `${seconds(media.length)}s, repeated from here to the end of the song`,
      onSelect: () => {
        void host.patch({
          action: 'sound-layer', soundId: layer.id, loop: !layer.loop,
        });
      },
    },

    /*
     * TRIM, ON THE LAYER'S OWN CLOCK BUT AT THE PLAYHEAD THE AUTHOR IS
     * LOOKING AT. Both marks are present at both ends and greyed with
     * the reason, because a menu whose rows come and go is a menu
     * nobody learns. [U-04]
     */
    {
      section: 'Trim — which part of it exists',
      label: 'Start it here',
      hint: `use nothing of it before ${formatMasterPosition(at)}`,
      ...(inside ? {} : {
        disabled: at <= on.fromSample
          ? 'it already starts at or after the line'
          : 'the line is past the end of it',
      } as const),
      onSelect: () => {
        void host.patch({
          action: 'trim-sound', soundId: layer.id, useFromSample: into,
        });
      },
    },
    {
      section: 'Trim — which part of it exists',
      label: 'End it here',
      hint: `use nothing of it after ${formatMasterPosition(at)}`,
      ...(inside ? {} : {
        disabled: at <= on.fromSample
          ? 'that would leave nothing of it'
          : 'it already ends before the line',
      } as const),
      onSelect: () => {
        void host.patch({
          action: 'trim-sound', soundId: layer.id, useToSample: into,
        });
      },
    },
    {
      section: 'Trim — which part of it exists',
      label: 'Use all of it again',
      hint: 'the file was never cut — a trim is two marks',
      ...(layer.useFromSample === undefined && layer.useToSample === undefined
        ? { disabled: 'none of it is trimmed' } as const : {}),
      onSelect: () => {
        void host.patch({
          action: 'trim-sound', soundId: layer.id,
          useFromSample: null, useToSample: null,
        });
      },
    },

    /*
     * MOVE, WHICH IS NOT TRIM. The brief asked for these three to be
     * distinguished rather than mixed, and a layer is where the
     * distinction is easiest to lose: moving it changes WHEN it is
     * heard and trimming it changes WHICH PART is. [B4, B5]
     */
    {
      section: 'Move — when it plays',
      label: 'Move it here',
      hint: `start it at ${formatMasterPosition(at)}`,
      ...(at === layer.fromSample
        ? { disabled: 'it already starts there' } as const
        : at > host.songSamples
          ? { disabled: 'that is past the end of the song' } as const : {}),
      onSelect: () => {
        void host.patch({
          action: 'move-sound', soundId: layer.id, fromSample: at,
        });
      },
    },
    {
      section: 'Move — when it plays',
      label: 'Move it to the start of the song',
      ...(layer.fromSample === 0
        ? { disabled: 'it already does' } as const : {}),
      hint: 'from 00:00.000',
      onSelect: () => {
        void host.patch({
          action: 'move-sound', soundId: layer.id, fromSample: 0,
        });
      },
    },
    {
      section: 'Move — when it plays',
      advanced: true,
      label: 'Move it by an exact amount…',
      hint: `it starts at ${formatMasterPosition(layer.fromSample)} now`,
      onSelect: () => host.confirm({
        question: 'How far should it move, in milliseconds? A positive '
          + 'number puts it later, a negative one earlier.',
        field: { label: 'Milliseconds', initial: '0' },
        verb: 'Move it',
        go: (typed) => {
          const value = Number(typed);
          if (!Number.isFinite(value) || value === 0) return;
          const moved = Math.round(
            layer.fromSample + (value / 1000) * HOUSE_SAMPLE_RATE);
          void host.patch({
            action: 'move-sound', soundId: layer.id,
            fromSample: Math.max(0, Math.min(host.songSamples, moved)),
          });
        },
      }),
    },

    /*
     * SOUND. Its own fader, bounded where every fader here is, and
     * SAID TO BE A BALANCE for the same reason the song's is: every
     * export is mastered to a loudness target, so turning one layer up
     * changes the mix and not the file. [INV-11, B10b]
     */
    {
      section: 'Sound — how it is heard',
      label: `Turn it down ${STEP_DB} dB`,
      hint: gain === 0
        ? 'quieter against everything else, not quieter overall'
        : `it is at ${gain > 0 ? '+' : ''}${gain} dB now`,
      ...(gain - STEP_DB < -24
        ? { disabled: 'that is as far as it goes' } as const : {}),
      onSelect: () => {
        void host.patch({
          action: 'sound-layer', soundId: layer.id, gainDb: gain - STEP_DB,
        });
      },
    },
    {
      section: 'Sound — how it is heard',
      label: `Turn it up ${STEP_DB} dB`,
      hint: gain === 0
        ? 'louder against everything else, not louder overall'
        : `it is at ${gain > 0 ? '+' : ''}${gain} dB now`,
      ...(gain + STEP_DB > 24
        ? { disabled: 'that is as far as it goes' } as const : {}),
      onSelect: () => {
        void host.patch({
          action: 'sound-layer', soundId: layer.id, gainDb: gain + STEP_DB,
        });
      },
    },
    ...(['in', 'out'] as const).map((end) => {
      const key = end === 'in' ? 'fadeInSamples' : 'fadeOutSamples';
      const now = layer[key] ?? 0;
      return {
        section: 'Sound — how it is heard',
        advanced: true,
        label: `Fade ${end}…`,
        hint: now > 0
          ? `${seconds(now)}s now`
          /* A fade OUT goes down, and the one sentence that served
             both ends said "up from silence at the end", which is a
             description of a fade in printed under a fade out. Seen
             in a screenshot of the menu, not in a test. */
          : end === 'in'
            ? `up from silence at the start of it`
            : `down to silence at the end of it`,
        onSelect: () => host.confirm({
          question: `How long should it fade ${end}? In seconds, or 0 for `
            + `none. It is ${seconds(media.length)}s long.`,
          field: { label: 'Seconds', initial: now > 0 ? seconds(now) : '1' },
          verb: `Fade ${end}`,
          go: (typed) => {
            const value = Number(typed);
            if (!Number.isFinite(value) || value < 0) return;
            void host.patch({
              action: 'sound-layer', soundId: layer.id,
              [key]: value === 0 ? null : Math.round(value * HOUSE_SAMPLE_RATE),
            });
          },
        }),
      };
    }),

    /*
     * AND THE SAME SHORT LIST OF EFFECTS THE SONG HAS.  [B6j]
     *
     * One list for both, because "make this sound like a radio" is
     * one idea and a studio with two of them is a studio where the
     * author has to remember which menu has which. [D-19]
     */
    ...AUDIO_EFFECT_IDS.map((id) => {
      const effect = AUDIO_EFFECTS[id];
      const on = layer.effect === id;
      return {
        section: 'Sound — how it is heard',
        advanced: true,
        label: on ? `${effect.label} \u2014 on` : effect.label,
        hint: on ? 'press again to take it off' : effect.hint,
        onSelect: () => {
          void host.patch({
            action: 'sound-layer', soundId: layer.id, effect: on ? null : id,
          });
        },
      };
    }),

    /*
     * WHICH LANE IT IS DRAWN ON. Four tracks that the mixer treats
     * identically — they differ in where the eye finds them, which on
     * a timeline with a dozen sounds on it is the whole of the value.
     * Behind "More", because the track it arrived on is usually right.
     * [B10a]
     */
    ...TRACKS.filter((track) => track.id !== layer.track).map((track) => ({
      section: 'The sound itself',
      advanced: true,
      label: `Move it to ${track.label}`,
      hint: track.hint,
      onSelect: () => {
        void host.patch({
          action: 'sound-layer', soundId: layer.id, track: track.id,
        });
      },
    })),
    {
      section: 'The sound itself',
      advanced: true,
      label: 'Rename it…',
      hint: `called “${layer.label}”`,
      onSelect: () => host.confirm({
        question: 'What should this sound be called? The name is what the '
          + 'timeline shows, and nothing else depends on it.',
        field: { label: 'Name', initial: layer.label },
        verb: 'Rename',
        go: (typed) => {
          if (!typed.trim()) return;
          void host.patch({
            action: 'sound-layer', soundId: layer.id, label: typed.trim(),
          });
        },
      }),
    },
    {
      section: 'The sound itself',
      label: 'Take it off the timeline',
      danger: true,
      hint: 'the file stays in the library',
      onSelect: () => host.confirm({
        question: `Take “${layer.label}” off the timeline? The `
          + 'audio itself is untouched — only its place on the song goes.',
        verb: 'Take it off',
        danger: true,
        go: () => {
          void host.patch({ action: 'remove-sound', soundId: layer.id });
        },
      }),
    },
  ];
}

/** Exported for the tests, which assert what the step is. */
export const SOUND_GAIN_STEP_DB = STEP_DB;
export const SOUND_TRACKS = TRACKS;
