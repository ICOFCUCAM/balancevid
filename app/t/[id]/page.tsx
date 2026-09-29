import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { isOwner } from '../../../src/auth/request.js';
import { loadChannel } from '../../../src/store/channels.js';
import { listConversations } from '../../../src/store/repository.js';
import { listPerformances } from '../../../src/store/performances.js';
import { streamQuality } from '../../../src/domain/quality.js';
import ChannelStudio from './ChannelStudio.js';
import { studiosOf } from '../../../src/domain/account.js';
import { theAccount } from '../../../src/store/accounts.js';

export const dynamic = 'force-dynamic';

/**
 * Studio Three.  [Doctrine CHANNEL §1, §13, D-18]
 *
 * A third address for a third document, for the reason `/p/[id]` is a second
 * one: "they can share the same underlying media/rendering infrastructure,
 * but don't force both experiences into one UI." A channel is not a longer
 * performance — it has no takes, no master clock and no render. It has a
 * schedule, and its clock is the wall.
 */
export default async function ChannelPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookie = (await headers()).get('cookie') ?? '';
  if (!(await isOwner(new Request('http://local/', { headers: { cookie } })))) notFound();

  let channel;
  try {
    channel = await loadChannel(id);
  } catch {
    notFound();
  }

  /* The other two studios, so the bar can point at them. [§13] */
  const [conversations, performances] = await Promise.all([
    listConversations().catch(() => []),
    listPerformances().catch(() => []),
  ]);

  return (
    <ChannelStudio
      initial={channel!}
      studioOneId={conversations[0]?.id}
      studioTwoId={performances[0]?.id}
      owned={studiosOf(await theAccount())}
      /*
       * THE INSTANT THIS PAGE WAS DRAWN.
       *
       * A control room is one long argument about what time it is, and every
       * string in it — the clock, the elapsed counter, the playhead, which
       * programme is on — comes out of one number. Server-rendered at T and
       * hydrated at T+1s, that number differs and React throws out the
       * markup it was handed. Passing it down means the browser's FIRST
       * render is the server's render, exactly, and the second one (a tick
       * later) is the browser's own. [§2, U-08]
       */
      serverNow={Date.now()}
      /*
       * WHAT THE CHANNEL TRANSMITS, which is not what this machine sends up.
       *
       * The engine re-encodes every piece onto one wire format, so an
       * operator broadcasting at 1080p and watching the 720p monitor beside
       * it would otherwise conclude the setting did nothing. It is set for
       * the deployment and read here rather than fetched, because the web
       * tier must never import the playout engine to find it out. [U-23]
       */
      transmission={streamQuality().id}
    />
  );
}
