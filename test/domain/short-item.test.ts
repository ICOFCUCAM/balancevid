/**
 * Five seconds of media in a sixteen-minute slot.
 *   [CHANNEL §3, §4; Doctrine D-13, D-21, U-02, INV-17]
 *
 * THE FAULT THESE ANSWER, reported by the operator of a live
 * channel after three releases of work on the transmitter:
 *
 * > *"the channel cannot show images constantly even as i have
 * > only one channel at the moment"*
 * > *"music plays and cuts while video does not display. beside
 * > even if it were to play why is it cutting?"*
 *
 * Measured on that channel. Every item in its loop was a
 * five-second file sitting in a slot of four to twenty-five
 * minutes:
 *
 *     Music Video — Everlasting Love   slot  240s   file 5.0s
 *     Station Ident                    slot  960s   file 5.0s
 *     Morning Music                    slot 1500s   file 5.0s
 *     ─────────────────────────────────────────────────────────
 *     the loop ran 116 minutes and was black for 115 of them
 *
 * Five seconds of picture and sound at the top of each item, then
 * nothing until the next one — *"music plays and cuts"* exactly.
 * The video never appeared because seeing it meant watching during
 * a five-second window out of sixteen minutes.
 *
 * AND EVERY SIGNAL STAYED GREEN, because nothing was broken. The
 * engine ran, kept up, wrote a segment every four seconds and put
 * on the wire precisely what it was asked for. Three releases of
 * work on the transmitter — the crash-looping image, the load
 * gauge that lied, somewhere to scale to — touched none of it,
 * because none of them were about what the channel was asked to
 * PLAY.
 *
 * THE PRODUCT HAD TWO ANSWERS AND NEITHER WAS REACHABLE.
 * `RotationEntry.loop` does exactly this and its own comment names
 * the fault — *"for a short film in a long slot. Without it a
 * ten-minute programme in a thirty-minute slot is twenty minutes
 * of black, and black is the one thing a channel must never
 * broadcast by accident"*. Built, correct, accepted by the API,
 * and set by no surface in this product: nought of eight entries
 * had it. `channel.filler` covers the hole instead, and that
 * channel had none.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  overrunSays, slotsOverrunning, type Channel, type ProgrammeSource,
} from '../../src/domain/channel.js';
import { playoutWindow } from '../../src/domain/playout.js';

const RENDER: ProgrammeSource = {
  kind: 'render', document: 'performance',
  documentId: 'perf_one', planHash: 'hash_one',
};
const OTHER: ProgrammeSource = {
  kind: 'render', document: 'performance',
  documentId: 'perf_two', planHash: 'hash_two',
};

/** What was measured: five seconds of media, sixteen minutes of slot. */
const MEDIA_MS = 5_000;
const SLOT_MS = 960_000;

function channelWith(
  rotation: Channel['rotation'], filler?: ProgrammeSource,
): Channel {
  return {
    schemaVersion: 1, id: 'chan_test', name: 'Test', timezone: 'Europe/London',
    programmes: [], rotation, blocks: [], ingests: [], recordings: [],
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
    ...(filler ? { filler } : {}),
  } as unknown as Channel;
}

const entry = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'rot_one', source: RENDER, durationMs: SLOT_MS, title: 'Station Ident',
  createdAt: '2026-10-01T00:00:00.000Z', ...over,
}) as unknown as Channel['rotation'][number];

/** How much of a window went out as dead air. */
function darkness(channel: Channel, hours = 2): { on: number; dark: number } {
  const from = Date.parse('2026-10-07T09:00:00.000Z');
  const reads = playoutWindow(
    channel, from, from + hours * 3_600_000,
    (source) => (source === RENDER || source === OTHER ? MEDIA_MS : undefined));
  let on = 0; let dark = 0;
  for (const read of reads) {
    if ((read as unknown as { offAir?: boolean }).offAir) dark += read.durationMs;
    else on += read.durationMs;
  }
  return { on, dark };
}

