/**
 * The words, for a video of somebody singing.
 * [MASTER-EDIT §12 P3; Doctrine INV-07, U-02, U-08, U-19, U-22, D-04]
 *
 * INV-07 says every export carries captions and an attribution block. A
 * performance export carried the attribution and no captions — measured,
 * not remembered: the worker passed `cues` at three of its four `compose`
 * call sites and not at the performance one.
 *
 * STUDIO ONE'S TRANSCRIPTION IS NOT THE FIX, which is the finding worth
 * keeping. Speech recognition on SINGING is bad — held vowels, melisma, a
 * backing track in the same band as the voice — and a caption track that
 * is wrong two lines in five is worse than none: a deaf viewer cannot tell
 * which two, and D-04's argument for captions is that they are the
 * accessible form of what was said, not an approximation of it.
 *
 * So the words come from the author, in LRC, and the product never guesses
 * a time. That is what most of this file is about.
 */
import { describe, expect, it } from 'vitest';

import type { AssetId } from '../../src/domain/document.js';
import {
  LyricsError, MIN_LINE_SAMPLES, TAIL_SAMPLES, lyricsInWindow, parseLrc,
} from '../../src/domain/lyrics.js';
import type { MasterTrack, Performance } from '../../src/domain/performance.js';
import { masterCheck } from '../../src/domain/performance.js';
import {
  PerformanceEditError, newPerformance, setLyrics,
} from '../../src/domain/performanceEdit.js';
import { performanceCues } from '../../src/render/cues.js';
import { EXPORT_PROFILES } from '../../src/domain/presentation.js';
import { HOUSE_SAMPLE_RATE, secondsToSamples } from '../../src/domain/time.js';

const AT = '2026-09-29T12:00:00.000Z';
const SONG = secondsToSamples(240);
const at = (seconds: number) => Math.round(seconds * HOUSE_SAMPLE_RATE);

function master(): MasterTrack {
  return {
    assetId: 'asset_song' as AssetId,
    title: 'The Long Way Round', artist: 'The Author',
    class: 'own', durationSamples: SONG,
  };
}

const SAMPLE = `[00:12.00]I walked the long way round
[00:16.50]And found you waiting there
[00:21.00]
[00:24.25]So we walked it again`;

