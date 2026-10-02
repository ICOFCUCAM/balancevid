/**
 * What actually went out.  [Doctrine CHANNEL §5, §18, D-18, D-20, C-32]
 *
 * The audit's last open row: *"As-run | None | A log of what actually
 * transmitted, which broadcasters need."*
 *
 * THE DISTINCTION THESE TESTS EXIST TO HOLD. This product already has
 * an audit log, and it records what somebody DID TO THE DOCUMENT. An
 * as-run records what came out of the transmitter, and the two
 * disagree exactly when it matters — a programme that was scheduled
 * and never played is in one and not the other. A log derived from
 * the schedule would report a ten-minute encoder failure as ten
 * perfect minutes. [C-24]
 */

import { describe, expect, it } from 'vitest';

import type { ProgrammeSource } from '../../src/domain/channel.js';
import { SEGMENT_MS } from '../../src/domain/playout.js';
import {
  AS_RUN_COLUMNS, type Aired, type Ran,
  asRunCsv, fold, secondsOf, wasClean,
} from '../../src/domain/asRun.js';

const FILM: ProgrammeSource = { kind: 'media', assetId: 'ast_film', form: 'video' };
const TALK: ProgrammeSource = { kind: 'media', assetId: 'ast_talk', form: 'video' };

const seg = (index: number, over: Partial<Aired> = {}): Aired => ({
  index, source: FILM, title: 'A Film', fellBack: false, ...over,
});

/** Fold a run of segments, as the engine would. */
const run = (aired: Aired[]): Ran[] => aired.reduce(fold, [] as Ran[]);

describe('four seconds at a time becomes a stretch (C-32)', () => {
  it('joins consecutive segments of the same thing', () => {
    const log = run([seg(100), seg(101), seg(102)]);
    expect(log).toHaveLength(1);
    expect(log[0]!.segments).toBe(3);
    expect(log[0]!.fromMs).toBe(100 * SEGMENT_MS);
    expect(log[0]!.toMs).toBe(103 * SEGMENT_MS);
    expect(secondsOf(log[0]!)).toBe(3 * SEGMENT_MS / 1000);
  });

  it('starts a new entry when the thing changes', () => {
    const log = run([seg(10), seg(11),
      seg(12, { source: TALK, title: 'A Talk' })]);
    expect(log.map((one) => one.title)).toEqual(['A Film', 'A Talk']);
    expect(log[0]!.toMs).toBe(log[1]!.fromMs);
  });

  /*
   * A GAP STARTS A NEW ENTRY EVEN WHEN THE THING IS THE SAME. The
   * engine can be stopped and restarted, and joining across the hole
   * would be the log claiming continuous transmission across exactly
   * the outage it exists to record.
   */
  it('does not join across an outage', () => {
    const log = run([seg(10), seg(11), seg(40), seg(41)]);
    expect(log).toHaveLength(2);
    expect(log[0]!.toMs).toBe(12 * SEGMENT_MS);
    expect(log[1]!.fromMs).toBe(40 * SEGMENT_MS);
    /* And the hole is visible as the space between them. */
    expect(log[1]!.fromMs - log[0]!.toMs).toBe(28 * SEGMENT_MS);
  });

  it('tiles without gaps when there was no gap', () => {
    const log = run([seg(1), seg(2, { source: TALK, title: 'A Talk' }), seg(3)]);
    for (let at = 1; at < log.length; at += 1) {
      expect(log[at]!.fromMs).toBe(log[at - 1]!.toMs);
    }
  });

  it('tells two things apart that share a title', () => {
    const log = run([seg(1), seg(2, { source: TALK })]);
    expect(log).toHaveLength(2);
  });

  it('tells two things apart that share a source', () => {
    const log = run([seg(1), seg(2, { title: 'Renamed' })]);
    expect(log).toHaveLength(2);
  });

  it('records an off-air stretch as a stretch', () => {
    const log = run([seg(1, { source: null, title: 'Off air' }),
      seg(2, { source: null, title: 'Off air' })]);
    expect(log).toHaveLength(1);
    expect(log[0]!.source).toBe(null);
  });

  it('starts from nothing without complaining', () => {
    expect(run([])).toEqual([]);
    expect(asRunCsv([])).toBe(`${AS_RUN_COLUMNS.join(',')}\n`);
  });
});

