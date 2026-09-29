/**
 * The words, for a video of somebody singing.
 * [MASTER-EDIT §6, §12 P3; Doctrine INV-07, U-02, U-19, D-04]
 *
 * INV-07: "Every export carries captions and an attribution block." A
 * performance export carries the attribution and does not carry captions —
 * the worker builds cues for a conversation render and passes none for a
 * performance. Measured, not remembered: `compose` is called without `cues`
 * at the performance call site and with them at the other three.
 *
 * WHY STUDIO ONE'S TRANSCRIPTION IS NOT THE ANSWER, and this is the
 * interesting part. The obvious move is to point the existing ASR at the
 * vocal take. Studio One's captions come from speech, and speech
 * recognition on SINGING is bad — held vowels, melisma, a backing track in
 * the same band as the voice. A caption track that is wrong two lines in
 * five is worse than none at all: a deaf viewer cannot tell which two, and
 * D-04's whole argument for captions is that they are the accessible form
 * of WHAT WAS SAID, not an approximation of it.
 *
 * So the words come from the author, who has them. A song has lyrics before
 * it has a video.
 *
 * AND THE TIMING COMES FROM THE AUTHOR TOO, in LRC — the format every
 * karaoke tool, every lyrics site and most music players already read, so
 * an author is pasting something they have rather than typing something
 * new. [U-02]
 *
 * THE PRODUCT NEVER GUESSES A TIME. Plain lines with no timestamps are
 * refused with the reason, rather than spread evenly across the song: a
 * four-minute song with twenty lines is not twelve seconds a line, and a
 * caption that drifts away from the voice is the thing a viewer notices
 * before anything else in the video.
 */

import { type Samples, HOUSE_SAMPLE_RATE } from './time.js';

export interface LyricLine {
  /** Where the line is sung, on the master clock. */
  fromSample: Samples;
  /**
   * Where it stops being on screen.
   *
   * Derived from the next line rather than written in the file, because LRC
   * gives one timestamp per line and nothing else. A line is on screen until
   * the next one starts, which is what every player that reads this format
   * does — and the last line holds for `TAIL` and no longer, so a song that
   * ends in two minutes of outro does not end with a lyric sitting there.
   */
  toSample: Samples;
  text: string;
}

export class LyricsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LyricsError';
  }
}

/** How long the last line stays up when nothing follows it. Four seconds. */
export const TAIL_SAMPLES: Samples = HOUSE_SAMPLE_RATE * 4;

/** A caption nobody can read is not a caption. One second, at least. */
export const MIN_LINE_SAMPLES: Samples = HOUSE_SAMPLE_RATE;

/*
 * `[mm:ss.xx]` or `[mm:ss]`, and more than one on a line — LRC repeats a
 * line by giving it several stamps, which is how a chorus is written once.
 * Fractions may be two digits (centiseconds, the common case) or three.
 */
const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/**
 * Read an LRC file, or say why it is not one.
 *
 * `songSamples` bounds the result: a stamp past the end of the song is a
 * line that can never be on screen, and silently keeping it would mean a
 * caption file longer than the video it captions.
 */
export function parseLrc(text: string, songSamples: Samples): LyricLine[] {
  const found: { at: Samples; text: string }[] = [];
  let sawAnyStamp = false;

  for (const raw of text.split(/\r?\n/)) {
    STAMP.lastIndex = 0;
    const stamps: Samples[] = [];
    let match: RegExpExecArray | null;
    while ((match = STAMP.exec(raw)) !== null) {
      sawAnyStamp = true;
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      /*
       * TWO DIGITS ARE HUNDREDTHS AND THREE ARE THOUSANDTHS, which is the
       * one place LRC files disagree with each other. Reading `[00:01.5]`
       * as five hundredths rather than five tenths puts every line in the
       * file half a second early, and it would look like the parser
       * working.
       */
      const fraction = match[3]
        ? Number(match[3]) / 10 ** match[3].length
        : 0;
      stamps.push(Math.round((minutes * 60 + seconds + fraction) * HOUSE_SAMPLE_RATE));
    }
    if (stamps.length === 0) continue;

    /* Everything after the last stamp is the line. */
    const body = raw.slice(raw.lastIndexOf(']') + 1).trim();
    /*
     * A STAMP WITH NOTHING AFTER IT IS NOT AN EMPTY CAPTION. LRC uses those
     * as markers for an instrumental break, and a player shows nothing.
     * Kept as a boundary so the line before it ends there, and dropped
     * from the output below.
     */
    for (const at of stamps) found.push({ at, text: body });
  }

  if (!sawAnyStamp) {
    throw new LyricsError(
      'these lyrics have no timings in them. Paste an LRC file — the format '
      + 'lyrics sites and karaoke tools export, with [00:12.34] before each '
      + 'line — because a line placed by guesswork drifts away from the voice');
  }

  found.sort((a, b) => a.at - b.at);

  const lines: LyricLine[] = [];
  for (let i = 0; i < found.length; i += 1) {
    const here = found[i]!;
    if (here.text === '') continue;
    if (here.at >= songSamples) continue;
    const next = found[i + 1]?.at ?? here.at + TAIL_SAMPLES;
    lines.push({
      fromSample: Math.max(0, here.at),
      toSample: Math.min(songSamples, Math.max(next, here.at + MIN_LINE_SAMPLES)),
      text: here.text,
    });
  }

  if (lines.length === 0) {
    throw new LyricsError('there are no lines in that, only timings');
  }
  return lines;
}

/**
 * The lines that fall inside a window, on the OUTPUT clock.
 * [MASTER-EDIT §14, U-22]
 *
 * A clip is the master render with a window on it, so its captions are the
 * master's captions shifted to the clip's own zero — the same arithmetic
 * `buildCues` does for a conversation's timeline, and the same reason: a
 * chorus clip whose captions still carry master timings shows the first
 * verse's words.
 *
 * Clipped rather than dropped at the edges, because the viewer HEARS half
 * a line and must therefore read half a line.
 */
export function lyricsInWindow(
  lines: readonly LyricLine[],
  window?: { fromSample: Samples; toSample: Samples },
): LyricLine[] {
  const from = window?.fromSample ?? 0;
  const to = window?.toSample ?? Number.POSITIVE_INFINITY;
  const out: LyricLine[] = [];
  for (const line of lines) {
    if (line.toSample <= from || line.fromSample >= to) continue;
    out.push({
      fromSample: Math.max(line.fromSample, from) - from,
      toSample: Math.min(line.toSample, to) - from,
      text: line.text,
    });
  }
  return out;
}
