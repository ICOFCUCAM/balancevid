/**
 * Looking at the schedule.  [CHANNEL §2, §10, §18, D-04, D-21, U-08,
 * C-31, C-38, C-46]
 *
 * THE WINDOW WAS A CONSTANT AND THE COMMENT ABOVE IT WAS RIGHT:
 * *"a whole day compressed into a strip makes a five-minute ident
 * two pixels wide, and the thing an operator actually needs to see
 * is the join between what is on now and what follows it."*
 *
 * Both halves are true, which is what makes a fixed window the
 * wrong answer — a day is unreadable AND an eight-second lower
 * third is 0.09% of two and a half hours. The answer to a trade you
 * cannot win is to let the operator move.
 */

import { describe, expect, it } from 'vitest';

import type { OnAir, ProgrammeSource } from '../../src/domain/channel.js';
import {
  BEHIND, CAPTION_SHARE, DEFAULT_SPAN, FRAME_SHARE, MIN_LABEL_PX, SPANS,
  COUNTDOWN_READINGS, LEGIBLE_PX,
  blockTone, canZoom, carriesSound, fitsText, labelNudge, leftOf, mostOnScreen,
  roomOnScreen, spanSays, stepFor, windowFor, zoomed,
} from '../../src/domain/scheduleView.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const FILM: ProgrammeSource = { kind: 'media', assetId: 'a', form: 'video' };
const on = (kind: OnAir['kind']): OnAir => (kind === 'off'
  ? { kind: 'off' }
  : { kind, source: FILM, fromMs: 0, untilMs: 1,
    session: {}, programme: {}, entry: {} } as unknown as OnAir);

describe('how much clock is on screen (C-46)', () => {
  /*
   * TEN MINUTES IS THE TIGHTEST BECAUSE OF WHAT IT MAKES VISIBLE: an
   * eight-second lower third is 1.3% of it — a block with an edge —
   * against 0.09% of the old fixed window, which is the
   * minimum-width sliver every short thing collapsed to.
   */
  it('goes tight enough to see an eight-second graphic', () => {
    const tightest = SPANS[0]!;
    expect((8000 / tightest) * 100).toBeGreaterThan(1);
    expect((8000 / DEFAULT_SPAN) * 100).toBeLessThan(0.1);
  });

  it('goes wide enough to see a day', () => {
    expect(SPANS[SPANS.length - 1]).toBe(24 * HOUR);
  });

  it('keeps the window it has always had as one of the stops', () => {
    expect(SPANS).toContain(DEFAULT_SPAN);
  });

  it('is ordered tight to wide, with no repeats', () => {
    for (let at = 1; at < SPANS.length; at += 1) {
      expect(SPANS[at]!).toBeGreaterThan(SPANS[at - 1]!);
    }
  });
});

describe('zooming (C-46)', () => {
  /* "In" is the operator's word and means a smaller span. */
  it('shows less when you zoom in', () => {
    expect(zoomed(DEFAULT_SPAN, 1)).toBeLessThan(DEFAULT_SPAN);
    expect(zoomed(DEFAULT_SPAN, -1)).toBeGreaterThan(DEFAULT_SPAN);
  });

  /* And stops rather than running off either end. */
  it('stops at the ends', () => {
    expect(zoomed(SPANS[0]!, 1)).toBe(SPANS[0]);
    expect(zoomed(SPANS[SPANS.length - 1]!, -1))
      .toBe(SPANS[SPANS.length - 1]);
    expect(canZoom(SPANS[0]!, 1)).toBe(false);
    expect(canZoom(SPANS[0]!, -1)).toBe(true);
  });

  /* A span that is not a stop lands on the nearest one. */
  it('finds its way back to a stop from anywhere', () => {
    expect(SPANS).toContain(zoomed(37 * MINUTE, 1));
    expect(SPANS).toContain(zoomed(37 * MINUTE, -1));
  });

  /*
   * AND A STEP NEVER SKIPS A STOP, which is what the tie-break in
   * `nearestStop` is for. Twenty minutes sits exactly between ten
   * and thirty. Rounding a tie the other way puts "nearest" at
   * thirty, so one press of the minus button would land on an hour
   * — jumping clean over the half hour the operator was two
   * hundred milliseconds away from. A control that skips a stop
   * depending on where you happened to start is a control nobody
   * can aim.
   */
  it('does not skip a stop from a span sitting between two', () => {
    const between = 20 * MINUTE;
    expect(zoomed(between, -1)).toBe(30 * MINUTE);
    expect(zoomed(between, 1)).toBe(10 * MINUTE);
  });
});

