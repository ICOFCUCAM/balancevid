import { notFound } from 'next/navigation';
import { loadConversation } from '../../../../src/store/repository.js';
import { roomView } from '../../../../src/web/room.js';
import RoomView, { type RoomState } from './RoomView.js';
import OpenRoom from './OpenRoom.js';

export const dynamic = 'force-dynamic';

/**
 * The host's room.  [Doctrine ROOM §1]
 *
 * A different window from the Studio, reached from it. Middleware has already
 * required the owner's session for this path, so anyone rendering this is the
 * host.
 */
export default async function RoomPage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    notFound();
  }

  if (!conversation.room?.open) {
    return <OpenRoom conversationId={id} title={conversation.title} />;
  }
  return (
    <RoomView
      conversationId={id}
      host
      initial={roomView(conversation, true) as unknown as RoomState}
    />
  );
}
