/**
 * The Channel: a schedule that owns nothing, and an engine that reads.
 * [Doctrine CHANNEL §1–§7, D-18, INV-00, INV-17]
 *
 * "Online TV must never duplicate media merely because it is scheduled for
 *  broadcast. A scheduled programme references an existing media asset. Only
 *  live ingest and explicitly requested recordings create new media assets.
 *  The playout engine continuously reads scheduled assets and produces the
 *  broadcast stream."
 *
 * That paragraph is four claims and this file checks all four:
 *
 *   thirty broadcasts of one film are thirty programmes and one asset;
 *   a programme has nowhere to put media, and removing one deletes none;
 *   only `openIngest` and `requestRecording` mint an asset id;
 *   the engine turns a schedule and an instant into READS and nothing else.
 */
import { describe, expect, it } from 'vitest';

import {
  type Channel, type ProgrammeSource,
  gaps, nextAfter, onAirAt, orderedProgrammes, overlaps, programmeEnd,
  referencedAssets, rotationAt, rotationLengthMs, rotationOffsets, sourceKey,
  whatIsOn,
} from '../../src/domain/channel.js';
import {
  ChannelEditError,
  addToRotation, closeIngest, endLive, goLive, moveInRotation, moveProgramme,
  newChannel, openIngest, removeFromRotation, removeProgramme, requestRecording,
  rollIn, scheduleProgramme, setFiller,
} from '../../src/domain/channelEdit.js';
import {
  SEGMENT_MS, WINDOW_SEGMENTS,
  deadAir, distinctAssetsRead, livePlaylist, playoutWindow, segmentIndexAt,
} from '../../src/domain/playout.js';
import {
  InvariantViolation,
  assertChannelOwnsNoScheduledMedia, assertScheduleResolves,
} from '../../src/domain/invariants.js';

const AT = '2026-09-25T09:00:00.000Z';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** A film that exists, in the studio that made it. */
const FILM: ProgrammeSource = {
  kind: 'render',
  document: 'performance',
  documentId: 'perf_everlasting',
  planHash: 'a1b2c3d4',
};
/** A conversation that exists, in the studio that made it. */
const DEBATE: ProgrammeSource = {
  kind: 'render',
  document: 'conversation',
  documentId: 'cnv_the_long_way',
  planHash: 'deadbeef',
};

function channel(): Channel {
  return newChannel('Prof Class One', 'Africa/Lagos', AT);
}

/** An hour of film at nine, as an instant with an offset. [§2] */
function at(hour: number, minute = 0): string {
  return `2026-10-01T${String(hour).padStart(2, '0')}:`
    + `${String(minute).padStart(2, '0')}:00.000Z`;
}

