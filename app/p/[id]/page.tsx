import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { isOwner } from '../../../src/auth/request.js';
import { loadPerformance } from '../../../src/store/performances.js';
import PerformanceStudio from './PerformanceStudio.js';

export const dynamic = 'force-dynamic';

/**
 * Studio Two.  [Doctrine STUDIO-TWO §13]
 *
 * A separate address from `/c/[id]`, because it is a separate studio over a
 * separate document. "They can share the same underlying media/rendering
 * infrastructure, but don't force both experiences into one UI."
 */
export default async function PerformancePage(
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const cookie = (await headers()).get('cookie') ?? '';
  if (!(await isOwner(new Request('http://local/', { headers: { cookie } })))) notFound();

  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    notFound();
  }

  return <PerformanceStudio initial={performance!} />;
}
