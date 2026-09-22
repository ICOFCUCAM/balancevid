import { notFound } from 'next/navigation';
import { loadConversation } from '../../../src/store/repository.js';
import Studio from './Studio.js';

export const dynamic = 'force-dynamic';

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await loadConversation(id);
  } catch {
    notFound();
  }
  return <Studio conversationId={id} />;
}
