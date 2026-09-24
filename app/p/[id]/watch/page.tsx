import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { accessTo } from '../../../../src/auth/request.js';
import { performanceAttribution } from '../../../../src/domain/performancePlan.js';
import { listJobs } from '../../../../src/store/queue.js';
import { loadPerformance } from '../../../../src/store/performances.js';
import { performanceShareFor } from '../../../../src/web/performanceShare.js';
import { formatMasterPosition } from '../../../../src/domain/time.js';
import Watch from './Watch.js';

export const dynamic = 'force-dynamic';

/** The incoming request, rebuilt from the headers this page was rendered for. */
async function asRequest(): Promise<Request> {
  const incoming = await headers();
  return new Request('http://local/', {
    headers: {
      cookie: incoming.get('cookie') ?? '',
      ...(incoming.get('host') ? { host: incoming.get('host')! } : {}),
      ...(incoming.get('x-forwarded-host')
        ? { 'x-forwarded-host': incoming.get('x-forwarded-host')! } : {}),
      ...(incoming.get('x-forwarded-proto')
        ? { 'x-forwarded-proto': incoming.get('x-forwarded-proto')! } : {}),
    },
  });
}

/**
 * What this page says about itself when somebody shares the link.
 *
 * AN UNPUBLISHED PERFORMANCE SAYS NOTHING, deliberately — this runs before the
 * page decides whether to 404, with none of the sender's cookies, so a title
 * here would hand the author's work to anyone who guessed a URL. [D-03]
 */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  try {
    const performance = await loadPerformance(id);
    const share = await performanceShareFor(await asRequest(), performance);
    if (!share) return { title: 'BalanceVid' };
    const { card } = share;
    return {
      title: card.title,
      description: card.description,
      openGraph: {
        type: 'video.other',
        title: card.title,
        description: card.description,
        url: share.pageUrl,
        // Claimed only when the worker has drawn it: an og:image that answers
        // 404 is a small lie the page does not need to tell.
        ...(share.imageUrl ? {
          images: [{
            url: share.imageUrl,
            width: card.image.width,
            height: card.image.height,
            alt: card.image.alt,
          }],
        } : {}),
      },
      twitter: {
        card: share.imageUrl ? 'summary_large_image' : 'summary',
        title: card.title,
        description: card.description,
        ...(share.imageUrl ? { images: [share.imageUrl] } : {}),
      },
    };
  } catch {
    return { title: 'BalanceVid' };
  }
}

export default async function WatchPerformance(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    notFound();
  }

  /*
   * Unpublished is not a 403 to a stranger — that would confirm it exists —
   * it is simply not there. [D-03, U-31]
   */
  if (await accessTo(await asRequest(), performance!) === 'denied') notFound();

  const publication = performance!.publication!;
  const jobs = await listJobs(id);

  /*
   * The clips that belong to what was published, and only those. A clip made
   * from a later edit is not part of this video, and offering it under this
   * link would be publishing something nobody pressed publish on.
   */
  const clips = jobs
    .filter((job) => job.kind === 'render_performance_clip' && job.state === 'done')
    .filter((job) => Number(job.payload?.['toSample'] ?? 0) > 0)
    .map((job) => ({
      url: `/api/performances/${id}/clips/${String(job.result!['planHash'])}/file`,
      label: formatMasterPosition(Number(job.payload!['fromSample'] ?? 0)),
    }));

  return (
    <Watch
      title={performance!.title}
      videoUrl={`/api/performances/${id}/renders/${publication.planHash}/file`}
      attribution={performanceAttribution(performance!, performance!.createdAt).text}
      {...(publication.author ? { author: publication.author } : {})}
      clips={clips}
    />
  );
}
