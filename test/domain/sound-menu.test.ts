/**
 * Operating a sound the way everything else here is operated.
 *   [TIMELINE B8, B10a, B12; D-19]
 *
 * A layer is a timeline object or it is a setting, and the difference
 * is whether you can right-click it. This file holds the list to the
 * same shape as the take's and the song's — five groups, in one order,
 * saying the same things — because that consistency is the only reason
 * a studio with three menus in it is learnable.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Ask } from '../../app/Confirm.js';
import type { MenuItem } from '../../app/Menu.js';
import {
  SOUND_GAIN_STEP_DB, SOUND_TRACKS, soundMenuItems, type SoundMenuHost,
} from '../../app/p/[id]/soundMenu.js';
import type { AssetId } from '../../src/domain/document.js';
import type { SoundLayer } from '../../src/domain/performance.js';
import { HOUSE_SAMPLE_RATE, secondsToSamples } from '../../src/domain/time.js';

const SONG = secondsToSamples(240);
const AT = '2026-09-30T00:00:00.000Z';

const code = (file: string) => readFileSync(
  join(import.meta.dirname, '..', '..', file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function layer(over: Partial<SoundLayer> = {}): SoundLayer {
  return {
    id: 'snd_clap', assetId: 'asset_clap' as AssetId, label: 'Applause',
    track: 'effect', fromSample: secondsToSamples(60),
    durationSamples: secondsToSamples(10), createdAt: AT, ...over,
  };
}

function built(one = layer(), at = secondsToSamples(60)): {
  host: SoundMenuHost; sent: Record<string, unknown>[]; asked: Ask[];
} {
  const sent: Record<string, unknown>[] = [];
  const asked: Ask[] = [];
  return {
    sent,
    asked,
    host: {
      patch: (body) => { sent.push(body); },
      confirm: (ask) => { asked.push(ask); },
      at: () => at,
      songSamples: SONG,
    },
  };
}

const items = (one?: SoundLayer, at?: number) =>
  soundMenuItems(one ?? layer(), built(one, at).host)
    .filter((item): item is MenuItem => Boolean(item));

function entry(label: string, one?: SoundLayer, at?: number): MenuItem {
  const found = items(one, at).find((item) => item.label === label);
  expect(found, label).toBeTruthy();
  return found as MenuItem;
}

function press(label: string, one?: SoundLayer, at?: number) {
  const made = built(one ?? layer(), at);
  const found = soundMenuItems(one ?? layer(), made.host)
    .find((item) => item && item.label === label);
  expect(found, label).toBeTruthy();
  (found as MenuItem).onSelect?.();
  return made;
}

describe('the sound itself', () => {
  it('mutes without taking it off the timeline', () => {
    expect(press('Mute it').sent).toEqual([
      { action: 'sound-layer', soundId: 'snd_clap', muted: true },
    ]);
    expect(entry('Mute it').hint).toMatch(/still on the timeline/);
    expect(press('Unmute it', layer({ muted: true })).sent).toEqual([
      { action: 'sound-layer', soundId: 'snd_clap', muted: false },
    ]);
  });

  /* Ten seconds of rain under a four-minute song: the length of the
     file says nothing about how long it is heard for. [S-29] */
  it('loops to the end of the song, and says what that means', () => {
    expect(entry('Loop it to the end').hint)
      .toBe('10.0s, repeated from here to the end of the song');
    expect(press('Loop it to the end').sent).toEqual([
      { action: 'sound-layer', soundId: 'snd_clap', loop: true },
    ]);
    expect(entry('Play it once', layer({ loop: true })).hint)
      .toBe('10.0s, once, where it sits');
  });

  it('is renamed, and a blank name is not a name', () => {
    const made = press('Rename it…');
    made.asked[0]!.go?.('  ');
    expect(made.sent).toEqual([]);
    made.asked[0]!.go?.(' Crowd ');
    expect(made.sent).toEqual([
      { action: 'sound-layer', soundId: 'snd_clap', label: 'Crowd' },
    ]);
  });

  /* Taking a sound off the timeline is the one destructive row here, so
     it asks — and says what it does NOT destroy. */
  it('asks before taking it off, and says the file stays', () => {
    const made = press('Take it off the timeline');
    expect(entry('Take it off the timeline').danger).toBe(true);
    expect(made.asked[0]?.danger).toBe(true);
    expect(made.asked[0]?.question).toMatch(/audio itself is untouched/);
    expect(made.sent).toEqual([]);
    made.asked[0]!.go?.('');
    expect(made.sent).toEqual([
      { action: 'remove-sound', soundId: 'snd_clap' },
    ]);
  });

  /* Four tracks, and the one it is already on is not offered. */
  it('moves between tracks, never to the one it is on', () => {
    const labels = items().map((item) => item.label);
    expect(labels).toContain('Move it to Ambience');
    expect(labels).not.toContain('Move it to Effect');
    expect(press('Move it to Ambience').sent).toEqual([
      { action: 'sound-layer', soundId: 'snd_clap', track: 'ambience' },
    ]);
    expect(SOUND_TRACKS.map((track) => track.id))
      .toEqual(['voice', 'effect', 'ambience', 'music']);
  });
});

