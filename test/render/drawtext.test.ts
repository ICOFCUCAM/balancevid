/**
 * What this build can draw, and what happens when it cannot.
 * [CHANNEL §13, §18, C-24]
 *
 * THE TEST THAT WOULD HAVE CAUGHT IT. Every channel this product
 * transmitted went out black, for as long as it had an identity,
 * because `markFilters` emitted ffmpeg's `drawtext` and the pinned
 * `ffmpeg-static` is built without freetype. A filtergraph naming a
 * filter that is not there is rejected WHOLE — so one missing filter
 * took the picture, the fallback succeeded, and every health signal
 * stayed green.
 *
 * Nothing here mocks ffmpeg. The binary the product ships is asked.
 */

import { describe, expect, it } from 'vitest';

import {
  FFMPEG, availableFilters, canDrawText, forgetFilters,
} from '../../src/render/ffmpeg.js';
import { markFilters } from '../../src/playout/segment.js';
import {
  noteFailure, readFailure, reasonFrom,
} from '../../src/store/playoutHealth.js';
import {
  type Tone, FAILURE_FRESH_MS, controlRoomNote, stillFailing,
} from '../../src/domain/health.js';
import type { Mark } from '../../src/domain/identity.js';

const bug: Mark = {
  kind: 'bug', text: 'REdemption TV', corner: 'top-right',
  opacity: 0.85, size: 34, plate: true, ink: '0xffffff',
};

describe('asking the binary what it can do', () => {
  it('reads a real filter list off the real ffmpeg', async () => {
    const filters = await availableFilters();
    /* A parser that matched nothing would answer "cannot draw text" for
       every build, which is the right ANSWER for the wrong REASON and
       would hide the day somebody ships a binary that can. */
    expect(filters.size).toBeGreaterThan(100);
    for (const needed of ['scale', 'drawbox', 'overlay', 'gblur']) {
      expect(filters.has(needed), needed).toBe(true);
    }
    expect(filters.has('definitely-not-a-filter')).toBe(false);
  }, 30_000);

  it('takes a binary that will not answer at its word', async () => {
    /*
     * A PROBE THAT THROWS MUST MEAN "NOTHING", not "everything". The
     * caller then draws no text, which is a picture without a bug —
     * and a picture without a bug beats no picture. The opposite
     * default is the one that caused all this.
     */
    forgetFilters();
    try {
      expect(await availableFilters('/nonexistent/ffmpeg')).toEqual(new Set());
      expect(await canDrawText('/nonexistent/ffmpeg')).toBe(false);
    } finally {
      /* The answer is cached for the process; the next test asks the
         real binary and must not be handed this one's. */
      forgetFilters();
    }
  }, 30_000);

  it('answers for drawtext whichever way this build was compiled', async () => {
    const can = await canDrawText();
    const filters = await availableFilters();
    expect(can).toBe(filters.has('drawtext'));
    /*
     * AND THE ANSWER IS RECORDED RATHER THAN ASSERTED. `ffmpeg-static`
     * has no drawtext today and an image built with WITH_TEXT=1 does,
     * so pinning either value here would fail somebody's correct
     * build. What must hold is that the code and the binary agree.
     */
    expect(typeof can).toBe('boolean');
  }, 30_000);
});

describe('the marks, against a binary that cannot draw them', () => {
  it('emits nothing rather than a filter that kills the segment', () => {
    expect(markFilters([bug], false)).toEqual([]);
    expect(markFilters([bug], true)).toHaveLength(1);
    expect(markFilters([bug], true)[0]).toContain('drawtext=');
  });

  it('drops the plate with the text', () => {
    /* A box is drawable without freetype, and a black rectangle where a
       name should be looks deliberate. Nothing, or the whole mark. */
    const plated = markFilters([{ ...bug, plate: true }], false);
    expect(plated).toEqual([]);
    expect(markFilters([{ ...bug, plate: true }], true)[0]).toContain('box=1');
  });

  it('and the segment chain ffmpeg is handed actually runs', async () => {
    /*
     * THE WHOLE CLAIM, END TO END, against the shipped binary: the
     * chain `produceSegment` builds must render. Before this it did
     * not, and the only thing that noticed was a viewer.
     */
    const { runCapture } = await import('../../src/render/ffmpeg.js');
    const base = [
      'scale=320:180:force_original_aspect_ratio=decrease',
      'pad=320:180:(ow-iw)/2:(oh-ih)/2', 'fps=30', 'setsar=1',
    ];
    const chain = [...base, ...markFilters([bug], await canDrawText())];
    await expect(runCapture(FFMPEG, [
      '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=30:duration=1',
      '-vf', chain.join(','), '-frames:v', '1', '-f', 'null', '-',
    ])).resolves.toBeDefined();
  }, 30_000);
});