describe('the ruler step (C-46)', () => {
  /*
   * A THIRTY-MINUTE STEP IS RIGHT FOR TWO AND A HALF HOURS AND
   * ABSURD FOR TEN MINUTES — one label — and invisible in a day,
   * which would want forty-eight of them.
   */
  it('never crowds the labels closer than they can be read', () => {
    for (const span of SPANS) {
      const width = 1100;
      const step = stepFor(span, width);
      expect(width / (span / step), `${span}`)
        .toBeGreaterThanOrEqual(MIN_LABEL_PX);
    }
  });

  /*
   * AND THE FLOOR IS MEASURED, NOT ASSERTED AGAINST ITSELF.
   *
   * The test above compares the gap to `MIN_LABEL_PX`, which means
   * it passes at any value of `MIN_LABEL_PX` — halve the constant
   * and it still agrees with itself. The fact it was meant to hold
   * is about the glass: a clock reading in the readout face is five
   * characters of 10px mono, about thirty-four pixels, and a ruler
   * whose numbers come within a number's width of each other is a
   * ruler nobody can read. So that is the number here.
   */
  const READING_PX = 34;
  it('leaves a clear reading’s worth of air between two numbers', () => {
    for (const span of SPANS) {
      const gap = 1100 / (span / stepFor(span, 1100));
      expect(gap, `${span}`).toBeGreaterThanOrEqual(READING_PX * 2);
    }
  });

  /* And it is always a round number somebody would say out loud. */
  it('only ever uses a round interval', () => {
    for (const span of SPANS) {
      const step = stepFor(span, 1100);
      expect([1, 2, 5, 10, 15, 30, 60, 120, 180, 360])
        .toContain(step / MINUTE);
    }
  });

  /* The tighter the window, the finer the ruler. */
  it('gets finer as the window tightens', () => {
    expect(stepFor(SPANS[0]!, 1100)).toBeLessThan(stepFor(DEFAULT_SPAN, 1100));
    expect(stepFor(DEFAULT_SPAN, 1100))
      .toBeLessThan(stepFor(24 * HOUR, 1100));
  });

  /* A narrow panel gets fewer labels, not squashed ones. */
  it('coarsens on a narrow panel rather than crowding', () => {
    expect(stepFor(DEFAULT_SPAN, 300))
      .toBeGreaterThanOrEqual(stepFor(DEFAULT_SPAN, 1100));
  });
});

