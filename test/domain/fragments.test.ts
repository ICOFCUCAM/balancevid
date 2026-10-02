/**
 * A link into the control room has to arrive somewhere.
 * [Doctrine CHANNEL §1, D-04, D-22, U-19, C-30]
 *
 * The author's own observation, which the audit then measured:
 * *"most of bottons leads to one direction."* Six of the seven
 * controls on the landing page open the same page, and the fragments
 * that were supposed to distinguish them did almost nothing —
 * `#schedules` scrolled to a zero-size anchor that was already on
 * screen and left whichever rail tab happened to be open.
 *
 * THE TABLE IS WALKED AGAINST THE SOURCE. The links live in one file
 * and the targets in another, and nothing connected them: a renamed
 * tab was a dead link nobody would notice until somebody pressed it.
 * These tests read both files, which is the only way that stays true.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { FLASH_MS, JUMPS, jumpFor } from '../../src/domain/fragments.js';

const studio = readFileSync('app/t/[id]/ChannelStudio.tsx', 'utf8');
const landing = readFileSync('app/t/ControlRoom.tsx', 'utf8');

describe('what a fragment asks for (C-30)', () => {
  it('sends the schedule link to the schedules tab', () => {
    /* THE BUG. It used to land on whichever rail tab was open,
       which for a fresh page is PLAYLIST. */
    expect(jumpFor('#schedules')?.rail).toBe('schedules');
    expect(jumpFor('schedules')?.rail).toBe('schedules');
  });

  it('sends the go-live link to the camera desk', () => {
    expect(jumpFor('#live')?.desk).toBe('camera');
  });

  it('is not case-sensitive, because a pasted link may not be', () => {
    expect(jumpFor('#Schedules')?.rail).toBe('schedules');
  });

  it('does nothing approximate for a fragment it does not know', () => {
    for (const asked of ['', '#', '#nonsense', '#sched', 'live2']) {
      expect(jumpFor(asked), asked).toBe(null);
    }
  });

  /*
   * EVERY JUMP NAMES A REAL PANEL. Two of the four targets were
   * `display: contents` anchors with no box — nothing to scroll to
   * and nothing to flash — which is why the behaviour was real and
   * the feedback was nil.
   */
  it('names something that can actually be seen to move', () => {
    for (const [asked, jump] of Object.entries(JUMPS)) {
      expect(jump.panel, `${asked} has no panel`).toBeTruthy();
      const anchored = new RegExp(
        `id="${jump.panel}"|testid="${jump.panel}"`).test(studio);
      expect(anchored, `${asked} points at ${jump.panel}, which is not in `
        + 'the control room').toBe(true);
    }
  });

  it('gives no jump a zero-size anchor to flash', () => {
    for (const [asked, jump] of Object.entries(JUMPS)) {
      const line = studio.split('\n').find((text) =>
        text.includes(`id="${jump.panel}"`)
        || text.includes(`testid="${jump.panel}"`)) ?? '';
      expect(line, `${asked}'s panel is display:contents`)
        .not.toContain("display: 'contents'");
    }
  });
});

describe('the links and the table agree (C-30)', () => {
  /*
   * THE ONE THAT WOULD HAVE CAUGHT THE ORIGINAL FAULT. Every
   * fragment the landing page links to has to be one this table
   * knows, or the link is the dead button the author saw.
   */
  it('honours every fragment the landing page links to', () => {
    const linked = [...landing.matchAll(/\$\{channel\.href\}#([a-z]+)/g)]
      .map((hit) => hit[1]!);
    expect(linked.length).toBeGreaterThan(0);
    for (const asked of new Set(linked)) {
      expect(jumpFor(asked), `the landing page links to #${asked} and `
        + 'nothing honours it').not.toBe(null);
    }
  });

  it('names only rail tabs that exist', () => {
    for (const jump of Object.values(JUMPS)) {
      if (!jump.rail) continue;
      expect(studio).toContain(`id: '${jump.rail}', label:`);
    }
  });

  it('names only desks that exist', () => {
    for (const jump of Object.values(JUMPS)) {
      if (!jump.desk) continue;
      expect(studio).toContain(`id: '${jump.desk}', label:`);
    }
  });
});

describe('the arrival is acknowledged (D-04, C-30)', () => {
  /* Long enough to catch an eye that was elsewhere, short enough to
     be gone before it becomes furniture: a highlight that stayed
     would be a panel that looks selected for the rest of the
     session, which is a worse lie than no feedback at all. */
  it('marks the arrival for about a second', () => {
    expect(FLASH_MS).toBeGreaterThan(600);
    expect(FLASH_MS).toBeLessThan(2500);
  });
});