describe('reading an LRC file', () => {
  it('places every line where its stamp says', () => {
    const lines = parseLrc(SAMPLE, SONG);
    expect(lines.map((line) => line.text)).toEqual([
      'I walked the long way round',
      'And found you waiting there',
      'So we walked it again',
    ]);
    expect(lines[0]!.fromSample).toBe(at(12));
    expect(lines[1]!.fromSample).toBe(at(16.5));
  });

  /*
   * A LINE IS ON SCREEN UNTIL THE NEXT ONE STARTS, which is what every
   * player that reads this format does. LRC gives one timestamp per line
   * and nothing else, so the end has to come from somewhere.
   */
  it('runs each line up to the next one', () => {
    const lines = parseLrc(SAMPLE, SONG);
    expect(lines[0]!.toSample).toBe(at(16.5));
  });

  /*
   * A STAMP WITH NOTHING AFTER IT IS AN INSTRUMENTAL BREAK, not an empty
   * caption. It is kept as a boundary — so the line before it ends there —
   * and dropped from the output.
   */
  it('lets an empty stamp end the line before it, and shows nothing', () => {
    const lines = parseLrc(SAMPLE, SONG);
    expect(lines[1]!.toSample).toBe(at(21));
    expect(lines.some((line) => line.text === '')).toBe(false);
  });

  it('holds the last line for a while and then stops', () => {
    const lines = parseLrc(SAMPLE, SONG);
    const last = lines[lines.length - 1]!;
    expect(last.toSample - last.fromSample).toBe(TAIL_SAMPLES);
  });

  /*
   * THE ONE PLACE LRC FILES DISAGREE WITH EACH OTHER. Two digits are
   * hundredths and three are thousandths; reading `[00:01.5]` as five
   * hundredths rather than five tenths puts every line in the file half a
   * second early, and it would look like the parser working.
   */
  it('reads a fraction by how many digits it has', () => {
    expect(parseLrc('[00:01.5]a', SONG)[0]!.fromSample).toBe(at(1.5));
    expect(parseLrc('[00:01.50]a', SONG)[0]!.fromSample).toBe(at(1.5));
    expect(parseLrc('[00:01.500]a', SONG)[0]!.fromSample).toBe(at(1.5));
    expect(parseLrc('[00:01.05]a', SONG)[0]!.fromSample).toBe(at(1.05));
  });

  /* A chorus is written once and stamped several times. */
  it('repeats a line that carries more than one stamp', () => {
    const lines = parseLrc('[00:10.00][01:10.00][02:10.00]the chorus', SONG);
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => line.fromSample))
      .toEqual([at(10), at(70), at(130)]);
  });

  it('puts them in order however they were written', () => {
    const lines = parseLrc('[00:30.00]second\n[00:10.00]first', SONG);
    expect(lines.map((line) => line.text)).toEqual(['first', 'second']);
  });

  it('ignores the metadata tags an LRC file starts with', () => {
    const lines = parseLrc('[ar:The Author]\n[ti:Song]\n[00:05.00]a line', SONG);
    expect(lines).toHaveLength(1);
    expect(lines[0]!.text).toBe('a line');
  });

  /*
   * THE PRODUCT NEVER GUESSES A TIME, and this is the refusal that says so.
   * A four-minute song with twenty lines is not twelve seconds a line, and
   * a caption drifting away from the voice is the first thing a viewer
   * notices.
   */
  it('refuses plain lyrics rather than spreading them across the song', () => {
    expect(() => parseLrc('I walked the long way round\nAnd found you', SONG))
      .toThrow(LyricsError);
    expect(() => parseLrc('some words', SONG)).toThrow(/no timings/);
  });

  it('refuses timings with no words against them', () => {
    expect(() => parseLrc('[00:10.00]\n[00:20.00]', SONG))
      .toThrow(/only timings/);
  });

  /* A line that can never be on screen is not kept. */
  it('drops a stamp past the end of the song', () => {
    const lines = parseLrc('[00:10.00]inside\n[10:00.00]far past the end', SONG);
    expect(lines.map((line) => line.text)).toEqual(['inside']);
  });

  it('never runs a line past the end of the song', () => {
    const lines = parseLrc(`[03:59.00]the last word`, SONG);
    expect(lines[0]!.toSample).toBe(SONG);
  });

  /* A caption nobody can read is not a caption. */
  it('gives a line crowded up against the next one a moment to be read', () => {
    const lines = parseLrc('[00:10.00]a\n[00:10.10]b', SONG);
    expect(lines[0]!.toSample - lines[0]!.fromSample)
      .toBeGreaterThanOrEqual(MIN_LINE_SAMPLES);
  });
});

describe('putting them on a performance', () => {
  function performance(): Performance {
    return newPerformance('My Performance', master(), AT);
  }

  it('parses once, in the edit, so a route cannot invent a second reading', () => {
    const p = performance();
    setLyrics(p, SAMPLE);
    expect(p.master.lyrics).toHaveLength(3);
    expect(p.master.lyrics![0]!.fromSample).toBe(at(12));
  });

  it('takes them off again', () => {
    const p = performance();
    setLyrics(p, SAMPLE);
    setLyrics(p, null);
    expect(p.master.lyrics).toBeUndefined();
    setLyrics(p, SAMPLE);
    setLyrics(p, '   ');
    expect(p.master.lyrics).toBeUndefined();
  });

  /*
   * A PARSER ERROR HAS TO ARRIVE AS AN EDIT ERROR. Every caller of that
   * module catches `PerformanceEditError` and answers 400; a `LyricsError`
   * escaping would come back as a 404 saying the performance was not
   * found, which is a lie about a file the author is looking at.
   */
  it('refuses untimed lyrics as an edit error, with the reason kept', () => {
    const p = performance();
    expect(() => setLyrics(p, 'just some words')).toThrow(PerformanceEditError);
    expect(() => setLyrics(p, 'just some words')).toThrow(/no timings/);
  });
});

