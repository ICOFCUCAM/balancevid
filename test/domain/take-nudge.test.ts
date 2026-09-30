/**
 * Pushing a take against the song, and taking hold of the playhead.
 *   [STUDIO-TWO §10, MASTER-EDIT §2; S-3, INV-02, INV-03, INV-14, D-19]
 *
 * THE POINT OF THIS FILE IS THAT ALMOST NONE OF IT WAS NEW. `nudgeTake`
 * wrote `alignment.nudgeSamples`, `effectiveOffset` added it to the
 * measurement, the planner and the mixer both asked, an invariant refused
 * a fractional one and the API route had taken `nudge-take` for months.
 * The only missing piece was a way in — so what these tests hold are the
 * two ends of that: the entries a menu offers, and the places that must
 * agree about where a pushed take actually is.
 *
 * One of those places did not. The timeline lane drew from the raw
 * `offsetSamples` while everything else added the nudge, which nothing
 * could see while nothing could nudge.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Ask } from '../../app/Confirm.js';
import { visible, type MenuItem } from '../../app/Menu.js';
import { takeMenuItems, type TakeMenuHost } from '../../app/p/[id]/takeMenu.js';
import {
  NUDGE_FRAME, NUDGE_SECOND, nudgeItems, nudgeSays,
} from '../../app/p/[id]/takeNudge.js';
import type { AssetId, TakeId } from '../../src/domain/document.js';
import type { Performance, PerformanceTake } from '../../src/domain/performance.js';
import { effectiveOffset } from '../../src/domain/performance.js';
import { addTake, newPerformance } from '../../src/domain/performanceEdit.js';
import {
  HOUSE_FPS, HOUSE_SAMPLE_RATE, SYNC_TOLERANCE_SAMPLES, secondsToSamples,
} from '../../src/domain/time.js';

const ROOT = join(import.meta.dirname, '..', '..');
const code = (file: string) => readFileSync(join(ROOT, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function take(nudgeSamples?: number): PerformanceTake {
  return {
    id: 'take_one' as TakeId,
    assetId: 'asset_one' as AssetId,
    label: 'Living room',
    environment: { kind: 'original' },
    alignment: {
      offsetSamples: secondsToSamples(2), rateRatio: 1, method: 'measured',
      ...(nudgeSamples === undefined ? {} : { nudgeSamples }),
    },
    durationSamples: secondsToSamples(30),
    hasAudio: true,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

/** Collect what the entries would send, without a network. */
function sent(entry: MenuItem | null | false | undefined): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = [];
  const items = nudgeItems(take(0), (body) => { calls.push(body); }, () => {});
  void entry; void items;
  return calls;
}

function pressing(
  label: string, from: number,
): Record<string, unknown> | undefined {
  const calls: Record<string, unknown>[] = [];
  const items = nudgeItems(take(from), (body) => { calls.push(body); }, () => {});
  const found = items.find((item) => item && item.label === label);
  expect(found, label).toBeTruthy();
  (found as MenuItem).onSelect?.();
  return calls[0];
}

describe('the step a push is made in', () => {
  /*
   * FRAMES, because the product cuts on frames and every other time
   * control in the studio steps by one. A nudge in round milliseconds
   * would land between two frames and read as the control being broken.
   * [INV-02]
   */
  it('is one frame of the house rate, exactly', () => {
    expect(NUDGE_FRAME).toBe(HOUSE_SAMPLE_RATE / HOUSE_FPS);
    expect(Number.isInteger(NUDGE_FRAME)).toBe(true);
  });

  /*
   * A frame is 33 ms and the point at which a sound and a picture stop
   * being one event is 20 ms, so a single frame IS a visible correction
   * — which is what makes it the right smallest step, and a second the
   * right larger one: nobody holds a take back by a frame on purpose.
   */
  it('is a step a viewer could see, and the larger one is musical', () => {
    expect(NUDGE_FRAME).toBeGreaterThan(SYNC_TOLERANCE_SAMPLES);
    expect(NUDGE_SECOND).toBe(HOUSE_SAMPLE_RATE);
  });
});

