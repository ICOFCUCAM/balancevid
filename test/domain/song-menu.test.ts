/**
 * Operating the song the way everything else here is operated.
 *   [TIMELINE B5, B6, B9; D-19]
 *
 * The song was the one object on this timeline that could not be
 * right-clicked. It is a lane like any other now, and it deliberately
 * borrows the take menu's shape: Trim is which part of it exists,
 * Sound is how it is heard, and the last group is the object itself.
 * An author who has learned one has learned the other — which is the
 * whole argument for naming the distinction rather than implying it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Ask } from '../../app/Confirm.js';
import type { MenuItem } from '../../app/Menu.js';
import {
  SONG_GAIN_STEP_DB, songMenuItems, type SongMenuHost,
} from '../../app/p/[id]/songMenu.js';
import type { AssetId } from '../../src/domain/document.js';
import type { Performance } from '../../src/domain/performance.js';
import { newPerformance } from '../../src/domain/performanceEdit.js';
import { setSongSound, trimSong } from '../../src/domain/performanceEdit.js';
import { HOUSE_SAMPLE_RATE, secondsToSamples } from '../../src/domain/time.js';

const SONG = secondsToSamples(240);
const AT = '2026-09-30T00:00:00.000Z';

const code = (file: string) => readFileSync(
  join(import.meta.dirname, '..', '..', file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function performance(): Performance {
  return newPerformance('A Performance', {
    assetId: 'asset_song' as AssetId, title: 'The Ancient of Days',
    class: 'own', durationSamples: SONG,
  }, AT);
}

function host(p = performance(), at = secondsToSamples(60)): {
  host: SongMenuHost; sent: Record<string, unknown>[]; asked: Ask[];
} {
  const sent: Record<string, unknown>[] = [];
  const asked: Ask[] = [];
  return {
    sent,
    asked,
    host: {
      performance: p,
      patch: (body) => { sent.push(body); },
      confirm: (ask) => { asked.push(ask); },
      at: () => at,
    },
  };
}

const items = (p?: Performance, at?: number) =>
  songMenuItems(host(p, at).host).filter((item): item is MenuItem => Boolean(item));

function press(label: string, p?: Performance, at?: number) {
  const built = host(p, at);
  const found = songMenuItems(built.host)
    .find((item) => item && item.label === label);
  expect(found, label).toBeTruthy();
  (found as MenuItem).onSelect?.();
  return built;
}

function entry(label: string, p?: Performance, at?: number): MenuItem {
  const found = songMenuItems(host(p, at).host)
    .find((item) => item && item.label === label);
  expect(found, label).toBeTruthy();
  return found as MenuItem;
}

describe('trimming the song from its own lane', () => {
  it('trims at the playhead, on the master clock', () => {
    expect(press('Start the song here').sent).toEqual([
      { action: 'trim-song', useFromSample: secondsToSamples(60) },
    ]);
    expect(press('End the song here').sent).toEqual([
      { action: 'trim-song', useToSample: secondsToSamples(60) },
    ]);
  });

  /* The same per-end honesty a take's trim learned from a screenshot:
     what is wrong is different at each end, and saying "outside" at
     00:00 on a song that starts at 00:00 is a lie. */
  it('says what would actually happen at each end', () => {
    expect(entry('Start the song here', performance(), 0).disabled)
      .toBe('it already starts there');
    expect(entry('End the song here', performance(), 0).disabled)
      .toBe('that would leave nothing of it');
    expect(entry('End the song here', performance(), SONG).disabled)
      .toBe('it already ends there');
  });

  it('offers to take the trim off only when there is one', () => {
    expect(entry('Use all of the song again').disabled)
      .toBe('none of it is trimmed');
    const trimmed = performance();
    trimSong(trimmed, secondsToSamples(30), SONG);
    expect(entry('Use all of the song again', trimmed).disabled).toBeUndefined();
    expect(press('Use all of the song again', trimmed).sent).toEqual([
      { action: 'trim-song', useFromSample: null, useToSample: null },
    ]);
  });

  /*
   * A TRIMMED SONG LOOKS EXACTLY LIKE A SHORT SONG, so the menu says
   * which it is. A statement rather than a verb, so it is disabled —
   * the menu's own convention for a row that is there to be read.
   */
  it('says what is being exported, once there is a trim', () => {
    expect(items().some((item) => item.label.startsWith('Exporting'))).toBe(false);
    const trimmed = performance();
    trimSong(trimmed, secondsToSamples(30), secondsToSamples(90));
    const said = items(trimmed).find((item) => item.label.startsWith('Exporting'));
    expect(said?.label).toBe('Exporting 00:30.000–01:30.000');
    expect(said?.disabled).toBe('of 04:00.000 recorded');
  });
});

