/**
 * Can this build read back what the channel writes?
 * [CHANNEL §13, §15, §11, C-24, C-35]
 *
 * THE SECOND HALF OF C-24'S FAULT, FOUND TWO STAGES LATER. That
 * stage's lesson was *"ask the binary, do not assume"*, and it was
 * applied to the one capability that had already burned the product:
 * `drawtext`. This is the capability nobody thought to doubt. The
 * pinned `ffmpeg-static` writes MPEG-TS perfectly, lists mpegts among
 * its formats, and SEGFAULTS reading any transport stream back —
 * including one it has just written itself.
 *
 * Two of the three things that touch a segment are unharmed. The
 * playout engine only WRITES them. The viewer's browser demuxes them
 * itself, in hls.js. The RTMP sender (C-29) READS them, with `-c
 * copy`, which is precisely the operation that crashes — so it spawns,
 * dies by signal before it has read a packet, and a supervisor doing
 * exactly what it was told restarts it for ever. A destination that
 * can never work sits BLOCKED saying `Stopped (null)`.
 *
 * SO THE PROBE ASKS BY DOING IT, and this file checks the probe
 * against the thing it predicts: the sender's own operation, run for
 * real, on this machine. On a broken build both fail; on a good one
 * both succeed. A probe that disagreed with reality would be the same
 * class of bug one layer up.
 *
 * Nothing here mocks ffmpeg. The binary the product ships is asked.
 */

import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FFMPEG, canReadSegments, ffmpeg, forgetSegmentReads,
} from '../../src/render/ffmpeg.js';
import {
  CANNOT_SEND_FROM_THIS_BUILD, senderArgs,
} from '../../src/domain/rtmp.js';

let root: string;

beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'bv-reads-')); });
afterAll(async () => { await rm(root, { recursive: true, force: true }); });

/** A real transport stream, written by the binary under test. */
async function writeSegment(name: string): Promise<string> {
  const path = join(root, name);
  await ffmpeg([
    '-f', 'lavfi', '-i', 'testsrc=size=160x90:rate=10:duration=0.4',
    '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo',
    '-t', '0.4', '-c:v', 'libx264', '-preset', 'ultrafast',
    '-c:a', 'aac', '-f', 'mpegts', path,
  ]);
  return path;
}

describe('asking the binary whether it can read a segment (C-35)', () => {
  /*
   * THE ASSERTION THAT MAKES THE PROBE WORTH HAVING. Whatever this
   * build answers, the sender's own operation must agree with it —
   * the sender is `-c copy` out of a playlist of these, and the
   * probe is `-c copy` out of one of them. If the two ever differ,
   * the product is refusing a destination that works or starting one
   * that cannot.
   */
  it('agrees with what the sender actually does on this machine', async () => {
    const verdict = await canReadSegments();
    const segment = await writeSegment('real.ts');
    let sends = true;
    try {
      /* The sender's args with the socket taken off the end: read the
         transport stream, remux to FLV, write it to a file instead of
         to an ingest. */
      await ffmpeg([
        ...senderArgs({
          playlist: segment,
          target: { server: 'rtmp://unused.invalid/app', key: 'k' },
        }).filter((arg) => !arg.startsWith('rtmp:')),
        join(root, 'out.flv'),
      ]);
    } catch {
      sends = false;
    }
    expect(verdict).toBe(sends);
  }, 60_000);

  /*
   * AND THIS ONE RECORDS WHICH ANSWER THIS CONTAINER GIVES, so the
   * day somebody ships a working binary the suite says so out loud
   * rather than passing identically either way. It is written as a
   * report, not a requirement: the test above is the requirement.
   */
  it('reports the verdict for the build under test', async () => {
    const verdict = await canReadSegments();
    expect(typeof verdict).toBe('boolean');
    console.log(
      `ffmpeg at ${FFMPEG} ${verdict ? 'CAN' : 'CANNOT'} read segments`);
  }, 60_000);

  /*
   * A BINARY THAT IS NOT THERE CANNOT READ ANYTHING, and the answer
   * must be no rather than a thrown pass. The opposite default is
   * what C-24 was about.
   */
  it('takes a binary that will not run at its word', async () => {
    forgetSegmentReads();
    try {
      expect(await canReadSegments('/nonexistent/ffmpeg')).toBe(false);
    } finally {
      forgetSegmentReads();
    }
  }, 30_000);

  /*
   * ASKED ONCE. The supervisor reconciles every pass, and a probe
   * that spawned two processes each time would cost more than the
   * sender it is protecting.
   */
  it('answers from cache after the first ask', async () => {
    /*
     * THE TWO BINARIES MUST DISAGREE or this proves nothing. A
     * command that exits 0 whatever it is given passes both spawns,
     * so the probe reads `true` from it; the missing one reads
     * `false`. Asking the second and being told the first is the
     * cache, observed.
     */
    forgetSegmentReads();
    expect(await canReadSegments('/bin/true')).toBe(true);
    expect(await canReadSegments('/nonexistent/ffmpeg')).toBe(true);
    forgetSegmentReads();
    expect(await canReadSegments('/nonexistent/ffmpeg')).toBe(false);
    forgetSegmentReads();
  }, 60_000);

  /*
   * AND IT LEAVES NOTHING BEHIND. It writes a file to the system
   * temporary directory on a machine that also renders video there;
   * a probe that leaked one directory per engine start is a disk
   * that fills over a season.
   */
  it('clears up after itself', async () => {
    const before = (await readdir(tmpdir())).filter(
      (name) => name.startsWith('bv-ts-'));
    forgetSegmentReads();
    await canReadSegments();
    forgetSegmentReads();
    await canReadSegments('/nonexistent/ffmpeg');
    forgetSegmentReads();
    const after = (await readdir(tmpdir())).filter(
      (name) => name.startsWith('bv-ts-'));
    expect(after).toEqual(before);
  }, 60_000);
});

describe('what the operator is told (C-35)', () => {
  /* The first thing anybody wonders when a destination turns red. */
  it('says the channel itself is still going out', () => {
    expect(CANNOT_SEND_FROM_THIS_BUILD).toContain('channel itself is');
    expect(CANNOT_SEND_FROM_THIS_BUILD).toContain('unaffected');
  });

  /* A reason without a remedy is a reason nobody can act on. */
  it('names the remedy and the setting that applies it', () => {
    expect(CANNOT_SEND_FROM_THIS_BUILD).toContain('WITH_TEXT=1');
    expect(CANNOT_SEND_FROM_THIS_BUILD).toContain('BALANCEVID_FFMPEG');
  });

  /* Not "an internal error occurred". */
  it('says what is wrong rather than that something is', () => {
    expect(CANNOT_SEND_FROM_THIS_BUILD).toContain('ffmpeg');
    expect(CANNOT_SEND_FROM_THIS_BUILD).toContain('mpegts');
  });
});
