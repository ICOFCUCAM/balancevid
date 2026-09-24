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

  let card: ShareCard;
  try {
    card = buildPerformanceCard({
      performance,
      attribution: performanceAttribution(performance, performance.createdAt).text,
    });
  } catch (error) {
    // A published performance whose music was reclassified afterwards. The
    // page still refuses to describe it rather than describing it wrongly.
    if (error instanceof PerformanceCardError) return undefined;
    throw error;
  }

  const drawn = await stat(paths.performanceCard(performance.id))
    .then((file) => file.size > 0).catch(() => false);
  const origin = originOf(request);

  return {
    card,
    pageUrl: `${origin}/p/${performance.id}/watch`,
    ...(drawn
      ? { imageUrl: `${origin}/api/performances/${performance.id}/card?image=1` }
      : {}),
  };
}