describe('a schedule references, and never copies (§3, D-18, INV-17)', () => {
  /*
   * THE CLAIM, COUNTED. Thirty broadcasts of one film. If the architecture
   * ever starts copying, this number is the first thing that changes.
   */
  it('thirty broadcasts of one film are thirty programmes and one asset', () => {
    const c = channel();
    for (let day = 0; day < 30; day += 1) {
      scheduleProgramme(c, {
        startsAt: new Date(Date.parse(at(9)) + day * 24 * HOUR).toISOString(),
        durationMs: HOUR, source: FILM, title: 'Everlasting Love',
      }, AT);
    }
    expect(c.programmes).toHaveLength(30);
    expect(referencedAssets(c)).toHaveLength(1);
    expect(sourceKey(referencedAssets(c)[0]!)).toBe(sourceKey(FILM));
  });

  it('and a breakfast showing, a lunchtime repeat and an overnight loop are one', () => {
    const c = channel();
    scheduleProgramme(c, { startsAt: at(7), durationMs: HOUR, source: FILM }, AT);
    scheduleProgramme(c, { startsAt: at(13), durationMs: HOUR, source: FILM }, AT);
    scheduleProgramme(c, {
      startsAt: at(1), durationMs: 4 * HOUR, source: FILM, loop: true,
    }, AT);
    expect(c.programmes).toHaveLength(3);
    expect(referencedAssets(c)).toHaveLength(1);
  });

  /*
   * A programme has no field that could hold media, so the check is that
   * nothing in the document names a path, a buffer or a directory. Written as
   * a property of the serialised document rather than of the type, because
   * the type is what a future edit would change.
   */
  it('nothing a programme stores could be a file', () => {
    const c = channel();
    scheduleProgramme(c, {
      startsAt: at(9), durationMs: HOUR, source: FILM, fromMs: 30_000,
    }, AT);
    const written = JSON.stringify(c.programmes[0]);
    expect(written).not.toMatch(/\.mp4|\.webm|\.ts\b|\/var\/|path|bytes|file/i);
    expect(Object.keys(c.programmes[0]!.source).sort())
      .toEqual(['document', 'documentId', 'kind', 'planHash']);
  });

  /*
   * The mirror of the rule. A channel never made the file, so a channel never
   * deletes it — dropping the breakfast repeat must not remove the
   * performance its author spent a week on.
   */
  it('taking a programme off the schedule leaves the other showings alone', () => {
    const c = channel();
    scheduleProgramme(c, { startsAt: at(7), durationMs: HOUR, source: FILM }, AT);
    scheduleProgramme(c, { startsAt: at(13), durationMs: HOUR, source: FILM }, AT);
    removeProgramme(c, c.programmes[0]!.id);
    expect(c.programmes).toHaveLength(1);
    expect(referencedAssets(c)).toHaveLength(1);
  });

  it('a programme with no time zone is refused, because 09:00 is not an instant', () => {
    const c = channel();
    expect(() => scheduleProgramme(
      c, { startsAt: '2026-10-01T09:00:00', durationMs: HOUR, source: FILM }, AT,
    )).toThrow(ChannelEditError);
    expect(c.programmes).toHaveLength(0);
  });

  it('and one that names a render nobody could have made is refused', () => {
    const c = channel();
    expect(() => scheduleProgramme(c, {
      startsAt: at(9), durationMs: HOUR,
      source: { kind: 'render', document: 'performance', documentId: '../../etc', planHash: 'x' },
    }, AT)).toThrow(ChannelEditError);
  });
});

describe('only two things make media (§5, §6, D-18)', () => {
  /*
   * Named for what they do, and they are the only two. A test that counted
   * functions would rot; this counts ASSET IDS, which is what the rule is
   * actually about.
   */
  it('scheduling all day mints no asset id at all', () => {
    const c = channel();
    for (let hour = 0; hour < 24; hour += 1) {
      scheduleProgramme(c, {
        startsAt: at(hour), durationMs: HOUR, source: hour % 2 ? FILM : DEBATE,
      }, AT);
    }
    expect(c.ingests).toHaveLength(0);
    expect(c.recordings).toHaveLength(0);
  });

  it('opening a live feed mints exactly one, and it belongs to the feed', () => {
    const c = channel();
    const ingest = openIngest(c, 'The nine o\'clock news', AT);
    expect(c.ingests).toHaveLength(1);
    expect(ingest.assetId).toMatch(/^asset_/);
    expect(ingest.closedAt).toBeUndefined();
  });

  it('two open feeds at once are refused — one wire, one live', () => {
    const c = channel();
    openIngest(c, 'Studio', AT);
    expect(() => openIngest(c, 'Outside broadcast', AT)).toThrow(ChannelEditError);
  });

  /*
   * A feed that dropped for ninety seconds was open for an hour and is
   * fifty-eight and a half minutes long. The measurement is passed in; the
   * subtraction is not trusted.
   */
  it('a closed feed carries a measured length, not the clock difference', () => {
    const c = channel();
    const ingest = openIngest(c, 'Studio', at(9));
    closeIngest(c, ingest.id, at(10), 58.5 * MINUTE);
    expect(c.ingests[0]!.durationMs).toBe(58.5 * MINUTE);
    expect(programmeEnd).toBeDefined();
  });

  it('and it can then be scheduled like anything else, without a second copy', () => {
    const c = channel();
    const ingest = openIngest(c, 'Studio', at(9));
    closeIngest(c, ingest.id, at(10), HOUR);
    scheduleProgramme(c, {
      startsAt: at(22), durationMs: HOUR,
      source: { kind: 'live', ingestId: ingest.id }, title: 'News, repeated',
    }, AT);
    expect(referencedAssets(c)).toHaveLength(1);
    expect(c.ingests).toHaveLength(1);
  });

  it('a recording is made because somebody asked, and the document says who', () => {
    const c = channel();
    const recording = requestRecording(c, {
      label: 'The debate', fromAt: at(20), toAt: at(22), requestedBy: 'James',
    }, AT);
    expect(recording.requestedBy).toBe('James');
    expect(recording.assetId).toMatch(/^asset_/);
  });

  it('and one nobody asked for is refused', () => {
    const c = channel();
    expect(() => requestRecording(c, {
      label: 'Everything', fromAt: at(0), toAt: at(23), requestedBy: '  ',
    }, AT)).toThrow(ChannelEditError);
  });
});