describe('the failure record', () => {
  it('is written and read back, and lives beside the heartbeat', async () => {
    /*
     * NOT IN `stream/`, which is where the first version put it and
     * where a test caught it within the hour: that directory holds
     * transport and nothing else — the sweeper deletes by age from it
     * and the playlist route lists it. A health record there is one
     * the sweeper will eventually delete and the playlist may
     * eventually serve.
     */
    const id = 'chan_failure_probe';
    await noteFailure(id, "No such filter: 'drawtext'");
    const read = await readFailure(id);
    expect(read?.says).toBe("No such filter: 'drawtext'");
    expect(Number.isFinite(Date.parse(read?.at ?? ''))).toBe(true);

    const { paths } = await import('../../src/store/paths.js');
    const { readdir } = await import('node:fs/promises');
    const streamed = await readdir(paths.channelStream(id)).catch(() => []);
    expect(streamed).toEqual([]);
  });

  it('answers nothing for a channel that has never failed', async () => {
    expect(await readFailure('chan_never_failed_at_all')).toBeNull();
  });
});

describe('what the operator is told', () => {
  it('pulls the line that names the refusal out of ffmpeg’s noise', () => {
    const said = [
      'ffmpeg version 6.0 Copyright (c) 2000-2023',
      '  libavutil      58.  2.100',
      '[AVFilterGraph @ 0x55d1c0] No such filter: \'drawtext\'',
      'Error reinitializing filters!',
      'Conversion failed!',
    ].join('\n');
    /* The useful line is in the middle. Taking the tail would have
       reported "Conversion failed!", which tells an operator nothing. */
    expect(reasonFrom(said)).toBe("No such filter: 'drawtext'");
  });

  it('strips the graph address, so one fault is not two', () => {
    const once = reasonFrom('[AVFilterGraph @ 0xaaa1] No such filter: \'x\'');
    const twice = reasonFrom('[AVFilterGraph @ 0xbbb2] No such filter: \'x\'');
    expect(once).toBe(twice);
  });

  it('falls back to the last line when nothing names itself', () => {
    expect(reasonFrom('something odd\nand then this')).toBe('and then this');
    expect(reasonFrom('')).toBe('ffmpeg failed');
  });

  it('forgets a failure that stopped happening', () => {
    const now = Date.parse('2026-10-01T12:00:00.000Z');
    const fresh = { at: new Date(now - 5_000).toISOString() };
    const old = { at: new Date(now - FAILURE_FRESH_MS - 1_000).toISOString() };
    expect(stillFailing(fresh, now)).toBe(true);
    expect(stillFailing(old, now)).toBe(false);
    expect(stillFailing(null, now)).toBe(false);
    expect(stillFailing({ at: 'not a date' }, now)).toBe(false);
  });

  it('says the encoder is failing before anything else', () => {
    /*
     * ABOVE A STOPPED ENGINE, which is the one place the old ordering
     * was wrong. A stopped engine announces itself — the channel is
     * off. A RUNNING engine writing black looks perfect from every
     * angle an operator has, so it is the only fault here that nothing
     * else can reveal.
     */
    const failing = { says: "No such filter: 'drawtext'" };
    const note = controlRoomNote('running', 'transmitting', null, failing);
    expect(note?.tone).toBe<Tone>('fault');
    expect(note?.says).toContain('drawtext');
    expect(note?.says).toContain('black');

    /* It outranks a stopped engine and a dark channel alike. */
    expect(controlRoomNote('stopped', 'silent', 'something', failing)?.says)
      .toContain('drawtext');

    /* And with nothing failing, the old order is untouched. */
    expect(controlRoomNote('running', 'transmitting', null, null)).toBeNull();
    expect(controlRoomNote('running', 'silent', 'go live', null))
      .toEqual({ says: 'go live', tone: 'note' });
    expect(controlRoomNote('stopped', 'silent', null, null)?.tone)
      .toBe<Tone>('fault');
  });
});
