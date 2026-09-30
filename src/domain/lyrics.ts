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

/* ------------------------------------------------------------------------ *
 *  Aligning words to the voice.  [MASTER-EDIT §16, C-L1; L2]
 * ------------------------------------------------------------------------ */

/**
 * *"You should not have to know what LRC is just because BalanceVid asked
 *  you for lyrics."*
 *
 * AND THE HEAD OF THIS FILE SAYS THE PRODUCT NEVER GUESSES A TIME. Both
 * are right, and the distinction they turn on is the whole of this
 * section: **the objection is to SPREADING, not to MEASURING.**
 *
 * Spreading is what the refusal was written against — twenty lines over
 * four minutes at twelve seconds each, an arithmetic mean pretending to
 * be a fact, drifting further from the voice with every line. That is
 * still refused and always will be.
 *
 * What this does instead is read where the singing actually starts and
 * stops. A phrase boundary is a measurement of the master's own audio,
 * made by the same voice detector Studio One's transcription uses, and
 * placing a line at one is not a guess about the song — it is the song,
 * reported.
 *
 * IT IS ALSO NOT TRANSCRIPTION, which this file rejected for good reason:
 * *"speech recognition on SINGING is bad — held vowels, melisma, a backing
 * track in the same band as the voice."* Nothing here recognises a word.
 * The words are known, because the author supplied them; the only question
 * is which phrase each one belongs to, and a held vowel is as detectable
 * as a short one.
 *
 * WHERE IT STILL ESTIMATES, IT SAYS SO AND THE ERROR IS BOUNDED. Two lines
 * sung in one breath share one measured phrase, and they are divided
 * inside it by how long each takes to sing. That is an estimate — but it
 * is an estimate INSIDE a measurement, so it cannot drift: the worst it
 * can be wrong by is the length of the phrase it is confined to, and the
 * author is told which lines those are.
 */

/** A stretch of the master where somebody is singing. Measured. */
export interface Phrase {
  fromSample: Samples;
  toSample: Samples;
}

export interface Alignment {
  lines: LyricLine[];
  /**
   * Which lines were placed by measurement alone, by their index in
   * `lines`. Everything not here shares a phrase with its neighbour and
   * was divided inside it — which is what the studio marks for review.
   */
  measured: number[];
  /** What to tell the author, in their language rather than ours. */
  says: string;
  /**
   * Whether this is good enough to keep without looking.
   *
   * False does not mean refused. It means the author has to see it, which
   * is the whole point of showing a timing preview. [§16]
   */
  ok: boolean;
  /**
   * The words ran past the singing that was found.
   *
   * Every line gets its second, because a caption nobody can read is not
   * a caption — so more words than voice pushes the tail beyond the last
   * phrase. Reported rather than hidden: it means the detector heard a
   * fraction of the song, and the author needs to know that before they
   * trust any of it.
   */
  overflowed: boolean;
  /** Said alongside `says` when there is a second thing to know. */
  also?: string;
}

/**
 * The words, one per line, as somebody typed them.
 *
 * BLANK LINES SEPARATE STANZAS AND ARE NOT LINES. Everybody pastes a
 * verse, a gap and a chorus, and a caption track with an empty caption in
 * it shows a blank screen where a word should be.
 */
export function lyricLines(text: string): string[] {
  return text.split(/\r?\n/).map((one) => one.trim()).filter((one) => one !== '');
}

/**
 * How long a line takes to sing, relative to the others.
 *
 * COUNTED IN LETTERS, not in words: "Hallelujah" is one word and four
 * syllables, and a word count would give it the same time as "Lord".
 * Letters are a poor proxy for syllables and a much better one than
 * words, and this is only ever used to divide a measured phrase between
 * two lines that shared it — so a poor proxy costs a fraction of one
 * breath, never a drift.
 */
function weight(line: string): number {
  return Math.max(1, line.replace(/[^\p{L}\p{N}]/gu, '').length);
}

/**
 * Put the words on the voice.
 *
 * THREE CASES, AND THE PRODUCT SAYS WHICH ONE HAPPENED:
 *
 *   as many phrases as lines — every line landed on its own breath, which
 *     is the case a verse-per-line lyric produces and it needs no review;
 *   more phrases than lines — the singer breathed inside a line, or there
 *     is an instrumental. Adjacent phrases are joined at the SHORTEST gaps
 *     first, because the shortest gap is the one most likely to be a
 *     breath rather than a line break;
 *   more lines than phrases — two lines were sung in one breath. The
 *     phrase is divided between them by `weight`, and both are marked for
 *     review.
 */