describe('trimming a sound, which is on its own clock', () => {
  /*
   * THE CONVERSION IS THE WHOLE POINT OF THESE ROWS.  A take is
   * ALIGNED to the song, so its trim marks are read on the master
   * clock. A layer has no alignment — it was placed, not measured — so
   * a mark is a fact about the FILE, and the playhead is not. Doing
   * that arithmetic in the author's head every time is how a studio
   * ends up with a timecode field nobody uses.
   */
  it('writes the mark on the file, from the line on the song', () => {
    expect(press('Start it here', layer(), secondsToSamples(63)).sent).toEqual([
      { action: 'trim-sound', soundId: 'snd_clap', useFromSample: secondsToSamples(3) },
    ]);
    expect(press('End it here', layer(), secondsToSamples(63)).sent).toEqual([
      { action: 'trim-sound', soundId: 'snd_clap', useToSample: secondsToSamples(3) },
    ]);
  });

  /* And it adds to a trim that is already there, rather than replacing
     the clock it is measured on. */
  it('counts from where the used part begins, not from the top of the file', () => {
    const trimmed = layer({ useFromSample: secondsToSamples(2) });
    expect(press('Start it here', trimmed, secondsToSamples(63)).sent).toEqual([
      { action: 'trim-sound', soundId: 'snd_clap', useFromSample: secondsToSamples(5) },
    ]);
  });

  it('says what is wrong at each end rather than hiding the row', () => {
    expect(entry('Start it here', layer(), secondsToSamples(60)).disabled)
      .toBe('it already starts at or after the line');
    expect(entry('End it here', layer(), secondsToSamples(60)).disabled)
      .toBe('that would leave nothing of it');
    expect(entry('Start it here', layer(), secondsToSamples(90)).disabled)
      .toBe('the line is past the end of it');
    expect(entry('End it here', layer(), secondsToSamples(90)).disabled)
      .toBe('it already ends before the line');
  });

  it('offers to put it all back only when some is gone', () => {
    expect(entry('Use all of it again').disabled).toBe('none of it is trimmed');
    expect(entry('Use all of it again',
      layer({ useToSample: secondsToSamples(4) })).disabled).toBeUndefined();
    expect(press('Use all of it again',
      layer({ useFromSample: secondsToSamples(1) })).sent).toEqual([{
        action: 'trim-sound', soundId: 'snd_clap',
        useFromSample: null, useToSample: null,
      }]);
  });
});