describe('two pictures cannot go down one wire (§2)', () => {
  it('an overlapping programme is refused rather than reported', () => {
    const c = channel();
    scheduleProgramme(c, { startsAt: at(9), durationMs: 2 * HOUR, source: FILM }, AT);
    expect(() => scheduleProgramme(
      c, { startsAt: at(10), durationMs: HOUR, source: DEBATE }, AT,
    )).toThrow(ChannelEditError);
    expect(c.programmes).toHaveLength(1);
  });

  it('but a programme moved onto its own old slot is not a clash with itself', () => {
    const c = channel();
    const one = scheduleProgramme(
      c, { startsAt: at(9), durationMs: HOUR, source: FILM }, AT);
    moveProgramme(c, one.id, { durationMs: 90 * MINUTE });
    expect(c.programmes[0]!.durationMs).toBe(90 * MINUTE);
  });

  it('the order is derived from the clock, never stored', () => {
    const c = channel();
    scheduleProgramme(c, { startsAt: at(20), durationMs: HOUR, source: FILM }, AT);
    scheduleProgramme(c, { startsAt: at(7), durationMs: HOUR, source: DEBATE }, AT);
    expect(orderedProgrammes(c).map((p) => p.startsAt)).toEqual([at(7), at(20)]);
    // The array itself is untouched: nothing reorders the document.
    expect(c.programmes.map((p) => p.startsAt)).toEqual([at(20), at(7)]);
  });

  it('and a document that somehow holds an overlap can say so', () => {
    const c = channel();
    scheduleProgramme(c, { startsAt: at(9), durationMs: HOUR, source: FILM }, AT);
    scheduleProgramme(c, { startsAt: at(11), durationMs: HOUR, source: DEBATE }, AT);
    expect(overlaps(c)).toHaveLength(0);
    c.programmes[0]!.durationMs = 3 * HOUR;
    expect(overlaps(c)).toHaveLength(1);
  });
});

