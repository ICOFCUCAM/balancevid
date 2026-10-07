/**
 * The slot takes the length of the media, and nobody types a number.
 *   [CHANNEL §3, §4, §25; Doctrine D-13, D-14, D-21, C-14, U-02]
 *
 * THE FAULT THESE ANSWER is the one `short-item.test.ts` measured,
 * asked the other way round. That file established that a channel
 * whose loop was eight five-second files in slots of four to
 * twenty-five minutes was black for 99.4% of every two hours, and
 * made the engine loop the item rather than go dark. The operator
 * was then told what remained:
 *
 * > *"Set each slot to its real length and you get roughly a
 * > forty-second loop of genuine content."*
 *
 * and answered:
 *
 * > *"HOW IS MY BUSINESS? AM I NOT SUPPOSE TO JUST LOAD MEDIA AND
 * > PLAY? HOW IS IT NOW I HAVE TO DO THE WORK THE SYSTEM SUPPOSE
 * > TO AUTOMATE?"*
 *
 * THEY WERE RIGHT, AND THE CODE AGREED WITH THEM IN WRITING.
 * `addToRotation`'s header has said since it was written that
 * *"the route reads it off the library, which measured it once"*.
 * The route read `Number(body['durationMs'])`. The browser sent
 * `item.durationMs ?? 15 * MINUTE` from the library menu and a
 * number off a row of buttons marked `5 15 30 60 90 120 min` from
 * the scheduler, which opened on sixty. Between the file and the
 * document there was no step that opened the file — while the
 * engine opened it on every single pass to trim four seconds out
 * of it.
 *
 * So the promise is kept here instead of described: ask for no
 * length and the slot is the media's own, which is what "load it
 * and play it" has to mean. [channel.ts `slotLength`]
 *
 * AND THE EIGHT ALREADY IN THE DOCUMENT are not the operator's to
 * retype either: `retimeSlots` is given the list the control room
 * is already showing and sets all of them.
 *   [channelEdit.ts `retimeSlots`]
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  slotLength, slotsOverrunning, type Channel, type ProgrammeSource,
} from '../../src/domain/channel.js';
import { retimeSlots } from '../../src/domain/channelEdit.js';
import { playoutWindow } from '../../src/domain/playout.js';

const RENDER: ProgrammeSource = {
  kind: 'render', document: 'performance',
  documentId: 'perf_one', planHash: 'hash_one',
};

/** What was measured on the live channel. */
const MEDIA_MS = 5_000;
/** A real programme, for the case the fault was never about. */
const FILM_MS = 4 * 60_000;

/* ------------------------------------------------------------------ *
 *  1. The rule: the media decides unless somebody says otherwise.
 * ------------------------------------------------------------------ */