describe('moving a sound, which is not trimming it', () => {
  it('moves to the line, and to the start', () => {
    expect(press('Move it here', layer(), secondsToSamples(90)).sent).toEqual([
      { action: 'move-sound', soundId: 'snd_clap', fromSample: secondsToSamples(90) },
    ]);
    expect(press('Move it to the start of the song').sent).toEqual([
      { action: 'move-sound', soundId: 'snd_clap', fromSample: 0 },
    ]);
    expect(entry('Move it here').disabled).toBe('it already starts there');
    expect(entry('Move it to the start of the song',
      layer({ fromSample: 0 })).disabled).toBe('it already does');
  });

  /* The same exact-millisecond push a take has, because "move Take 3
     by 250 ms" and "move the applause by 250 ms" are one decision. */
  it('takes an exact number of milliseconds, and refuses what is not one', () => {
    const made = press('Move it by an exact amount…');
    made.asked[0]!.go?.('soon');
    expect(made.sent).toEqual([]);
    made.asked[0]!.go?.('0');
    expect(made.sent).toEqual([]);
    made.asked[0]!.go?.('-250');
    expect(made.sent).toEqual([{
      action: 'move-sound', soundId: 'snd_clap',
      fromSample: secondsToSamples(60) - HOUSE_SAMPLE_RATE / 4,
    }]);
  });

  /* Nothing can be pushed off either end of the song. */
  it('stays inside the song however far it is pushed', () => {
    const made = press('Move it by an exact amount…');
    made.asked[0]!.go?.('-999999');
    expect(made.sent).toEqual([
      { action: 'move-sound', soundId: 'snd_clap', fromSample: 0 },
    ]);
    const far = press('Move it by an exact amount…');
    far.asked[0]!.go?.('999999');
    expect(far.sent).toEqual([
      { action: 'move-sound', soundId: 'snd_clap', fromSample: SONG },
    ]);
  });
});

describe('how a sound is heard', () => {
  it('moves by the same step the song’s fader moves by', () => {
    expect(SOUND_GAIN_STEP_DB).toBe(3);
    expect(press('Turn it down 3 dB').sent).toEqual([
      { action: 'sound-layer', soundId: 'snd_clap', gainDb: -3 },
    ]);
    expect(press('Turn it up 3 dB', layer({ gainDb: -6 })).sent).toEqual([
      { action: 'sound-layer', soundId: 'snd_clap', gainDb: -3 },
    ]);
    expect(entry('Turn it up 3 dB', layer({ gainDb: 24 })).disabled)
      .toBe('that is as far as it goes');
  });

  /* It is a BALANCE, for the same reason the song's fader is: every
     export is mastered to a loudness target. [INV-11] */
  it('says the fader is a balance, not an output level', () => {
    expect(entry('Turn it down 3 dB').hint)
      .toBe('quieter against everything else, not quieter overall');
    expect(entry('Turn it up 3 dB').hint)
      .toBe('louder against everything else, not louder overall');
  });

  it('asks for a fade in seconds, and 0 takes it off', () => {
    const made = press('Fade in…');
    made.asked[0]!.go?.('1.5');
    expect(made.sent).toEqual([{
      action: 'sound-layer', soundId: 'snd_clap',
      fadeInSamples: Math.round(1.5 * HOUSE_SAMPLE_RATE),
    }]);
    const off = press('Fade out…');
    off.asked[0]!.go?.('0');
    expect(off.sent).toEqual([
      { action: 'sound-layer', soundId: 'snd_clap', fadeOutSamples: null },
    ]);
  });
});

