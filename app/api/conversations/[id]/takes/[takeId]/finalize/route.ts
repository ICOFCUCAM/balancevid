import { chunkStatus } from '../../../../../../../src/store/chunks.js';
import { enqueue } from '../../../../../../../src/store/queue.js';
import { audit, loadConversation } from '../../../../../../../src/store/repository.js';
import { callerFor } from '../../../../../../../src/auth/request.js';
import { mayWriteTake } from '../../../../../../../src/web/room.js';
import { fail, json } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; takeId: string }> };

/**
 * Close a take and queue its assembly.
 *
 * `prerollSegments` is how many leading segments were captured BEFORE the user
 * pressed the key (U-04). They are kept, not discarded -- the worker measures
 * their real duration to place the default trim, and the user can always
 * recover the words they said before deciding to speak.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id, takeId } = await params;
  const body = await request.json().catch(() => ({})) as {
    interventionId?: string;
    prerollSegments?: number;
    captureMimeType?: string;
  };
  if (!body.interventionId) return fail(400, 'interventionId is required');

  // The same check the chunks took, because closing a take is a write too.
  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }
  const caller = await callerFor(request, conversation);
  if (!mayWriteTake(conversation, takeId, caller)) {
    return fail(404, 'conversation not found');
  }

  const status = await chunkStatus(id, takeId);
  if (status.count === 0) return fail(409, 'no chunks were received for this take');

  const job = await enqueue({
    kind: 'assemble_take',
    conversationId: id,
    payload: {
      interventionId: body.interventionId,
      takeId,
      prerollSegments: body.prerollSegments ?? 0,
      captureMimeType: body.captureMimeType ?? '',
    },
  });
  await audit(id, {
    action: 'take.closed',
    detail: { takeId, segments: status.count, bytes: status.bytes, prerollSegments: body.prerollSegments },
  });
  return json({ job, chunks: status.count, bytes: status.bytes }, { status: 202 });
}
