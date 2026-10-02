/**
 * A destination refuses honestly on a build that cannot send.
 * [CHANNEL §15, §18, D-21, C-29, C-35]
 *
 * C-29 BUILT THE SENDER AND C-35 FOUND IT INERT. The supervisor was
 * right about everything it was written to be right about — it
 * reconciles rather than commands, it backs off, it never takes the
 * channel down — and on the binary this product ships it was
 * restarting a process that segfaults before it reads a packet,
 * roughly every two seconds, rising to once a minute, for the
 * length of a broadcast. The control room said BLOCKED and
 * `Stopped (null)`.
 *
 * D-21: *"A destination showing 'on' with nothing arriving is the
 * screen that loses a broadcast."* A destination showing BLOCKED
 * with nothing an operator can act on is the same screen with the
 * lamp the other way up. So the supervisor asks first and refuses
 * with a sentence.
 *
 * THE PROBE IS SEEDED HERE RATHER THAN MOCKED. `canReadSegments`
 * caches the first answer for the life of the process and takes the
 * binary to ask, so pointing it at a command that always succeeds
 * seeds `true` and one that does not exist seeds `false`. Both
 * branches are therefore tested on every machine, including the one
 * where the real answer is only ever one of them.
 */

import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Channel } from '../../src/domain/channel.js';
import type { Destination } from '../../src/domain/distribution.js';
import { newChannel } from '../../src/domain/channelEdit.js';
import {
  CANNOT_SEND_FROM_THIS_BUILD,
} from '../../src/domain/rtmp.js';

/** A binary that exits 0 whatever it is asked: the probe reads `true`. */
const ALWAYS_FINE = '/bin/true';
/** And one that cannot run at all: the probe reads `false`. */
const NEVER_RUNS = '/nonexistent/ffmpeg';

let root: string;
let reconcileSenders: typeof import('../../src/playout/send.js').reconcileSenders;
let stopAllSenders: typeof import('../../src/playout/send.js').stopAllSenders;
let sendingNow: typeof import('../../src/playout/send.js').sendingNow;
let canReadSegments: typeof import('../../src/render/ffmpeg.js').canReadSegments;
let forgetSegmentReads:
  typeof import('../../src/render/ffmpeg.js').forgetSegmentReads;
let putKey: typeof import('../../src/store/streamKeys.js').putKey;
let readSenders: typeof import('../../src/store/senderHealth.js').readSenders;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-sender-'));
  process.env['BALANCEVID_VAR'] = root;
  /*
   * A SENDER THAT IS REALLY STARTED MUST STAY UP FOR THE LENGTH OF
   * THE ASSERTION, or the test is a race it loses on a loaded
   * machine. A command that exits at once — the real ffmpeg
   * complaining about a playlist that is not there, or `true` —
   * lets the supervisor's own exit handler overwrite "Sending to…"
   * with "Stopped" somewhere between the `await` and the `expect`.
   * This one ignores its arguments and sleeps, which is what a
   * working sender looks like from here.
   *
   * `BALANCEVID_FFMPEG` is read when `render/ffmpeg.js` is first
   * evaluated, so every module that reaches it is imported AFTER
   * this line rather than at the top of the file.
   */
  const stays = join(root, 'ffmpeg-that-stays-up');
  await writeFile(stays, '#!/bin/sh\nexec sleep 30\n');
  await chmod(stays, 0o755);
  process.env['BALANCEVID_FFMPEG'] = stays;
  ({ reconcileSenders, stopAllSenders, sendingNow } =
    await import('../../src/playout/send.js'));
  ({ canReadSegments, forgetSegmentReads } =
    await import('../../src/render/ffmpeg.js'));
  ({ putKey } = await import('../../src/store/streamKeys.js'));
  ({ readSenders } = await import('../../src/store/senderHealth.js'));
});

