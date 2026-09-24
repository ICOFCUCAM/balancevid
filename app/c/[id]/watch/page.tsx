import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { accessTo } from '../../../../src/auth/request.js';
import { loadConversation } from '../../../../src/store/repository.js';
import { shareFor } from '../../../../src/web/share.js';
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
 * A published conversation is a link people send each other, and until it
 * could describe itself it arrived as a bare URL. [U-31, §52]
 *
 * A DRAFT SAYS NOTHING, deliberately. Metadata is fetched by whatever the link
 * was pasted into, with none of the sender's cookies, and this function runs
 * before the page decides whether to 404 — so a title here would leak the
 * existence and subject of an unpublished conversation to anyone who guessed
 * a URL. `shareFor` returns nothing for a draft and this returns the generic
 * title. [D-03]
 */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  try {
    const conversation = await loadConversation(id);
    const share = await shareFor(await asRequest(), conversation, 'watch');
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
        // Claimed only when the worker has drawn it: an og:image that
        // answers 404 is a small lie the page does not need to tell.
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

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    notFound();
  }

  /*
   * "Anyone can open it and respond to it" applies to a PUBLISHED
   * conversation (U-31). An unpublished one is not a 403 to a stranger — that
   * would confirm it exists — it is simply not there.
   */
  if (await accessTo(await asRequest(), conversation!) === 'denied') notFound();

  return <Watch conversationId={id} />;
}