describe('what is on air, and what is next (§2, §7)', () => {
  function evening(): Channel {
    const c = channel();
    scheduleProgramme(
      c, { startsAt: at(20), durationMs: HOUR, source: FILM, title: 'The film' }, AT);
    scheduleProgramme(
      c, { startsAt: at(21), durationMs: HOUR, source: DEBATE, title: 'The debate' }, AT);
    return c;
  }

  it('answers with the programme that owns the instant', () => {
    const c = evening();
    expect(onAirAt(c, Date.parse(at(20, 30)))?.title).toBe('The film');
    expect(onAirAt(c, Date.parse(at(21, 30)))?.title).toBe('The debate');
  });

  it('the last instant of a programme belongs to the next one', () => {
    const c = evening();
    expect(onAirAt(c, Date.parse(at(21)))?.title).toBe('The debate');
  });

  it('and before the first and after the last, nothing is on', () => {
    const c = evening();
    expect(onAirAt(c, Date.parse(at(19)))).toBeUndefined();
    expect(onAirAt(c, Date.parse(at(23)))).toBeUndefined();
    expect(nextAfter(c, Date.parse(at(19)))?.title).toBe('The film');
    expect(nextAfter(c, Date.parse(at(23)))).toBeUndefined();
  });

  it('the holes in an evening are found before they go out', () => {
    const c = channel();
    scheduleProgramme(c, { startsAt: at(20), durationMs: HOUR, source: FILM }, AT);
    expect(gaps(c, Date.parse(at(19)), Date.parse(at(22)))).toEqual([
      { fromAt: Date.parse(at(19)), toAt: Date.parse(at(20)) },
      { fromAt: Date.parse(at(21)), toAt: Date.parse(at(22)) },
    ]);
  });
});

describe('the playout engine reads, and produces nothing (§7, D-18)', () => {
  const lengths = (source: ProgrammeSource): number | undefined => (
    sourceKey(source) === sourceKey(FILM) ? 10 * MINUTE
      : sourceKey(source) === sourceKey(DEBATE) ? HOUR : undefined);

  it('every instruction it emits is a read of a reference', () => {
    const c = channel();
    scheduleProgramme(c, { startsAt: at(20), durationMs: HOUR, source: DEBATE }, AT);
    const reads = playoutWindow(
      c, Date.parse(at(20)), Date.parse(at(21)), lengths);
    expect(reads).toHaveLength(1);
    expect(reads[0]).toMatchObject({
      atMs: Date.parse(at(20)), durationMs: HOUR, fromMs: 0, source: DEBATE,
    });
    // Nothing in a read names an output.
    expect(JSON.stringify(reads)).not.toMatch(/out|write|\.ts\b|\.mp4/i);
  });

  /*
   * Ten minutes of film in a thirty-minute slot. The arithmetic that makes a
   * loop possible without anybody cutting anything — and the reason the
   * engine is a pure function, because this is where an off-by-one lives.
   */
  it('a looping programme is read again from its own beginning each pass', () => {
    const c = channel();
    scheduleProgramme(c, {
      startsAt: at(20), durationMs: 30 * MINUTE, source: FILM, loop: true,
    }, AT);
    const reads = playoutWindow(
      c, Date.parse(at(20)), Date.parse(at(20, 30)), lengths);
    expect(reads).toHaveLength(3);
    expect(reads.map((read) => read.fromMs)).toEqual([0, 0, 0]);
    expect(reads.map((read) => read.durationMs))
      .toEqual([10 * MINUTE, 10 * MINUTE, 10 * MINUTE]);
    // Three passes over one asset is still one asset.
    expect(distinctAssetsRead(reads)).toBe(1);
  });

  it('and joining a loop halfway through lands halfway through a pass', () => {
    const c = channel();
    scheduleProgramme(c, {
      startsAt: at(20), durationMs: 30 * MINUTE, source: FILM, loop: true,
    }, AT);
    const reads = playoutWindow(
      c, Date.parse(at(20, 15)), Date.parse(at(20, 20)), lengths);
    expect(reads[0]!.fromMs).toBe(5 * MINUTE);
  });

  /*
   * The fault an editor has to be shown before it happens, not after: a
   * ten-minute film in an hour slot is fifty minutes of something, and the
   * engine says what.
   */
  it('a programme shorter than its slot runs out, and the engine says so', () => {
    const c = channel();
    scheduleProgramme(c, { startsAt: at(20), durationMs: HOUR, source: FILM }, AT);
    const reads = playoutWindow(
      c, Date.parse(at(20)), Date.parse(at(21)), lengths);
    expect(reads).toHaveLength(2);
    expect(reads[0]!.durationMs).toBe(10 * MINUTE);
    expect(reads[1]!.offAir).toBe(true);
    expect(reads[1]!.durationMs).toBe(50 * MINUTE);
  });

  it('unless there is filler, which covers the hole and loops itself', () => {
    const c = channel();
    setFiller(c, DEBATE);
    scheduleProgramme(c, { startsAt: at(20), durationMs: HOUR, source: FILM }, AT);
    const reads = playoutWindow(
      c, Date.parse(at(20)), Date.parse(at(21)), lengths);
    expect(reads[1]!.offAir).toBeUndefined();
    expect(sourceKey(reads[1]!.source)).toBe(sourceKey(DEBATE));
    expect(distinctAssetsRead(reads)).toBe(2);
  });

  it('a live feed cannot be the filler, because filler has to always be there', () => {
    const c = channel();
    const ingest = openIngest(c, 'Studio', AT);
    expect(() => setFiller(c, { kind: 'live', ingestId: ingest.id }))
      .toThrow(ChannelEditError);
  });

  it('dead air is named before it is broadcast', () => {
    const c = channel();
    scheduleProgramme(c, { startsAt: at(20), durationMs: HOUR, source: FILM }, AT);
    expect(deadAir(c, Date.parse(at(19)), Date.parse(at(22)))).toHaveLength(2);
    setFiller(c, DEBATE);
    expect(deadAir(c, Date.parse(at(19)), Date.parse(at(22)))).toHaveLength(0);
  });

  /*
   * A whole broadcast day, which is the number the rule is about. Six
   * showings of two films is a day of television and two files.
   */
  it('a day that repeats two programmes six times reads from two assets', () => {
    const c = channel();
    for (let hour = 0; hour < 12; hour += 1) {
      scheduleProgramme(c, {
        startsAt: at(hour), durationMs: HOUR, source: hour % 2 ? FILM : DEBATE,
        loop: true,
      }, AT);
    }
    const reads = playoutWindow(c, Date.parse(at(0)), Date.parse(at(12)), lengths);
    expect(reads.length).toBeGreaterThan(12);
    expect(distinctAssetsRead(reads)).toBe(2);
  });
});