describe('what the rail says about a pushed take', () => {
  it('says nothing at all about a take nobody has pushed', () => {
    expect(nudgeSays(take())).toBeNull();
    expect(nudgeSays(take(0))).toBeNull();
  });

  it('says which way, in frames', () => {
    expect(nudgeSays(take(NUDGE_FRAME))).toBe('1 frame later');
    expect(nudgeSays(take(-3 * NUDGE_FRAME))).toBe('3 frames earlier');
  });

  /*
   * A second is thirty frames, and "30 frames later" is nobody's
   * sentence for a take deliberately held back. The two units are two
   * readings of the control: frames for a fault, seconds for a
   * decision.
   */
  it('says a second or more in seconds', () => {
    expect(nudgeSays(take(NUDGE_SECOND))).toBe('1.00s later');
    expect(nudgeSays(take(-45 * NUDGE_FRAME))).toBe('1.50s earlier');
    expect(nudgeSays(take(29 * NUDGE_FRAME))).toBe('29 frames later');
  });

  /*
   * A push under the sync tolerance cannot be the correction of a fault
   * nobody can see — which makes it the other reading: somebody meant
   * it. Hiding it would hide exactly the deliberate case.
   */
  it('still says so for a push too small to be a fault', () => {
    const fine = Math.round(SYNC_TOLERANCE_SAMPLES / 2);
    expect(nudgeSays(take(fine))).toMatch(/later/);
  });
});

describe('the entries a menu offers', () => {
  it('adds to the push already there rather than replacing it', () => {
    expect(pressing('Push it a frame later', 2 * NUDGE_FRAME))
      .toEqual({ action: 'nudge-take', takeId: 'take_one', nudgeSamples: 3 * NUDGE_FRAME });
    expect(pressing('Pull it a frame earlier', 2 * NUDGE_FRAME))
      .toEqual({ action: 'nudge-take', takeId: 'take_one', nudgeSamples: NUDGE_FRAME });
  });

  it('offers the larger step for a deliberate delay', () => {
    expect(pressing('Hold it back a second', 0))
      .toEqual({ action: 'nudge-take', takeId: 'take_one', nudgeSamples: NUDGE_SECOND });
    expect(pressing('Bring it in a second early', 0))
      .toEqual({ action: 'nudge-take', takeId: 'take_one', nudgeSamples: -NUDGE_SECOND });
  });

  /*
   * NEVER INTO THE MEASUREMENT. Clearing the push sends zero and says
   * nothing about the offset, which is `nudgeTake`'s whole reason for
   * being a separate field: re-measuring must not discard a human's fix,
   * and a human's fix must not discard the measurement either.
   */
  it('clears the push without touching the measurement', () => {
    const cleared = pressing('Back to the measured sync', 5 * NUDGE_FRAME);
    expect(cleared).toEqual({
      action: 'nudge-take', takeId: 'take_one', nudgeSamples: 0,
    });
    expect(cleared).not.toHaveProperty('offsetSamples');
  });

  /* Greyed with the reason, never hidden: a menu that changes between
     visits is a menu nobody learns. */
  it('greys the reset on a take that has not been pushed', () => {
    const items = nudgeItems(take(0), () => {}, () => {});
    const reset = items.find((item) => item && item.label === 'Back to the measured sync');
    expect((reset as MenuItem).disabled).toBe('it has not been pushed');
    const pushed = nudgeItems(take(NUDGE_FRAME), () => {}, () => {})
      .find((item) => item && item.label === 'Back to the measured sync');
    expect((pushed as MenuItem).disabled).toBeUndefined();
  });

  /*
   * "MOVE TAKE 3 +250 MS" IS A REAL INSTRUCTION, and 250 ms is seven
   * and a half frames — so the steppers cannot express it and this
   * entry can. `nudgeSamples` has always been samples, a twentieth of
   * a millisecond each, so nothing downstream has to round.
   */
  it('takes an exact amount in milliseconds', () => {
    const calls: Record<string, unknown>[] = [];
    let asked: Ask | null = null;
    const items = nudgeItems(take(0), (body) => { calls.push(body); },
      (question) => { asked = question; });
    const exact = items.find((item) => item
      && item.label === 'Move it by an exact amount\u2026');
    (exact as MenuItem).onSelect?.();
    expect(asked).toBeTruthy();
    (asked as unknown as Ask).go?.('250');
    expect(calls).toEqual([{
      action: 'nudge-take', takeId: 'take_one', nudgeSamples: 12_000,
    }]);
  });

  it('refuses a typed amount that is not a number, rather than writing NaN', () => {
    const calls: Record<string, unknown>[] = [];
    let asked: Ask | null = null;
    const items = nudgeItems(take(0), (body) => { calls.push(body); },
      (question) => { asked = question; });
    (items.find((item) => item
      && item.label === 'Move it by an exact amount\u2026') as MenuItem).onSelect?.();
    (asked as unknown as Ask).go?.('later please');
    expect(calls).toEqual([]);
  });

  it('sends a whole number of samples, which the invariant requires', () => {
    for (const label of [
      'Push it a frame later', 'Pull it a frame earlier',
      'Hold it back a second', 'Bring it in a second early',
    ]) {
      const body = pressing(label, 7);
      expect(Number.isInteger(body!['nudgeSamples']), label).toBe(true);
    }
    expect(sent(undefined)).toEqual([]);
  });
});

