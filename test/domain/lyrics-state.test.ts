/**
 * Lyrics supplied is not lyrics timed.  [MASTER-EDIT §16, L1, L5]
 *
 * *"It should not present the situation as though the user failed to
 * provide lyrics."*
 *
 * The document can hold three states now — nothing, words, and timed
 * words — and the Master Check has to name the one it is in. The
 * assertion that matters is the middle one: an author who has pasted a
 * whole song must not be told there are no lyrics.
 */

import { describe, expect, it } from 'vitest';

import {
  type Performance, lyricsStatus, masterCheck, renderProblems,
} from '../../src/domain/performance.js';
import { EXPORT_PROFILES } from '../../src/domain/presentation.js';
import {
  setLyrics, setLyricsText, synchroniseLyrics,
} from '../../src/domain/performanceEdit.js';
import { HOUSE_SAMPLE_RATE, type Samples } from '../../src/domain/time.js';
import type { Phrase } from '../../src/domain/lyrics.js';

const SECOND = HOUSE_SAMPLE_RATE;

/** The smallest performance the captions check will look at. */
function song(): Performance {
  return {
    schemaVersion: 6,
    id: 'perf_x', title: 'The Ancient of Days',
    createdAt: '2026-09-30T10:00:00.000Z',
    master: {
      assetId: 'asset_song' as never,
      title: 'The Ancient of Days',
      class: 'own',
      durationSamples: (240 * SECOND) as Samples,
    },
    takes: [], scenes: [], audio: { mode: 'master' },
  } as unknown as Performance;
}

const captions = (performance: Performance) =>
  masterCheck(performance, 'youtube_16x9', EXPORT_PROFILES)
    .items.find((one) => one.id === 'captions');

const at = (from: number, to: number): Phrase =>
  ({ fromSample: (from * SECOND) as Samples, toSample: (to * SECOND) as Samples });

describe('the state model', () => {
  it('is three states from one function, not a length', () => {
    /* *"rather than trying to infer everything from lyrics.length"* —
       the inference was the bug: two numbers for three states. */
    const one = song();
    expect(lyricsStatus(one.master)).toBe('none');
    setLyricsText(one, 'Ancient of Days');
    expect(lyricsStatus(one.master)).toBe('untimed');
    synchroniseLyrics(one, [at(10, 14)]);
    expect(lyricsStatus(one.master)).toBe('timed');
  });

  it('treats whitespace as no lyrics', () => {
    const one = song();
    one.master.lyricsText = '   \n  ';
    expect(lyricsStatus(one.master)).toBe('none');
  });
});

describe('the three states the check must tell apart', () => {
  it('says not supplied, and does not call it a fault', () => {
    /* *"No lyrics ≠ missing required data. A song can be perfectly
       valid with Lyrics — Not supplied, and should still be
       publishable."* An instrumental is not an incomplete song. */
    const line = captions(song());
    expect(line?.says).toContain('not supplied');
    expect(line?.ok).toBe(true);
  });

  it('does not tell an instrumental it is missing something', () => {
    expect(captions(song())?.says).not.toContain('no lyrics yet');
    expect(captions(song())?.says).not.toMatch(/INV-07/);
  });

  it('does NOT say that to somebody who has just pasted a song', () => {
    /* The fault in the screenshot: a full lyric in the box, and the
       check counting timed lines and reporting zero. */
    const one = song();
    setLyricsText(one, 'Ancient of Days\nWho can search out Your mind');
    expect(captions(one)?.says).not.toContain('no lyrics yet');
    expect(captions(one)?.says).toContain('timing required');
    /* And THIS one is worth doing: the author said there are words and
       they are not usable yet. */
    expect(captions(one)?.ok).toBe(false);
  });

  it('counts the lines once they are timed', () => {
    const one = song();
    setLyrics(one, '[00:10.00]Ancient of Days\n[03:00.00]Who can search out');
    expect(captions(one)?.says).toContain('2 line(s)');
  });

  it('is called Lyrics, not Captions, because that is what was asked for', () => {
    expect(captions(song())?.label).toBe('Lyrics');
  });

  it('is a warning in every state, never a refusal', () => {
    /* Making the render refuse would make INV-07 true by breaking every
       performance made before there was a field to put lyrics in. */
    const one = song();
    expect(captions(one)?.advisory).toBe(true);
    setLyricsText(one, 'Ancient of Days');
    expect(captions(one)?.advisory).toBe(true);
    /* And it blocks nothing: `renderProblems` is what stops a render,
       and captions are not in it. */
    expect(renderProblems(one).some(
      (problem) => problem.say.toLowerCase().includes('caption'))).toBe(false);
  });
});

