/**
 * What the caption says.  [CHANNEL §13, §5, §6, §9, D-04, C-26, C-42]
 *
 * THE BRIEF'S POINT 3: *"The viewer needs to know what they are
 * watching, not just which channel."* The lower third has carried
 * the programme's title since the identity was written. The half
 * that was missing is the one the brief keeps drawing — what KIND
 * of thing this is.
 *
 * AND THE TITLE WAS OFTEN THE CHANNEL'S OWN NAME. `titleOf` falls
 * back to it for a live session with a segment up, for the
 * emergency cut, for the backup and for anything untitled — so the
 * caption said the station's name under a bug that already said the
 * station's name. C-26 condemns exactly that: *"a name in two
 * corners of the same graphic is a station that does not trust the
 * viewer to have seen it."* It was doing it on air.
 */

import { describe, expect, it } from 'vitest';

import type { OnAir, ProgrammeSource } from '../../src/domain/channel.js';
import {
  captionFor, nextLine, sourceLine, stateLine,
} from '../../src/domain/caption.js';
import { type ChannelIdentity, marksFor } from '../../src/domain/identity.js';

const CONVERSATION: ProgrammeSource = {
  kind: 'render', document: 'conversation',
  documentId: 'conv_1', planHash: 'h',
};
const PERFORMANCE: ProgrammeSource = {
  kind: 'render', document: 'performance',
  documentId: 'perf_1', planHash: 'h',
};
const LIVE: ProgrammeSource = { kind: 'live', ingestId: 'ing_1' as never };
const STILL: ProgrammeSource = { kind: 'media', assetId: 'a', form: 'image' };
const FILM: ProgrammeSource = { kind: 'media', assetId: 'a', form: 'video' };

const on = (over: Partial<OnAir> = {}): OnAir => ({
  kind: 'rotation',
  entry: { id: 'rot_1' as never, source: CONVERSATION, durationMs: 1,
    createdAt: '2026-01-01T00:00:00.000Z' },
  source: CONVERSATION, fromMs: 0, untilMs: 1, ...over,
} as OnAir);

describe('what kind of thing is on (C-42)', () => {
  /* The schedule already knows which studio made it. */
  it('names the studio a render came from', () => {
    expect(sourceLine(CONVERSATION)).toBe('Studio One · Conversation');
    expect(sourceLine(PERFORMANCE)).toBe('Studio Two · Performance');
  });

  /*
   * "LIVE FROM THE STUDIO" rather than "LIVE". The lamp in the
   * corner already says it is live, and a caption repeating the
   * lamp is the second name in the second corner again.
   */
  it('says where a live feed is coming from, not that it is live', () => {
    expect(sourceLine(LIVE)).toBe('Live from the studio');
    expect(sourceLine(LIVE)).not.toBe('Live');
  });

  /*
   * NOTHING HONEST TO SAY IS NOTHING. A caption reading "MEDIA"
   * would be the product describing its own data model to a viewer,
   * and a slide is already the graphic — it does not need a label
   * saying it is one.
   */
  it('says nothing about a still', () => {
    expect(sourceLine(STILL)).toBe(null);
    expect(sourceLine(FILM)).toBe('Film');
    expect(sourceLine(undefined)).toBe(null);
  });
});

describe('the two things that outrank the source (C-42)', () => {
  /* A viewer who has just been cut away from needs to know that
     before they need to know which studio made the replacement. */
  it('says the transmission was interrupted', () => {
    expect(stateLine(on({ kind: 'emergency' }))).toBe('Interrupted');
    expect(stateLine(on({ kind: 'backup' }))).toBe('Standing by');
    expect(stateLine(on())).toBe(null);
  });

  it('puts that on the caption instead of the studio', () => {
    expect(captionFor(on({ kind: 'emergency' }), 'A title')?.under)
      .toBe('Interrupted');
  });
});

describe('who the caption is about (C-42)', () => {
  /*
   * A LOWER THIRD IDENTIFIES THE PERSON WHEN THERE IS ONE. A
   * caption that led with the show's title over somebody's face
   * would be the station introducing itself while a person is
   * talking.
   */
  it('leads with the person when there is one', () => {
    expect(captionFor(on(), 'The Ancient of Days',
      { presenter: 'James Chama Meyembi' }))
      .toEqual({ lead: 'James Chama Meyembi',
        under: 'Studio One · Conversation' });
  });

  /* The brief's point 2, exactly: the name, then what they are. */
  it('puts a typed role under the name', () => {
    expect(captionFor(on(), 'A title',
      { presenter: 'James Chama Meyembi', role: 'Host' }))
      .toEqual({ lead: 'James Chama Meyembi', under: 'Host' });
  });

  /* Two "what this is" lines would be the third fact this refuses
     to draw. The operator typed one of them on purpose. */
  it('lets the typed role beat what the schedule knows', () => {
    expect(captionFor(on(), 'A title', { role: 'Host' })?.under).toBe('Host');
  });

  it('leads with the programme when nobody is named', () => {
    expect(captionFor(on(), 'The Ancient of Days'))
      .toEqual({ lead: 'The Ancient of Days',
        under: 'Studio One · Conversation' });
  });
});

