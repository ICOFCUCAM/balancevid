/**
 * A channel no viewer can reach is still being encoded.
 *   [CHANNEL §7, §17, §18; Doctrine D-13, D-18, D-21, U-02, U-16]
 *
 * THE WORD "published" APPEARED NOWHERE IN THE PLAYOUT ENGINE. It
 * encoded every channel it owned — reachable or not, looked at or
 * not, for ever. An unpublished channel's segments are refused to
 * everyone but its owner by the segment route, so a draft channel
 * had H.264 made for it every four seconds and declined at the
 * door, until somebody deleted it.
 *
 * WHAT THIS IS NOT, SAID FIRST BECAUSE IT WAS NEARLY SHIPPED AS A
 * LIE. This was written while chasing a control room reporting
 * 111% of real time over seventeen channels, on the theory that
 * they were unpublished and the engine was working for nobody.
 * **All seventeen were published.** The count that said otherwise
 * had read `channel.published`; the field is `channel.publication`.
 * So this saves that installation nothing, and the remedy for a
 * box with seventeen live channels is the one `paceSays` now
 * names: another playout service. [pace.ts, shard.ts]
 *
 * It is kept because the draft case is real and arrives the moment
 * anybody builds a channel before publishing it.
 *
 * AND A PUBLISHED CHANNEL IS STILL ENCODED WHETHER ANYBODY IS
 * WATCHING OR NOT, which is the line that must not move. The
 * cheaper rule — count the viewers — would take a channel off the
 * air between two of them, and a channel that runs only while
 * observed is not a channel. [§7]
 */

import { describe, expect, it } from 'vitest';

import {
  KEEP_WARM_MS, idleSays, needsSegments, type Channel,
} from '../../src/domain/channel.js';

const AT = '2026-10-07T09:00:00.000Z';
const NOW = Date.parse('2026-10-07T12:00:00.000Z');

function channel(over: Record<string, unknown> = {}): Channel {
  return {
    schemaVersion: 1, id: 'chan_test', name: 'Test', timezone: 'UTC',
    programmes: [], rotation: [], blocks: [], ingests: [], recordings: [],
    createdAt: AT, updatedAt: AT, ...over,
  } as unknown as Channel;
}

describe('does anybody need this channel encoded', () => {
  /*
   * THE RULE THAT MUST NOT MOVE. A published channel is made at
   * every instant because the public can tune in at any instant.
   */
  it('yes, if it is published — whether or not anybody is watching', () => {
    const one = channel({ publication: { at: AT } });
    expect(needsSegments(one, NOW).encode).toBe(true);
    expect(needsSegments(one, NOW).why).toBe('published');
    /* Nobody has opened it in a week. Still encoded. */
    expect(needsSegments(one, NOW, NOW - 7 * 24 * 3_600_000).encode).toBe(true);
  });

  it('and not once it has been unpublished', () => {
    const one = channel({ publication: { at: AT, unpublishedAt: AT } });
    expect(needsSegments(one, NOW).encode).toBe(false);
  });

  /*
   * THE RED BUTTON OUTRANKS EVERYTHING. Whatever else is true, a
   * broadcast that is on air is going out now.
   */
  it('yes, if it is live, published or not', () => {
    const one = channel({ live: { phase: 'on_air', ingestId: 'ing_1' } });
    expect(needsSegments(one, NOW)).toEqual({ encode: true, why: 'live' });
  });

  it('and not once the broadcast has ended', () => {
    const one = channel({ live: { phase: 'ended', ingestId: 'ing_1' } });
    expect(needsSegments(one, NOW).encode).toBe(false);
  });

  /*
   * AND A DRAFT STILL HAS TO SHOW ITS OWNER A PICTURE, because
   * that preview is how anybody decides it is ready to publish. An
   * engine that skipped every unpublished channel would hand the
   * operator a black monitor and no way to get one. [watching.ts]
   */
  it('yes, while somebody has the control room open on it', () => {
    const one = channel();
    expect(needsSegments(one, NOW, NOW - 5_000))
      .toEqual({ encode: true, why: 'watched' });
    expect(needsSegments(one, NOW, NOW - KEEP_WARM_MS + 1).encode).toBe(true);
  });

  it('and stops once nobody has looked for a while', () => {
    const one = channel();
    expect(needsSegments(one, NOW, NOW - KEEP_WARM_MS - 1).encode).toBe(false);
    expect(needsSegments(one, NOW, NOW - 3_600_000).why).toBe('idle');
  });

  /*
   * THE WARM WINDOW IS LONGER THAN THE POLL THAT FEEDS IT, or a
   * studio left open would flicker between warm and idle. The
   * control room re-reads every ten seconds.
   */
  it('stays warm across several of the control room’s polls', () => {
    expect(KEEP_WARM_MS).toBeGreaterThan(10_000 * 3);
  });

  /*
   * NOT LOOKED AT IS NOT LOOKED AT LONG AGO. A channel nobody has
   * ever opened has no mark on disk, and `undefined` must not read
   * as a timestamp. [D-21]
   */
  it('treats never-opened and unreadable the same, and as neither', () => {
    const one = channel();
    expect(needsSegments(one, NOW, undefined).encode).toBe(false);
    expect(needsSegments(one, NOW, Number.NaN).encode).toBe(false);
  });

  /*
   * AND A CLOCK THAT RAN BACKWARDS IS NOT A REASON TO GO DARK. A
   * mark in the future is somebody looking right now by any
   * sensible reading, and the failure that matters here is the one
   * that stops a picture.
   */
  it('does not go dark on a mark from the future', () => {
    expect(needsSegments(channel(), NOW, NOW + 60_000).encode).toBe(true);
  });
});

