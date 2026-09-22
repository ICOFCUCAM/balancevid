import { appendChunk } from '../../../../../../../src/store/chunks.js';
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
