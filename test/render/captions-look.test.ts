/**
 * How captions look.  [Doctrine U-19 §2, D-04, U-18, INV-07]
 *
 * "A user may choose the look; not an unreadable one." That sentence has been
 * a comment in the caption renderer since it was written. These tests are it
 * enforced.
 *
 * The distinction this file defends is between a CHOICE and a STYLING PANEL.
 * Captions are the accessible form of what was said, so the looks on offer
 * are a short list that has been checked, not a size slider and a colour
 * picker — which is a way to produce captions nobody can read, offered by the
 * product that insisted on having them.
 */
import { describe, expect, it } from 'vitest';

import {
  CAPTION_FLOOR_FRACTION, CAPTION_STYLES, EXPORT_PROFILES,
  PLATFORM_CHROME_FRACTION, captionStyleFor,
} from '../../src/domain/presentation.js';
import { setCaptionStyle } from '../../src/domain/edit.js';
import { buildRenderPlan } from '../../src/domain/plan.js';
import { buildClipPlan } from '../../src/domain/clips.js';
import { buildAss } from '../../src/render/subtitles.js';
import { S, makeConversation, makeIntervention } from '../domain/fixtures.js';

const conversation = () => makeConversation(S(600), [
  makeIntervention(S(100), S(20), { type: 'critique', quote: 'The policy worked.' }),
]);

/** The caption styles out of a generated script, by name. */
function captionStyleLines(ass: string): string[] {
  return ass.split('\n').filter((l) => /^Style: (Source|User)Cap,/.test(l));
}

/**
 * One field of an ASS style line, BY NAME.
 *
 * Counting commas is how the first version of this file asserted that a
 * lifted caption sits higher and got a passing test out of comparing two
 * horizontal margins. The order is fixed by the Format line the renderer
 * writes, so it is written down once here and never counted again.
 */
const STYLE_FIELDS = [
  'Name', 'Fontname', 'Fontsize', 'PrimaryColour', 'SecondaryColour',
  'OutlineColour', 'BackColour', 'Bold', 'Italic', 'Underline', 'StrikeOut',
  'ScaleX', 'ScaleY', 'Spacing', 'Angle', 'BorderStyle', 'Outline', 'Shadow',
  'Alignment', 'MarginL', 'MarginR', 'MarginV', 'Encoding',
] as const;

function field(line: string, name: (typeof STYLE_FIELDS)[number]): string {
  const parts = line.replace(/^Style: /, '').split(',');
  const index = STYLE_FIELDS.indexOf(name);
  return parts[index]!;
}

describe('every look on offer is a legible one', () => {
  it('none of them is below the floor', () => {
    // Asserted over the TABLE rather than over the three that exist today, so
    // that a look added later cannot quietly drop under it.
    for (const style of Object.values(CAPTION_STYLES)) {
      expect(style.fontFraction).toBeGreaterThanOrEqual(CAPTION_FLOOR_FRACTION);
    }
  });

  it('and none of them is a colour choice', () => {
    /*
     * There is deliberately no colour on a caption style. White on a dark
     * scrim is the one combination that holds up over arbitrary footage, and
     * offering alternatives would mean offering unreadable ones.
     */
    for (const style of Object.values(CAPTION_STYLES)) {
      expect(Object.keys(style).sort()).toEqual(
        ['fontFraction', 'hint', 'id', 'label', 'marginFraction', 'scrim'],
      );
    }
  });

  it('and each says what it is for, in the author\'s language', () => {
    for (const style of Object.values(CAPTION_STYLES)) {
      expect(style.hint.length).toBeGreaterThan(10);
      expect(style.hint).not.toMatch(/U-\d|INV-\d|§|fraction|libass/i);
    }
  });
});

describe('what the canvas decides when nobody has', () => {
  it('a tall clip lifts its captions clear of the app\'s own buttons', () => {
    /*
     * The bottom of a vertical frame belongs to whichever app it is being
     * watched in. Captions put there are covered — which is a legibility
     * problem rather than a stylistic one, and the reason this default is not
     * a matter of taste.
     */
    const style = captionStyleFor(EXPORT_PROFILES['vertical_9x16']!);
    expect(style.id).toBe('lifted');
    expect(style.marginFraction).toBeGreaterThan(PLATFORM_CHROME_FRACTION);
  });

  it('while a wide one keeps them where captions belong', () => {
    expect(captionStyleFor(EXPORT_PROFILES['youtube_16x9']!).id).toBe('clean');
    expect(captionStyleFor(EXPORT_PROFILES['square_1x1']!).id).toBe('clean');
  });

  it('and the author outranks the canvas', () => {
    expect(captionStyleFor(EXPORT_PROFILES['vertical_9x16']!, 'solid').id).toBe('solid');
  });

  it('but cannot ask for one that does not exist', () => {
    expect(() => captionStyleFor(EXPORT_PROFILES['youtube_16x9']!, 'neon')).toThrow(/neon/);
    expect(() => setCaptionStyle(conversation(), 'neon')).toThrow(/neon/);
  });
});