describe('how long a new slot is', () => {
  /*
   * THE WHOLE REQUEST, IN ONE ASSERTION. Nothing stated, so the
   * slot is exactly the file. This is the step that did not exist.
   */
  it('is the media, when nobody says', () => {
    expect(slotLength({}, FILM_MS)).toBe(FILM_MS);
    expect(slotLength({}, MEDIA_MS)).toBe(MEDIA_MS);
  });

  /*
   * AND A STATED LENGTH IS STILL HONOURED, because a short bed
   * under a long block is a real intention. What changed is that
   * it is now an intention somebody had rather than a default
   * nobody chose — the fifteen minutes was the absence of a
   * choice, not a choice.
   */
  it('is what was asked for, when somebody says', () => {
    expect(slotLength({ durationMs: 30 * 60_000 }, MEDIA_MS)).toBe(30 * 60_000);
    /* Even shorter than the media: that is a trim by another name. */
    expect(slotLength({ durationMs: 2_000 }, MEDIA_MS)).toBe(2_000);
  });

  /*
   * A TRIM BEATS THE CONTAINER, because a trim is a length
   * somebody already stated. Reaching past `toMs` to the whole
   * file would schedule two and a half minutes nobody asked to
   * see, out of a programme they had just cut down.
   */
  it('respects a trim over the length of the whole file', () => {
    expect(slotLength({ toMs: 90_000 }, FILM_MS)).toBe(90_000);
    expect(slotLength({ fromMs: 10_000 }, FILM_MS)).toBe(FILM_MS - 10_000);
    expect(slotLength({ fromMs: 10_000, toMs: 70_000 }, FILM_MS)).toBe(60_000);
    /* A trim needs no measurement at all: it states both ends. */
    expect(slotLength({ fromMs: 10_000, toMs: 70_000 }, undefined)).toBe(60_000);
    /*
     * AND A START BEFORE THE START ADDS NOTHING. `addToRotation`
     * does not check `fromMs` the way `scheduleProgramme` does, so
     * a negative one reaching this would make the slot LONGER than
     * the file — the exact shape of the fault, arrived at from the
     * other side.
     */
    expect(slotLength({ fromMs: -10_000 }, MEDIA_MS)).toBe(MEDIA_MS);
  });

  /*
   * AND IF IT CANNOT BE MEASURED, IT SAYS SO RATHER THAN GUESSING.
   *
   * This is the line that matters most in the file. Every other
   * answer here is a convenience; this one is the difference
   * between a refusal somebody reads and five seconds in a
   * twenty-five minute slot. A number invented at this point is
   * a number that goes into a document and out on a wire.
   *   [D-21, U-19]
   */
  it('refuses to invent one', () => {
    expect(slotLength({}, undefined)).toBeUndefined();
    expect(slotLength({}, 0)).toBeUndefined();
    expect(slotLength({}, -1)).toBeUndefined();
    expect(slotLength({}, Number.NaN)).toBeUndefined();
    /* A trim that leaves nothing of the programme is not a slot. */
    expect(slotLength({ fromMs: 70_000, toMs: 10_000 }, FILM_MS)).toBeUndefined();
    expect(slotLength({ fromMs: FILM_MS }, FILM_MS)).toBeUndefined();
  });

  /*
   * A LENGTH THAT IS NOT A LENGTH IS NOT A STATEMENT. `Number()`
   * of an absent field is `NaN` and of a blank one is zero, and
   * both used to go into the document unexamined — `durationMs:
   * NaN` is what `scheduleProgramme` then refused with *"a
   * programme needs a length"* on a file it could have measured.
   */
  it('reads a nonsense length as nothing said', () => {
    for (const said of [Number.NaN, 0, -5, Number.POSITIVE_INFINITY]) {
      expect(slotLength({ durationMs: said }, MEDIA_MS), String(said))
        .toBe(MEDIA_MS);
    }
  });

  /*
   * AND A NONSENSE TRIM IS NOT A TRIM, for the same reason a
   * nonsense length is not a length. The route reads these with
   * `Number(body['toMs'])`, so `null`, `""` or a word arrives as
   * `NaN` — and a `NaN` that reached the subtraction would turn a
   * perfectly measurable four-minute file into a refusal the
   * operator cannot act on. Two mutations survived to find this.
   *   [U-02]
   */
  it('reads a nonsense trim as no trim at all', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(slotLength({ toMs: bad }, FILM_MS), `toMs ${bad}`).toBe(FILM_MS);
      expect(slotLength({ fromMs: bad }, FILM_MS), `fromMs ${bad}`).toBe(FILM_MS);
    }
  });

  /* Whole milliseconds, because a document stores what it is given. */
  it('is a whole number of milliseconds', () => {
    expect(slotLength({}, 4_004.4)).toBe(4_004);
    expect(slotLength({ durationMs: 999.6 }, undefined)).toBe(1_000);
  });
});

/* ------------------------------------------------------------------ *
 *  2. The repair, for what was written before the rule.
 * ------------------------------------------------------------------ */

function realChannel(): Channel {
  /*
   * THE MEASURED DOCUMENT, not an invented one: the eight slots
   * are the lengths read off `chan_c3bf272865354bc3baa3`, and
   * every file behind them is 5.0s.
   */
  const slots = [240, 420, 600, 780, 960, 1140, 1320, 1500];
  return {
    schemaVersion: 1, id: 'chan_test', name: 'BalanceVid TV',
    timezone: 'Europe/London',
    programmes: [{
      id: 'prog_loop', startsAt: '2026-10-07T20:00:00.000Z',
      durationMs: 600_000, source: RENDER, title: 'Looping Feature',
      loop: true, createdAt: '2026-10-01T00:00:00.000Z',
    }],
    rotation: slots.map((seconds, at) => ({
      id: `rot_${at}`, source: RENDER, durationMs: seconds * 1000,
      title: `Item ${at}`, createdAt: '2026-10-01T00:00:00.000Z',
    })),
    blocks: [], ingests: [], recordings: [],
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  } as unknown as Channel;
}

