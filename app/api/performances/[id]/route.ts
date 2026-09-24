import { classifyMaster, setAudioMode, setScene, moveScene, removeScene, labelScene, clearScenes, nudgeTake, trimTake, renameTake, setEnvironment, removeTake, PerformanceEditError } from '../../../../src/domain/performanceEdit.js';
import { projectPerformance, covered } from '../../../../src/domain/performance.js';
import { assertAlignmentInvariants } from '../../../../src/domain/invariants.js';
import { listJobs } from '../../../../src/store/queue.js';
import {
  auditPerformance, loadPerformance, mutatePerformance,
} from '../../../../src/store/performances.js';
import { fail, json } from '../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The document, plus what is derived from it.  [STUDIO-TWO S-1, INV-00]
 *
 * The timeline is recomputed on every read and never stored, which is exactly
 * what makes it impossible to drift from the Performance.
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }

  let alignmentError: string | null = null;
  try {
    assertAlignmentInvariants(performance);
  } catch (error) {
    alignmentError = error instanceof Error ? error.message : String(error);
  }

  return json({
    performance,
    timeline: projectPerformance(performance),
    covered: covered(performance),
    alignmentError,
    jobs: await listJobs(id),
  });
}

/**
 * Every edit to a Performance, through one door.
 *
 * One route rather than a route per verb, because these are all the same kind
 * of thing — a change to the document — and the alternative is fifteen files
 * that differ by four lines.
 */
export async function PATCH(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const body = await request.json().catch(() => ({})) as Record<string, any>;

  try {
    const performance = await mutatePerformance(id, (draft) => {
      switch (body['action']) {
        case 'classify-master':
          classifyMaster(draft, { class: body['class'], licence: body['licence'] ?? null });
          break;
        case 'audio-mode':
          setAudioMode(draft, body['mode'], body['vocalTakeId'] ?? null);
          break;
        case 'set-scene':
          setScene(draft, body['at'], {
            layoutId: body['layoutId'], takeIds: body['takeIds'] ?? [],
            ...(body['transition'] ? { transition: body['transition'] } : {}),
            ...(body['label'] ? { label: body['label'] } : {}),
            ...(body['audioMode'] ? { audioMode: body['audioMode'] } : {}),
          });
          break;
        case 'move-scene': moveScene(draft, body['sceneId'], body['at']); break;
        case 'remove-scene': removeScene(draft, body['sceneId']); break;
        case 'label-scene': labelScene(draft, body['sceneId'], body['label'] ?? null); break;
        case 'clear-scenes': clearScenes(draft); break;
        case 'nudge-take': nudgeTake(draft, body['takeId'], body['nudgeSamples']); break;
        case 'trim-take':
          trimTake(draft, body['takeId'],
            body['useFromSample'] ?? null, body['useToSample'] ?? null);
          break;
        case 'rename-take': renameTake(draft, body['takeId'], body['label']); break;
        case 'set-environment':
          setEnvironment(draft, body['takeId'], body['environment']);
          break;
        case 'remove-take': removeTake(draft, body['takeId']); break;
        default: throw new PerformanceEditError(`unknown action: ${body['action']}`);
      }
    });
    await auditPerformance(id, { action: `performance.${body['action']}`, detail: body });
    return json({ performance, timeline: projectPerformance(performance) });
  } catch (error) {
    if (error instanceof PerformanceEditError) return fail(400, error.message);
    return fail(404, error instanceof Error ? error.message : 'performance not found');
  }
}