describe('the channel’s own name is not a title (C-42)', () => {
  /*
   * `titleOf` falls back to the channel's name whenever it runs out
   * of answers, and printing that under a bug that already says it
   * is the fault this function exists to stop.
   */
  it('refuses to print the station’s name as the programme', () => {
    const caption = captionFor(on({ kind: 'live' } as never),
      'REDEMPTION TV', {}, 'REDEMPTION TV');
    expect(caption?.lead).not.toBe('REDEMPTION TV');
  });

  it('falls back to the one true thing it has', () => {
    const caption = captionFor(
      { kind: 'live', session: {} as never, source: LIVE, fromMs: 0 },
      'REDEMPTION TV', {}, 'REDEMPTION TV');
    expect(caption).toEqual({ lead: 'Live from the studio' });
  });

  /* A channel whose programme really is called that keeps it when
     it is not also the station's name. */
  it('keeps a real title that merely looks like one', () => {
    expect(captionFor(on(), 'REDEMPTION TV', {}, 'Another Channel')?.lead)
      .toBe('REDEMPTION TV');
  });

  /* And says nothing at all rather than the station's name twice. */
  it('says nothing when it has nothing', () => {
    expect(captionFor(on({ source: STILL } as never),
      'REDEMPTION TV', {}, 'REDEMPTION TV')).toBe(null);
  });
});

describe('NEXT, with the time it starts (C-42)', () => {
  /* The half a viewer deciding whether to wait actually needs. */
  it('carries the clock when there is one', () => {
    expect(nextLine({ title: 'Live Conversation', at: '16:30' }))
      .toBe('NEXT  16:30  Live Conversation');
  });

  it('is still worth saying without one', () => {
    expect(nextLine({ title: 'Live Conversation' }))
      .toBe('NEXT  Live Conversation');
  });

  it('says nothing when nothing follows', () => {
    expect(nextLine(undefined)).toBe(null);
    expect(nextLine({ at: '16:30' })).toBe(null);
    expect(nextLine({ title: '  ' })).toBe(null);
  });
});

describe('and the identity actually composes it (C-42)', () => {
  /*
   * THE TWO MUTANTS THAT SURVIVED EVERYTHING ABOVE. `caption.ts`
   * was tested to the letter and nothing asserted that `marksFor`
   * reads the role or joins the two lines — so a wiring that threw
   * half the caption away passed the whole suite. The judgement
   * being right is not the same as the judgement being used.
   */
  const identity: ChannelIdentity = {
    lowerThird: { show: 'always', holdMs: 8000,
      presenter: 'James Chama Meyembi', role: 'Host' },
    ink: '#ffffff',
  };
  const live: OnAir = {
    kind: 'live', session: {} as never, source: LIVE, fromMs: 0,
  };

  it('puts both lines on the mark, joined for the renderer', () => {
    const [lower] = marksFor(identity, live, 0, () => 'REDEMPTION TV',
      undefined, 'REDEMPTION TV').filter((one) => one.kind === 'lower-third');
    expect(lower?.text).toContain('James Chama Meyembi');
    expect(lower?.text).toContain('Host');
    expect(lower?.text).toContain('\u00b7');
  });

  it('reads the role the operator typed', () => {
    const without: ChannelIdentity = {
      ...identity,
      lowerThird: { show: 'always', holdMs: 8000,
        presenter: 'James Chama Meyembi' },
    };
    const text = (one: ChannelIdentity) => marksFor(one, live, 0,
      () => 'REDEMPTION TV', undefined, 'REDEMPTION TV')
      .find((mark) => mark.kind === 'lower-third')?.text ?? '';
    expect(text(identity)).toContain('Host');
    expect(text(without)).not.toContain('Host');
    expect(text(without)).toContain('Live from the studio');
  });

  /* And NEXT carries the clock all the way to the mark. */
  it('puts the time on the NEXT mark', () => {
    const next = marksFor(identity, live, 0, () => 'REDEMPTION TV',
      { title: 'Live Conversation', at: '16:30' }, 'REDEMPTION TV')
      .find((one) => one.kind === 'next');
    expect(next?.text).toBe('NEXT  16:30  Live Conversation');
  });
});