describe('an item that cannot fill its slot', () => {
  /*
   * THE WHOLE BUG, IN ONE NUMBER. A channel whose loop is eight
   * five-second files in sixteen-minute slots was black for 99.4%
   * of every two hours, and nothing anywhere said why.
   */
  it('no longer puts the slot out as black', () => {
    const { on, dark } = darkness(channelWith([entry()]));
    expect(dark).toBe(0);
    expect(on).toBe(2 * 3_600_000);
  });

  /*
   * AND IT IS THE MEDIA THAT PLAYS, from its own beginning each
   * time. Filling the slot with something is only right if the
   * something is what was scheduled: a read that ran past the end
   * of the file is what produced black in the first place.
   */
  it('plays the media again rather than reading past its end', () => {
    const from = Date.parse('2026-10-07T09:00:00.000Z');
    const reads = playoutWindow(channelWith([entry()]), from, from + 60_000,
      () => MEDIA_MS);
    expect(reads.length).toBeGreaterThan(1);
    for (const read of reads) {
      expect((read as unknown as { offAir?: boolean }).offAir).toBeFalsy();
      expect(read.source).toBe(RENDER);
      /* Never past the end of the file, which is what black was. */
      expect(read.fromMs).toBeGreaterThanOrEqual(0);
      expect(read.fromMs + read.durationMs).toBeLessThanOrEqual(MEDIA_MS);
    }
    /* And it covers the minute with no holes between the reads. */
    const covered = reads.reduce((sum, one) => sum + one.durationMs, 0);
    expect(covered).toBe(60_000);
  });

  /*
   * AND IT PICKS UP WHERE THE REPEAT IS, not at the start.
   *
   * A mutation had to find this: every test above began at a slot
   * boundary, where "wrap to `intoSlot % own`" and "always start
   * at zero" give the same answer. They differ for everybody
   * actually watching. A viewer seven seconds into a slot of
   * five-second media is two seconds into the second play, and an
   * engine that restarted the file for every four-second segment
   * would show the first four seconds over and over — a picture
   * that judders rather than one that runs. [U-02]
   */
  it('continues the repeat rather than restarting every read', () => {
    const from = Date.parse('2026-10-07T09:00:00.000Z');
    /* Seven seconds in: the second play, two seconds through it. */
    const reads = playoutWindow(
      channelWith([entry()]), from + 7_000, from + 8_000, () => MEDIA_MS);
    expect(reads).toHaveLength(1);
    expect(reads[0]!.fromMs).toBe(2_000);

    /* Read from the top of the slot, every repeat legitimately
       starts at zero — which is why the mid-slot case above is the
       one that distinguishes the two. */
    const fromTop = playoutWindow(
      channelWith([entry()]), from, from + 20_000, () => MEDIA_MS);
    expect(fromTop.every((one) => one.fromMs === 0)).toBe(true);
    expect(fromTop).toHaveLength(4);
  });

  /*
   * AND MEDIA OF NO LENGTH IS NOT MEDIA. A zero would take the
   * modulus by zero and produce a slot with no reads in it at all
   * — a hole the encoder is never even asked to fill, which is
   * worse than the black this exists to remove.
   */
  it('refuses to divide a slot by media of no length', () => {
    const from = Date.parse('2026-10-07T09:00:00.000Z');
    for (const length of [0, -1, Number.NaN]) {
      const reads = playoutWindow(
        channelWith([entry()]), from, from + 20_000, () => length);
      const covered = reads.reduce((sum, one) => sum + one.durationMs, 0);
      expect(covered, `media length ${length}`).toBe(20_000);
      for (const read of reads) {
        expect(Number.isFinite(read.fromMs), `media length ${length}`).toBe(true);
        expect(Number.isFinite(read.durationMs)).toBe(true);
      }
    }
  });

  /*
   * A CHANNEL WITH A FILLER KEEPS ITS FILLER. The operator chose
   * what covers a hole; this module deciding it knows better would
   * be overriding a deliberate setting with a guess. Looping is
   * for when the only other answer is dead air.
   */
  it('leaves a configured filler to do its job', () => {
    const withFiller = channelWith([entry()], OTHER);
    const reads = playoutWindow(
      withFiller, Date.parse('2026-10-07T09:00:00.000Z'),
      Date.parse('2026-10-07T09:01:00.000Z'), () => MEDIA_MS);
    /* The media first, then the filler — not the media repeating. */
    expect(reads.some((one) => one.source === OTHER)).toBe(true);
  });

  /* An item somebody explicitly set to loop loops, as it always
     did, filler or no filler. */
  it('still honours a slot somebody asked to repeat', () => {
    const asked = channelWith([entry({ loop: true })], OTHER);
    const reads = playoutWindow(
      asked, Date.parse('2026-10-07T09:00:00.000Z'),
      Date.parse('2026-10-07T09:01:00.000Z'), () => MEDIA_MS);
    expect(reads.every((one) => one.source === RENDER)).toBe(true);
  });

  /*
   * AND A LONG FILM IN A SHORT SLOT IS UNTOUCHED, which is the
   * ordinary case and must not start repeating. A forty-minute
   * film in a thirty-minute slot plays thirty minutes of itself.
   */
  it('does not touch an item longer than its slot', () => {
    const film = channelWith([entry({ durationMs: 60_000 })]);
    const from = Date.parse('2026-10-07T09:00:00.000Z');
    const reads = playoutWindow(film, from, from + 60_000, () => 10 * 60_000);
    expect(reads).toHaveLength(1);
    expect(reads[0]!.fromMs).toBe(0);
    expect(reads[0]!.durationMs).toBe(60_000);
  });

  /*
   * AND AN ITEM NOBODY HAS MEASURED IS LEFT ALONE. This module
   * does not decode, so a length it invented would be a length
   * somebody schedules against. [D-14]
   */
  it('claims nothing about media it has not been given a length for', () => {
    const from = Date.parse('2026-10-07T09:00:00.000Z');
    const reads = playoutWindow(
      channelWith([entry()]), from, from + 60_000, () => undefined);
    expect(reads).toHaveLength(1);
    expect(reads[0]!.source).toBe(RENDER);
  });
});

