/**
 * One protocol, two clients.
 *   [Doctrine D-19, U-02; TAKE-DESKTOP T-5, B-2]
 *
 * > *"No second participation protocol. Four clients today,
 * > five with the desktop application, one system."*
 *
 * B-2 GAVE THE ROUTE A TRACK DIMENSION AND THE BROWSER WAS ITS
 * ONLY CLIENT. T-5 makes the desktop capture station a second
 * one, and the moment two programs spell a URL for themselves is
 * the moment they start disagreeing about it. These are the
 * assertions on the thing they now share.
 */

import { describe, expect, it } from 'vitest';

import { MOST_ANGLES, type Capture } from '../../shared/src/capture.js';
import {
  PIECE_BYTES, callPath, declarePath, piecePath, piecesOf, refusedBecause,
  sendPath, tracksFrom,
} from '../../shared/src/submit.js';

const LINK = 'req_abc.secret';

const capture = (angles: Partial<Capture['angles'][number]>[]): Capture => ({
  id: 'cap_1',
  label: 'Hall',
  beganAt: '2026-10-03T12:00:00.000Z',
  sampleRate: 48000,
  spreadMs: 0.8,
  startedTogether: true,
  angles: angles.map((one, n) => ({
    sourceId: `s${n}`,
    label: `Camera ${n + 1}`,
    file: `0${n + 1}-cam.webm`,
    calledAtMs: 0,
    offsetSamples: 0,
    bytes: 1000,
    hasAudio: true,
    ...one,
  })),
});

describe('where the three requests go', () => {
  /*
   * THE CALL IS OPENED BEFORE ANYTHING IS SENT, and this path
   * exists because a 409 taught it: the installation's request
   * machine allows *submitted* only from *opened*, a link is
   * opened by somebody following it, and a capture station
   * never follows anything. The browser does it by loading a
   * page.
   */
  it('names the call, the declaration and the send', () => {
    expect(callPath(LINK)).toBe('/api/take/req_abc.secret');
    expect(declarePath(LINK)).toBe('/api/take/req_abc.secret/submissions');
    expect(sendPath(LINK, 'sub_x'))
      .toBe('/api/take/req_abc.secret/submissions/sub_x');
  });

  /*
   * TRACK 0 CARRIES NO `track`, which is not a saving: it is the
   * URL a phone has always posted, and the whole of B-2's
   * compatibility story holds only if both clients spell it the
   * same way.
   */
  it('posts track 0 where a phone always posted', () => {
    expect(piecePath(LINK, 'sub_x', 4))
      .toBe('/api/take/req_abc.secret/submissions/sub_x?index=4');
    expect(piecePath(LINK, 'sub_x', 4, 0))
      .toBe('/api/take/req_abc.secret/submissions/sub_x?index=4');
    expect(piecePath(LINK, 'sub_x', 4, 2))
      .toBe('/api/take/req_abc.secret/submissions/sub_x?index=4&track=2');
  });

  /* A link and an id are somebody else's strings, in a URL. */
  it('escapes what it is given', () => {
    expect(piecePath('a/b', 'c d', 0)).toBe(
      '/api/take/a%2Fb/submissions/c%20d?index=0');
  });
});

