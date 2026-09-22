import { notFound } from 'next/navigation';
import { loadConversation } from '../../../../src/store/repository.js';
import Watch from './Watch.js';

export const dynamic = 'force-dynamic';

export default async function WatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await loadConversation(id);
  } catch {
    notFound();
  }
  return <Watch conversationId={id} />;
}
