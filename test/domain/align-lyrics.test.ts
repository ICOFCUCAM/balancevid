/**
 * Putting the words on the voice.  [MASTER-EDIT §16, C-L1; INV-07, D-04]
 *
 * *"You should not have to know what LRC is just because BalanceVid
 * asked you for lyrics."*
 *
 * And `lyrics.ts` says the product never guesses a time. Both hold, and
 * the line between them is what this file tests: a phrase boundary is a
 * MEASUREMENT and placing a line on one is reporting the song, while
 * spreading lines evenly across four minutes is arithmetic pretending to
 * be a fact. The assertions that matter most are the ones about the
 * cases where it cannot measure — it must say so, and where it divides
 * a measured phrase it must mark the lines it divided.
 */

import { describe, expect, it } from 'vitest';

import {
  type Phrase, LyricsError, MIN_LINE_SAMPLES,
  alignLyrics, lyricLines,
} from '../../src/domain/lyrics.js';
import { HOUSE_SAMPLE_RATE, type Samples } from '../../src/domain/time.js';

const SECOND = HOUSE_SAMPLE_RATE;
const SONG = (240 * SECOND) as Samples;

const at = (from: number, to: number): Phrase =>
  ({ fromSample: (from * SECOND) as Samples, toSample: (to * SECOND) as Samples });

const seconds = (value: number) => value / SECOND;

describe('the words, as somebody typed them', () => {
  it('drops blank lines rather than captioning them', () => {
    /* Everybody pastes a verse, a gap and a chorus, and an empty caption
       is a blank screen where a word should be. */
    expect(lyricLines('one\n\n\ntwo\n')).toEqual(['one', 'two']);
  });

  it('trims, because a trailing space is not a word', () => {
    expect(lyricLines('  one  \n\ttwo\t')).toEqual(['one', 'two']);
  });

  it('finds nothing in nothing', () => {
    expect(lyricLines('   \n\n  ')).toEqual([]);
  });
});

describe('one line to one phrase', () => {
  const phrases = [at(10, 14), at(16, 20), at(22, 27)];
  const words = 'Ancient of Days\nWho can search out Your mind\nThey study the stars';

  it('puts each line where the singing starts', () => {
    const done = alignLyrics(words, phrases, SONG);
    expect(done.lines.map((one) => seconds(one.fromSample))).toEqual([10, 16, 22]);
    expect(done.lines.map((one) => seconds(one.toSample))).toEqual([14, 20, 27]);
  });

  it('keeps the words in the order they were written', () => {
    expect(alignLyrics(words, phrases, SONG).lines.map((one) => one.text))
      .toEqual(['Ancient of Days', 'Who can search out Your mind',
        'They study the stars']);
  });

  it('says every line was measured, and needs no review', () => {
    const done = alignLyrics(words, phrases, SONG);
    expect(done.ok).toBe(true);
    expect(done.measured).toEqual([0, 1, 2]);
    expect(done.says).toContain('own phrase');
  });

  it('does not care what order the phrases arrived in', () => {
    const shuffled = [phrases[2]!, phrases[0]!, phrases[1]!];
    expect(alignLyrics(words, shuffled, SONG).lines.map(
      (one) => seconds(one.fromSample))).toEqual([10, 16, 22]);
  });
});

describe('more phrases than lines — a breath inside a line', () => {
  it('joins at the shortest gap, which is the one most likely a breath', () => {
    /* "Who has measured Your wisdom, [breath] who can search out Your
       mind" is one line sung in two breaths. The gap inside it is
       shorter than the gap between lines. */
    const phrases = [at(10, 13), at(13.2, 16), at(20, 24)];
    const done = alignLyrics('Who has measured Your wisdom\nThey study the stars',
      phrases, SONG);
    expect(done.lines).toHaveLength(2);
    expect(seconds(done.lines[0]!.fromSample)).toBe(10);
    expect(seconds(done.lines[0]!.toSample)).toBe(16);
    expect(seconds(done.lines[1]!.fromSample)).toBe(20);
  });

  it('joins as many times as it needs to', () => {
    const phrases = [at(10, 11), at(11.1, 12), at(12.1, 13), at(13.1, 14)];
    const done = alignLyrics('one line', phrases, SONG);
    expect(done.lines).toHaveLength(1);
    expect(seconds(done.lines[0]!.fromSample)).toBe(10);
    expect(seconds(done.lines[0]!.toSample)).toBe(14);
  });

  it('still counts every line as measured, and says what it joined', () => {
    const phrases = [at(10, 13), at(13.2, 16), at(20, 24)];
    const done = alignLyrics('one\ntwo', phrases, SONG);
    expect(done.ok).toBe(true);
    expect(done.measured).toEqual([0, 1]);
    expect(done.says).toContain('breath');
  });
});