afterEach(() => { stopAllSenders(); forgetSegmentReads(); });
afterAll(async () => {
  delete process.env['BALANCEVID_FFMPEG'];
  await rm(root, { recursive: true, force: true });
});

const AT = '2026-09-25T09:00:00.000Z';

function destination(over: Partial<Destination> = {}): Destination {
  return {
    id: 'dest_rtmp', kind: 'rtmp', label: 'Our RTMP', enabled: true,
    shape: '16:9', settingsRef: 'dest_rtmp', createdAt: AT, ...over,
  };
}

function channelWith(...destinations: Destination[]): Channel {
  return { ...newChannel('Test', 'UTC', AT), destinations };
}

describe('a build that cannot read what the channel writes (C-35)', () => {
  it('refuses the destination instead of restarting a crash', async () => {
    await putKey('dest_rtmp', {
      server: 'rtmp://live.example.com/app', key: 'xk7Qv2Lm9ZpR4tWn',
    });
    const channel = channelWith(destination());

    expect(await canReadSegments(NEVER_RUNS)).toBe(false);
    await reconcileSenders(channel, Date.parse(AT));

    /* Nothing was started. The whole fault is that something was. */
    expect(sendingNow()).toEqual([]);
    const note = (await readSenders(channel.id))['dest_rtmp'];
    expect(note?.state).toBe('blocked');
    expect(note?.says).toBe(CANNOT_SEND_FROM_THIS_BUILD);
  });

  /*
   * AND ON A BUILD THAT CAN, NOTHING CHANGES. A guard that refused
   * every destination would pass the test above and take the
   * feature away.
   */
  it('starts the sender when the binary can read a segment', async () => {
    await putKey('dest_rtmp', {
      server: 'rtmp://live.example.com/app', key: 'xk7Qv2Lm9ZpR4tWn',
    });
    const channel = channelWith(destination());

    expect(await canReadSegments(ALWAYS_FINE)).toBe(true);
    await reconcileSenders(channel, Date.parse(AT));

    expect(sendingNow()).toEqual(['dest_rtmp']);
    const note = (await readSenders(channel.id))['dest_rtmp'];
    expect(note?.state).toBe('on');
    expect(note?.says).toContain('Sending to rtmp://live.example.com/app');
    /* And still not the key, which is the one thing that must never
       reach a file the web tier reads. [D-21, C-29] */
    expect(note?.says).not.toContain('xk7Qv2Lm9ZpR4tWn');
  });

  /*
   * THE ORDER OF THE TWO REFUSALS. A destination nobody has pasted a
   * key into is told it has no key — that is the sentence the
   * operator can act on, and the machine's problem is not yet in
   * their way. It also means the probe is never spawned for a
   * destination that could not start anyway.
   */
  it('still asks for the key first', async () => {
    const channel = channelWith(destination({
      id: 'dest_bare', label: 'Unconfigured', settingsRef: 'dest_bare',
    }));
    expect(await canReadSegments(NEVER_RUNS)).toBe(false);
    await reconcileSenders(channel, Date.parse(AT));

    const note = (await readSenders(channel.id))['dest_bare'];
    expect(note?.says).toContain('No stream key yet');
  });

  /*
   * AND A DESTINATION THAT IS A DIFFERENT COMPOSITION KEEPS ITS OWN
   * REASON, because that one is true on every build and fixing the
   * binary would not change it.
   */
  it('keeps the shape refusal on a broken build', async () => {
    await putKey('dest_tall', {
      server: 'rtmp://live.example.com/app', key: 'xk7Qv2Lm9ZpR4tWn',
    });
    const channel = channelWith(destination({
      id: 'dest_tall', label: 'Phone', shape: '9:16', settingsRef: 'dest_tall',
    }));
    expect(await canReadSegments(NEVER_RUNS)).toBe(false);
    await reconcileSenders(channel, Date.parse(AT));

    const note = (await readSenders(channel.id))['dest_tall'];
    expect(note?.says).toContain('different composition');
  });
});