describe('the window itself (C-46)', () => {
  const AT = Date.UTC(2026, 9, 2, 21, 2);

  /*
   * NOTHING MOVES FOR SOMEBODY WHO NEVER TOUCHES THE ZOOM. At the
   * old fixed window the ten per cent behind is the fifteen minutes
   * it has always kept.
   */
  it('is exactly what it always was at the default span', () => {
    expect(DEFAULT_SPAN * BEHIND).toBe(15 * MINUTE);
    const { from, to } = windowFor(DEFAULT_SPAN, AT, 30 * MINUTE);
    expect(to - from).toBe(DEFAULT_SPAN);
    /* Snapped down to the step, as it always was. */
    expect(from % (30 * MINUTE)).toBe(0);
    expect(from).toBeLessThanOrEqual(AT - 15 * MINUTE);
  });

  /* The anchor keeps its place in the window at every zoom, which is
     what makes zooming feel like a lens rather than a jump. */
  it('keeps the same share of history at every span', () => {
    for (const span of SPANS) {
      const step = stepFor(span, 1100);
      const { from, to } = windowFor(span, AT, step);
      const where = (AT - from) / (to - from);
      expect(where, `${span}`).toBeGreaterThan(0);
      expect(where, `${span}`).toBeLessThan(0.5);
    }
  });

  /* A fixed fifteen minutes would be impossible in a ten-minute window. */
  it('never puts the anchor outside the window it drew', () => {
    for (const span of SPANS) {
      const { from, to } = windowFor(span, AT, stepFor(span, 1100));
      expect(AT, `${span}`).toBeGreaterThanOrEqual(from);
      expect(AT, `${span}`).toBeLessThan(to);
    }
  });
});

describe('what a block means (C-46)', () => {
  /*
   * A HOLE WAS DRAWN AS A PROGRAMME. Off air and a turn of the loop
   * both fell through to the same faint blue, so a gap in the
   * schedule — the thing an operator most needs to find at a glance
   * — looked like a quiet programme.
   */
  it('tells a hole from a turn of the loop', () => {
    expect(blockTone(on('off'), false)).toBe('hole');
    expect(blockTone(on('rotation'), false)).toBe('loop');
    expect(blockTone(on('off'), false))
      .not.toBe(blockTone(on('rotation'), false));
  });

  it('gives every kind its own tone', () => {
    const tones = (['off', 'live', 'emergency', 'programme', 'rotation'] as const)
      .map((kind) => blockTone(on(kind), false));
    expect(new Set(tones).size).toBe(tones.length);
  });

  /* The emergency cut and the backup are one thing to a viewer. */
  it('reads the two standby sources the same', () => {
    expect(blockTone(on('emergency'), false))
      .toBe(blockTone(on('backup'), false));
  });

  /* A slot with a title and no media is the one fault a listing
     cannot show by looking right, so it wins. */
  it('lets a missing reference beat everything', () => {
    for (const kind of ['off', 'live', 'programme', 'rotation'] as const) {
      expect(blockTone(on(kind), true), kind).toBe('missing');
    }
  });
});

describe('how long is left (C-46)', () => {
  /* The block said its duration and not its end. */
  it('counts down only the stretch that is on', () => {
    const stretch = { fromMs: 1000, toMs: 5000 };
    expect(leftOf(stretch, 2000)).toBe(3000);
    expect(leftOf(stretch, 1000)).toBe(4000);
  });

  /*
   * AND NOTHING FOR THE OTHERS. A lane of forty blocks each counting
   * down is a lane nobody reads. [D-04]
   */
  it('says nothing about a stretch that is not on', () => {
    const stretch = { fromMs: 1000, toMs: 5000 };
    expect(leftOf(stretch, 999)).toBe(null);
    expect(leftOf(stretch, 5000)).toBe(null);
    expect(leftOf(stretch, 9000)).toBe(null);
  });
});

describe('the ruler’s own ends (C-46)', () => {
  /*
   * EVERY LABEL WAS CENTRED ON ITS TICK EXCEPT THE FIRST, so the
   * LAST hung half its width past the edge and was clipped: `23:0`.
   * A measuring instrument whose last number is shaved cannot be
   * trusted at the end of the scale, which is where a schedule is
   * read. [C-38, one surface along]
   */
  it('tucks both ends in', () => {
    expect(labelNudge(0, 6)).toBe('start');
    expect(labelNudge(5, 6)).toBe('end');
    expect(labelNudge(3, 6)).toBe('middle');
  });

  it('does not centre the last one', () => {
    expect(labelNudge(5, 6)).not.toBe('middle');
  });
});