describe('what the renderer is given', () => {
  it('turns the words into cues on the output clock', () => {
    const cues = performanceCues(parseLrc(SAMPLE, SONG));
    expect(cues).toHaveLength(3);
    expect(cues[0]!.startFrame).toBe(12 * 30);
    expect(cues[0]!.text).toBe('I walked the long way round');
    /* The performer is the one speaking, and there is no source. */
    expect(cues.every((cue) => cue.speaker === 'user')).toBe(true);
    /* A name on every line of a song is noise. */
    expect(cues.every((cue) => cue.speakerName === undefined)).toBe(true);
  });

  /*
   * A CLIP IS THE MASTER WITH A WINDOW ON IT, so its captions are the
   * master's shifted to the clip's own zero. A chorus clip carrying master
   * timings shows the first verse's words. [U-22]
   */
  it('shifts them to a clip’s own zero', () => {
    const lines = parseLrc(SAMPLE, SONG);
    const cues = performanceCues(lines, { fromSample: at(16), toSample: at(30) });
    /*
     * THREE, NOT TWO, AND COUNTING IT WRONG IS INSTRUCTIVE. The first line
     * runs to 16.5s, so a window opening at 16s catches half a second of
     * it — which is right, because the viewer hears that half second.
     */
    expect(cues).toHaveLength(3);
    expect(cues[0]!.text).toBe('I walked the long way round');
    expect(cues[0]!.startFrame).toBe(0);
    /* And the one that starts inside the window is shifted, not moved. */
    expect(cues[1]!.text).toBe('And found you waiting there');
    expect(cues[1]!.startFrame).toBe(Math.round(0.5 * 30));
  });

  /*
   * CLIPPED AT THE EDGES, NOT DROPPED: the viewer hears half a line, so
   * they must read half a line. The same rule `buildCues` follows for a
   * sentence straddling a cut.
   */
  it('keeps half a line the viewer hears half of', () => {
    const lines = parseLrc(SAMPLE, SONG);
    const cues = performanceCues(lines, { fromSample: at(14), toSample: at(18) });
    expect(cues[0]!.text).toBe('I walked the long way round');
    expect(cues[0]!.startFrame).toBe(0);
  });

  it('is nothing at all when there are no lyrics', () => {
    expect(performanceCues([])).toEqual([]);
    expect(lyricsInWindow([])).toEqual([]);
  });
});

describe('what MASTER CHECK says about them', () => {
  const profiles = Object.fromEntries(Object.entries(EXPORT_PROFILES)
    .map(([id, p]) => [id, { width: p.width, height: p.height, fps: p.fps }]));
  const captions = (p: Performance) => masterCheck(p, 'youtube_16x9', profiles)
    .items.find((entry) => entry.id === 'captions')!;

  it('names the invariant when there are none', () => {
    const p = newPerformance('My Performance', master(), AT);
    expect(captions(p).ok).toBe(false);
    expect(captions(p).says).toMatch(/INV-07/);
  });

  /*
   * A CAPTION TRACK THAT STOPS HALFWAY THROUGH THE SINGING is worse than
   * obvious — it looks finished. An outro with no words in it is normal,
   * so the bar is two thirds rather than the whole song.
   */
  it('is not satisfied by a few lines at the top of a long song', () => {
    const p = newPerformance('My Performance', master(), AT);
    setLyrics(p, '[00:05.00]one\n[00:10.00]two');
    expect(captions(p).ok).toBe(false);
    expect(captions(p).says).toMatch(/of 04:00\.000/);
  });

  it('passes when the words reach the end of the singing', () => {
    const p = newPerformance('My Performance', master(), AT);
    setLyrics(p, '[00:05.00]one\n[03:00.00]two');
    expect(captions(p).ok).toBe(true);
    expect(captions(p).says).toMatch(/2 line\(s\)/);
  });
});