/** The one action the button sends, end to end. */
function retime(channel: Channel): number {
  return retimeSlots(
    channel,
    slotsOverrunning(channel, () => MEDIA_MS)
      .map((one) => ({ id: one.id, durationMs: one.mediaMs })));
}

describe('the slots already in a document', () => {
  /*
   * ONE ACTION, EIGHT SLOTS, AND THE LOOP BECOMES WHAT IS IN IT.
   * 118 minutes of listing over 40 seconds of media.
   */
  it('are set to the length of their media in one go', () => {
    const channel = realChannel();
    const before = channel.rotation.reduce((sum, one) => sum + one.durationMs, 0);
    expect(before).toBe(6_960_000);

    expect(retime(channel)).toBe(8);

    const after = channel.rotation.reduce((sum, one) => sum + one.durationMs, 0);
    expect(after).toBe(8 * MEDIA_MS);
    expect(channel.rotation.every((one) => one.durationMs === MEDIA_MS)).toBe(true);
  });

  /*
   * AND NOTHING IS LEFT TO REPORT, which is the property that
   * makes the button finished rather than partial: the control
   * room's own count is what drove it, so the count must be zero
   * afterwards. A repair that leaves its own alarm standing is a
   * repair nobody trusts twice.
   */
  it('leave the control room with nothing left to say', () => {
    const channel = realChannel();
    expect(slotsOverrunning(channel, () => MEDIA_MS)).toHaveLength(8);
    retime(channel);
    expect(slotsOverrunning(channel, () => MEDIA_MS)).toEqual([]);
    /* And doing it twice changes nothing more. */
    expect(retime(channel)).toBe(0);
  });

  /*
   * A SLOT SOMEBODY ASKED TO REPEAT IS LEFT ALONE. `loop` means
   * "I know it is shorter and I want the time anyway", and a
   * repair that overrode it would delete the one intention this
   * whole area exists to express. The programme in the real
   * document has it; it keeps its ten minutes.
   */
  it('do not touch a slot that was told to repeat', () => {
    const channel = realChannel();
    retime(channel);
    expect(channel.programmes[0]!.durationMs).toBe(600_000);
  });

  /*
   * AND IT ONLY EVER SHORTENS, which is what makes it safe to run
   * without asking: shortening a programme cannot collide with
   * the one after it. Lengthening would, so it is refused even
   * when told to.
   */
  it('are never lengthened', () => {
    const channel = realChannel();
    channel.rotation[0]!.durationMs = 1_000;
    expect(retimeSlots(channel, [{ id: 'rot_0', durationMs: 600_000 }])).toBe(0);
    expect(channel.rotation[0]!.durationMs).toBe(1_000);
  });

  /*
   * AND A PROGRAMME IS SHORTENED TOO, not only the loop. Both
   * lists are in the document and both were written by the same
   * route; a repair that reached one of them would leave the nine
   * o'clock slot claiming sixteen minutes of a five-second file.
   */
  it('are set on the schedule as well as on the loop', () => {
    const channel = realChannel();
    delete (channel.programmes[0] as { loop?: boolean }).loop;
    expect(retime(channel)).toBe(9);
    expect(channel.programmes[0]!.durationMs).toBe(MEDIA_MS);
  });

  /*
   * A SLOT ALREADY THE RIGHT LENGTH IS NOT A CHANGE, which is what
   * makes the count in the answer worth printing: "8 slots set" has
   * to mean eight slots are different from how they were.
   */
  it('do not count a slot that was already right', () => {
    const channel = realChannel();
    expect(retimeSlots(channel, [{ id: 'rot_0', durationMs: 240_000 }])).toBe(0);
    expect(channel.rotation[0]!.durationMs).toBe(240_000);
  });

  /*
   * THE SHORTEST SLOT THE DOMAIN ALLOWS IS STILL ALLOWED HERE.
   * `MINIMUM_SLOT_MS` is one second exactly, and a repair that
   * refused the boundary would leave one-second idents reported
   * for ever with a button that does nothing to them.
   */
  it('go down to the shortest slot the domain accepts, and no further', () => {
    const channel = realChannel();
    expect(retimeSlots(channel, [{ id: 'rot_0', durationMs: 1_000 }])).toBe(1);
    expect(channel.rotation[0]!.durationMs).toBe(1_000);
  });

  /* Whole milliseconds, as everywhere a duration is written down. */
  it('store a whole number of milliseconds', () => {
    const channel = realChannel();
    retimeSlots(channel, [{ id: 'rot_0', durationMs: 4_004.4 }]);
    expect(channel.rotation[0]!.durationMs).toBe(4_004);
  });

  it('ignore an id that is not on the channel, and a sub-second length', () => {
    const channel = realChannel();
    expect(retimeSlots(channel, [{ id: 'rot_nowhere', durationMs: 1_000 }])).toBe(0);
    expect(retimeSlots(channel, [{ id: 'rot_0', durationMs: 999 }])).toBe(0);
    expect(retimeSlots(channel, [{ id: 'rot_0', durationMs: Number.NaN }])).toBe(0);
    expect(channel.rotation[0]!.durationMs).toBe(240_000);
  });

  /*
   * AND THE MEDIA IS UNTOUCHED, the rule every edit in this file
   * keeps: a channel never made the file, so a channel never
   * changes it. [§3, D-18]
   */
  it('change no reference', () => {
    const channel = realChannel();
    retime(channel);
    expect(channel.rotation.every((one) => one.source === RENDER)).toBe(true);
    expect(channel.programmes[0]!.source).toBe(RENDER);
  });

  /*
   * WHAT THE VIEWER GETS AFTERWARDS. The loop is forty seconds of
   * genuine content repeated, with no read running past the end
   * of a file and no repeat inside a slot — which is the
   * difference between a channel that is honest about what it has
   * and one that claims two hours of programming it does not own.
   */
  it('turn a two-hour claim into the content that exists', () => {
    const channel = realChannel();
    channel.programmes = [];
    retime(channel);
    const from = Date.parse('2026-10-07T09:00:00.000Z');
    const reads = playoutWindow(channel, from, from + 600_000, () => MEDIA_MS);
    expect(reads.reduce((sum, one) => sum + one.durationMs, 0)).toBe(600_000);
    for (const read of reads) {
      expect((read as unknown as { offAir?: boolean }).offAir).toBeFalsy();
      /* Each read is one whole play of a file, not a slice of a
         repeat: the loop is now made of items, not of padding. */
      expect(read.fromMs).toBe(0);
      expect(read.durationMs).toBe(MEDIA_MS);
    }
    /* Ten minutes over a forty-second loop: fifteen times round. */
    expect(reads).toHaveLength(120);
  });
});