describe('what the control says (C-46)', () => {
  it('says each span the way somebody would', () => {
    expect(spanSays(10 * MINUTE)).toBe('10 min');
    expect(spanSays(HOUR)).toBe('1 hour');
    expect(spanSays(2.5 * HOUR)).toBe('2½ hours');
    expect(spanSays(24 * HOUR)).toBe('24 hours');
  });

  it('has something to say about every stop', () => {
    for (const span of SPANS) expect(spanSays(span)).toMatch(/\d/);
  });
});

describe('what the audio lane may claim (C-46)', () => {
  /*
   * THE LANE WAS ONE BAR READING "Master Audio (Program)", noted
   * "always on", drawn identically over a programme, over a hole
   * and over a dead reference. The engine puts `anullsrc` on the
   * wire for a hole and for a missing render alike (`black()`,
   * §11), so that bar was wrong about the two stretches where
   * being wrong about silence matters.
   */
  it('calls the engine’s own silence silence', () => {
    expect(carriesSound(blockTone(on('off'), false))).toBe(false);
    expect(carriesSound(blockTone(on('programme'), true))).toBe(false);
  });

  /* And says nothing about the rest, which it cannot know. */
  it('leaves everything it has not decoded alone', () => {
    for (const kind of ['live', 'programme', 'rotation', 'emergency'] as const) {
      expect(carriesSound(blockTone(on(kind), false)), kind).toBe(true);
    }
  });

  /*
   * A LANE THAT SAYS THE SAME THING EVERYWHERE IS A LABEL, NOT A
   * TRACK — which is what this one was. Asserted on the walk rather
   * than on the tones, because the fault was that the lane never
   * varied across a schedule containing both.
   */
  it('is not the same bar across a schedule with a hole in it', () => {
    const day = [on('programme'), on('off'), on('rotation')]
      .map((what) => carriesSound(blockTone(what, false)));
    expect(new Set(day).size).toBe(2);
  });
});

describe('room on screen (C-46)', () => {
  /*
   * A SHARE OF THE WINDOW, NOT A DURATION — and this is the
   * assertion that was missing when the zoom shipped without it.
   *
   * The video lane drew a frame for any stretch of eight minutes or
   * more: five per cent of the window it was written against, half
   * a per cent of a day. The first zoom out to twenty-four hours
   * mounted a `<video>` per stretch and Chromium refused them in a
   * block — *"too many WebMediaPlayers already in existence"* — so
   * the lane went blank at exactly the span somebody zooms out to
   * survey. A browser mounts about seventy-five and then stops, for
   * the rest of the page's life.
   */
  const BROWSER_WILL_MOUNT = 75;
  it('cannot ask a browser for more media than it will give', () => {
    expect(mostOnScreen(FRAME_SHARE)).toBeLessThan(BROWSER_WILL_MOUNT);
  });

  /* And the bound does not move when the window does, which is the
     whole reason it is a share. */
  it('asks for the same most at every span', () => {
    for (const span of SPANS) {
      const shortest = span * FRAME_SHARE;
      expect(Math.floor(span / shortest), `${span}`)
        .toBe(mostOnScreen(FRAME_SHARE));
    }
  });

  /*
   * NOTHING MOVES AT THE OLD WINDOW. Eight minutes was the
   * threshold and eight minutes is still exactly it, because
   * 8 min is 1/18.75 of two and a half hours.
   */
  it('is the eight minutes it always was at the default span', () => {
    const MIN = 60_000;
    expect(roomOnScreen(8 * MIN, DEFAULT_SPAN, FRAME_SHARE)).toBe(true);
    expect(roomOnScreen(7.9 * MIN, DEFAULT_SPAN, FRAME_SHARE)).toBe(false);
  });

  /* A caption is words, so it needs more room than a frame does. */
  it('wants more room for a caption than for a picture', () => {
    expect(CAPTION_SHARE).toBeGreaterThan(FRAME_SHARE);
    const MIN = 60_000;
    expect(roomOnScreen(10 * MIN, DEFAULT_SPAN, FRAME_SHARE)).toBe(true);
    expect(roomOnScreen(10 * MIN, DEFAULT_SPAN, CAPTION_SHARE)).toBe(false);
  });
});

