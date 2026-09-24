import Join from './Join.js';

export const dynamic = 'force-dynamic';

/**
 * The way in.  [Doctrine ROOM §6, §7, D-03]
 *
 * The page a forwarded link opens, on a phone, for somebody with no account.
 *
 * It deliberately renders NOTHING about the conversation before the token is
 * accepted — not its title, not its source, not whether it exists. The
 * existence of a conversation is private (D-03), and a join page that said
 * "that room is not found" for a bad token and showed a title for a good one
 * would be a way to test ids.
 */
export default async function JoinPage(
  { params, searchParams }: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ t?: string }>;
  },
) {
  const { id } = await params;
  const { t } = await searchParams;
  return <Join conversationId={id} token={t ?? ''} />;
}