/* ------------------------------------------------------------------ *
 *  3. And it is reached.  [D-13]
 * ------------------------------------------------------------------ */

/**
 * THE MISTAKE THIS FILE IS THE SECOND HALF OF was a capability
 * built, correct, documented and wired to nothing — `loop` sat in
 * the domain for releases while the channel it would have saved
 * ran dark. A `slotLength` the route does not call would be the
 * same week's work making the same mistake.
 */
describe('nothing between the file and the document guesses', () => {
  const bare = (path: string) => readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const ROUTE = bare('app/api/channels/[id]/route.ts');
  const STUDIO = bare('app/t/[id]/ChannelStudio.tsx');

  /*
   * THE LINE THE WHOLE FAULT WAS. Three of them, one per way of
   * putting MEDIA on a channel, and all three took the browser's
   * word for how long a file is.
   *
   * Five other reads of the field survive and are meant to. One
   * is inside `lengthFor`, which is the thing that examines it.
   * `move` is an operator dragging a slot's edge, which is a
   * stated length by definition. `book-live` books an hour for a
   * broadcast nobody has made yet — no file to measure, and that
   * is the whole point of §6. `end-live` and `close-ingest` are
   * reporting how long something that already happened WAS, which
   * is the one duration this tier genuinely cannot find out.
   */
  it('the route no longer writes down what it was handed', () => {
    for (const call of [
      /scheduleProgramme\(draft, \{[^}]*\}/,
      /addToRotation\(draft, \{[^}]*\}/,
      /addToBlock\(draft, body\['blockId'\], \{[^}]*\}/,
    ]) {
      const written = ROUTE.match(call)?.[0] ?? '';
      expect(written, String(call)).not.toMatch(/Number\(body\['durationMs'\]\)/);
      expect(written, String(call)).toMatch(/durationMs: await lengthFor\(/);
    }
    /* And nowhere else grew one while this was being written. */
    expect(ROUTE.match(/Number\(body\['durationMs'\]\)/g) ?? [])
      .toHaveLength(5);
  });

  it('the route measures for all three ways in', () => {
    /* schedule, rotate, add-to-block. */
    expect(ROUTE.match(/durationMs: await lengthFor\(draft,/g) ?? [])
      .toHaveLength(3);
    expect(ROUTE).toMatch(/slotLength\(\{/);
    expect(ROUTE).toMatch(/await mediaLength\(draft, body\['source'\]\)/);
    /* Off the probe cache, never by decoding on a request. [U-16] */
    expect(ROUTE).toMatch(/factsFor\(file\)/);
    expect(ROUTE).not.toMatch(/ffprobe|spawn/);
  });

  /*
   * AND THE REFUSAL IS A SENTENCE, not a `NaN` that the domain
   * rejects three frames later with a message about something
   * else.
   */
  it('the route refuses rather than guesses', () => {
    expect(ROUTE).toMatch(/nothing here can measure how long that is/);
  });

  /*
   * AND THE ONE SOURCE WHOSE FILE HAS NO MEANINGFUL LENGTH IS NOT
   * MEASURED. An ingest that is still open resolves to the buffer
   * being written into at this instant, so a slot taking that
   * answer would be a few seconds long for a broadcast that has
   * not happened yet. Once it is kept it is an asset like any
   * other and the ordinary path measures it. [§7, §8]
   */
  it('the route does not measure a feed that is still running', () => {
    expect(ROUTE).toMatch(
      /source\?\.kind === 'live' && !ingestById\(channel, source\.ingestId\)\?\.assetId/);
  });

  it('the repair is an action and it is the same computation', () => {
    expect(ROUTE).toMatch(/case 'retime':/);
    expect(ROUTE).toMatch(/retimeSlots\(/);
    expect(ROUTE).toMatch(/slotsOverrunning\(draft, await mediaLengths\(draft\)\)/);
  });

  /*
   * THE FIFTEEN MINUTES, GONE FROM THE ONLY PLACE IT EVER WAS.
   * Two call sites sent `item.durationMs ?? 15 * MINUTE`, which is
   * how a five-second ident came to claim a quarter of an hour.
   */
  it('the studio sends no length it made up', () => {
    expect(STUDIO).not.toMatch(/15 \* MINUTE/);
    expect(STUDIO).not.toMatch(/durationMs: pickedItem\.durationMs/);
  });

  /*
   * AND THE SCHEDULER OPENS ON THE ITEM, not on sixty minutes. The
   * row of buttons is still there, because asking for a longer
   * slot is a real thing to want — it is just no longer the only
   * thing on offer.
   */
  it('the scheduler offers the media’s own length first', () => {
    expect(STUDIO).toMatch(/data-testid="slot-own-length"/);
    expect(STUDIO).toMatch(/useState<number \| null>\(ownMs \? null : 60\)/);
    expect(STUDIO).toMatch(/ownMs=\{pickedItem\.durationMs\}/);
    /* And "no length chosen" leaves the field out of the body. */
    expect(STUDIO).toMatch(/durationMs === undefined \? \{\} : \{ durationMs \}/);
  });

  /*
   * AND THE REPAIR REACHES A SCREEN. An action no button sends is
   * the same invisible capability all over again. [D-13]
   */
  it('the button for the eight already written is in the room', () => {
    expect(STUDIO).toMatch(/data-testid="retime"/);
    expect(STUDIO).toMatch(/patch\(\{ action: 'retime' \}\)/);
  });
});