describe('the shape of the list, and where it is raised from', () => {
  const stage = code('app/p/[id]/SwitchingStage.tsx');

  /* THE SAME FIVE GROUPS A TAKE HAS, IN THE SAME ORDER. This is the
     whole argument for the studio being learnable: one menu teaches
     the others. */
  it('groups a sound the way it groups a take', () => {
    const order: string[] = [];
    for (const item of items()) {
      const section = String(item.section);
      if (order[order.length - 1] !== section) order.push(section);
    }
    expect(order).toEqual([
      'This sound',
      'Trim — which part of it exists',
      'Move — when it plays',
      'Sound — how it is heard',
      'The sound itself',
    ]);
  });

  /* Simple at first, everything else behind one press. [B9] */
  it('opens simple', () => {
    const plain = items().filter((item) => !item.advanced);
    expect(plain.length).toBeLessThanOrEqual(10);
    for (const label of [
      'Mute it', 'Start it here', 'Move it here', 'Turn it down 3 dB',
      'Take it off the timeline',
    ]) {
      expect(entry(label).advanced, label).toBeUndefined();
    }
    for (const label of [
      'Fade in…', 'Rename it…', 'Move it by an exact amount…',
      'Move it to Voice',
    ]) {
      expect(entry(label).advanced, label).toBe(true);
    }
  });

  /*
   * EVERY ROW SENDS SOMETHING THE API HAS. The song's menu shipped a
   * row that sent `{ action: 'seek' }`, which is not an action — a
   * control that looks like one and does nothing. Nothing here is a
   * verb unless the route layer has a case for it.
   */
  it('sends only actions the API actually has', () => {
    const route = code('app/api/performances/[id]/route.ts');
    const sent = new Set<string>();
    for (const one of [
      layer(), layer({ muted: true, loop: true, gainDb: -6 }),
      layer({ useFromSample: 100, fromSample: 0 }),
    ]) {
      const made = built(one, secondsToSamples(63));
      for (const item of soundMenuItems(one, made.host)) {
        if (item && !item.disabled) item.onSelect?.();
      }
      for (const ask of made.asked) ask.go?.('1');
      for (const body of made.sent) sent.add(String(body['action']));
    }
    expect(sent).toEqual(new Set([
      'sound-layer', 'trim-sound', 'move-sound', 'remove-sound',
    ]));
    for (const action of sent) expect(route, action).toContain(`case '${action}':`);
  });

  it('is raised by right-clicking the sound itself, from one definition', () => {
    expect(stage).toMatch(
      /data-testid="sound-block"[\s\S]{0,600}onRow\(layer\.label, \(\) => soundMenu\(layer\)\)/);
    expect(stage).toMatch(/soundMenuItems\(layer, \{/);
    expect(stage).not.toMatch(/label: 'Mute it'/);
  });

  /*
   * ONE LANE PER TRACK, AND ONLY WHERE THERE IS SOMETHING ON IT.
   * A dozen impacts is a dozen rows nobody can read, and an empty
   * lane is furniture in a column that is already tall. [B10a, B12]
   */
  it('draws one lane per track that has something on it', () => {
    expect(stage).toMatch(/const soundLanes = SOUND_TRACKS/);
    expect(stage).toMatch(/\.filter\(\(lane\) => lane\.layers\.length > 0\)/);
    expect(stage).toMatch(/data-testid="sound-lane"/);
    expect(stage).toMatch(/data-testid="sound-head"/);
  });

  /*
   * THE BLOCK IS DRAWN FROM THE SAME FUNCTION THE MIXER READS, so it
   * cannot draw in one place and play in another — which is exactly
   * the divergence the take lane had for months, with nothing able to
   * show it. [D-19]
   */
  it('draws the block from soundOnSong, not from its own arithmetic', () => {
    expect(stage).toMatch(/const on = soundOnSong\(layer, duration\);/);
  });

  /*
   * A DRAG IS READ THROUGH THE ZOOM.  The box is the WINDOW and the
   * track inside it is `zoom` times as wide, so a pointer that moved
   * a tenth of the box moved a tenth of the WINDOW. Writing this lane
   * is what found the take lane doing it without the divide — at 8x a
   * drag moved a take eight times as far as the pointer went, while
   * the lane drew the new position correctly the whole way. [B3a]
   */
  it('reads a drag through the zoom, on both lanes', () => {
    const drags = stage.match(
      /\(\(event\.clientX - \w+\.at\) \/ box\.width\)\s*\*\s*duration \/ zoom/g);
    expect(drags).toHaveLength(2);
    expect(stage).not.toMatch(/\/ box\.width\) \* duration\)/);
  });
});