describe('the stream is a window, not an archive (§7)', () => {
  it('segments are aligned to the epoch, so every viewer agrees where they are', () => {
    expect(segmentIndexAt(0)).toBe(0);
    expect(segmentIndexAt(SEGMENT_MS - 1)).toBe(0);
    expect(segmentIndexAt(SEGMENT_MS)).toBe(1);
    // Two players joining a second apart compute the same boundary.
    expect(segmentIndexAt(1_000_000_000)).toBe(segmentIndexAt(1_000_000_999));
  });

  it('the playlist names a rolling window and never the segment being made', () => {
    const now = 1_000_000 * SEGMENT_MS + 1234;
    const text = livePlaylist(now, (index) => `${index}.ts`);
    const named = text.split('\n').filter((line) => line.endsWith('.ts'));
    expect(named).toHaveLength(WINDOW_SEGMENTS);
    expect(named).not.toContain('1000000.ts');
    expect(named[named.length - 1]).toBe('999999.ts');
    expect(text).toContain('#EXT-X-MEDIA-SEQUENCE:999994');
    // A channel, unlike a video, is expected to know what time it is.
    expect(text).toContain('#EXT-X-PROGRAM-DATE-TIME:');
  });

  it('and it is a live playlist, so it never says it has ended', () => {
    const text = livePlaylist(1_000_000 * SEGMENT_MS, (index) => `${index}.ts`);
    expect(text).not.toContain('#EXT-X-ENDLIST');
  });
});

