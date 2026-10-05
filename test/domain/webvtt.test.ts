/**
 * Reading a caption file, and cutting one onto the segment grid.
 *   [Doctrine CHANNEL §7, §17, D-18, D-19, U-19]
 *
 * THE ARITHMETIC OF THE CAPTION RENDITION, which is all of it:
 * there is no encoder here, because a caption segment is text
 * clipped to a window and shifted. What this file holds up is
 * that the clip is right at both edges, that a line crossing a
 * boundary survives in both segments, and that a file nobody in
 * this product wrote can still be read.
 */

import { describe, expect, it } from 'vitest';

import {
  linesAcross, readVtt, stampOf, vttSegment,
} from '../../src/domain/webvtt.js';
import { buildVtt } from '../../src/render/subtitles.js';
import { HOUSE_FPS } from '../../src/domain/time.js';

describe('reading what the renderer wrote', () => {
  /*
   * THE ROUND TRIP IS THE POINT. `buildVtt` is the one function
   * every export in this product writes captions with, and this
   * reader exists to read its output and nothing else. A parser
   * tested only against files written in its own test is a
   * parser that agrees with itself.
   */
  it('reads back exactly what buildVtt wrote', () => {
    const text = buildVtt([
      {
        startFrame: 0, endFrame: HOUSE_FPS * 2,
        speaker: 'source', text: 'The second verse, then.',
      },
      {
        startFrame: HOUSE_FPS * 3, endFrame: HOUSE_FPS * 5,
        speaker: 'user', speakerName: 'Ada', text: 'Outdoors?',
      },
    ], HOUSE_FPS);

    const lines = readVtt(text);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({
      fromMs: 0, toMs: 2000, text: '<v Source>The second verse, then.',
    });
    expect(lines[1]).toEqual({
      fromMs: 3000, toMs: 5000, text: '<v Ada>Outdoors?',
    });
  });

  /*
   * AND A FILE THIS PRODUCT DID NOT WRITE. A broadcaster can put
   * a caption file beside a render by hand, and every tool that
   * makes one writes a slightly different dialect: cue
   * identifiers, `NOTE` blocks, cue settings after the arrow,
   * Windows line endings, a byte-order mark. A parser that threw
   * on any of them would take a channel's captions off the air
   * over a comment. [U-19]
   */
  it('is not thrown by identifiers, notes, settings or CRLF', () => {
    const text = '﻿WEBVTT - Some title\r\n'
      + '\r\n'
      + 'NOTE this block is not a cue\r\n'
      + 'and neither is this line\r\n'
      + '\r\n'
      + 'cue-1\r\n'
      + '00:00:01.000 --> 00:00:02.500 line:90% align:middle\r\n'
      + 'First.\r\n'
      + '\r\n'
      + '00:03.000 --> 00:04.000\r\n'
      + 'Second, in the short form.\r\n';
    expect(readVtt(text)).toEqual([
      { fromMs: 1000, toMs: 2500, text: 'First.' },
      { fromMs: 3000, toMs: 4000, text: 'Second, in the short form.' },
    ]);
  });

  /*
   * A CUE WHOSE TIMES CANNOT BE READ IS DROPPED, AND THE REST
   * OF THE FILE IS NOT. A line shown at the wrong moment is
   * worse than a line not shown — but losing a whole
   * programme's captions to one bad stamp is worse than both.
   */
  it('drops a cue it cannot time and keeps the others', () => {
    const text = 'WEBVTT\n\n'
      + 'banana --> 00:00:02.000\nNo.\n\n'
      + '00:00:05.000 --> 00:00:04.000\nBackwards.\n\n'
      + '00:00:06.000 --> 00:00:07.000\nYes.\n';
    expect(readVtt(text)).toEqual([
      { fromMs: 6000, toMs: 7000, text: 'Yes.' },
    ]);
  });

  /* An empty file is a programme with nothing said in it, which
     is most of a channel's day and not an error. */
  it('reads an empty file as no lines', () => {
    expect(readVtt('WEBVTT\n\n')).toEqual([]);
    expect(readVtt('')).toEqual([]);
  });

  /*
   * IN ORDER, WHATEVER ORDER THE FILE WAS IN. WebVTT does not
   * require a sorted file and `buildVtt` happens to write one;
   * relying on that is how the one file that was not sorted
   * loses half its lines.
   */
  it('puts the lines in time order', () => {
    const text = 'WEBVTT\n\n'
      + '00:00:09.000 --> 00:00:10.000\nLast.\n\n'
      + '00:00:01.000 --> 00:00:02.000\nFirst.\n';
    expect(readVtt(text).map((one) => one.text)).toEqual(['First.', 'Last.']);
  });
});