describe('telling the operator their durations are wrong', () => {
  /*
   * LOOPING IS BETTER THAN BLACK AND IS STILL NOT WHAT ANYBODY
   * MEANT. An ident repeating a hundred and ninety-two times is a
   * duration somebody typed, and the operator cannot fix what
   * nothing tells them. [D-21]
   */
  it('finds the item and says how many times it will repeat', () => {
    const found = slotsOverrunning(channelWith([entry()]), () => MEDIA_MS);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      title: 'Station Ident', slotMs: SLOT_MS, mediaMs: MEDIA_MS, repeats: 192,
    });
  });

  it('says nothing about a channel whose slots fit their media', () => {
    expect(slotsOverrunning(channelWith([entry({ durationMs: MEDIA_MS })]),
      () => MEDIA_MS)).toEqual([]);
    expect(slotsOverrunning(channelWith([entry({ durationMs: 1000 })]),
      () => MEDIA_MS)).toEqual([]);
    expect(overrunSays([])).toBeNull();
  });

  /* A slot somebody asked to repeat is doing what it was told, and
     reporting it would be an alarm about a deliberate choice. */
  it('says nothing about a slot somebody set to loop', () => {
    expect(slotsOverrunning(channelWith([entry({ loop: true })]), () => MEDIA_MS))
      .toEqual([]);
  });

  /* Trimming narrows the media, so a trim can make an item too
     short for a slot it used to fill. */
  it('measures the trimmed length, not the whole file', () => {
    const trimmed = channelWith([entry({ durationMs: 60_000, fromMs: 0, toMs: 5_000 })]);
    const found = slotsOverrunning(trimmed, () => 10 * 60_000);
    expect(found).toHaveLength(1);
    expect(found[0]!.mediaMs).toBe(5_000);
  });

  it('claims nothing about media nobody has measured', () => {
    expect(slotsOverrunning(channelWith([entry()]), () => undefined)).toEqual([]);
    expect(slotsOverrunning(channelWith([entry()]), () => 0)).toEqual([]);
  });

  /*
   * THE SENTENCE NAMES THE WORST ONE AND COUNTS THE REST, because
   * a control-room line that lists eight items is a line that
   * scrolls, and a line that scrolls is a line nobody reads. [D-04]
   */
  it('names the worst offender and counts the others', () => {
    const says = overrunSays([
      { id: 'rot_a', title: 'Station Ident', slotMs: SLOT_MS, mediaMs: MEDIA_MS, repeats: 192 },
      { id: 'rot_b', title: 'Morning Music', slotMs: 1_500_000, mediaMs: MEDIA_MS, repeats: 300 },
    ])!;
    /* The worst is the one that shows what kind of mistake it is. */
    expect(says).toContain('Morning Music');
    expect(says).toContain('300 times');
    expect(says).toMatch(/1 other item is/);
    /* And what to do about it. */
    expect(says).toMatch(/Match the media/);
  });

  it('reads as one sentence for one item', () => {
    const says = overrunSays([
      { id: 'rot_a', title: 'Station Ident', slotMs: SLOT_MS, mediaMs: MEDIA_MS, repeats: 192 },
    ])!;
    expect(says).toContain('Station Ident');
    expect(says).not.toMatch(/other item/);
  });
});

/* ------------------------------------------------------------------ *
 *  And somebody is actually told.
 * ------------------------------------------------------------------ */

/**
 * A REPORT NOBODY READS IS THE FAULT THIS WHOLE FILE IS ABOUT.
 *
 * `RotationEntry.loop` was built, correct, documented and wired to
 * no surface, which is why a channel sat dark for 99% of every
 * loop with the answer already in the codebase. A
 * `slotsOverrunning` that nothing calls would be the same mistake
 * committed in the same week. [D-13]
 */
describe('the control room is given it', () => {
  const ROUTE = readFileSync('app/api/channels/[id]/route.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('is computed and returned by the channel route', () => {
    expect(ROUTE).toMatch(/const overrunning = slotsOverrunning\(channel,/);
    expect(ROUTE).toMatch(/^\s*overrunning,$/m);
  });

  /*
   * MEASURED OFF THE PROBE CACHE the engine already fills, not by
   * decoding. A control-room read that spawned ffprobe per item
   * would make opening the page cost what a pass costs. [U-16]
   */
  it('reads the lengths it already has rather than decoding', () => {
    expect(ROUTE).toMatch(/factsFor\(file\)/);
    expect(ROUTE).not.toMatch(/ffprobe|spawn/);
  });

  /*
   * AND THE SENTENCE REACHES A SCREEN. An array in a JSON response
   * that no component renders is `RotationEntry.loop` all over
   * again — built, correct, and invisible. [D-13]
   */
  it('is shown in the room, in words', () => {
    const studio = readFileSync('app/t/[id]/ChannelStudio.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(studio).toMatch(/setOverrunning\(data\.overrunning \?\? \[\]\)/);
    expect(studio).toMatch(/data-testid="overrunning"/);
    expect(studio).toMatch(/overrunSays\(overrunning\)/);
  });
});