describe('INV-17, asserted against what is on disk', () => {
  /*
   * The document cannot express a copy, so checking the document would prove
   * only that TypeScript works. What can go wrong is a WRITER, so the check
   * is handed the channel's own assets and insists each one is accounted for.
   */
  it('a channel holding nothing but its live feed and its recording passes', () => {
    const c = channel();
    const ingest = openIngest(c, 'Studio', AT);
    closeIngest(c, ingest.id, AT, HOUR);
    const recording = requestRecording(c, {
      label: 'The debate', fromAt: at(20), toAt: at(22), requestedBy: 'James',
    }, AT);
    expect(() => assertChannelOwnsNoScheduledMedia(
      c, [ingest.assetId, recording.assetId])).not.toThrow();
  });

  it('and one holding a file that no feed and no request accounts for does not', () => {
    const c = channel();
    scheduleProgramme(c, { startsAt: at(9), durationMs: HOUR, source: FILM }, AT);
    expect(() => assertChannelOwnsNoScheduledMedia(c, ['asset_staged_for_playout']))
      .toThrow(InvariantViolation);
  });

  it('a schedule whose render has been deleted is a fault, not a silent black hour', () => {
    const c = channel();
    scheduleProgramme(c, { startsAt: at(9), durationMs: HOUR, source: FILM }, AT);
    expect(() => assertScheduleResolves(c, [])).not.toThrow();
    expect(() => assertScheduleResolves(c, [FILM])).toThrow(InvariantViolation);
  });
});

describe('the rotation, which is why the channel is always online (§4)', () => {
  /*
   *     00:00  Music Video — Everlasting Love
   *     04:17  History Discussion
   *     28:42  Music Video — Performance 2
   *     ...
   *     When the schedule reaches the end: it continues from the beginning.
   *
   * The times in that listing are not times of day; they are the sum of what
   * comes before. So the offsets are derived, and moving an entry to the top
   * moves everything after it without anybody editing a clock.
   */
  function loop(): Channel {
    const c = newChannel('Always On', 'Africa/Lagos', AT);
    c.rotationFrom = at(0);
    addToRotation(c, {
      source: FILM, durationMs: 4 * MINUTE + 17_000, title: 'Everlasting Love',
    }, AT);
    addToRotation(c, {
      source: DEBATE, durationMs: 24 * MINUTE + 25_000, title: 'History Discussion',
    }, AT);
    addToRotation(c, {
      source: FILM, durationMs: 4 * MINUTE + 28_000, title: 'Performance 2',
    }, AT);
    return c;
  }

  it('the listing column is derived from the durations, never stored', () => {
    const c = loop();
    expect(rotationOffsets(c)).toEqual([0, 257_000, 1_722_000]);
    expect(rotationLengthMs(c)).toBe(1_990_000);
  });

  it('and moving one to the top moves everything after it', () => {
    const c = loop();
    moveInRotation(c, c.rotation[2]!.id, 0);
    expect(c.rotation.map((entry) => entry.title))
      .toEqual(['Performance 2', 'Everlasting Love', 'History Discussion']);
    expect(rotationOffsets(c)[0]).toBe(0);
    // Nobody edited a time, and the whole listing moved.
    expect(rotationOffsets(c)).toEqual([0, 268_000, 525_000]);
  });

  it('when it reaches the end, it continues from the beginning', () => {
    const c = loop();
    const turn = rotationLengthMs(c);
    const start = Date.parse(at(0));
    expect(rotationAt(c, start)?.entry.title).toBe('Everlasting Love');
    expect(rotationAt(c, start + turn)?.entry.title).toBe('Everlasting Love');
    expect(rotationAt(c, start + turn)?.intoMs).toBe(0);
    // Forty turns later it is still exactly where the arithmetic says.
    expect(rotationAt(c, start + 40 * turn + 300_000)?.entry.title)
      .toBe('History Discussion');
  });

  /*
   * A channel is a loop with no beginning as far as a viewer is concerned, so
   * an instant before the rotation was created still lands somewhere in it
   * rather than on index -1.
   */
  it('and an instant before it started lands in it too, not outside it', () => {
    const c = loop();
    const before = Date.parse(at(0)) - 3 * rotationLengthMs(c) - 100_000;
    const found = rotationAt(c, before);
    expect(found).toBeDefined();
    expect(found!.index).toBeGreaterThanOrEqual(0);
    expect(found!.intoMs).toBeGreaterThanOrEqual(0);
  });

  /*
   * THE BRIEF'S PROMISE, as the function that would have to return something
   * for it to be untrue.
   */
  it('a channel with a rotation has no dead air, ever', () => {
    const c = loop();
    const start = Date.parse(at(0));
    expect(deadAir(c, start, start + 7 * 24 * HOUR)).toHaveLength(0);
    const reads = playoutWindow(c, start, start + HOUR, () => 30 * MINUTE);
    expect(reads.every((read) => !read.offAir)).toBe(true);
    /* An hour of television out of two files. */
    expect(distinctAssetsRead(reads)).toBe(2);
  });

  it('and a fixed programme pre-empts the loop for its slot, then the loop returns', () => {
    const c = loop();
    scheduleProgramme(c, {
      startsAt: at(20), durationMs: HOUR, source: DEBATE, title: 'The nine o\'clock',
    }, AT);
    expect(whatIsOn(c, Date.parse(at(19, 30))).kind).toBe('rotation');
    const during = whatIsOn(c, Date.parse(at(20, 30)));
    expect(during.kind).toBe('programme');
    expect(during.kind === 'programme' && during.programme.title).toBe('The nine o\'clock');
    expect(whatIsOn(c, Date.parse(at(21, 30))).kind).toBe('rotation');
  });

  it('taking a turn out of the loop leaves the media alone', () => {
    const c = loop();
    removeFromRotation(c, c.rotation[0]!.id);
    expect(c.rotation).toHaveLength(2);
    expect(referencedAssets(c)).toHaveLength(2);
  });

  it('and the loop is references like everything else — three turns, two files', () => {
    const c = loop();
    expect(c.rotation).toHaveLength(3);
    expect(referencedAssets(c)).toHaveLength(2);
  });
});