export function alignLyrics(
  text: string, phrases: readonly Phrase[], songSamples: Samples,
): Alignment {
  const words = lyricLines(text);
  if (words.length === 0) {
    throw new LyricsError('there are no words in that to put on the song');
  }
  /*
   * NO PHRASES IS NOT AN ALIGNMENT OF ZERO LINES. It means the detector
   * found no singing — an instrumental, a silent master, or a measurement
   * that has not run — and spreading the words over it is the exact thing
   * the head of this file forbids.
   */
  if (phrases.length === 0) {
    throw new LyricsError(
      'no singing was found in this song, so there is nothing to put the '
      + 'words on. Check the master has the vocal in it, or paste an LRC '
      + 'file with your own timings');
  }

  /* In order, inside the song, and never inside out. */
  const heard = [...phrases]
    .map((one) => ({
      fromSample: Math.max(0, Math.min(songSamples, one.fromSample)),
      toSample: Math.max(0, Math.min(songSamples, one.toSample)),
    }))
    .filter((one) => one.toSample > one.fromSample)
    .sort((a, b) => a.fromSample - b.fromSample);

  if (heard.length === 0) {
    throw new LyricsError(
      'the singing found in this song is outside the song, which cannot '
      + 'be right. Paste an LRC file with your own timings');
  }

  /* ---- more phrases than lines: join at the shortest gaps ------------ */
  const slots = [...heard];
  while (slots.length > words.length) {
    let shortest = 0;
    let gap = Number.POSITIVE_INFINITY;
    for (let i = 0; i < slots.length - 1; i += 1) {
      const between = slots[i + 1]!.fromSample - slots[i]!.toSample;
      if (between < gap) { gap = between; shortest = i; }
    }
    slots.splice(shortest, 2, {
      fromSample: slots[shortest]!.fromSample,
      toSample: slots[shortest + 1]!.toSample,
    });
  }

  /* ---- assign, dividing a slot where two lines share one ------------- */
  const lines: LyricLine[] = [];
  const measured: number[] = [];
  const perSlot = Math.ceil(words.length / slots.length);

  let index = 0;
  for (let s = 0; s < slots.length && index < words.length; s += 1) {
    const slot = slots[s]!;
    /*
     * AND NO SPECIAL CASE FOR THE LAST SLOT. One stood here — "the last
     * slot takes whatever is left, so nothing is dropped" — and a
     * mutation sweep removed it without an assertion noticing, because
     * `Math.ceil` already guarantees the slots can hold every line.
     * The fourth unobservable guard this session, and deleted for the
     * same reason as the others: it reads as though something were
     * being enforced that arithmetic already settles.
     */
    const take = Math.min(perSlot, words.length - index);
    const mine = words.slice(index, index + take);
    const total = mine.reduce((sum, one) => sum + weight(one), 0);
    let at = slot.fromSample;
    for (let i = 0; i < mine.length; i += 1) {
      const share = (slot.toSample - slot.fromSample) * (weight(mine[i]!) / total);
      const to = i === mine.length - 1 ? slot.toSample : at + share;
      if (mine.length === 1) measured.push(lines.length);
      lines.push({
        fromSample: Math.round(at),
        toSample: Math.round(Math.max(to, at + MIN_LINE_SAMPLES)),
        text: mine[i]!,
      });
      at = to;
    }
    index += take;
  }

  /*
   * A LINE MAY NOT START BEFORE THE ONE BEFORE IT ENDS, which the
   * minimum length above can otherwise cause on a phrase shorter than a
   * second. Walked forward once rather than checked: the alternative is
   * two captions on screen at the same time, which reads as a bug in the
   * video rather than in the timings.
   */
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i]!.fromSample < lines[i - 1]!.toSample) {
      lines[i]!.fromSample = lines[i - 1]!.toSample;
      lines[i]!.toSample = Math.max(
        lines[i]!.toSample, lines[i]!.fromSample + MIN_LINE_SAMPLES);
    }
  }

  const shared = lines.length - measured.length;
  const joined = heard.length - slots.length;
  /*
   * AND WHETHER THE WORDS FIT THE SINGING AT ALL.
   *
   * A caption nobody can read is not a caption, so every line gets its
   * second — and twenty lines against one ten-second phrase is twenty
   * seconds of captions on ten seconds of voice. The minimum wins,
   * because half a second on screen helps nobody, and then the words
   * run past the singing they were measured onto.
   *
   * That input is pathological — it means the detector heard a fraction
   * of the song — and the honest response is to say so rather than to
   * either refuse a whole lyric or quietly hand back captions that
   * outlast the voice. [D-04, §16]
   */
  const lastSlot = slots[slots.length - 1]!.toSample;
  const overflowed = (lines[lines.length - 1]?.toSample ?? 0) > lastSlot;
  return {
    lines,
    measured,
    ok: shared === 0,
    says: shared === 0
      ? joined > 0
        ? `Every line landed on its own phrase. ${joined} breath`
          + `${joined === 1 ? '' : 's'} inside a line ${joined === 1 ? 'was' : 'were'}`
          + ' joined up.'
        : 'Every line landed on its own phrase.'
      : `${shared} line${shared === 1 ? '' : 's'} shared a phrase with `
        + `${shared === 1 ? 'another' : 'others'} and ${shared === 1 ? 'was' : 'were'}`
        + ' divided inside it. Those are marked — check them against the song.',
    overflowed,
    ...(overflowed
      ? {
        also: 'There are more words here than singing was found for, so the '
          + 'last lines run past the voice. The master may be missing the '
          + 'vocal, or these may be the words to a longer song.',
      }
      : {}),
  };
}
