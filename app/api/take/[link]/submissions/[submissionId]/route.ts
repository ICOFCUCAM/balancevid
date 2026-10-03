import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';

import { MOST_ANGLES } from '../../../../../../shared/src/capture.js';
import { ParticipationError, submit } from '../../../../../../src/domain/participationEdit.js';
import { currentTerms, entryProblem } from '../../../../../../src/domain/campaign.js';
import { callOf } from '../../../../../../src/store/campaigns.js';
import { paths } from '../../../../../../src/store/paths.js';
import { mutateRequest, requestForLink } from '../../../../../../src/store/requests.js';
import { viewFor } from '../../../../../../src/domain/participation.js';
import { fail, json } from '../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ link: string; submissionId: string }> };

/** The same shape an id has everywhere: refused rather than sanitised. */
const ID = /^sub_[A-Za-z0-9_-]{1,120}$/;

/**
 * A segment of somebody's performance, as it is recorded.
 *   [Doctrine U-06, D-25; TAKE-APP T3]
 *
 * ROLLING SEGMENTS, THE SAME AS BOTH STUDIOS, and for the same reason
 * U-06 gives: a crash costs one segment rather than the take. On a
 * phone that argument is stronger, not weaker — a four-minute recording
 * is a long time for a browser tab on a phone to survive a phone call.
 *
 * WHICH IS IN TENSION WITH "TAKE 3 NEED NOT REACH THE SERVER AT ALL",
 * and the tension is real, so it is resolved rather than ignored: the
 * SEGMENTS are uploaded as they close, and nothing becomes a SUBMISSION
 * until the participant sends it. A recording they delete leaves chunks
 * that are never assembled and are swept with the request. They pay the
 * bandwidth for a take they discard; they do not pay it twice, and they
 * do not lose a good take to a dropped call. A native client with
 * background upload and retry can hold them locally instead — that is
 * T13's argument for the packaged app, and this surface is the one that
 * must work without it.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { link, submissionId } = await params;
  if (!ID.test(submissionId)) return fail(400, 'that is not a recording id');
  const asked = new URL(request.url).searchParams;
  const index = Number(asked.get('index') ?? NaN);
  if (!Number.isInteger(index) || index < 0) return fail(400, 'a chunk index is required');
  /*
   * WHICH CAMERA THIS SEGMENT IS FROM, and absent means the only
   * one.  [B-2]
   *
   * A phone never sends this and lands exactly where it always did.
   * Refused rather than clamped, like every other id this file
   * takes: a station that asks for track 9 has a bug, and writing
   * its ninth camera into track 8 beside the eighth would join two
   * performances into one file.
   */
  const track = Number(asked.get('track') ?? 0);
  if (!Number.isInteger(track) || track < 0 || track >= MOST_ANGLES) {
    return fail(400, `a track is 0 to ${MOST_ANGLES - 1}`);
  }

  const found = await requestForLink(link, new Date().toISOString());
  if (!found) return fail(404, 'that link is not open');

  const dir = paths.requestChunks(found.id, submissionId, track);
  await mkdir(dir, { recursive: true });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.byteLength === 0) return fail(400, 'an empty chunk is not a recording');
  /* Zero-padded, so a plain sort is the recording's own order. */
  await writeFile(
    join(dir, `${String(index).padStart(6, '0')}.part`), new Uint8Array(bytes));
  return json({ ok: true, bytes: bytes.byteLength }, { status: 202 });
}

/**
 * Send it.  [Doctrine D-25, U-23; TAKE-APP T4, T5]
 *
 * THIS IS THE MOMENT A RECORDING BECOMES A SUBMISSION, and until it is
 * called there is nothing but bytes in a directory. That is the
 * difference the brief asks for between a take somebody kept and one
 * they deleted.
 *
 * THE SEGMENTS ARE JOINED HERE AND NOTHING ELSE IS DONE TO THEM. No
 * transcode, no measurement, no alignment pass — because ffmpeg never
 * runs in the web tier (U-23), and more importantly because a
 * submission is not production material yet. It is turned into a take,
 * with everything that entails, at the moment a producer ACCEPTS it,
 * which is the only moment D-25 allows. Joining WebM segments is a byte
 * concatenation by construction: MediaRecorder writes a header cluster
 * and then continuation clusters, which is why chunked upload works at
 * all.
 *
 * WHAT THE BROWSER MEASURED TRAVELS WITH IT. `offsetSamples` is where
 * the phone believes the recording sits against the reference, taken
 * from the audio clock with the device's latency subtracted. It is a
 * hint, exactly as it is in the studio: the worker checks it against
 * the master when the take is made, and this route neither trusts nor
 * corrects it.
 */
