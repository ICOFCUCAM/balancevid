import { newId } from '../../../../../../src/domain/ids.js';
import {
  auditPerformance, loadPerformance,
} from '../../../../../../src/store/performances.js';
import { fail, json } from '../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * A sound is about to be recorded.  [TIMELINE B6i, B8; U-06]
 *
 * "Recording directly into the timeline." The same three-step shape a
 * take has, and for the same reason: the recording is DECLARED before
 * any media exists, so a browser that crashes halfway through a
 * voice-over has still left the segments it managed to send, and so
 * chunks never arrive for something nobody declared.
 *
 * NOTHING IS DECIDED HERE. Not the label, not the track, and above all
 * not where it lands — the recorder knows where the song actually was
 * when capture began, and it does not know that until it has begun.
 * All this call does is hand back somewhere for the segments to go.
 */
export async function POST(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  try {
    await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }

  const recordingId = newId('rec');
  await auditPerformance(id, {
    action: 'sound.recording-began', detail: { recordingId },
  });
  return json({ recordingId }, { status: 201 });
}
