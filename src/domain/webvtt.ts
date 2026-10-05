/**
 * Reading a caption file, and cutting one into segments.
 *   [Doctrine CHANNEL §7, §17, D-18, D-19, U-19]
 *
 *     WEBVTT
 *     X-TIMESTAMP-MAP=MPEGTS:126000,LOCAL:00:00:00.000
 *
 *     00:00:01.200 --> 00:00:03.900
 *     <v Source>The second verse, then.
 *
 * THE PRODUCT ALREADY MAKES CAPTIONS AND THE WIRE NEVER CARRIED
 * THEM. `compose.ts` writes `master.mp4.vtt` beside every render
 * it finishes — INV-07, the sidecars ship whatever the burn-in
 * setting — and a channel scheduling that render put the picture
 * and the sound on air and left the words on the disk. This is
 * the module that reads them back.
 *
 * NOT A SECOND CAPTION SYSTEM, WHICH IS THE WHOLE POINT. The
 * cues are the ones the transcript produced, through the one
 * `buildVtt` every export uses; nothing here invents a line,
 * re-times one, or decides who is speaking. It parses what that
 * function wrote and cuts it on the segment grid. A channel
 * captioner that read the transcript directly would be a second
 * answer to *what was said*, and the two would disagree the
 * first time somebody corrected a word. [D-19]
 *
 * A CUE THAT STRADDLES A BOUNDARY IS IN BOTH SEGMENTS. HLS hands
 * a player one segment at a time and a viewer who tunes in
 * mid-sentence gets only the second one; a cue that appeared
 * solely in the segment where it STARTED would vanish for them.
 * It is clipped to each window rather than duplicated whole, so
 * the line leaves the screen when it is meant to.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

/** One line of caption, in milliseconds from the file's own zero. */
export interface TimedLine {
  fromMs: number;
  toMs: number;
  /** The payload, exactly as written — tags, speaker voice and all. */
  text: string;
}

/**
 * Read a WebVTT file.
 *
 * FORGIVING ABOUT EVERYTHING EXCEPT THE TIMES. A caption file
 * may carry a cue identifier, a `NOTE` block, region and style
 * blocks, cue settings after the arrow, and either line ending —
 * and a parser that threw on any of them would take a channel's
 * captions off the air over a comment. What it will not do is
 * guess at a malformed timestamp: a cue whose times cannot be
 * read is dropped, because a line shown at the wrong moment is
 * worse than a line not shown. [U-19]
 */
export function readVtt(text: string): TimedLine[] {
  const out: TimedLine[] = [];
  /* `\r\n` and a byte-order mark, both of which a file picked up
     from somewhere else will carry. */
  const blocks = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((one) => one.trim() !== '');
    if (lines.length === 0) continue;
    /*
     * THE ARROW IS WHAT MAKES A BLOCK A CUE. The header, a
     * `NOTE`, a `STYLE` and a `REGION` have none; a cue with an
     * identifier has it on its second line. Looking for the
     * arrow rather than counting lines is what makes all four
     * cases one case.
     */
    const at = lines.findIndex((one) => one.includes('-->'));
    if (at < 0) continue;
    const times = timesOf(lines[at]!);
    if (!times) continue;
    const body = lines.slice(at + 1).join('\n').trim();
    if (body === '') continue;
    out.push({ ...times, text: body });
  }
  /*
   * IN ORDER, BECAUSE THE CUT BELOW WALKS THEM. WebVTT does not
   * require a file to be sorted and `buildVtt` happens to write
   * one that is; relying on a happy accident of the producer is
   * how the one file that was not sorted loses half its lines.
   */
  return out.sort((a, b) => a.fromMs - b.fromMs || a.toMs - b.toMs);
}

function timesOf(line: string): { fromMs: number; toMs: number } | null {
  const said = /^\s*([0-9:.]+)\s*-->\s*([0-9:.]+)/.exec(line);
  if (!said) return null;
  const fromMs = msOf(said[1]!);
  const toMs = msOf(said[2]!);
  if (fromMs === null || toMs === null || toMs <= fromMs) return null;
  return { fromMs, toMs };
}

/** `HH:MM:SS.mmm` or `MM:SS.mmm`, which WebVTT allows both of. */
function msOf(stamp: string): number | null {
  const parts = stamp.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    const value = Number(part);
    if (!Number.isFinite(value) || value < 0) return null;
    total = total * 60 + value;
  }
  return Math.round(total * 1000);
}

/**
 * The lines on screen across one window, rebased to its start.
 *
 * `fromMs`–`toMs` ARE THE SOURCE FILE'S OWN CLOCK. A channel
 * reading a programme from twenty minutes in asks for the window
 * twenty minutes in; the rebasing to the segment is what the
 * caller does not then have to think about.
 */
export function linesAcross(
  lines: readonly TimedLine[], fromMs: number, toMs: number,
): TimedLine[] {
  if (!(toMs > fromMs)) return [];
  const out: TimedLine[] = [];
  for (const line of lines) {
    if (line.toMs <= fromMs || line.fromMs >= toMs) continue;
    out.push({
      fromMs: Math.max(0, line.fromMs - fromMs),
      toMs: Math.min(toMs - fromMs, line.toMs - fromMs),
      text: line.text,
    });
  }
  return out;
}

/**
 * One WebVTT segment.
 *
 * ALWAYS A FILE, EVEN WITH NOTHING IN IT. A segment a playlist
 * names and the server 404s stalls the subtitle rendition a
 * viewer chose — and most of a channel's day has no words in it,
 * so an empty segment is the ordinary case rather than the
 * failure. A header with no cues is a valid WebVTT file and
 * reads to a player as *nothing is being said*. [U-19, D-21]
 *
 * `offsetMs` IS WHERE THIS SEGMENT SITS INSIDE ITS OWN FOUR
 * SECONDS, which is zero for everything except the second half
 * of a segment that straddles a programme boundary. The picture
 * carries the same number as `-output_ts_offset`.
 *
 * `startTicks` IS HANDED IN AND IS NOT DEFAULTED, because it is
 * a fact about an ENCODER and this module cannot see one. A
 * number invented here would be the mistake `master.m3u8`'s
 * `CODECS` note describes, committed where it goes wrong
 * silently: the words would simply be early, by a fixed amount,
 * on every player that honours the map — which reads as a
 * transcription fault rather than a playlist one and would be
 * chased in the wrong module for a long time. The segmenter
 * knows, and `SEGMENT_START_PTS` is measured against a real
 * segment in its own test. [playout/segment.ts]
 */
export function vttSegment(
  lines: readonly TimedLine[], offsetMs: number, startTicks: number,
): string {
  const head = 'WEBVTT\n'
    + `X-TIMESTAMP-MAP=MPEGTS:${Math.round(startTicks)},`
    + `LOCAL:${stampOf(0)}\n`;
  if (lines.length === 0) return `${head}\n`;
  const body = lines.map((line) =>
    `${stampOf(line.fromMs + offsetMs)} --> ${stampOf(line.toMs + offsetMs)}\n`
    + line.text).join('\n\n');
  return `${head}\n${body}\n`;
}

/** `HH:MM:SS.mmm`, which is the only form a segment writes. */
export function stampOf(ms: number): string {
  const whole = Math.max(0, Math.round(ms));
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(whole / 3_600_000))}`
    + `:${pad(Math.floor(whole / 60_000) % 60)}`
    + `:${pad(Math.floor(whole / 1000) % 60)}`
    + `.${pad(whole % 1000, 3)}`;
}