describe('what the encoder could not render (C-24, C-32)', () => {
  /*
   * THE REASON A SCHEDULE-DERIVED LOG WOULD BE WORTHLESS. Those four
   * seconds were black on the wire and perfect in the document.
   */
  it('counts the segments that fell back to black', () => {
    const log = run([seg(1), seg(2, { fellBack: true }), seg(3)]);
    expect(log).toHaveLength(1);
    expect(log[0]!.segments).toBe(3);
    expect(log[0]!.blackSegments).toBe(1);
    expect(wasClean(log[0]!)).toBe(false);
  });

  it('calls a stretch that rendered throughout clean', () => {
    expect(wasClean(run([seg(1), seg(2)])[0]!)).toBe(true);
  });

  /*
   * A COUNT AND NOT A FLAG. "Three segments of a thirty-minute
   * programme were black" and "all of it was black" are different
   * events, and a regulator asking about the second does not want to
   * be shown the first.
   */
  it('separates a glitch from a whole programme lost', () => {
    const glitch = run([seg(1), seg(2, { fellBack: true }), seg(3), seg(4)]);
    const lost = run([1, 2, 3, 4].map((n) => seg(n, { fellBack: true })));
    expect(glitch[0]!.blackSegments).toBe(1);
    expect(lost[0]!.blackSegments).toBe(4);
    expect(lost[0]!.blackSegments).toBe(lost[0]!.segments);
  });

  /* A failure does not break the stretch: the programme was on air
     throughout, and some of it did not render. Splitting would claim
     three programmes where there was one. */
  it('does not split a programme at a failure', () => {
    expect(run([seg(1), seg(2, { fellBack: true }), seg(3)])).toHaveLength(1);
  });
});

describe('the file a broadcaster is handed (C-32)', () => {
  const log = run([seg(1), seg(2, { fellBack: true }),
    seg(3, { source: TALK, title: 'A Talk' })]);

  it('has a header and a row per stretch', () => {
    const lines = asRunCsv(log).trimEnd().split('\n');
    expect(lines[0]).toBe(AS_RUN_COLUMNS.join(','));
    expect(lines).toHaveLength(1 + log.length);
  });

  /*
   * TIMES IN UTC AND IN FULL. A log in the channel's local zone is
   * ambiguous for one hour every autumn, which is exactly the hour
   * somebody will ask about.
   */
  it('writes instants in UTC', () => {
    const [, first] = asRunCsv(log).split('\n');
    expect(first!.split(',')[0]).toMatch(/Z$/);
    expect(first!.split(',')[0]).toBe(new Date(1 * SEGMENT_MS).toISOString());
  });

  it('names the asset, so a row can be traced to a file', () => {
    expect(asRunCsv(log)).toContain('ast_film');
    expect(asRunCsv(log)).toContain('ast_talk');
  });

  it('reports the black time in seconds, not segments', () => {
    const [, first] = asRunCsv(log).split('\n');
    expect(first!.split(',').pop()).toBe(String(SEGMENT_MS / 1000));
  });

  /* A title with a comma in it is a title, not two columns. */
  it('survives a title that would break the columns', () => {
    const nasty = run([seg(1, { title: 'Live, from "the" room\nnow' })]);
    const lines = asRunCsv(nasty).trimEnd().split('\n');
    expect(lines).toHaveLength(2 + 1);  /* the title's own newline */
    expect(asRunCsv(nasty)).toContain('""the""');
  });

  it('says none rather than nothing for an off-air stretch', () => {
    const off = run([seg(1, { source: null, title: 'Off air' })]);
    expect(asRunCsv(off)).toContain(',none,');
  });
});