describe('the song’s sound, from its own lane', () => {
  it('mutes and unmutes, and says the video stays as long', () => {
    expect(press('Mute the song').sent).toEqual([
      { action: 'song-sound', muted: true },
    ]);
    expect(entry('Mute the song').hint).toMatch(/still the clock/);
    const muted = performance();
    setSongSound(muted, { muted: true });
    expect(press('Unmute the song', muted).sent).toEqual([
      { action: 'song-sound', muted: false },
    ]);
  });

  it('moves the fader by a step anybody can hear', () => {
    expect(SONG_GAIN_STEP_DB).toBe(3);
    expect(press(`Turn it down ${SONG_GAIN_STEP_DB} dB`).sent).toEqual([
      { action: 'song-sound', gainDb: -3 },
    ]);
    const quiet = performance();
    setSongSound(quiet, { gainDb: -6 });
    expect(press(`Turn it up ${SONG_GAIN_STEP_DB} dB`, quiet).sent).toEqual([
      { action: 'song-sound', gainDb: -3 },
    ]);
  });

  /*
   * IT IS A BALANCE, AND THE HINT SAYS SO. Every export is mastered to
   * a loudness target, so on a song with no voice over it the fader
   * changes the mix and not the file — an author who hears no
   * difference and was not told would reasonably conclude it is
   * broken. A render proved this by refusing the first version of the
   * test that went with it. [INV-11]
   */
  it('says the fader is a balance, not an output level', () => {
    expect(entry('Turn it down 3 dB').hint)
      .toBe('quieter against the voices over it, not quieter overall');
    expect(entry('Turn it up 3 dB').hint)
      .toBe('louder against the voices over it, not louder overall');
  });

  it('stops at the ends of a real fader', () => {
    const loud = performance();
    setSongSound(loud, { gainDb: 24 });
    expect(entry('Turn it up 3 dB', loud).disabled).toBe('that is as far as it goes');
    expect(entry('Turn it down 3 dB', loud).disabled).toBeUndefined();
  });

  it('puts everything back with one press, and offers it only when there is something to put back', () => {
    expect(entry('Back to as recorded').disabled).toBe('it already is');
    const done = performance();
    setSongSound(done, { gainDb: -6, fadeInSamples: HOUSE_SAMPLE_RATE });
    expect(press('Back to as recorded', done).sent).toEqual([{
      action: 'song-sound',
      gainDb: null, fadeInSamples: null, fadeOutSamples: null, effect: null,
    }]);
  });

  /* INCLUDING THE EFFECT, or "back to as recorded" leaves the song
     sounding like a radio — which is not how it was recorded. [B6j] */
  it('counts an effect as something to put back', () => {
    const radio = performance();
    setSongSound(radio, { effect: 'radio' });
    expect(entry('Back to as recorded', radio).disabled).toBeUndefined();
    expect(press('Back to as recorded', radio).sent[0])
      .toMatchObject({ effect: null });
  });

  /*
   * A FADE OUT GOES DOWN. One sentence served both ends and read
   * "up from silence at the end of the export" under the fade-out
   * row — a description of a fade in. Seen in a screenshot of the
   * menu, not in a test. [U-04]
   */
  it('says which way each fade goes', () => {
    expect(entry('Fade in\u2026').hint)
      .toBe('up from silence at the start of the export');
    expect(entry('Fade out\u2026').hint)
      .toBe('down to silence at the end of the export');
  });

  /* A fade takes a number, so it asks for one — the same dialogue the
     exact-millisecond push uses, rather than two more stepper rows in
     a menu the last brief asked to keep short. [B9] */
  it('asks for a fade in seconds, and refuses what is not one', () => {
    const built = press('Fade in…');
    expect(built.asked).toHaveLength(1);
    built.asked[0]!.go?.('2');
    expect(built.sent).toEqual([{
      action: 'song-sound', fadeInSamples: 2 * HOUSE_SAMPLE_RATE,
    }]);

    const bad = press('Fade out…');
    bad.asked[0]!.go?.('soon');
    expect(bad.sent).toEqual([]);

    const off = press('Fade out…');
    off.asked[0]!.go?.('0');
    expect(off.sent).toEqual([{ action: 'song-sound', fadeOutSamples: null }]);
  });

  /* And the fades are behind "More", because they are the fine end of
     the control and the menu opens simple. [B9] */
  it('keeps the fades behind one press', () => {
    for (const label of ['Fade in…', 'Fade out…']) {
      expect(entry(label).advanced, label).toBe(true);
    }
    for (const label of ['Mute the song', 'Start the song here']) {
      expect(entry(label).advanced, label).toBeUndefined();
    }
  });
});

describe('where the menu is raised from', () => {
  const stage = code('app/p/[id]/SwitchingStage.tsx');

  /* Two handles on one lane: a studio where the gesture works on one
     half of a lane and not the other is one you have to aim at. */
  it('is both the lane’s head and its waveform', () => {
    expect(stage).toMatch(
      /data-testid="song-head"[\s\S]{0,200}onRow\(performance\.master\.title, songMenu\)/);
    expect(stage).toMatch(
      /data-testid="master-waveform"[\s\S]{0,200}onRow\(performance\.master\.title, songMenu\)/);
  });

  /*
   * EVERY ROW SENDS SOMETHING THE API HAS.  The first draft of this
   * menu offered "Go to where the export starts" and sent
   * `{ action: 'seek' }`, which is not an action — a row that looks
   * like a control and does nothing. Nothing here is a verb unless
   * the route layer has a case for it.
   */
  it('sends only actions the API actually has', () => {
    const route = code('app/api/performances/[id]/route.ts');
    const trimmed = performance();
    trimSong(trimmed, secondsToSamples(30), secondsToSamples(90));
    const muted = performance();
    setSongSound(muted, { gainDb: -6 });
    const sent = new Set<string>();
    for (const p of [performance(), trimmed, muted]) {
      const built = host(p);
      for (const item of songMenuItems(built.host)) {
        if (item && !item.disabled) item.onSelect?.();
      }
      for (const body of built.sent) sent.add(String(body['action']));
    }
    expect(sent.size).toBeGreaterThan(1);
    for (const action of sent) {
      expect(route, action).toContain(`case '${action}':`);
    }
  });

  it('is the same list from one definition', () => {
    expect(stage).toMatch(/songMenuItems\(\{/);
    expect(stage).not.toMatch(/label: 'Mute the song'/);
  });

  /* The same three groups a take has, so one menu teaches the other. */
  it('groups the song the way it groups a take', () => {
    const sections = new Set(items().map((item) => item.section));
    expect(sections).toEqual(new Set([
      'Trim — which part of the song exists',
      'Sound — how the song is heard',
    ]));
  });
});
