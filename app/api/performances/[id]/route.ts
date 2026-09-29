import { isOwner } from '../../../../src/auth/request.js';
import { bookingsFor, refusalFor } from '../../../../src/domain/deletion.js';
import { deletePerformance } from '../../../../src/store/performances.js';
import { listChannels } from '../../../../src/store/channels.js';
import { acceptBeats, setTempo,
  classifyMaster, usePlate, setAudioMode, setSceneAudio, setTransition, setTransitionTiming, setScene, moveScene, moveBoundary, coverGap, coverWith, removeScene, labelScene, clearScenes, nudgeTake, trimTake, renameTake, renamePerformance, setEffect, setCleanup, setLyrics, setEnvironment, setReframe, removeTake, setLoop, setFootageRights, PerformanceEditError } from '../../../../src/domain/performanceEdit.js';
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
        /*
         * Trim. The same move, with the question `moveScene` deliberately
         * does not ask: a live switch is the author's and is not
         * second-guessed; a drag is looking at the consequence and would
         * rather be stopped. [MASTER-EDIT §2]
         */
        case 'move-boundary':
          moveBoundary(draft, body['sceneId'], body['at']);
          break;
        /* Close a hole in one action, or say why it cannot be closed. [INV-03] */
        case 'cover-gap': coverGap(draft, body['sceneId'], body['fromSample']); break;
        /* The other repair: a take that reaches, put on the hole. [§13] */
        case 'cover-with':
          coverWith(draft, body['fromSample'], body['toSample'], body['takeId']);
          break;
        case 'remove-scene': removeScene(draft, body['sceneId']); break;
        case 'label-scene': labelScene(draft, body['sceneId'], body['label'] ?? null); break;
        /*
         * An acceptance names somebody, exactly as accepting a claim does
         * (U-15, INV-06). "The product accepted it" is not an acceptance.
         */
        case 'accept-beats':
          acceptBeats(draft, String(body['by'] ?? ''), new Date().toISOString());
          break;
        case 'set-tempo':
          setTempo(draft, Number(body['bpm']), String(body['by'] ?? ''),
            new Date().toISOString());
          break;
        case 'scene-transition':
          setTransition(draft, body['sceneId'], body['transition'] ?? null);
          break;
        /*
         * How long the arrival takes and who pays for it. Null for either
         * puts that one back to the style's own. [MASTER-EDIT §3]
         */
        case 'transition-timing':
          /*
           * `??` WOULD BE WRONG HERE. Absent and null mean different things
           * to this edit — leave it alone, versus put it back to the style
           * default — and collapsing them would make the alignment buttons
           * reset the duration. [MASTER-EDIT §3]
           */
          setTransitionTiming(draft, body['sceneId'],
            Object.hasOwn(body, 'frames') ? body['frames'] : undefined,
            Object.hasOwn(body, 'align') ? body['align'] : undefined);
          break;
        case 'scene-audio':
          setSceneAudio(draft, body['sceneId'], body['mode'] ?? null);
          break;
        case 'clear-scenes': clearScenes(draft); break;
        case 'nudge-take': nudgeTake(draft, body['takeId'], body['nudgeSamples']); break;
        /*
         * A reframe needs no pass over the media — it is four numbers
         * — so it belongs here with trim and nudge rather than in a
         * route of its own like `stabilize`, which has to measure the
         * shake before it can undo it.
         */
        case 'reframe-take':
          setReframe(draft, body['takeId'], body['reframe'] ?? null);
          break;
        case 'trim-take':
          trimTake(draft, body['takeId'],
            body['useFromSample'] ?? null, body['useToSample'] ?? null);
          break;
        case 'rename-take': renameTake(draft, body['takeId'], body['label']); break;
        case 'rename': renamePerformance(draft, body['title']); break;
        case 'set-environment':
          setEnvironment(draft, body['takeId'], body['environment']);
          break;
        case 'set-effect':
          setEffect(draft, body['takeId'], body['effect'] ?? null);
          break;
        /* The words of the song, so the export can carry captions. [INV-07] */
        case 'set-lyrics':
          setLyrics(draft, body['lrc'] ?? null);
          break;
        /* The room the take was recorded in. [MASTER-EDIT §8] */
        case 'set-cleanup':
          setCleanup(draft, body['takeId'], body['cleanup'] ?? null);
          break;
        case 'use-plate':
          usePlate(draft, body['takeId'], body['plateAssetId'] ?? null);
          break;
        case 'remove-take': removeTake(draft, body['takeId']); break;
        /* Footage, which is a take that nobody performed. [§5, S-29] */
        case 'set-loop':
          setLoop(draft, body['takeId'], body['loop'] !== false);
          break;
        case 'set-footage-rights':
          setFootageRights(
            draft, body['takeId'], body['rights'], body['rightsNote'] ?? null);
          break;
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

/**
 * Throw it away.  [Doctrine §19, STUDIO-TWO §13, D-18]
 *
 * The performance, its takes, its renders — and the song. That last one is
 * the reason this confirmation is worded the way it is on the page: a master
 * track is the one thing in here somebody may not have another copy of.
 *
 * The same question is put to the channels first, for the same reason: a
 * render of this performance may be in a loop that plays all night.
 */
export async function DELETE(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  if (!(await isOwner(request))) return fail(404, 'performance not found');
  try {
    await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }

  const channels = await listChannels().catch(() => []);
  const refusal = refusalFor(bookingsFor(channels, 'performance', id));
  if (refusal) return fail(409, refusal);

  await deletePerformance(id);
  return json({ ok: true, deleted: id });
}