describe('the plan decides, and the renderer obeys (U-18)', () => {
  it('the choice reaches the plan', () => {
    const c = conversation();
    setCaptionStyle(c, 'solid');
    expect(buildRenderPlan(c).captions.style.id).toBe('solid');
  });

  it('and reaches a clip of the same conversation', () => {
    const c = conversation();
    setCaptionStyle(c, 'solid');
    expect(buildClipPlan(c, c.interventions[0]!.id).captions.style.id).toBe('solid');
  });

  it('clearing it hands the decision back to the canvas', () => {
    const c = conversation();
    setCaptionStyle(c, 'solid');
    setCaptionStyle(c, null);
    expect(c.captionStyleId).toBeUndefined();
    expect(buildClipPlan(c, c.interventions[0]!.id).captions.style.id).toBe('lifted');
  });

  it('a solid look draws a panel behind the words', () => {
    const c = conversation();
    setCaptionStyle(c, 'solid');
    // BorderStyle 3 is an opaque box: the scrim that holds the contrast floor
    // whatever is behind it.
    for (const line of captionStyleLines(buildAss(buildRenderPlan(c)))) {
      expect(field(line, 'BorderStyle')).toBe('3');
    }
  });

  it('and a clean one draws an outline instead', () => {
    const c = conversation();
    setCaptionStyle(c, 'clean');
    for (const line of captionStyleLines(buildAss(buildRenderPlan(c)))) {
      expect(field(line, 'BorderStyle')).toBe('1');
    }
  });

  it('a lifted look actually sits higher up the frame', () => {
    const c = conversation();
    const lifted = buildAss(buildClipPlan(c, c.interventions[0]!.id));
    setCaptionStyle(c, 'clean');
    const low = buildAss(buildClipPlan(c, c.interventions[0]!.id));
    const marginOf = (ass: string) => Number(field(captionStyleLines(ass)[0]!, 'MarginV'));
    expect(marginOf(lifted)).toBeGreaterThan(marginOf(low));
  });

  it('and is larger, because it is read on a phone', () => {
    const c = conversation();
    const sizeOf = (ass: string) => Number(field(captionStyleLines(ass)[0]!, 'Fontsize'));
    const lifted = sizeOf(buildAss(buildClipPlan(c, c.interventions[0]!.id)));
    setCaptionStyle(c, 'clean');
    expect(lifted).toBeGreaterThan(sizeOf(buildAss(buildClipPlan(c, c.interventions[0]!.id))));
  });
});

describe('what no look may change', () => {
  it('that captions are there at all (INV-07)', () => {
    for (const id of Object.keys(CAPTION_STYLES)) {
      const c = conversation();
      setCaptionStyle(c, id);
      const plan = buildRenderPlan(c);
      expect(plan.captions.sidecars).toEqual(['srt', 'vtt']);
    }
  });

  it('that the responder is told apart from the source without colour (U-20)', () => {
    // Weight, not hue: it has to survive greyscale and colour-blindness.
    for (const id of Object.keys(CAPTION_STYLES)) {
      const c = conversation();
      setCaptionStyle(c, id);
      const lines = captionStyleLines(buildAss(buildRenderPlan(c)));
      const bold = lines.map((l) => field(l, 'Bold'));
      expect(bold).toEqual(['0', '1']);
    }
  });

  it('and that the words stay the size the floor requires', () => {
    for (const id of Object.keys(CAPTION_STYLES)) {
      const c = conversation();
      setCaptionStyle(c, id);
      const plan = buildRenderPlan(c);
      const base = Math.min(plan.exportProfile.width, plan.exportProfile.height);
      const size = Number(field(captionStyleLines(buildAss(plan))[0]!, 'Fontsize'));
      expect(size).toBeGreaterThanOrEqual(Math.round(base * CAPTION_FLOOR_FRACTION));
    }
  });
});
