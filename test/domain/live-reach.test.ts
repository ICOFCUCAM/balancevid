/**
 * The picture froze while every instrument stayed green.
 *   [CHANNEL §7, §9; Doctrine D-13, D-14, D-21, U-02, U-16]
 *
 * THE FAULT THESE ANSWER, reported by the operator of a live
 * channel while they were on air:
 *
 * > *"IMAGE SHOWS BUT FREEZES TO ALMOST STANDSTILL"*
 * > *"THIS IS AN ONLINE LIVE TV AND IMAGES MUST BE CONTINUOUS"*
 *
 * A LIVE FEED IS READ ON THE CLOCK AND WRITTEN ON A CONNECTION.
 * `LIVE_DELAY_MS` is twelve seconds and its own header says what
 * the twelve is for: *"ffmpeg reads past the end of the growing
 * file and puts out a fraction of a second of picture followed by
 * nothing."* The margin holds only while the buffer gains a second
 * of media for every second on the clock.
 *
 * IT DOES NOT, AND NOTHING GIVES IT BACK. The browser uploads
 * two-second chunks and counts the ones it fails to deliver —
 * `useLiveEncoder` has a `dropped` counter on the screen. Every
 * dropped chunk is two seconds the clock keeps and the file never
 * gets. The camera takes a second or two to start. None of it is
 * ever recovered, so the deficit only grows, and six dropped
 * chunks across a broadcast put the read point past the end of the
 * buffer for the rest of it.
 *
 * MEASURED, ON REAL MEDIA, with the engine's own ffmpeg command
 * against a sixty-second live WebM:
 *
 *     read at 40s   ->  1 098 484 bytes   4.02s   a full segment
 *     read at 58s   ->    511 360 bytes   2.02s   HALF A SLOT
 *     read at 62s   ->          0 bytes      —    nothing at all
 *
 * The middle row is the fault. Two seconds of picture published
 * into a playlist that says four, every four seconds — the player
 * is handed half of what it was promised and the channel crawls.
 * The engine's guard tested `size >= 1024`, which 511KB passes, so
 * it went out as a good segment and the as-run recorded a
 * programme that played.
 *
 * AND NOTHING COULD HAVE SEEN IT. `watchTheFeed` watches the
 * file's SIZE and asks "is it still growing" — which it must,
 * since a connection that is up and sending nothing is a failure
 * with a green light on it. Nothing anywhere asked whether the
 * buffer had reached the place the engine was about to read from.
 * The feed was arriving, the engine was beating, bytes were
 * landing, and the picture was stopped.
 *
 * SO THE READ FOLLOWS THE BUFFER RATHER THAN THE CLOCK. When the
 * buffer is behind, the delay grows and the picture stays
 * continuous — which is the trade live television has always made,
 * and the only one that answers *"images must be continuous"*.
 */

import { describe, expect, it } from 'vitest';

import {
  goLive, newChannel, rollIn, takeLive,
} from '../../src/domain/channelEdit.js';
import type { ProgrammeSource } from '../../src/domain/channel.js';
import { LIVE_DELAY_MS, SEGMENT_MS, playoutWindow } from '../../src/domain/playout.js';

const AT = '2026-10-07T09:00:00.000Z';
const ON_AIR = Date.parse('2026-10-07T09:00:00.000Z');

/** A channel that is live, from `ON_AIR`. */
function liveChannel() {
  const channel = newChannel('InterMissions TV', 'UTC', AT);
  goLive(channel, 'Studio', AT);
  takeLive(channel, AT);
  return channel;
}

/** The one read the engine makes for the segment starting `afterMs` in. */
function readAt(
  channel: ReturnType<typeof liveChannel>, afterMs: number,
  reachMs?: number | undefined,
) {
  const from = ON_AIR + afterMs;
  const reads = playoutWindow(
    channel, from, from + SEGMENT_MS, () => undefined,
    reachMs === undefined ? undefined : () => reachMs);
  expect(reads).toHaveLength(1);
  return reads[0]!;
}

