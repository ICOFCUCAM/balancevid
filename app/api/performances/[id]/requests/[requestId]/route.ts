import { copyFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  ParticipationError, accept, hold, reject, rotate,
} from '../../../../../../src/domain/participationEdit.js';
import { viewFor } from '../../../../../../src/domain/participation.js';
import { PerformanceEditError, addTake } from '../../../../../../src/domain/performanceEdit.js';
import type { AssetId, TakeId } from '../../../../../../src/domain/document.js';
import { newId } from '../../../../../../src/domain/ids.js';
import { paths } from '../../../../../../src/store/paths.js';
import { enqueue } from '../../../../../../src/store/queue.js';
import {
  auditPerformance, loadPerformance, mutatePerformance,
} from '../../../../../../src/store/performances.js';
import {
  linkFor, loadRequest, mutateRequest, newSecret,
} from '../../../../../../src/store/requests.js';
import { fail, json } from '../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; requestId: string }> };

/** The shape our ids have. Refused rather than sanitised. [INV-15] */
const REQUEST = /^req_[A-Za-z0-9]{1,64}$/;
const SUBMISSION = /^sub_[A-Za-z0-9_-]{1,120}$/;

/**
 * What a producer does with what came back.  [TAKE-APP T10, T10a, T11; D-25]
 *
 * "Preview / Accept / Reject / Hold / Add to programme."
 *
 * ACCEPTING IS THE ONLY MOMENT A SUBMISSION BECOMES PRODUCTION
 * MATERIAL, and that is the whole of D-25. Until it happens, what
 * exists is a file on a request that nothing in the performance
 * knows about; after it, there is an ordinary take in the rail with
 * everything a take has.
 *
 * AND IT BECOMES ONE THROUGH THE PIPELINE EVERY OTHER TAKE GOES
 * THROUGH. The submission is put where a recorder's segments go and
 * the ordinary assembler is queued: joined, normalised, MEASURED,
 * aligned against the master, postered and stripped. A second path
 * that turned a file into a take would be a second place alignment
 * could be got wrong — and alignment is the thing this studio is
 * for. [D-19, S-3, U-02]
 *
 * WHAT THE PHONE MEASURED IS A HINT AND NOTHING MORE. The worker
 * checks it against the song exactly as it checks a take recorded in
 * the studio, which is what catches a phone that recorded at a rate
 * it did not claim. [§10, S-3, INV-06]
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id, requestId } = await params;
  if (!REQUEST.test(requestId)) return fail(404, 'no such request');

  const body = await request.json().catch(() => ({})) as {
    action?: string;
    submissionId?: string;
  };

  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'that performance could not be found');
  }

  let found;
  try {
    found = await loadRequest(requestId);
  } catch {
    return fail(404, 'no such request');
  }
  /* Checked against the performance that asked: without it a producer
     could act on another producer's request by editing a path. [D-25] */
  if (found.holder.kind !== 'performance' || found.holder.id !== id) {
    return fail(404, 'no such request');
  }

  const now = new Date().toISOString();
  const by = 'owner';

  try {
    switch (body.action) {
      case 'reject': {
        const updated = await mutateRequest(requestId, (draft) => {
          reject(draft, now, by);
        });
        await auditPerformance(id, {
          action: 'request.rejected', detail: { requestId },
        });
        return json({ request: viewFor(updated) });
      }
      /*
       * HOLD IS NOT A REFUSAL AND NOT AN ACCEPTANCE. "Received" is
       * where a producer parks something they have not decided
       * about, and a queue with no such state makes every arrival a
       * decision. [T10, T16a]
       */
      case 'hold': {
        const updated = await mutateRequest(requestId, (draft) => {
          hold(draft, now, by);
        });
        return json({ request: viewFor(updated) });
      }
      /*
       * A NEW SECRET, which stops the old link working for whoever
       * holds it — including somebody who has already opened it. An
       * invitation you cannot take back from the person who used it
       * is not one you can withdraw. [ROOM §6, D-25]
       */
      case 'rotate': {
        const token = newSecret();
        const updated = await mutateRequest(requestId, (draft) => {
          rotate(draft, token, now);
        });
        await auditPerformance(id, {
          action: 'request.rotated', detail: { requestId },
        });
        return json({ request: viewFor(updated), link: linkFor(updated) });
      }
      case 'accept': break;
      default: return fail(400, 'that is not something to do with a request');
    }

    const submissionId = String(body.submissionId ?? '');
    if (!SUBMISSION.test(submissionId)) return fail(400, 'no such submission');
    const submission = (found.submissions ?? [])
      .find((one) => one.assetId === submissionId);
    if (!submission) return fail(404, 'no such submission');

    /*
     * THE REQUEST MOVES FIRST, AND THE TAKE SECOND.
     *
     * The first version did it the other way round, on U-06's
     * argument that a document should learn about a take before its
     * media exists — which is right about a RECORDER, where the
     * media is arriving and may not finish, and wrong here, where
     * the media already exists and the thing that can fail is the
     * acceptance. A browser run proved it: an accept refused by the
     * state machine had already put a take in the rail, so the
     * author was left with somebody's name on a take with no media
     * and no way to know why.
     *
     * The order that survives both failures is: refuse at the state
     * machine, then declare, then copy. A copy that fails after that
     * leaves a take with no media — which is exactly what a crashed
     * recorder leaves, and the product already shows and deletes it.
     */
    const updated = await mutateRequest(requestId, (draft) => {
      accept(draft, submission.id, now, by);
    });

    const takeId = newId('take') as TakeId;
    const assetId = newId('asset') as AssetId;
    await mutatePerformance(id, (draft) => {
      addTake(draft, {
        id: takeId,
        assetId,
        /*
         * AND WHICH CAMERA, WHERE THERE WAS MORE THAN ONE. [B-3]
         *
         * Four angles of one capture all carry the same
         * participant, so four accepted angles would be four takes
         * called the same thing in the rail — a list the producer
         * cannot act on, which is the exact failure B-3 exists to
         * stop one layer up. The device is the only thing that
         * differs and it is what a person would say: "the one on
         * Camera B". Nothing is appended for a lone recording,
         * because there is nothing to tell it apart from.
         */
        label: [
          found.participant?.trim()
            || `From ${submission.kind === 'audio' ? 'a microphone' : 'a phone'}`,
          ...(submission.capturedIn?.id && submission.device
            ? [submission.device.slice(0, 40)] : []),
        ].join(' · '),
        environment: { kind: 'original' },
        /*
         * UNPLACED, NOT MEASURED. The phone's own number is passed to
         * the worker as a hint and the worker decides; calling it a
         * measurement here would make a stranger's clock into a fact
         * about this performance. [§10, S-3, INV-06]
         */
        alignment: {
          offsetSamples: Math.max(0, Math.round(submission.offsetSamples ?? 0)),
          rateRatio: 1,
          method: 'unplaced',
        },
        /*
         * THE CAPTURE COMES WITH IT.  [B-1, B-2, B-3]
         *
         * B-2 writes `capturedIn` on a submission and B-1 reads it
         * off a take, and for one stage there was nothing in
         * between: four angles accepted into a performance arrived
         * as four attempts, and Studio Two's badge — built,
         * tested, correct — could never fire for a real capture
         * station. *When a stage adds a field to the model and a
         * branch to the renderer, the thing in between is where
         * the test is missing.* [C-42, C-44, C-46]
         *
         * COPIED, NOT RE-DERIVED. The offsets were measured by the
         * machine that did the recording, against each other, and
         * nothing in this studio is in a position to improve on
         * them. `alignment` is still `unplaced` directly below,
         * because where the capture sits on THIS song is a
         * different question and still the worker's. [S-3, INV-06]
         */
        ...(submission.capturedIn ? { capturedIn: submission.capturedIn } : {}),
        durationSamples: 0,
        hasAudio: true,
        createdAt: now,
        /* Who made it, so the rail can say. [T5a] */
        ...(found.participant ? { performer: found.participant } : {}),
      });
    });

    /* Where a recorder's segments go, so the ordinary assembler finds
       it: one segment, which is what a joined submission is. */
    const chunkDir = paths.performanceChunks(id, takeId);
    await mkdir(chunkDir, { recursive: true });
    await copyFile(
      paths.requestAsset(found.id, submissionId, 'webm'),
      join(chunkDir, '000000.part'));

    const job = await enqueue({
      kind: 'assemble_performance_take',
      conversationId: id,
      payload: {
        takeId,
        assetId,
        hintSamples: Math.round(submission.offsetSamples ?? 0),
        elapsedSamples: Math.max(0, Math.round(submission.durationSamples ?? 0)),
        latencySamples: 0,
      },
    });
    await auditPerformance(id, {
      action: 'request.accepted',
      detail: { requestId, submissionId, takeId, job: job.id },
    });
    return json({ request: viewFor(updated), takeId, job }, { status: 202 });
  } catch (error) {
    if (error instanceof ParticipationError) return fail(409, error.message);
    if (error instanceof PerformanceEditError) return fail(400, error.message);
    throw error;
  }
}
