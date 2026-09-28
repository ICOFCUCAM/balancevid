import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { accessTo } from '../../../../src/auth/request.js';
import { loadChannel } from '../../../../src/store/channels.js';
import Watch from './Watch.js';

export const dynamic = 'force-dynamic';

/** The incoming request, rebuilt from the headers this page was rendered for. */
async function asRequest(): Promise<Request> {
  const incoming = await headers();
  return new Request('http://local/', {
    headers: { cookie: incoming.get('cookie') ?? '' },
  });
}

/**
 * What this page says about itself when somebody shares the link.
 *
 * AN UNPUBLISHED CHANNEL SAYS NOTHING, deliberately — this runs before the
 * page decides whether to 404, with none of the sender's cookies, so a title
 * here would hand the broadcaster's schedule to anyone who guessed a URL.
 * [D-03]
 *
 * And it does not say what is ON. A card is fetched once and cached by
 * whatever it was pasted into; a channel changes every few minutes, so a card
 * naming the programme would be wrong within the hour and wrong for ever
 * after. It names the channel, which is the thing that does not change.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  try {
    const channel = await loadChannel(id);
    const published = channel.publication && !channel.publication.unpublishedAt;
    if (!published) return { title: 'BalanceVid' };
    return {
      title: channel.name,
      description: 'Watch live.',
      openGraph: {
        type: 'video.other', title: channel.name, description: 'Watch live.',
      },
    };
  } catch {
    return { title: 'BalanceVid' };
  }
}

/**
 * Somebody watching the channel.  [Doctrine CHANNEL §17, U-31, D-03]
 *
 * The third studio's `/watch`, alongside `/c/[id]/watch` and `/p/[id]/watch`
 * — and the one that was missing, which meant a channel could be scheduled,
 * gone live on, failed over, branded and distributed, and watched by nobody.
 */
export default async function WatchChannel(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let channel;
  try {
    channel = await loadChannel(id);
  } catch {
    notFound();
  }

  /*
   * Unpublished is not a 403 to a stranger — that would confirm it exists —
   * it is simply not there. The same rule the playlist and the segments
   * enforce, so a viewer cannot reach the bytes by a different door. [D-03]
   */
  if (await accessTo(await asRequest(), channel!) === 'denied') notFound();

  return (
    <Watch
      channelId={channel!.id}
      name={channel!.name}
      {...(channel!.publication?.author
        ? { author: channel!.publication.author } : {})}
    />
  );
}
