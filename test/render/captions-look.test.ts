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
     *
     * Asserted as an ALLOWLIST rather than an exact key set: the list has
     * grown twice and will grow again, and a test that has to be edited for
     * every addition gets edited without being read. What must never appear
     * is a property naming an ink, and that is what this checks.
     */
    const ALLOWED = new Set([
      'id', 'label', 'hint', 'fontFraction', 'scrim', 'marginFraction',
      'serif', 'speakerPrefix', 'highlightWords', 'quoteSource',
    ]);
    for (const style of Object.values(CAPTION_STYLES)) {
      for (const key of Object.keys(style)) {
        expect(ALLOWED, `${style.id} has an undeclared property: ${key}`)
          .toContain(key);
        expect(key, `${style.id}.${key} looks like a colour`)
          .not.toMatch(/colou?r|ink|hex|rgb|tint/i);
      }
      // And no value is one either, which is the way a colour would actually
      // get in: as a string on a property innocently called `accent`.
      for (const value of Object.values(style)) {
        expect(String(value)).not.toMatch(/^#[0-9a-f]{3,8}$/i);
      }
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

/**
 * The four looks the brief asked for, and the one rule they all obey.
 * [U-19 §2, U-20, D-16, INV-00]
 *
 * "Captions should be derived from the canonical transcript rather than
 * manually burned into each export." That is already true, and adding looks is
 * where it would stop being true — a look that could drop a line, or write
 * one, is an edit hiding in a style menu, and it is how a vertical clip ends
 * up saying something the long version does not.
 *
 * So every test below checks the look does what it says AND that the words
 * are the same words.
 */
describe('the looks that were added, and what they may not do', () => {
  const cues = [
    { startFrame: 0, endFrame: 60, speaker: 'source' as const, text: 'The policy worked.',
      words: [
        { text: 'The', startFrame: 0, endFrame: 15 },
        { text: 'policy', startFrame: 15, endFrame: 40 },
        { text: 'worked.', startFrame: 45, endFrame: 60 },
      ] },
    { startFrame: 60, endFrame: 120, speaker: 'user' as const, text: 'For one year only.' },
  ];

  const scriptFor = (styleId: string): string => {
    const conv = conversation();
    setCaptionStyle(conv, styleId);
    return buildAss(buildRenderPlan(conv), { cues });
  };

  /** The dialogue lines that are captions, in order. */
  const captionEvents = (ass: string): string[] =>
    ass.split('\n').filter((line) => /^Dialogue: .*,(Source|User)Cap,/.test(line));

  it('EVERY look carries the same words — that is the whole rule', () => {
    const wordsOf = (ass: string) => captionEvents(ass)
      .map((line) => line.split(',').slice(9).join(',')
        .replace(/\{[^}]*\}/g, '')          // override tags are the look
        .replace(/^(SOURCE|YOU):\s*/, '')   // the prefix is the look
        .replace(/[“”]/g, '')     // the marks are the look
        .replace(/\s+/g, ' ').trim())
      /*
       * Deduped, because how many EVENTS a look draws is the look's business:
       * Highlighted words redraws the line once per word. What may not differ
       * is the sequence of lines a viewer reads.
       */
      .filter((text, index, all) => text !== all[index - 1]);
    const plain = wordsOf(scriptFor('clean'));
    for (const id of ['editorial', 'speakers', 'social', 'highlight', 'quoted']) {
      expect(wordsOf(scriptFor(id)), `${id} changed the words`).toEqual(plain);
    }
  });

  it('Editorial sets a serif face, and it is the only one that does', () => {
    expect(field(captionStyleLines(scriptFor('editorial'))[0]!, 'Fontname'))
      .toMatch(/Serif/);
    for (const id of ['clean', 'solid', 'lifted', 'social', 'highlight', 'quoted']) {
      expect(field(captionStyleLines(scriptFor(id))[0]!, 'Fontname'),
        `${id} should not be serif`).not.toMatch(/Serif/);
    }
  });

  it('Speaker captions say who is talking, in the one visual language', () => {
    const events = captionEvents(scriptFor('speakers'));
    expect(events[0]).toContain('SOURCE:');
    expect(events[1]).toContain('YOU:');
    // Carried by weight as well as by the word, so it survives greyscale (U-20).
    expect(events[0]).toContain('\\b1');
    // And no other look burns it in: the sidecars always carry it, the
    // picture usually says, and the prefix is clutter where it does.
    expect(captionEvents(scriptFor('clean'))[0]).not.toContain('SOURCE:');
  });

  it('Large social captions are the biggest and sit clear of the chrome', () => {
    const social = captionStyleLines(scriptFor('social'))[0]!;
    const clean = captionStyleLines(scriptFor('clean'))[0]!;
    expect(Number(field(social, 'Fontsize')))
      .toBeGreaterThan(Number(field(clean, 'Fontsize')));
    expect(Number(field(social, 'MarginV')))
      .toBeGreaterThan(Number(field(clean, 'MarginV')));
  });

  describe('Highlighted words', () => {
    /*
     * The obvious implementation is ASS karaoke, and it is wrong for what
     * this look is called: karaoke colours the words NOT YET SAID and turns
     * them plain as they arrive. "Each word lights as it is said" is the
     * opposite. So the line is redrawn once per word with one word lit.
     */
    it('draws the line once per word, with one word lit each time', () => {
      const drawn = captionEvents(scriptFor('highlight'))
        .filter((line) => line.includes('policy'));
      expect(drawn).toHaveLength(3);
      for (const line of drawn) {
        // The whole line every time — the effect is emphasis, not reveal.
        expect(line).toContain('The');
        expect(line).toContain('policy');
        expect(line).toContain('worked.');
        // And exactly one word lit, never two and never none.
        // Two overrides per line: one to light the word, one back to the ink.
        expect((line.match(/\\c&H[0-9A-F]{6,8}/g) ?? []).length).toBe(2);
      }
      // A different word each time, moving forward through the line.
      const lit = drawn.map((line) =>
        /\\c&H[0-9A-F]{6,8}\}([^{]+)\{/.exec(line)?.[1]?.trim());
      expect(lit).toEqual(['The', 'policy', 'worked.']);
    });

    it('holds a word lit across a pause rather than blinking out', () => {
      // The fixture leaves five frames between "policy" and "worked."
      const drawn = captionEvents(scriptFor('highlight'))
        .filter((line) => line.includes('policy'));
      const startOf = (line: string) => line.split(',')[1]!;
      const endOf = (line: string) => line.split(',')[2]!;
      expect(endOf(drawn[1]!)).toBe(startOf(drawn[2]!));
    });

    /*
     * The requirement this look has that no other does. Not every engine
     * times words. A caption is the accessible form of what was said, so the
     * fallback is a plain line — degraded, never dropped. [D-04]
     */
    it('draws a plain line when the engine timed no words', () => {
      const drawn = captionEvents(scriptFor('highlight'))
        .filter((line) => line.includes('For one year only.'));
      expect(drawn).toHaveLength(1);
      expect(drawn[0]).not.toMatch(/\\c&H/);
    });

    /*
     * Words are clipped to their shot, so a sentence straddling a cut keeps
     * its text and loses the words outside. Drawing the line from those would
     * publish a shorter sentence than the sidecar carries. [D-16]
     */
    it('and a plain line when the words do not reconstruct it', () => {
      const conv = conversation();
      setCaptionStyle(conv, 'highlight');
      const ass = buildAss(buildRenderPlan(conv), {
        cues: [{
          startFrame: 0, endFrame: 60, speaker: 'source' as const,
          text: 'The policy worked in that decade.',
          words: [{ text: 'The', startFrame: 0, endFrame: 20 },
            { text: 'policy', startFrame: 20, endFrame: 40 }],
        }],
      });
      const drawn = ass.split('\n')
        .filter((line) => /^Dialogue: .*,SourceCap,/.test(line));
      expect(drawn).toHaveLength(1);
      expect(drawn[0]).toContain('The policy worked in that decade.');
      expect(drawn[0]).not.toMatch(/\\c&H/);
    });
  });

  it('Source quote captions mark the source, and only the source', () => {
    const events = captionEvents(scriptFor('quoted'));
    expect(events[0]).toContain('“');
    expect(events[0]).toContain('\\i1');
    // The author's own words are not a quotation of anybody. [INV-05]
    expect(events[1]).not.toContain('“');
    expect(events[1]).toContain('For one year only.');
  });
});
