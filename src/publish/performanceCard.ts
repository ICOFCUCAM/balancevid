/**
 * The share card for a performance.  [Doctrine STUDIO-TWO §14, U-30, D-16]
 *
 * The same object the other studio's card is — `ShareCard`, drawn by the same
 * renderer — because a link preview is a link preview and a second one would
 * be a second set of typography to keep in step with the first.
 *
 * WHAT CHANGES IS WHAT IS TRUE. A conversation's card is built around a bound
 * quote, because the honesty rule there is about not overstating what somebody
 * said. A performance quotes nobody: there is no transcript, no claim, and no
 * statement to bind. So the hero is the performance's own title, the eyebrow
 * names the music, and the scale is what there is — how many performances, and
 * how long. Every string comes from the document or from the generated
 * attribution; nothing is written here that lives nowhere else (D-16).
 *
 * AND IT IS GATED. A card is a thing made to be posted, so INV-15 applies to
 * it exactly as it applies to a publishable export: a performance over music
 * the author has not claimed does not get a preview image to post with.
 */

import type { Performance } from '../domain/performance.js';
import { mayPublish } from '../domain/performance.js';
import { formatMasterPosition } from '../domain/time.js';
import { CARD_HEIGHT, CARD_WIDTH, type ShareCard } from './card.js';

export class PerformanceCardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PerformanceCardError';
  }
}

export interface PerformanceCardInputs {
  performance: Performance;
  /** Generated from the record, never typed. [U-21, INV-07] */
  attribution: string;
}

export function buildPerformanceCard(inputs: PerformanceCardInputs): ShareCard {
  const { performance, attribution } = inputs;
  if (!mayPublish(performance.master)) {
    throw new PerformanceCardError(
      `"${performance.master.title}" is not marked as something you may publish, `
      + 'so there is nothing to make a link preview of');
  }

  const { master } = performance;
  const eyebrow = master.artist
    ? `“${master.title}” by ${master.artist}`
    : `“${master.title}”`;

  const performances = performance.takes.filter((take) => take.durationSamples > 0).length;
  const count = performances === 1 ? '1 performance' : `${performances} performances`;
  const runtime = master.durationSamples > 0
    ? formatMasterPosition(master.durationSamples)
    : undefined;
  const scale = runtime ? `${count} · ${runtime}` : count;

  return {
    title: performance.title,
    // The same facts in the same order as the picture, for the places that
    // show text and no image.
    description: `${eyebrow}. ${scale}.`,
    hero: {
      text: performance.title,
      /*
       * Never quoted. Quotation marks on this card would be a claim that
       * somebody said these words, and nobody did — the title is the author's
       * name for their own video. The conversation's card earns its quotes by
       * hashing what the source actually said (INV-05); there is no equivalent
       * here, so there are no quotes.
       */
      quoted: false,
    },
    eyebrow,
    attribution,
    scale,
    image: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      alt: `${performance.title} — ${performances === 1 ? 'a performance' : 'performances'}`
        + ` of ${eyebrow}`,
    },
  };
}
