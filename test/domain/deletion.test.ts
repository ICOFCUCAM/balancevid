/**
 * Throwing something away.  [Doctrine §19, CHANNEL §3, D-18, INV-17]
 *
 * The danger is entirely D-18's doing: a channel schedules by REFERENCE, so
 * the bytes a broadcast depends on live in another studio's directory and
 * nothing on that studio's page hints that tonight's nine o'clock is built
 * on them.
 */

import { describe, expect, it } from 'vitest';

import type { Channel, ProgrammeSource } from '../../src/domain/channel.js';
import {
  addBlock, addToBlock, addToRotation, newChannel, scheduleProgramme,
  setBackup, setEmergency, setFiller,
} from '../../src/domain/channelEdit.js';
import {
  bookingsFor, channelOwns, refusalFor,
} from '../../src/domain/deletion.js';

const AT = '2026-04-20T09:00:00.000Z';
const HOUR = 60 * 60 * 1000;

const FILM: ProgrammeSource = {
  kind: 'render', document: 'performance',
  documentId: 'perf_everlasting', planHash: 'a'.repeat(64),
};
/* A second render of the SAME performance. Deleting the document takes both. */
const OTHER_CUT: ProgrammeSource = {
  kind: 'render', document: 'performance',
  documentId: 'perf_everlasting', planHash: 'b'.repeat(64),
};
const TALK: ProgrammeSource = {
  kind: 'render', document: 'conversation',
  documentId: 'conv_thepower', planHash: 'c'.repeat(64),
};
const IDENT: ProgrammeSource = { kind: 'media', assetId: 'lib_ident', form: 'video' };

function channel(name = 'BalanceVid TV'): Channel {
  return newChannel(name, 'Europe/London', AT);
}

describe('what a deletion would break', () => {
  it('finds nothing when nothing points at it', () => {
    const c = channel();
    addToRotation(c, { source: TALK, durationMs: HOUR }, AT);
    expect(bookingsFor([c], 'performance', 'perf_everlasting')).toEqual([]);
    expect(refusalFor([])).toBeNull();
  });

  /*
   * A RENDER NAMES ITS DOCUMENT, so the match is on the document and not on
   * a plan hash. Deleting a performance takes every cut of it, and a check
   * that looked for one hash would miss the others and delete the lot.
   */
  it('matches every render of the document, not one cut of it', () => {
    const c = channel();
    addToRotation(c, { source: FILM, durationMs: HOUR, title: 'Everlasting Love' }, AT);
    addToRotation(c, { source: OTHER_CUT, durationMs: HOUR, title: 'Everlasting (short)' }, AT);

    const found = bookingsFor([c], 'performance', 'perf_everlasting');
    expect(found).toHaveLength(1);
    expect(found[0]!.slots).toEqual(['Everlasting Love', 'Everlasting (short)']);
  });

  /*
   * ALL FOUR PLACES A CHANNEL CAN HOLD A REFERENCE. A check that missed one
   * would let somebody delete the thing a channel falls back to when
   * everything else has failed — which is the one file that must survive
   * every other file going wrong. [§4, §5, §9]
   */
  it('looks in the fixed slots, the loop, the day-parts and the fallbacks', () => {
    const fixed = channel('Fixed');
    scheduleProgramme(fixed, {
      source: IDENT, startsAt: AT, durationMs: HOUR, title: 'Nine O’Clock',
    }, AT);

    const loop = channel('Loop');
    addToRotation(loop, { source: IDENT, durationMs: HOUR, title: 'Ident' }, AT);

    const dayPart = channel('Morning');
    const block = addBlock(dayPart, { name: 'Breakfast', fromMinute: 7 * 60 }, AT);
    addToBlock(dayPart, block.id, { source: IDENT, durationMs: HOUR }, AT);

    const fallback = channel('Fallback');
    setFiller(fallback, IDENT);

    const safe = channel('Safe');
    setBackup(safe, IDENT);

    const cut = channel('Cut');
    setEmergency(cut, IDENT, AT);

    const names = bookingsFor(
      [fixed, loop, dayPart, fallback, safe, cut], 'media', 'lib_ident',
    ).map((booking) => booking.channelName);
    expect(names).toEqual(
      ['Fixed', 'Loop', 'Morning', 'Fallback', 'Safe', 'Cut']);
  });

  it('reports each channel separately, so the message can name them', () => {
    const one = channel('BalanceVid One');
    const two = channel('BalanceVid Two');
    addToRotation(one, { source: TALK, durationMs: HOUR, title: 'The Power' }, AT);
    scheduleProgramme(two, {
      source: TALK, startsAt: AT, durationMs: HOUR, title: 'Late Repeat',
    }, AT);

    const found = bookingsFor([one, two], 'conversation', 'conv_thepower');
    expect(found.map((booking) => booking.channelName))
      .toEqual(['BalanceVid One', 'BalanceVid Two']);
    expect(found[1]!.slots).toEqual(['Late Repeat']);
  });

  it('does not confuse a conversation with a performance of the same id', () => {
    const c = channel();
    addToRotation(c, { source: TALK, durationMs: HOUR }, AT);
    expect(bookingsFor([c], 'performance', 'conv_thepower')).toEqual([]);
  });
});

describe('the refusal', () => {
  /*
   * "Cannot delete: in use" is the message that makes somebody open every
   * channel by hand. This one names the channel, the slot, and the one
   * action that clears it — and says that action costs nothing, because the
   * fear it answers is "will unscheduling delete my video".
   */
  it('names the channel, the slot, and what to do about it', () => {
    const c = channel('BalanceVid TV');
    addToRotation(c, { source: FILM, durationMs: HOUR, title: 'Everlasting Love' }, AT);

    const said = refusalFor(bookingsFor([c], 'performance', 'perf_everlasting'))!;
    expect(said).toContain('BalanceVid TV');
    expect(said).toContain('Everlasting Love');
    expect(said).toMatch(/take it off the schedule first/i);
    expect(said).toMatch(/changes no files/);
  });

  it('is silent when there is nothing in the way', () => {
    expect(refusalFor([])).toBeNull();
  });
});

describe('what a channel takes with it', () => {
  /*
   * D-18 PAYING OUT ONE LAST TIME. A channel's schedule is references, so
   * deleting six months of programming removes no video from the machine.
   */
  it('counts nothing for a schedule, however full', () => {
    const c = channel();
    addToRotation(c, { source: FILM, durationMs: HOUR }, AT);
    addToRotation(c, { source: TALK, durationMs: HOUR }, AT);
    scheduleProgramme(c, { source: IDENT, startsAt: AT, durationMs: HOUR }, AT);
    setBackup(c, IDENT);
    expect(channelOwns(c)).toBe(0);
  });

  /* The only media a channel ever owns is what it recorded itself. [INV-17] */
  it('counts the recordings somebody asked it to keep', () => {
    const c = channel();
    c.recordings = [{
      id: 'rec_1', assetId: 'ast_1', label: 'Last night',
      fromAt: AT, toAt: AT, requestedBy: 'owner', createdAt: AT,
    } as unknown as Channel['recordings'][number]];
    expect(channelOwns(c)).toBe(1);
  });
});