describe('the words are kept', () => {
  it('keeps plain lyrics without inventing timings', () => {
    const one = song();
    setLyricsText(one, 'Ancient of Days\nWho can search out Your mind');
    expect(one.master.lyricsText).toContain('Ancient of Days');
    expect(one.master.lyrics).toBeUndefined();
  });

  it('keeps the words when an LRC is imported, not only the timings', () => {
    /* An author who imported an LRC and then re-records should not have
       to find the file again. */
    const one = song();
    setLyrics(one, '[00:10.00]Ancient of Days');
    expect(one.master.lyrics).toHaveLength(1);
    expect(one.master.lyricsText).toContain('Ancient of Days');
  });

  it('clearing the lyrics clears both', () => {
    const one = song();
    setLyrics(one, '[00:10.00]Ancient of Days');
    setLyrics(one, null);
    expect(one.master.lyrics).toBeUndefined();
    expect(one.master.lyricsText).toBeUndefined();
  });

  it('clearing just the words leaves timings that are still wanted', () => {
    const one = song();
    setLyrics(one, '[00:10.00]Ancient of Days');
    setLyricsText(one, '');
    expect(one.master.lyricsText).toBeUndefined();
    expect(one.master.lyrics).toHaveLength(1);
  });

  it('editing the words does not silently retime them', () => {
    /* Synchronising is a separate act, because it is one. */
    const one = song();
    setLyrics(one, '[00:10.00]Ancient of Days');
    setLyricsText(one, 'Something else entirely');
    expect(one.master.lyrics?.[0]?.text).toBe('Ancient of Days');
  });
});

describe('synchronising', () => {
  it('times the words against the phrases it was given', () => {
    const one = song();
    setLyricsText(one, 'Ancient of Days\nWho can search out Your mind');
    const done = synchroniseLyrics(one, [at(10, 14), at(20, 25)]);
    expect(done.ok).toBe(true);
    expect(one.master.lyrics).toHaveLength(2);
    expect(one.master.lyrics?.[0]?.fromSample).toBe(10 * SECOND);
    expect(one.master.lyrics?.[1]?.text).toBe('Who can search out Your mind');
  });

  it('turns the check green once it has', () => {
    const one = song();
    setLyricsText(one, 'Ancient of Days\nWho can search out Your mind');
    expect(captions(one)?.ok).toBe(false);
    synchroniseLyrics(one, [at(10, 14), at(200, 230)]);
    expect(captions(one)?.ok).toBe(true);
  });

  it('refuses when there are no words to time', () => {
    expect(() => synchroniseLyrics(song(), [at(10, 14)]))
      .toThrow(/no lyrics on this song yet/);
  });

  it('refuses when no singing was found, in the edit’s own error', () => {
    /* Every caller of this module catches `PerformanceEditError` and
       answers 400; a parser error escaping would come back as a 404
       saying the performance was not found. */
    const one = song();
    setLyricsText(one, 'Ancient of Days');
    expect(() => synchroniseLyrics(one, [])).toThrow(/no singing was found/);
  });

  it('leaves the old timings alone when it refuses', () => {
    const one = song();
    setLyrics(one, '[00:10.00]Ancient of Days');
    expect(() => synchroniseLyrics(one, [])).toThrow();
    expect(one.master.lyrics).toHaveLength(1);
  });
});