export async function PUT(request: Request, { params }: Params): Promise<Response> {
  const { link, submissionId } = await params;
  if (!ID.test(submissionId)) return fail(400, 'that is not a recording id');
  const now = new Date().toISOString();
  const found = await requestForLink(link, now);
  if (!found) return fail(404, 'that link is not open');

  /*
   * NOTHING ENTERS A CALL THAT ASKS SOMETHING WITHOUT AN ANSWER
   * TO IT.  [GO-VIRAL V-3]
   *
   * THIS IS THE GATE AND THE ONE AT `POST /submissions` IS THE
   * COURTESY. That one refuses before the song, so nobody records
   * four minutes for nothing; this one is the rule, because it is
   * the moment bytes become a submission and it is the moment
   * that cannot be skipped by a client that invents a recording
   * id. A guard only on the polite path is a guard on the polite.
   *
   * AND IT REFUSES BEFORE THE SEGMENTS ARE JOINED, so a refusal
   * costs a disk write of nothing. The chunks stay where they
   * are: the performer may agree and send, or `DELETE` them.
   *
   * AN ORDINARY REQUEST IS UNTOUCHED. No call, or a call with no
   * terms, and `entryProblem` is the empty string — which is
   * every submission this product has ever taken.
   */
  const call = await callOf(found);
  if (call) {
    const refused = entryProblem(call, found.consent);
    if (refused) return fail(409, refused);
  }

  const body = await request.json().catch(() => ({})) as {
    hintSamples?: number;
    elapsedSamples?: number;
    latencySamples?: number;
    device?: string;
    tracks?: unknown;
  };

  /*
   * ONE RECORDING OR N ANGLES OF ONE, and the single case is not a
   * special case of the plural one — it is the plural one with a
   * list of length one, which is why absent becomes exactly that.
   * [B-2; D-19]
   */
  const read = readTracks(body);
  if ('refused' in read) return fail(400, read.refused);
  const asked = read.tracks;

  await mkdir(paths.requestAssets(found.id), { recursive: true });

  const joined: { track: Track; assetId: string }[] = [];
  for (const one of asked) {
    const dir = paths.requestChunks(found.id, submissionId, one.track);
    let parts: string[];
    try {
      parts = (await readdir(dir)).filter((name) => name.endsWith('.part')).sort();
    } catch {
      parts = [];
    }
    /*
     * A CAPTURE IS NOT PART OF A CAPTURE. With one angle this is the
     * message it has always been. With four, a missing one is said
     * by number rather than joined around: three angles submitted as
     * though they were the capture is a producer cutting to a camera
     * that is not there.
     */
    if (parts.length === 0) {
      return fail(400, asked.length === 1
        ? 'nothing was recorded' : `nothing was recorded on track ${one.track}`);
    }
    const assetId = assetFor(submissionId, one.track);
    const out = createWriteStream(paths.requestAsset(found.id, assetId, 'webm'));
    for (const part of parts) {
      await pipeline(createReadStream(join(dir, part)), out, { end: false });
    }
    await new Promise<void>((resolve, reject) => {
      out.end((error?: Error | null) => (error ? reject(error) : resolve()));
    });
    joined.push({ track: one, assetId });
  }

  /*
   * HOW FAR APART THE ANGLES STARTED, WORKED OUT RATHER THAN TAKEN.
   * It is the widest gap between the offsets already in hand, so
   * there is nothing for a client to get wrong and nothing extra to
   * trust. [shared/src/capture.ts `spreadMs`]
   */
  const offsets = joined.map((one) => one.track.offsetSamples);
  const spreadSamples = Math.max(...offsets) - Math.min(...offsets);

  try {
    const updated = await mutateRequest(found.id, (draft) => {
      for (const one of joined) {
        submit(draft, {
          assetId: one.assetId,
          kind: draft.allowed.video ? 'video' : 'audio',
          ...(Number.isFinite(one.track.elapsedSamples)
            ? { durationSamples: Math.max(0, Math.round(one.track.elapsedSamples!)) } : {}),
          ...(Number.isFinite(one.track.hintSamples)
            ? { offsetSamples: Math.round(one.track.hintSamples!) } : {}),
          /*
           * WHAT RECORDED IT, as the client reports it and nothing more.
           * A producer with twenty submissions and one that is out of
           * sync needs to know which device; nothing decides anything
           * from this string. Bounded, because it arrives from a phone.
           *
           * PER ANGLE WHERE THERE ARE ANGLES, because on a capture
           * station the four are four cameras on one machine and the
           * camera is the answer to "which one is out".
           */
          ...(one.track.device ?? body.device
            ? { device: String(one.track.device ?? body.device).slice(0, 120) } : {}),
          /*
           * ONLY WHEN THERE IS SOMETHING TO BELONG TO. A single
           * recording carries no membership — not an empty one — so
           * what a phone writes is byte for byte what it wrote before
           * captures existed.
           */
          ...(joined.length > 1
            ? {
              capturedIn: {
                id: submissionId,
                offsetSamples: one.track.offsetSamples,
                ...(spreadSamples > 0 ? { spreadSamples } : {}),
              },
            } : {}),
          at: now,
        }, now);
      }
    });
    return json(
      { request: viewFor(updated, call && currentTerms(call)) },
      { status: 201 });
  } catch (error) {
    if (error instanceof ParticipationError) return fail(409, error.message);
    throw error;
  }
}