describe('the red button (§5)', () => {
  function ready(): Channel {
    const c = newChannel('Always On', 'UTC', AT);
    c.rotationFrom = at(0);
    addToRotation(c, { source: FILM, durationMs: 30 * MINUTE, title: 'The film' }, AT);
    scheduleProgramme(c, {
      startsAt: at(20), durationMs: HOUR, source: DEBATE, title: 'The debate',
    }, AT);
    return c;
  }

  it('going live pre-empts a scheduled programme, which is what it is for', () => {
    const c = ready();
    expect(whatIsOn(c, Date.parse(at(20, 30))).kind).toBe('programme');
    goLive(c, 'Studio', at(20, 10));
    expect(whatIsOn(c, Date.parse(at(20, 30))).kind).toBe('live');
  });

  it('and it opens a feed, which is one of the two things that make media', () => {
    const c = ready();
    const session = goLive(c, 'Studio', at(20));
    expect(c.ingests).toHaveLength(1);
    expect(c.ingests[0]!.id).toBe(session.ingestId);
    expect(c.ingests[0]!.closedAt).toBeUndefined();
  });

  it('but it does not touch the schedule, so the listings stay true', () => {
    const c = ready();
    const before = JSON.stringify({ p: c.programmes, r: c.rotation });
    goLive(c, 'Studio', at(20));
    expect(JSON.stringify({ p: c.programmes, r: c.rotation })).toBe(before);
  });

  it('twice is refused — one channel, one red light', () => {
    const c = ready();
    goLive(c, 'Studio', at(20));
    expect(() => goLive(c, 'Outside', at(20, 5))).toThrow(ChannelEditError);
  });

  /*
   * "You can bring up Studio One conversations, Studio Two performances,
   *  videos, images, graphics, announcements, prepared segments."
   */
  it('something rolled in is what goes out, and the feed is underneath it', () => {
    const c = ready();
    goLive(c, 'Studio', at(20));
    rollIn(c, DEBATE, 90_000);
    const on = whatIsOn(c, Date.parse(at(20, 10)));
    expect(on.kind).toBe('live');
    expect(on.kind !== 'off' && sourceKey(on.source)).toBe(sourceKey(DEBATE));
    expect(on.kind !== 'off' && on.fromMs).toBe(90_000);
  });

  it('and taking it down returns to the room with nothing re-cued', () => {
    const c = ready();
    const session = goLive(c, 'Studio', at(20));
    rollIn(c, DEBATE);
    rollIn(c, null);
    const on = whatIsOn(c, Date.parse(at(20, 10)));
    expect(on.kind !== 'off' && sourceKey(on.source)).toBe(`live:${session.ingestId}`);
  });

  it('the room is the room that already exists, named rather than rebuilt', () => {
    const c = ready();
    const session = goLive(c, 'Studio', at(20), 'conv_the_long_way');
    expect(session.roomId).toBe('conv_the_long_way');
  });

  /*
   * "and the scheduled channel automatically resumes" — where the clock says,
   * not where it paused. An hour of live television means the rotation has
   * moved an hour on, exactly as it does on any broadcast channel.
   */
  it('ending it resumes where the clock says, not where it paused', () => {
    const c = ready();
    goLive(c, 'Studio', at(20));
    endLive(c, at(21), HOUR);
    const on = whatIsOn(c, Date.parse(at(21, 10)));
    expect(on.kind).toBe('rotation');
    /* 21:10 is 70 minutes past a thirty-minute turn, so ten minutes in. */
    expect(on.kind === 'rotation' && on.fromMs).toBe(10 * MINUTE);
  });

  it('and the feed it opened becomes an ordinary asset, schedulable like any other', () => {
    const c = ready();
    const session = goLive(c, 'Studio', at(20));
    endLive(c, at(21), 58 * MINUTE);
    expect(c.ingests[0]!.closedAt).toBe(at(21));
    expect(c.ingests[0]!.durationMs).toBe(58 * MINUTE);
    scheduleProgramme(c, {
      startsAt: at(23), durationMs: HOUR,
      source: { kind: 'live', ingestId: session.ingestId }, title: 'Live, repeated',
    }, AT);
    /* The repeat is a reference. No second copy of an hour of television. */
    expect(referencedAssets(c).filter((s) => s.kind === 'live')).toHaveLength(1);
  });

  it('ending a channel that is not live is refused rather than ignored', () => {
    const c = ready();
    expect(() => endLive(c, at(21))).toThrow(ChannelEditError);
    expect(() => rollIn(c, DEBATE)).toThrow(ChannelEditError);
  });
});