describe('a live feed is read from where the buffer actually is', () => {
  /*
   * NOTHING CHANGES FOR AN INSTALLATION THAT DOES NOT MEASURE.
   * The measurer is optional, and absent it the delay behaves
   * exactly as it did before any of this existed — which is the
   * property that makes the change safe to deploy under a live
   * broadcast. [D-18]
   */
  it('reads on the clock when nobody has measured the buffer', () => {
    const channel = liveChannel();
    const read = readAt(channel, 60_000);
    expect(read.fromMs).toBe(60_000 - LIVE_DELAY_MS);
    expect(read.notYet).toBeUndefined();
  });

  /*
   * AND NOTHING CHANGES WHILE THE FEED IS KEEPING UP. A buffer
   * holding more than the delay asks for is a buffer the clamp
   * never touches: the viewer stays twelve seconds behind live and
   * not a frame more.
   */
  it('reads on the clock when the buffer is ahead of it', () => {
    const channel = liveChannel();
    /* One minute on air, 58s of media: the clock wants 48s. */
    const read = readAt(channel, 60_000, 58_000);
    expect(read.fromMs).toBe(60_000 - LIVE_DELAY_MS);
    expect(read.notYet).toBeUndefined();
  });

  /*
   * THE WHOLE FAULT, IN ONE ASSERTION. One minute on air with
   * only fifty seconds of media in the buffer — ten seconds lost
   * to five dropped chunks. The clock asks for 48s to 52s and the
   * buffer ends at 50s, so two of those four seconds do not
   * exist: 511KB, 2.02s, published as four.
   *
   * The read now stops where the media stops.
   */
  it('never reads past the end of the buffer', () => {
    const channel = liveChannel();
    const read = readAt(channel, 60_000, 50_000);
    expect(read.fromMs).toBe(50_000 - SEGMENT_MS);
    expect(read.fromMs + read.durationMs).toBeLessThanOrEqual(50_000);
    expect(read.notYet).toBeUndefined();
  });

  /*
   * AND IT KEEPS READING AS THE BUFFER GROWS, which is what makes
   * this a delay rather than a stall. Once the feed has fallen ten
   * seconds behind it stays ten seconds behind: each new second of
   * media is a new second on the wire, and the viewer sees
   * everything, later. A read that stopped advancing would be the
   * frozen picture again, arrived at from the other side.
   */
  it('follows the buffer forward, continuously, once it is behind', () => {
    const channel = liveChannel();
    const first = readAt(channel, 60_000, 50_000);
    const next = readAt(channel, 64_000, 54_000);
    expect(next.fromMs).toBe(first.fromMs + SEGMENT_MS);
    /* No gap and no overlap: the picture is continuous. */
    expect(next.fromMs).toBe(first.fromMs + first.durationMs);
  });

  /*
   * A BUFFER WITH LESS THAN ONE SEGMENT IN IT HAS NOTHING TO GIVE,
   * and the honest answer is the slate the first twelve seconds
   * already use — not a segment with two frames in it. This is the
   * case `notYet` was written for, now reached by the other road.
   */
  it('puts the slate up rather than a segment it cannot fill', () => {
    const channel = liveChannel();
    const read = readAt(channel, 60_000, 3_000);
    expect(read.notYet).toBe(true);
  });

  /*
   * AND THE READ IS NEVER NEGATIVE. `reach - need` goes below zero
   * the moment the buffer holds less than a segment, and a
   * negative `-ss` is an ffmpeg argument that means something else
   * entirely.
   */
  it('never asks for a negative offset', () => {
    const channel = liveChannel();
    for (const reach of [0, 1, 1_000, SEGMENT_MS - 1]) {
      const read = readAt(channel, 60_000, reach);
      expect(read.fromMs, `reach ${reach}`).toBeGreaterThanOrEqual(0);
    }
  });

  /*
   * A MEASUREMENT NOBODY COULD TAKE IS NOT A MEASUREMENT OF ZERO.
   * The scan can fail — a file half-written, a read error — and
   * reading that as "the buffer is empty" would take a working
   * channel off the air on a transient. Nothing means carry on.
   *   [D-21]
   */
  it('carries on when the buffer could not be measured', () => {
    const channel = liveChannel();
    for (const bad of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      const read = readAt(channel, 60_000, bad);
      expect(read.fromMs, String(bad)).toBe(60_000 - LIVE_DELAY_MS);
      expect(read.notYet, String(bad)).toBeUndefined();
    }
  });

  /*
   * AND A FILM ROLLED IN OVER A LIVE SHOW IS NOT A LIVE FEED.
   *
   * `playoutWindow` already said so about the DELAY — *"the delay
   * applies to a live FEED, not to a segment rolled in over it; a
   * film played during a live show is an ordinary file and can be
   * read from wherever it likes"* — and the clamp has to keep the
   * same rule or an advert break would be cut to the length of a
   * camera feed nobody is watching. A mutation deleting that guard
   * passed every other test in this file. [U-02]
   */
  it('does not clamp a film rolled in over the feed', () => {
    const channel = liveChannel();
    const film: ProgrammeSource = {
      kind: 'render', document: 'performance',
      documentId: 'perf_break', planHash: 'hash_break',
    };
    rollIn(channel, film, 0);
    /* A buffer holding three seconds would slate the camera. The
       film is read from its own beginning regardless. */
    const read = readAt(channel, 60_000, 3_000);
    expect(read.source).toEqual(film);
    expect(read.notYet).toBeUndefined();
    /* Its own beginning, which is where `rollIn` put it — not a
       position derived from a camera it has nothing to do with. */
    expect(read.fromMs).toBe(0);
  });

  /*
   * AND THE FIRST TWELVE SECONDS STILL BEHAVE AS THEY DID. Before
   * the delay has elapsed there is nothing to show whatever the
   * buffer holds, and that was already right.
   */
  it('still slates the first twelve seconds of a broadcast', () => {
    const channel = liveChannel();
    expect(readAt(channel, 4_000).notYet).toBe(true);
    expect(readAt(channel, 4_000, 60_000).notYet).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 *  And the engine looks at what it made.
 * ------------------------------------------------------------------ */

/**
 * A CAPABILITY NOTHING CALLS IS THE MISTAKE THIS CODEBASE KEEPS
 * MAKING. `RotationEntry.loop` sat correct and unreachable while a
 * channel ran dark for 99% of every loop. A `liveReachMs` the
 * engine does not supply would be the same mistake in the live
 * path, where it costs the picture in real time. [D-13]
 */
describe('the engine measures the buffer and looks at its own output', () => {
  const bare = (path: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    return readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  };
  const ENGINE = bare('src/playout/index.ts');
  const SEGMENT = bare('src/playout/segment.ts');
  const BUFFER = bare('src/store/liveBuffer.ts');

  it('measures how much media the buffer holds', () => {
    expect(BUFFER).toMatch(/export async function bufferReachMs/);
    /* Demuxed, never decoded: 0.32s against 6.2s for the same
       answer on a twenty-minute buffer. [U-16] */
    expect(BUFFER).toMatch(/'-c', 'copy'/);
    expect(BUFFER).toMatch(/'-f', 'null'/);
  });

  it('and hands it to the walk, once per pass', () => {
    expect(ENGINE).toMatch(/const reach = await liveReach\(channel, nowMs\)/);
    expect(ENGINE).toMatch(/bufferReachMs\(path\)/);
    /* The picture, the ladder and the alternate audio all read the
       same instant of the same growing file. */
    expect((ENGINE.match(/, reach\)/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  /*
   * AND THE SCAN IS SKIPPED WHILE IT CANNOT MATTER. A stale
   * reading is always conservative — media never catches the clock
   * up — so while the read point is short of the last known end,
   * the old answer stands and nothing is measured. Without this a
   * three-hour broadcast would scan three hours of WebM every four
   * seconds. [U-16]
   */
  it('and does not scan when the clamp cannot bind', () => {
    expect(ENGINE).toMatch(
      /if \(seen && wanted \+ 2 \* SEGMENT_MS < seen\.ms\) return seen\.ms;/);
  });

  /*
   * AND THE LAST THING BEFORE THE WIRE LOOKS AT THE FILE. The
   * engine has never read its own output: it wrote, renamed, and
   * reported what it INTENDED. That is how 2.02 seconds went out
   * in a four-second slot with an as-run saying the programme
   * played. [U-02, C-32]
   */
  it('and checks the length of the segment, not just that it exists', () => {
    expect(SEGMENT).toMatch(/async function segmentMs/);
    expect(SEGMENT).toMatch(/held \+ SHORT_MS < wantMs/);
    /* Filled, not rejected: the picture that exists still goes out. */
    expect(SEGMENT).toMatch(/appendAll\(\[temp, tail\]/);
    /* And it counts as a fallback, so the as-run says so. [C-24] */
    expect(SEGMENT).toMatch(/held \+ SHORT_MS < wantMs\)[\s\S]{0,400}fellBackHere = true;/);
  });
});