/** One angle as the client describes it, once it has been believed. */
interface Track {
  track: number;
  offsetSamples: number;
  hintSamples?: number;
  elapsedSamples?: number;
  device?: string;
}

/**
 * What the client said its tracks were, or why not.
 *
 * REFUSED RATHER THAN REPAIRED, the same as every other id here. A
 * repeated track number would join one camera's bytes into two
 * submissions and call them two angles; a missing `tracks` is a
 * phone, and a phone means one recording with no membership at all.
 *
 * THERE IS NO SEPARATE BOUND ON HOW MANY. One was written and then
 * deleted, because it could not fire: the track numbers of a capture
 * are distinct and each is below `MOST_ANGLES`, so a list longer than
 * that always contains a number already seen or a number out of
 * range, and the loop below refuses it by the ninth element at the
 * latest. A guard nobody can reach is a guard nobody can check. [C-49]
 */
function readTracks(body: {
  hintSamples?: number; elapsedSamples?: number; device?: string; tracks?: unknown;
}): { tracks: Track[] } | { refused: string } {
  const said = body.tracks;
  /*
   * NO LIST IS THE PHONE, and the phone's numbers are where they
   * have always been — at the top of the body, not inside a track.
   * Reading them here is what makes the single case the plural one
   * rather than a branch further down.
   */
  if (said === undefined) {
    return {
      tracks: [{
        track: 0,
        offsetSamples: 0,
        ...(typeof body.hintSamples === 'number' ? { hintSamples: body.hintSamples } : {}),
        ...(typeof body.elapsedSamples === 'number'
          ? { elapsedSamples: body.elapsedSamples } : {}),
        ...(typeof body.device === 'string' ? { device: body.device } : {}),
      }],
    };
  }
  /* An empty list is not a phone: a phone sends no list at all. */
  if (!Array.isArray(said) || said.length === 0) {
    return { refused: 'a capture has at least one angle' };
  }
  const wrong = { refused: `each angle is a different track, 0 to ${MOST_ANGLES - 1}` };
  const out: Track[] = [];
  const seen = new Set<number>();
  for (const row of said as Record<string, unknown>[]) {
    if (!row || typeof row !== 'object') return wrong;
    const track = Number(row.track ?? 0);
    if (!Number.isInteger(track) || track < 0 || track >= MOST_ANGLES) return wrong;
    if (seen.has(track)) return wrong;
    seen.add(track);
    const offset = Number(row.offsetSamples ?? 0);
    out.push({
      track,
      offsetSamples: Number.isFinite(offset) ? Math.round(offset) : 0,
      ...(typeof row.hintSamples === 'number' ? { hintSamples: row.hintSamples } : {}),
      ...(typeof row.elapsedSamples === 'number'
        ? { elapsedSamples: row.elapsedSamples } : {}),
      ...(typeof row.device === 'string' ? { device: row.device } : {}),
    });
  }
  return { tracks: out };
}

/**
 * Where one angle's joined media lives.
 *
 * TRACK 0 KEEPS THE SUBMISSION'S OWN ID, which is what every surface
 * that already reads a submission's asset expects, and what the
 * DELETE below compares against to decide whether a recording has
 * been sent.
 */
function assetFor(submissionId: string, track: number): string {
  return track === 0 ? submissionId : `${submissionId}-t${track}`;
}

/**
 * Throw a recording away before it has been sent.  [TAKE-APP T4; D-25]
 *
 * "Take 3 doesn't have to reach the server at all if they delete it
 * locally." Its segments DID reach the server, because a dropped call
 * must not cost a good take — so this is the explicit act that
 * removes them, rather than leaving them lying around until the
 * request is swept.
 *
 * ONLY BEFORE IT IS A SUBMISSION. Once it has been sent it belongs to
 * the production, and a link that could delete from somebody else's
 * studio would be a door, not a request. What a performer may undo is
 * their own decision not yet acted on; what they may not undo is a
 * producer's. [D-25]
 */
export async function DELETE(
  _request: Request, { params }: Params,
): Promise<Response> {
  const { link, submissionId } = await params;
  if (!ID.test(submissionId)) return fail(400, 'that is not a recording id');
  const found = await requestForLink(link, new Date().toISOString());
  if (!found) return fail(404, 'that link is not open');

  if ((found.submissions ?? []).some((one) => one.assetId === submissionId)) {
    return fail(409, 'that take has already been sent');
  }

  /*
   * The segments, and nothing else. `rm` with `force` so deleting a
   * recording that never produced one is a success rather than a
   * 404 the performer has to think about.
   */
  await rm(paths.requestChunks(found.id, submissionId),
    { recursive: true, force: true });
  return json({ ok: true });
}