describe('how a finished file is cut up', () => {
  /*
   * SLICED AT ARBITRARY BYTE BOUNDARIES, which is safe here and
   * would not be in the browser: the route joins `.part` files
   * by concatenation, so a file cut anywhere and rejoined in
   * order is the same file.
   */
  it('covers the whole file exactly once, in order', () => {
    const pieces = piecesOf(2500, 1000);
    expect(pieces).toEqual([
      { index: 0, at: 0, bytes: 1000 },
      { index: 1, at: 1000, bytes: 1000 },
      { index: 2, at: 2000, bytes: 500 },
    ]);
    expect(pieces.reduce((all, one) => all + one.bytes, 0)).toBe(2500);
  });

  it('makes one piece of a file that fits in one', () => {
    expect(piecesOf(900, 1000)).toEqual([{ index: 0, at: 0, bytes: 900 }]);
    expect(piecesOf(1000, 1000)).toEqual([{ index: 0, at: 0, bytes: 1000 }]);
  });

  /*
   * A FILE OF NOTHING HAS NO PIECES. The route refuses an empty
   * chunk, so a piece of zero bytes would be a request that
   * cannot succeed, sent every time.
   */
  it('makes no pieces of nothing, and does not divide by nothing', () => {
    expect(piecesOf(0)).toEqual([]);
    expect(piecesOf(-1)).toEqual([]);
    expect(piecesOf(100, 0)).toEqual([]);
  });

  /*
   * AND DOES NOT COUNT TO INFINITY. `bytes` comes off a manifest
   * on a disk a person can open; `1e999` parses as `Infinity`,
   * passes every "is it positive" check, and turns the loop into
   * one that never ends — in the process that owns the window.
   * Found by measuring the guard that was here before: it could
   * not be killed because the loop already handled zero, and
   * reading it to work out why showed what it did not handle.
   */
  it('refuses a byte count that is not a number of bytes', () => {
    expect(piecesOf(Number.POSITIVE_INFINITY, 1000)).toEqual([]);
    expect(piecesOf(Number.NaN, 1000)).toEqual([]);
    /* A piece size of infinity is one piece of the whole file,
       which is a sane answer and not a hang. Only the byte count
       can run the loop forever. */
    expect(piecesOf(1000, Number.POSITIVE_INFINITY))
      .toEqual([{ index: 0, at: 0, bytes: 1000 }]);
  });

  /* A megabyte: a few seconds of 1080p, and a small enough loss
     to accept twice when a connection drops. */
  it('sends a megabyte at a time unless told otherwise', () => {
    expect(PIECE_BYTES).toBe(1024 * 1024);
    expect(piecesOf(PIECE_BYTES + 1)).toHaveLength(2);
  });
});

describe('what a capture becomes', () => {
  /*
   * THE TRACK NUMBER IS THE ANGLE'S PLACE IN THE MANIFEST, which
   * is the slot order the operator arranged the cameras in.
   */
  it('numbers the angles in the order the manifest holds them', () => {
    const tracks = tracksFrom(capture([
      { offsetSamples: 0, label: 'Wide' },
      { offsetSamples: 19, label: 'Close' },
      { offsetSamples: 29, label: 'Side' },
    ]));
    expect(tracks.map((one) => one.track)).toEqual([0, 1, 2]);
    expect(tracks.map((one) => one.offsetSamples)).toEqual([0, 19, 29]);
    expect(tracks.map((one) => one.device)).toEqual(['Wide', 'Close', 'Side']);
  });

  /*
   * NO `elapsedSamples`, AND THAT IS U-02. The capture knows how
   * long it ran by the wall clock, which is weaker than the
   * container header this product already refuses to trust, and
   * the installation measures the duration by decoding when it
   * accepts. A wall-clock guess would put a number nobody
   * measured onto a producer's document.
   *
   * NO `hintSamples` EITHER: that is where a recording sits
   * against the reference it was performed to, and a capture
   * station recording a room has no reference.
   */
  it('sends no duration and no place on a song', () => {
    for (const track of tracksFrom(capture([{}, {}]))) {
      expect(track.elapsedSamples).toBeUndefined();
      expect(track.hintSamples).toBeUndefined();
    }
  });
});

describe('what cannot be sent, said before anything is', () => {
  /*
   * THE REFUSAL BELONGS AT THE START, where it costs nobody an
   * upload — the same argument the route makes about its own
   * take limit. A capture station finding out after four
   * cameras of a performance have gone up is finding out at the
   * worst moment.
   */
  it('refuses an angle that recorded nothing, by camera', () => {
    const because = refusedBecause(capture([
      { label: 'Wide', bytes: 1000 },
      { label: 'Close', bytes: 0 },
    ]));
    expect(because).toContain('Close');
    expect(because).toContain('recorded nothing');
    /* And it says what the capture would have been, so the
       operator knows what they are missing. */
    expect(because).toContain('2');
  });

  it('refuses a capture with no angles at all', () => {
    expect(refusedBecause(capture([]))).toBe('this capture has no angles');
  });

  it('refuses more angles than the protocol takes', () => {
    const many = capture(Array.from({ length: MOST_ANGLES + 1 }, () => ({})));
    expect(refusedBecause(many)).toContain(String(MOST_ANGLES));
    /* And the most it does take is taken. */
    expect(refusedBecause(capture(
      Array.from({ length: MOST_ANGLES }, () => ({}))))).toBe('');
  });

  it('says nothing about a capture that is fine', () => {
    expect(refusedBecause(capture([{}, {}, {}, {}]))).toBe('');
  });
});
