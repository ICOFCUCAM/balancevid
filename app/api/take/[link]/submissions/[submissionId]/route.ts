import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';

import { ParticipationError, submit } from '../../../../../../src/domain/participationEdit.js';
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
  const index = Number(new URL(request.url).searchParams.get('index') ?? NaN);
  if (!Number.isInteger(index) || index < 0) return fail(400, 'a chunk index is required');

  const found = await requestForLink(link, new Date().toISOString());
  if (!found) return fail(404, 'that link is not open');

  const dir = paths.requestChunks(found.id, submissionId);
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

  const body = await request.json().catch(() => ({})) as {
    hintSamples?: number;
    elapsedSamples?: number;
    latencySamples?: number;
    device?: string;
  };

  const dir = paths.requestChunks(found.id, submissionId);
  let parts: string[];
  try {
    parts = (await readdir(dir)).filter((name) => name.endsWith('.part')).sort();
  } catch {
    parts = [];
  }
  if (parts.length === 0) return fail(400, 'nothing was recorded');

  await mkdir(paths.requestAssets(found.id), { recursive: true });
  const assetId = submissionId;
  const target = paths.requestAsset(found.id, assetId, 'webm');
  const out = createWriteStream(target);
  for (const part of parts) {
    await pipeline(createReadStream(join(dir, part)), out, { end: false });
  }
  await new Promise<void>((resolve, reject) => {
    out.end((error?: Error | null) => (error ? reject(error) : resolve()));
  });

  try {
    const updated = await mutateRequest(found.id, (draft) => {
      submit(draft, {
        assetId,
        kind: draft.allowed.video ? 'video' : 'audio',
        ...(Number.isFinite(body.elapsedSamples)
          ? { durationSamples: Math.max(0, Math.round(body.elapsedSamples!)) } : {}),
        ...(Number.isFinite(body.hintSamples)
          ? { offsetSamples: Math.round(body.hintSamples!) } : {}),
        /*
         * WHAT RECORDED IT, as the client reports it and nothing more.
         * A producer with twenty submissions and one that is out of
         * sync needs to know which device; nothing decides anything
         * from this string. Bounded, because it arrives from a phone.
         */
        ...(body.device ? { device: String(body.device).slice(0, 120) } : {}),
        at: now,
      }, now);
    });
    return json({ request: viewFor(updated) }, { status: 201 });
  } catch (error) {
    if (error instanceof ParticipationError) return fail(409, error.message);
    throw error;
  }
}
