import { appendChunk } from '../../../../../../../src/store/chunks.js';
import { callerFor } from '../../../../../../../src/auth/request.js';
import { loadConversation } from '../../../../../../../src/store/repository.js';
import { mayWriteTake } from '../../../../../../../src/web/room.js';
import { fail, json } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; takeId: string }> };

/**
 * Persist one recording timeslice.  [Doctrine U-06 §2]
 *
 * Called continuously while the user is still speaking, not once at the end. A
 * tab crash, a browser update, or a closed lid at minute nine of a ten-minute
 * explanation then costs one timeslice instead of the whole take.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id, takeId } = await params;

  /*
   * Whose take is this?  [ROOM §10, D-03]
   *
   * The owner records into their own conversation; a guest records only into
   * a take that hangs off an intervention naming them. Checked on EVERY
   * chunk, not once when the take was made: a take id travels in a URL, and
   * whoever created it is not evidence about who is sending now.
   */
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

  const index = Number(new URL(request.url).searchParams.get('index'));
  if (!Number.isInteger(index) || index < 0) return fail(400, 'index must be a non-negative integer');

  const buffer = new Uint8Array(await request.arrayBuffer());
  if (buffer.byteLength === 0) return fail(400, 'empty chunk');

  try {
    const result = await appendChunk(id, takeId, index, buffer);
    return json(result, { status: 202 });
  } catch (error) {
    return fail(400, error instanceof Error ? error.message : 'bad chunk');
  }
}