describe('cutting a file onto the segment grid', () => {
  const LINES = [
    { fromMs: 0, toMs: 1500, text: 'A' },
    { fromMs: 3000, toMs: 6000, text: 'B' },
    { fromMs: 9000, toMs: 9500, text: 'C' },
  ];

  it('takes only the lines across the window', () => {
    expect(linesAcross(LINES, 0, 4000).map((one) => one.text)).toEqual(['A', 'B']);
    expect(linesAcross(LINES, 8000, 12_000).map((one) => one.text)).toEqual(['C']);
  });

  /*
   * A CUE THAT STRADDLES A BOUNDARY IS IN BOTH SEGMENTS. HLS
   * hands a player one segment at a time, and a viewer who tunes
   * in mid-sentence gets only the second — a cue that appeared
   * solely in the segment where it STARTED would vanish for
   * them.
   */
  it('keeps a line that crosses a boundary, in both segments', () => {
    const first = linesAcross(LINES, 0, 4000);
    const second = linesAcross(LINES, 4000, 8000);
    expect(first.find((one) => one.text === 'B'))
      .toEqual({ fromMs: 3000, toMs: 4000, text: 'B' });
    expect(second.find((one) => one.text === 'B'))
      .toEqual({ fromMs: 0, toMs: 2000, text: 'B' });
  });

  /*
   * AND IT IS CLIPPED RATHER THAN CARRIED WHOLE, so the line
   * leaves the screen when it was meant to. A player handed a
   * cue running past the end of its segment holds the words
   * there until the next one arrives, which on a four-second
   * grid is a sentence that outlives the shot it belonged to.
   */
  it('clips rather than overhanging the window', () => {
    for (const one of linesAcross(LINES, 4000, 8000)) {
      expect(one.fromMs).toBeGreaterThanOrEqual(0);
      expect(one.toMs).toBeLessThanOrEqual(4000);
    }
  });

  /* Touching is not overlapping: a line that ends exactly where
     the window opens was over before it began. */
  it('leaves out a line that merely touches the edge', () => {
    expect(linesAcross([{ fromMs: 0, toMs: 4000, text: 'A' }], 4000, 8000))
      .toEqual([]);
    expect(linesAcross([{ fromMs: 8000, toMs: 9000, text: 'A' }], 4000, 8000))
      .toEqual([]);
  });

  it('answers nothing for a window of no width', () => {
    expect(linesAcross(LINES, 4000, 4000)).toEqual([]);
    expect(linesAcross(LINES, 4000, 1000)).toEqual([]);
  });
});

describe('the segment a player is handed', () => {
  /*
   * THE TIMESTAMP MAP IS WHAT MAKES THE WORDS LAND ON THE RIGHT
   * FRAME. A segment this engine writes is its own little
   * transport stream and its first frame does not carry a PTS
   * of zero; a WebVTT segment whose cue clock was not mapped
   * onto that shows every line early by a fixed amount.
   *
   * THE NUMBER IS AN ARGUMENT HERE AND NOT A CONSTANT, which is
   * the point: it is a fact about an encoder, it lives beside
   * the encoder, and it is MEASURED against a real segment in
   * `subtitles-on-air.test.ts`. What this file holds up is the
   * shape of the line. [playout/segment.ts `SEGMENT_START_PTS`]
   */
  it('carries the map, even with nothing to say', () => {
    const said = vttSegment([], 0, 6000);
    expect(said.startsWith('WEBVTT\n')).toBe(true);
    expect(said).toContain('X-TIMESTAMP-MAP=MPEGTS:6000,LOCAL:00:00:00.000');
    /* Valid, and empty, which is what most of a day is. */
    expect(said).not.toContain('-->');
  });

  it('writes the lines it was given, in the segment’s own clock', () => {
    const said = vttSegment([
      { fromMs: 250, toMs: 1750, text: '<v Ada>Outdoors?' },
    ], 0, 6000);
    expect(said).toContain('00:00:00.250 --> 00:00:01.750\n<v Ada>Outdoors?');
  });

  /*
   * AND SHIFTED BY WHERE THE READ SITS IN THE SEGMENT, which is
   * zero for everything except the second half of a segment
   * that crosses a programme boundary — the same number the
   * picture carries as `-output_ts_offset`.
   */
  it('shifts by the read’s offset inside the segment', () => {
    const said = vttSegment([{ fromMs: 0, toMs: 500, text: 'Hello' }], 2000, 6000);
    expect(said).toContain('00:00:02.000 --> 00:00:02.500');
  });

  it('writes an hour correctly, because a programme can be one', () => {
    expect(stampOf(3_661_234)).toBe('01:01:01.234');
    expect(stampOf(0)).toBe('00:00:00.000');
  });
});