describe('more lines than phrases — two lines in one breath', () => {
  const phrases = [at(10, 20)];

  it('divides the measured phrase between them', () => {
    const done = alignLyrics('aaaa\naaaa', phrases, SONG);
    expect(done.lines).toHaveLength(2);
    expect(seconds(done.lines[0]!.fromSample)).toBe(10);
    expect(seconds(done.lines[0]!.toSample)).toBeCloseTo(15, 3);
    expect(seconds(done.lines[1]!.toSample)).toBe(20);
  });

  it('gives the longer line the longer share', () => {
    /* A poor proxy for syllables and a much better one than words — and
       it only ever divides ONE measured breath, so a poor proxy costs a
       fraction of a phrase and can never drift. */
    const done = alignLyrics('a\naaaaaaaaaaaaaaaaaaa', phrases, SONG);
    const first = done.lines[0]!.toSample - done.lines[0]!.fromSample;
    const second = done.lines[1]!.toSample - done.lines[1]!.fromSample;
    expect(second).toBeGreaterThan(first * 3);
  });

  it('never leaves the phrase it was given', () => {
    /* The whole argument for dividing rather than refusing: the error is
       bounded by the measurement it sits inside. */
    const done = alignLyrics('one\ntwo\nthree', phrases, SONG);
    expect(seconds(done.lines[0]!.fromSample)).toBe(10);
    expect(seconds(done.lines[done.lines.length - 1]!.toSample)).toBe(20);
  });

  it('marks the divided lines for review and does not call itself ok', () => {
    const done = alignLyrics('one\ntwo', phrases, SONG);
    expect(done.ok).toBe(false);
    expect(done.measured).toEqual([]);
    expect(done.says).toContain('marked');
  });

  it('marks only the lines that shared, not the ones that did not', () => {
    const done = alignLyrics('one\ntwo\nthree', [at(10, 20), at(30, 34)], SONG);
    /* Two lines in the first phrase, one alone in the second. */
    expect(done.measured).toEqual([2]);
    expect(done.ok).toBe(false);
  });

  it('places every line it was given, dropping none', () => {
    const done = alignLyrics('a\nb\nc\nd\ne\nf\ng', [at(10, 20), at(30, 40)], SONG);
    expect(done.lines.map((one) => one.text))
      .toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
  });
});

describe('what it refuses, and says why', () => {
  it('refuses words with no song under them', () => {
    expect(() => alignLyrics('one\ntwo', [], SONG)).toThrow(LyricsError);
    expect(() => alignLyrics('one', [], SONG)).toThrow(/no singing was found/);
  });

  it('names the two ways out when it cannot hear the voice', () => {
    /* A refusal that does not say what to do next is a dead end. */
    try { alignLyrics('one', [], SONG); } catch (error) {
      expect((error as Error).message).toContain('vocal');
      expect((error as Error).message).toContain('LRC');
    }
  });

  it('refuses a song with no words', () => {
    expect(() => alignLyrics('  \n \n', [at(10, 14)], SONG)).toThrow(LyricsError);
  });

  it('refuses phrases that are outside the song entirely', () => {
    expect(() => alignLyrics('one', [at(300, 320)], SONG)).toThrow(/outside the song/);
  });
});

describe('what it will never produce', () => {
  it('never puts two captions on screen at once', () => {
    /* Which reads as a bug in the video rather than in the timings. */
    const done = alignLyrics('a\nb\nc', [at(10, 10.5)], SONG);
    for (let i = 1; i < done.lines.length; i += 1) {
      expect(done.lines[i]!.fromSample)
        .toBeGreaterThanOrEqual(done.lines[i - 1]!.toSample);
    }
  });

  it('never shows a line for less than a second', () => {
    const done = alignLyrics('a\nb\nc', [at(10, 10.5)], SONG);
    for (const line of done.lines) {
      expect(line.toSample - line.fromSample).toBeGreaterThanOrEqual(MIN_LINE_SAMPLES);
    }
  });

  it('never places a line before the song starts', () => {
    const done = alignLyrics('one', [at(-5, 4)], SONG);
    expect(done.lines[0]!.fromSample).toBeGreaterThanOrEqual(0);
  });

  it('clamps a phrase that runs past the end of the song', () => {
    const done = alignLyrics('one', [at(235, 300)], SONG);
    expect(done.lines[0]!.toSample).toBeLessThanOrEqual(SONG);
  });

  it('says when there are more words than singing, rather than hiding it', () => {
    /* Every line gets its second, so twenty lines on a ten-second phrase
       run past the voice. That input means the detector heard a fraction
       of the song, and the author needs to know before trusting any of
       it. */
    const words = Array.from({ length: 20 }, (unused, i) => `line ${i}`).join('\n');
    const done = alignLyrics(words, [at(10, 20)], SONG);
    expect(done.overflowed).toBe(true);
    expect(done.also).toContain('more words here than singing');
    expect(done.ok).toBe(false);
  });

  it('does not cry overflow when the words fit', () => {
    const done = alignLyrics('one\ntwo', [at(10, 20), at(30, 40)], SONG);
    expect(done.overflowed).toBe(false);
    expect(done.also).toBeUndefined();
  });

  it('never spreads lines evenly over a song, which is the whole point', () => {
    /* Twenty lines over four minutes at twelve seconds each is the thing
       `lyrics.ts` refuses. With one measured phrase of ten seconds, all
       twenty land inside those ten seconds and nowhere else. */
    const words = Array.from({ length: 20 }, (unused, i) => `line ${i}`).join('\n');
    const done = alignLyrics(words, [at(10, 20)], SONG);
    expect(seconds(done.lines[0]!.fromSample)).toBe(10);
    expect(seconds(done.lines[19]!.toSample)).toBeLessThanOrEqual(30);
  });
});