describe('words, or noise with the shape of words (C-46)', () => {
  /*
   * AT A DAY THE STRIP READ `2: 5: 4036 9:2: 5:` across a hundred
   * eight-pixel blocks. That is not small text. It is noise with
   * the shape of text, and it is harder to look past than an empty
   * block would be — the eye keeps trying to resolve it.
   */
  const STRIP = 880;
  const MIN = 60_000;
  const DAY = 24 * 60 * MIN;

  it('says nothing on a block narrower than one clock reading', () => {
    /* Five minutes of a day on this strip is three pixels. */
    expect((5 * MIN / DAY) * STRIP).toBeLessThan(LEGIBLE_PX);
    expect(fitsText(5 * MIN, DAY, STRIP)).toBe(false);
  });

  /* And the same item says its name when there is room for it. */
  it('says it on the same item once the window is tight enough', () => {
    expect(fitsText(5 * MIN, 10 * MIN, STRIP)).toBe(true);
  });

  /*
   * IT IS A MEASUREMENT, NOT A GUESS ABOUT PROGRAMME LENGTH. The
   * same stretch is legible or not according to how much glass it
   * has, which is what changes when somebody zooms — so a narrow
   * panel must suppress text a wide one shows.
   */
  it('follows the glass, not the clock', () => {
    expect(fitsText(15 * MIN, DEFAULT_SPAN, 1600)).toBe(true);
    expect(fitsText(15 * MIN, DEFAULT_SPAN, 300)).toBe(false);
  });

  /* A block at the threshold is one reading wide, exactly. */
  it('draws the line at one reading and not at two', () => {
    const exactly = (LEGIBLE_PX / STRIP) * DEFAULT_SPAN;
    expect(fitsText(exactly, DEFAULT_SPAN, STRIP)).toBe(true);
    expect(fitsText(exactly * 0.99, DEFAULT_SPAN, STRIP)).toBe(false);
  });
});

describe('a gate that passes the caption it cannot hold (C-46)', () => {
  /*
   * THE FAULT THIS STAGE PUT IN AND THE SCREENSHOT FOUND.
   *
   * The countdown was added, the legibility gate was added, and
   * the gate asked "can this block say anything" while the block
   * was being handed `ends 20:51 · 06:40 left`. On every short
   * item at the default span the string wrapped over three lines
   * and out of its own block. Both halves were right and nothing
   * measured the one against the other.
   *
   * [C-42/C-44's lesson, a third time: when a stage adds a field
   * and a branch, the thing in between is where the test is
   * missing.]
   */
  const STRIP = 880;
  const MIN = 60_000;

  it('will not promise room for a countdown it cannot hold', () => {
    /* A six-minute item at the default span: 35px — one reading. */
    const short = 6 * MIN;
    expect(fitsText(short, DEFAULT_SPAN, STRIP)).toBe(true);
    expect(fitsText(short, DEFAULT_SPAN, STRIP, COUNTDOWN_READINGS))
      .toBe(false);
  });

  /* And a block with real room gets the long form. */
  it('gives the long form to a block that has the glass for it', () => {
    expect(fitsText(40 * MIN, DEFAULT_SPAN, STRIP, COUNTDOWN_READINGS))
      .toBe(true);
  });

  /* The countdown asks for more room than a bare title, always. */
  it('asks for more room than a title does', () => {
    expect(COUNTDOWN_READINGS).toBeGreaterThan(1);
    for (const span of SPANS) {
      const edge = (LEGIBLE_PX * 2 / STRIP) * span;
      expect(fitsText(edge, span, STRIP), `${span}`).toBe(true);
      expect(fitsText(edge, span, STRIP, COUNTDOWN_READINGS), `${span}`)
        .toBe(false);
    }
  });
});
