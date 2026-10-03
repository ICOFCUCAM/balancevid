/**
 * What a link to a performance says about itself.
 * [Doctrine STUDIO-TWO §14, U-30, U-31, D-03]
 *
 * The other studio's `share.ts`, for the other document. Written beside it
 * rather than generalised into one function with a union parameter, for the
 * same reason the two stores are separate files: the two documents answer
 * "what is this" with different facts, and a shared implementation would be a
 * pile of branches on which kind it was.
 */
import { stat } from 'node:fs/promises';

import type { Performance } from '../domain/performance.js';
import { callCredit } from '../domain/campaign.js';
import { callInPerformance } from '../store/campaigns.js';
import { performanceAttribution } from '../domain/performancePlan.js';
import { buildPerformanceCard, PerformanceCardError } from '../publish/performanceCard.js';
import type { ShareCard } from '../publish/card.js';
import { paths } from '../store/paths.js';
import { originOf } from './share.js';

export interface PerformanceShare {
  card: ShareCard;
  pageUrl: string;
  imageUrl?: string;
}

/**
 * The card for a performance, with the call it answered on it.
 *   [GO-VIRAL V-6; D-19]
 *
 * FOUR CALLERS AND ONE OF THEM WAS MISSED, which is why this
 * function exists. `buildPerformanceCard` is pure and takes the
 * call as a string; three places called it — the share metadata,
 * the worker that draws the picture, and the route that serves
 * both the card and the image — and the first version of V-6
 * taught two of them to look the call up. A browser run found
 * the third: the preview a chat app actually reads said nothing
 * about the competition the video won.
 *
 * SO THE LOOKUP IS HERE, ONCE. Pure card-building stays in
 * `src/publish/`; the one line about where to find the call is
 * in one place that every caller goes through.
 *
 * `at` IS THE ORIGIN OR NOTHING. A caller with a request gives
 * the origin the browser reached, so a posted card links back to
 * the installation the reader is on; the worker drawing the
 * picture has none and gives an empty string, which leaves the
 * path. A hostname invented here would be printed on every card
 * this installation ever posts. [`originOf`]
 */
export async function performanceCardFor(
  performance: Performance, at = '',
): Promise<ShareCard> {
  const call = await callInPerformance(performance);
  return buildPerformanceCard({
    performance,
    attribution: performanceAttribution(performance, performance.createdAt).text,
    ...(call ? { call: callCredit(call, `${at}/go/${call.slug ?? call.id}`) } : {}),
  });
}

/** Published, and not withdrawn. */
export function isPerformancePublic(performance: Performance): boolean {
  const publication = performance.publication;
  return Boolean(publication && !publication.unpublishedAt);
}

/**
 * The card for this performance, or nothing.
 *
 * Nothing for an unpublished one, and that is the point rather than an
 * omission: a preview is fetched by whatever the link was pasted into, with
 * none of the sender's cookies, so metadata on a draft would hand its title
 * and its music to any machine that guessed the URL.
 */
export async function performanceShareFor(
  request: Request, performance: Performance,
): Promise<PerformanceShare | undefined> {
  if (!isPerformancePublic(performance)) return undefined;

  const origin = originOf(request);

  let card: ShareCard;
  try {
    card = await performanceCardFor(performance, origin);
  } catch (error) {
    // A published performance whose music was reclassified afterwards. The
    // page still refuses to describe it rather than describing it wrongly.
    if (error instanceof PerformanceCardError) return undefined;
    throw error;
  }

  const drawn = await stat(paths.performanceCard(performance.id))
    .then((file) => file.size > 0).catch(() => false);

  return {
    card,
    pageUrl: `${origin}/p/${performance.id}/watch`,
    ...(drawn
      ? { imageUrl: `${origin}/api/performances/${performance.id}/card?image=1` }
      : {}),
  };
}