describe('everywhere that has to agree about where a take is', () => {
  /*
   * THE LANE DREW THE WRONG PLACE. The planner, the mixer and the player
   * all add the nudge; the timeline lane read `alignment.offsetSamples`
   * straight, so a pushed take would have played at one moment and been
   * drawn at another. Unreachable until the nudge had a control, and
   * wrong the whole time.
   */
  it('draws the take lane at the offset the renderer will use', () => {
    const stage = code('app/p/[id]/SwitchingStage.tsx');
    expect(stage).toMatch(/const from = Math\.max\(0, effectiveOffset\(take\.alignment\)\)/);
    expect(stage).not.toMatch(/Math\.max\(0, take\.alignment\.offsetSamples\)/);
  });

  it('is the same arithmetic wherever it is asked', () => {
    const pushed = take(4 * NUDGE_FRAME);
    expect(effectiveOffset(pushed.alignment))
      .toBe(pushed.alignment.offsetSamples + 4 * NUDGE_FRAME);
    expect(effectiveOffset(take().alignment)).toBe(secondsToSamples(2));
  });
});

describe('taking hold of the playhead', () => {
  const stage = code('app/p/[id]/SwitchingStage.tsx');

  /*
   * A CLICK AND A DRAG MUST LAND ON THE SAME SAMPLE, so they go through
   * one function. Two pieces of arithmetic for "where is that x on the
   * song" is two answers to one question, and the one the author would
   * notice is the disagreement.
   */
  it('seeks through one definition of where an x is', () => {
    expect(stage).toMatch(/const sampleAtX = useCallback/);
    expect(stage).toMatch(/onClick=\{\(e\) => player\.seek\(sampleAtX\(e\.clientX\)\)\}/);
    expect(stage).toMatch(/onPointerMove=\{\(event\) => \{\s*if \(scrubbing\) player\.seek\(sampleAtX\(event\.clientX\)\)/);
  });

  /* Clamped at both ends: nothing before the first sample, and by INV-03
     nothing after the last. "Drag it back to the very start" is the ask
     this was built for, and a scrub that could go past zero would make
     the one position an author most wants the hardest to hit. */
  it('clamps the scrub to the song at both ends', () => {
    expect(stage).toMatch(/Math\.max\(0, Math\.min\(duration, Math\.round\(along \* duration\)\)\)/);
  });

  /* The drag survives leaving the strip, or it ends the moment the
     pointer rises above the ruler — which is where a pointer goes when
     somebody drags towards the monitors. */
  it('captures the pointer so a drag can leave the strip', () => {
    expect(stage).toMatch(/setPointerCapture\(event\.pointerId\)/);
    expect(stage).toMatch(/releasePointerCapture\(event\.pointerId\)/);
    expect(stage).toMatch(/onPointerCancel=\{\(\) => setScrubbing\(false\)\}/);
  });

  /* The line is two pixels wide and moves ten times a second: the worst
     drag target a studio could offer. The pointer falls through it to
     the strip, and the grip is what says the line can be taken hold of
     at all — a shape and a cursor, not a colour. [U-19] */
  it('leaves the line untouchable and puts a grip on it', () => {
    expect(stage).toMatch(/data-testid="playhead"[\s\S]{0,220}pointerEvents: 'none'/);
    expect(stage).toMatch(/data-testid="playhead-grip"/);
    expect(stage).toMatch(/cursor: 'ew-resize'/);
  });
});

describe('the take in a multiview tile', () => {
  const stage = code('app/p/[id]/SwitchingStage.tsx');

  /*
   * THE RAIL TAUGHT RIGHT-CLICK IN THE FIRST WEEK, and in the multiview
   * the take IS the picture — so a right-click there did nothing, which
   * is that lesson unlearned one panel away: "they shouldn't always have
   * to move their mouse to the left rail".
   */
  it('raises the take menu on the picture, and still cuts on a click', () => {
    expect(stage).toMatch(/data-testid="monitor-pick"[\s\S]{0,700}onRow\(take\.label, \(\) => takeMenu\(take\)\)/);
    expect(stage).toMatch(/onClick=\{\(\) => choose\(key - 1\)\}/);
  });

  /* And on the block in the timeline, which is the same take again. */
  it('raises the same menu on the block in the timeline', () => {
    expect(stage).toMatch(/data-testid="take-lane-block"[\s\S]{0,400}onRow\(take\.label, \(\) => takeMenu\(take\)\)/);
  });

  /*
   * ONE DEFINITION OF A CUT: the menu's "put it on screen" runs
   * `choose`, which is what a click on the picture and a press of the
   * number key both run.
   */
  it('cuts through the same call the picture and the key make', () => {
    expect(stage).toMatch(/place: \(takeId\) => \{[\s\S]{0,240}choose\(index\);/);
  });

  /* Neither host writes a verb of its own: the list is `takeMenu.ts`. */
  it('offers one list, written in neither host', () => {
    expect(stage).not.toMatch(/Push it a frame later/);
    const studio = code('app/p/[id]/PerformanceStudio.tsx');
    expect(studio).not.toMatch(/Push it a frame later/);
    /*
     * The take's own rename, not the song's — which is a different
     * object with a different menu and legitimately lives up there.
     */
    expect(stage).not.toMatch(/label: 'Rename\\u2026'/);
    expect(studio).not.toMatch(/label: 'Rename\\u2026'/);
    expect(studio).toMatch(/label: 'Rename the song/);
    expect(code('app/p/[id]/takeMenu.ts'))
      .toMatch(/nudgeItems\(take, host\.patch, host\.confirm\)/);
  });
});


/* ------------------------------------------------------------------ *
 *  The one take menu, raised from a row or from the take's picture.
 * ------------------------------------------------------------------ */

const SONG = secondsToSamples(240);

function host(over: Partial<TakeMenuHost> = {}): {
  host: TakeMenuHost; sent: Record<string, unknown>[]; did: string[];
} {
  const sent: Record<string, unknown>[] = [];
  const did: string[] = [];
  const performance: Performance = newPerformance('A song', {
    assetId: 'asset_song' as AssetId, title: 'A song', class: 'own',
    durationSamples: SONG,
  }, '2026-01-01T00:00:00.000Z');
  return {
    sent, did,
    host: {
      performance,
      patch: (body) => { sent.push(body); },
      confirm: () => { did.push('asked'); },
      at: () => secondsToSamples(10),
      place: () => { did.push('placed'); },
      keyOf: () => 2,
      onReframe: (id) => { did.push(`reframe:${id}`); },
      solo: null,
      onSolo: (id) => { did.push(`solo:${id ?? 'off'}`); },
      chosen: null,
      onChoose: (id) => { did.push(`chose:${id}`); },
      ...over,
    },
  };
}

function press(label: string, over: Partial<TakeMenuHost> = {}, on = take()) {
  const built = host(over);
  const found = takeMenuItems(on, built.host)
    .find((item) => item && item.label === label);
  expect(found, label).toBeTruthy();
  (found as MenuItem).onSelect?.();
  return built;
}

function entry(label: string, over: Partial<TakeMenuHost> = {}, on = take()) {
  const found = takeMenuItems(on, host(over).host)
    .find((item) => item && item.label === label);
  expect(found, label).toBeTruthy();
  return found as MenuItem;
}

describe('what can be done to a take', () => {
  /*
   * ONE LIST, TWO WAYS IN. The rail renders it on a row and the
   * multiview renders it on the take's own picture; neither writes out
   * a verb of its own, because the first time they drift is the first
   * time somebody learns one menu and finds the other missing the verb
   * they came for. [D-19]
   */
  it('is the only definition of the list in the product', () => {
    const stage = code('app/p/[id]/SwitchingStage.tsx');
    const studio = code('app/p/[id]/PerformanceStudio.tsx');
    expect(stage).toMatch(/takeMenuItems\(take, \{/);
    /* The rail is HANDED the list rather than building a second one. */
    expect(studio).toMatch(/takesPanel=\{\(takeMenu\) =>/);
    expect(studio).toMatch(/onRow\(take\.label, \(\) => takeMenu\(take\)\)/);
    expect(studio).not.toMatch(/const takeItems =/);
    for (const verb of ['Rename\u2026', 'Remove\u2026', 'Loop it']) {
      expect(studio, verb).not.toContain(`label: '${verb}'`);
    }
  });

  it('plays one take on its own without a second player', () => {
    expect(press('Play it on its own').did).toEqual(['solo:take_one']);
    const off = entry('Stop watching it on its own', { solo: 'take_one' });
    expect(off.label).toBe('Stop watching it on its own');
  });

  /*
   * PUTTING IT ON SCREEN GOES THROUGH THE HOST'S CUT, which is the same
   * call the picture and the number key make. A menu that wrote its own
   * scene would be a second definition of what a cut is.
   */
  it('puts it on screen through the same cut a click makes', () => {
    const pressed = press('Put it on screen from here');
    expect(pressed.did).toEqual(['placed']);
    expect(pressed.sent).toEqual([]);
  });

  it('greys what a take still assembling cannot do, with the reason', () => {
    const cannot = entry('Put it on screen from here', { keyOf: () => null });
    expect(cannot.disabled).toBe('it is still assembling');
    expect(entry('Play it on its own', { keyOf: () => null }).disabled)
      .toBe('it is still assembling');
  });

  /*
   * TRIM IS TWO MARKS AT THE PLAYHEAD. The author is looking at the
   * moment they mean; asking them to type it back in as a timecode is
   * asking them to read out what is already under the line.
   */
  it('trims at the playhead, on the master clock', () => {
    const at = secondsToSamples(10);
    expect(press('Start it here').sent).toEqual([
      { action: 'trim-take', takeId: 'take_one', useFromSample: at },
    ]);
    expect(press('End it here').sent).toEqual([
      { action: 'trim-take', takeId: 'take_one', useToSample: at },
    ]);
  });

  /*
   * WHAT IS WRONG IS DIFFERENT AT EACH END, and the first version of
   * this said "the playhead is outside this take" for both — which at
   * the start of the song greyed them out on a take beginning at zero,
   * where zero is that take's FIRST SAMPLE. A screenshot caught it.
   * `trimTake` refuses a trim that leaves nothing; these say so before
   * it is pressed. [U-04]
   */
  it('refuses a trim that would leave nothing, and says which', () => {
    const past = { at: () => secondsToSamples(200) };
    expect(entry('Start it here', past).disabled)
      .toBe('that would leave nothing of it');
    const atStart = { at: () => 0 };
    expect(entry('End it here', atStart).disabled)
      .toBe('that would leave nothing of it');
  });

  it('does not call the take\u2019s own first sample outside it', () => {
    const atStart = { at: () => secondsToSamples(2) };
    expect(entry('Start it here', atStart).disabled).toBe('it already starts there');
    /* And the other end is live there, because it would leave the take. */
    expect(entry('End it here', { at: () => secondsToSamples(20) }).disabled)
      .toBeUndefined();
  });

  it('takes both marks off again, and says so only when there are some', () => {
    expect(entry('Use all of it again').disabled).toBe('none of it is trimmed');
    const trimmed = { ...take(), useFromSample: secondsToSamples(4) };
    expect(press('Use all of it again', {}, trimmed).sent).toEqual([
      {
        action: 'trim-take', takeId: 'take_one',
        useFromSample: null, useToSample: null,
      },
    ]);
  });
});

describe('a take that begins late', () => {
  /*
   * THE TWO ALIGNMENTS AN AUTHOR ASKS FOR, which are the push with the
   * subtraction already done — and both write the NUDGE, so the
   * measurement underneath stays readable and a re-measure does not
   * discard the fix. [S-3, INV-14]
   */
  it('can be pulled back to the start of the song', () => {
    expect(press('Align its start to the song\u2019s').sent).toEqual([
      {
        action: 'nudge-take', takeId: 'take_one',
        nudgeSamples: -secondsToSamples(2),
      },
    ]);
  });

  it('can be pulled to the playhead', () => {
    expect(press('Align its start to the playhead').sent).toEqual([
      {
        action: 'nudge-take', takeId: 'take_one',
        nudgeSamples: secondsToSamples(10) - secondsToSamples(2),
      },
    ]);
  });

  /*
   * AND IT MOVES THE MEDIA, NOT THE TRIM. `coverage` answers "what part
   * of the song can this fill", which a trim narrows; these two move
   * where the take BEGINS, so reading the trimmed figure would align an
   * edge the action does not touch.
   */
  it('aligns where the media begins, not where the trim starts', () => {
    const trimmed = { ...take(), useFromSample: secondsToSamples(30) };
    expect(press('Align its start to the song\u2019s', {}, trimmed).sent)
      .toEqual([{
        action: 'nudge-take', takeId: 'take_one',
        nudgeSamples: -secondsToSamples(2),
      }]);
  });

  it('says it already begins with the song when it does', () => {
    const aligned = { ...take(-secondsToSamples(2)) };
    expect(entry('Align its start to the song\u2019s', {}, aligned).disabled)
      .toBe('it already begins with the song');
  });

  /* Dragging the block is the same correction made by hand, so it
     writes the same field — added to whatever push is already there,
     not replacing it. And once, on release: a PATCH per pointer move
     would be sixty versions of one decision. */
  it('can be dragged along its lane, and is written once', () => {
    const stage = code('app/p/[id]/SwitchingStage.tsx');
    expect(stage).toMatch(/data-testid="take-lane-block"/);
    expect(stage).toMatch(/onPointerUp[\s\S]{0,400}action: 'nudge-take'[\s\S]{0,120}nudgeSamples: \(take\.alignment\.nudgeSamples \?\? 0\) \+ by/);
    /* Nothing is written while the pointer moves. */
    expect(stage).not.toMatch(/onPointerMove[\s\S]{0,200}action: 'nudge-take'/);
    /* A press that did not move is a press, not a drag. */
    expect(stage).toMatch(/if \(by === 0\) return;/);
    /* How far, in words, while it happens. [U-19] */
    expect(stage).toMatch(/data-testid="take-lane-drag"/);
  });
});

describe('reaching the start of the song', () => {
  it('is one press, not a drag that can miss', () => {
    const stage = code('app/p/[id]/SwitchingStage.tsx');
    expect(stage).toMatch(/data-testid="player-start"[\s\S]{0,200}onClick=\{\(\) => player\.seek\(0\)\}/);
  });
});


describe('a menu long enough to matter', () => {
  /*
   * SEVENTEEN VERBS IS A NEW LENGTH FOR THIS COMPONENT. Every list in
   * the product was four or five until the take menu, and at
   * seventeen the panel ran off the bottom of a laptop screen with
   * "Remove…" below the fold and no way to reach it. Measured in the
   * browser at a viewport of 800: the panel was 880 tall and its last
   * item ended at 883.
   */
  it('cannot grow taller than the screen it is drawn on', () => {
    const menu = code('app/Menu.tsx');
    expect(menu).toMatch(/maxHeight: 'calc\(100vh - 16px\)'/);
    expect(menu).toMatch(/overflowY: 'auto'/);
  });

  /*
   * AND THE THREE OPERATIONS ARE NAMED APART. Moving a take, trimming
   * a take and reframing one act on three different things — when it
   * plays, which part of it exists, what part of the picture shows —
   * and a flat list invites somebody to trim when they meant to move.
   */
  it('prints each group heading once, above the first of its group', () => {
    const menu = code('app/Menu.tsx');
    expect(menu).toMatch(/const opens = Boolean\(item\.section\)\s*&& item\.section !== shown\[index - 1\]\?\.section;/);
    expect(menu).toMatch(/data-testid="menu-section"/);
  });

  it('files every take verb under one of them', () => {
    const items = takeMenuItems(take(), host().host)
      .filter((item): item is MenuItem => Boolean(item));
    expect(items.length).toBeGreaterThan(12);
    for (const item of items) {
      expect(item.section, item.label).toBeTruthy();
    }
    expect(new Set(items.map((item) => item.section))).toEqual(new Set([
      'This take',
      'Trim \u2014 which part of it exists',
      'Crop \u2014 what part of the picture shows',
      'Move \u2014 when it plays',
      'The take itself',
    ]));
  });
});


describe('simple by default, advanced when it is asked for', () => {
  /*
   * "I would not try to recreate a giant professional editing
   * application... the interface should have a simple mode with
   * advanced controls appearing when needed." [B9]
   *
   * The take menu went from four verbs to nineteen in two days, which
   * is exactly the shape that warning is about. The everyday ones are
   * always there; timing, alignment and the frame are one press away.
   */
  const built = (on = take()) => takeMenuItems(on, host().host)
    .filter((item): item is MenuItem => Boolean(item));
  const everyday = (on = take()) => built(on).filter((item) => !item.advanced);
  const behind = (on = take()) => built(on).filter((item) => item.advanced);

  /*
   * THE PROPERTY IS A PROPORTION, not a number somebody picked. The
   * list will keep growing — that is what a professional editor does —
   * and what must stay true is that most of it is not in a beginner's
   * way.
   */
  it('shows a beginner fewer than half of them', () => {
    const all = built().length;
    expect(all).toBeGreaterThanOrEqual(17);
    expect(everyday().length).toBeLessThanOrEqual(all / 2);
    const labels = everyday().map((item) => item.label);
    /* The four things the brief says a normal user needs: choose it,
       put it on screen, trim it, and the take's own housekeeping. */
    expect(labels).toContain('Work on this take');
    expect(labels).toContain('Put it on screen from here');
    expect(labels).toContain('Start it here');
    expect(labels).toContain('Remove\u2026');
  });

  it('keeps timing and the frame behind one press', () => {
    const labels = behind().map((item) => item.label);
    expect(labels).toContain('Push it a frame later');
    expect(labels).toContain('Move it by an exact amount\u2026');
    expect(labels).toContain('Align its start to the playhead');
    expect(labels).toContain('Crop / reframe\u2026');
    expect(behind().length).toBeGreaterThan(5);
  });

  /* Every advanced row is in one of the two advanced groups, and no
     everyday row is: the split follows the operation, not taste. */
  it('splits on the operation rather than one row at a time', () => {
    for (const item of behind()) {
      expect(item.section, item.label)
        .toMatch(/^(Move|Crop) \u2014 /);
    }
    for (const item of everyday()) {
      expect(item.section, item.label)
        .not.toMatch(/^(Move|Crop) \u2014 /);
    }
  });

  /* And the menu itself reveals them in place — not a submenu, not a
     mode, and not by closing and reopening. */
  it('hides the advanced rows until more is asked for', () => {
    /* By label: each call builds fresh closures, so the entries are
       equal in every way a person can see and not by identity. */
    const labels = (list: MenuItem[]) => list.map((item) => item.label);
    const items = built();
    expect(labels(visible(items, false)))
      .toEqual(labels(items.filter((item) => !item.advanced)));
    expect(labels(visible(items, true))).toEqual(labels(items));
    expect(visible(items, false).length).toBeLessThan(items.length);
    /* A list with nothing advanced in it is unchanged either way, so
       such a menu never grows a "More" row. */
    const plain = items.filter((item) => !item.advanced);
    expect(labels(visible(plain, false))).toEqual(labels(plain));
  });

  it('reveals them in the same menu', () => {
    const menu = code('app/Menu.tsx');
    expect(menu).toMatch(/data-testid="menu-more"/);
    expect(menu).toMatch(/onClick=\{\(\) => setMore\(true\)\}/);
    /*
     * AND THE LABEL IS AN EXPRESSION, NOT JSX TEXT. An escape in JSX
     * text is not an escape — the browser showed a row reading
     * "More\\u2026" — so the ellipsis is written inside braces where
     * the string is a string.
     */
    expect(menu).toMatch(/\{'More\\u2026'\}/);
    expect(menu).not.toMatch(/^\s+More\\u2026$/m);
    /* Every raise starts simple again, or "more" would be a setting. */
    expect(menu).toMatch(/setMore\(false\);\s*setRaised\(\{ items, about, x: event\.clientX/);
  });
});