describe('other media — the library\'s third branch (§3)', () => {
  const IDENT: ProgrammeSource = {
    kind: 'media', assetId: 'asset_ident', form: 'video',
  };
  const CARD: ProgrammeSource = {
    kind: 'media', assetId: 'asset_card', form: 'image',
  };

  it('an ident and a caption card schedule like anything else', () => {
    const c = newChannel('With Idents', 'UTC', AT);
    addToRotation(c, { source: IDENT, durationMs: 10_000, title: 'Ident' }, AT);
    addToRotation(c, { source: FILM, durationMs: 30 * MINUTE, title: 'The film' }, AT);
    addToRotation(c, { source: CARD, durationMs: 15_000, title: 'Up next' }, AT);
    expect(c.rotation).toHaveLength(3);
    expect(referencedAssets(c)).toHaveLength(3);
  });

  it('and an ident used twenty times is still one file', () => {
    const c = newChannel('With Idents', 'UTC', AT);
    for (let turn = 0; turn < 20; turn += 1) {
      addToRotation(c, { source: IDENT, durationMs: 10_000 }, AT);
      addToRotation(c, { source: FILM, durationMs: 5 * MINUTE }, AT);
    }
    expect(c.rotation).toHaveLength(40);
    expect(referencedAssets(c)).toHaveLength(2);
  });
});