describe('and it is said out loud', () => {
  /*
   * A CHANNEL QUIETLY NOT BEING ENCODED IS THE SHAPE OF FAULT THIS
   * CODEBASE KEEPS PAYING FOR. Nobody must ever have to wonder why
   * an unpublished channel shows nothing. [D-21]
   */
  it('names the count and how to start one', () => {
    const says = idleSays(16, 17)!;
    expect(says).toMatch(/16 of 17/);
    expect(says).toMatch(/not published/);
    expect(says).toMatch(/Publishing one, or opening its control room/);
  });

  it('reads properly for one', () => {
    expect(idleSays(1, 4)).toMatch(/1 of 4 channels is not published/);
  });

  it('and says nothing when every channel is being made', () => {
    expect(idleSays(0, 17)).toBeNull();
    expect(idleSays(-1, 17)).toBeNull();
  });
});

/* ------------------------------------------------------------------ *
 *  And the engine asks.
 * ------------------------------------------------------------------ */

describe('the engine skips them and the route keeps them warm', () => {
  const bare = (path: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    return readFileSync(path, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  };
  const ENGINE = bare('src/playout/index.ts');
  const ROUTE = bare('app/api/channels/[id]/route.ts');

  it('the engine asks before it encodes', () => {
    expect(ENGINE).toMatch(/needsSegments\(one, nowMs, await watchedAt\(one\.id\)\)/);
    expect(ENGINE).toMatch(/warm\.filter\(\(one\) => one\.needs\.encode\)/);
  });

  /*
   * AND SAYS SO WHEN IT CHANGES — once, not every four seconds for
   * ever, which would be a log nobody can read past. [D-04]
   */
  it('and says what it is skipping, when it changes', () => {
    expect(ENGINE).toMatch(/idleSays\(idle, warm\.length\)/);
    expect(ENGINE).toMatch(/if \(idle !== lastIdle\)/);
  });

  /*
   * AND THE CONTROL ROOM'S OWN POLL IS WHAT KEEPS A DRAFT WARM. An
   * engine that skipped drafts with nothing recording attention
   * would black out the preview the operator publishes from.
   */
  it('the channel read records that somebody is looking', () => {
    expect(ROUTE).toMatch(/void noteWatching\(id\)/);
  });

  /* Not awaited: bookkeeping beside a read must not make a control
     room wait, nor fail it. [D-21] */
  it('and never makes the control room wait for it', () => {
    expect(ROUTE).not.toMatch(/await noteWatching/);
  });
});
