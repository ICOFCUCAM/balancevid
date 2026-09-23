import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { accessTo } from '../../../../src/auth/request.js';
import { loadConversation } from '../../../../src/store/repository.js';
import Watch from './Watch.js';

export const dynamic = 'force-dynamic';

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
  const cookie = (await headers()).get('cookie') ?? '';
  const request = new Request('http://local/', { headers: { cookie } });
  if (await accessTo(request, conversation!) === 'denied') notFound();

  return <Watch conversationId={id} />;
}
