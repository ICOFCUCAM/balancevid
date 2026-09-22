import { loadConversation } from '../../../../../src/store/repository.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { newId } from '../../../../../src/domain/ids.js';
import { paths } from '../../../../../src/store/paths.js';
import { enqueue } from '../../../../../src/store/queue.js';
import { audit, mutateConversation } from '../../../../../src/store/repository.js';
import { fail, json, serveFile } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Serve the source for playback.
 *
 * By default this is the editing PROXY, not the mezzanine: small, quick to
 * seek, and decodable everywhere. Both are produced from the same normalised
 * media and carry the same frame count at the same rate, so the frame the user
 * sees while choosing where to interrupt is the frame the renderer cuts. A
 * player disagreeing with the renderer about which frame is frame N would make
 * frame-exactness true of the file and false of the experience.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let conversation;
  try {
    conversation = await loadConversation(id);
  } catch {
    return fail(404, 'conversation not found');
  }
  const assetId = conversation.source.mezzanineAssetId;
  if (!assetId) return fail(409, 'source is still being normalised');

  if (new URL(request.url).searchParams.get('kind') === 'mezzanine') {
    return serveFile(request, paths.asset(id, `${assetId}mezz`, 'mp4'), 'video/mp4');
  }
  return serveFile(request, paths.sourceProxy(id, assetId), 'video/webm');
}

/**
 * Supply a governed copy, upgrading Class B to Class A.  [Doctrine U-01]
 *
 * "A Class B conversation upgrades to Class A losslessly the day the user
 *  supplies a governed copy of the source — the interventions, timestamps,
 *  types, annotations and evidence all carry over untouched, and the composed
 *  render simply becomes available."
 *
 * Nothing about the conversation is rebuilt. The document already holds every
 * anchor in source frames (U-08), so the only thing that changes is that we
 * now hold frames to cut.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return fail(400, 'a source video file is required');
  }
  const rightsBasis = String(form.get('rightsBasis') ?? '').trim();
  if (!rightsBasis) return fail(400, 'a rights basis is required for a governed copy');

  const assetId = newId('asset');
  const extension = (file.name.split('.').pop() ?? 'mp4')
    .toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';

  await mkdir(paths.assets(id), { recursive: true });
  const originalPath = paths.asset(id, assetId, extension);
  await writeFile(originalPath, Buffer.from(await file.arrayBuffer()));

  try {
    await mutateConversation(id, (draft) => {
      draft.source.class = 'A';
      draft.source.originalAssetId = assetId;
      // Cleared until the mezzanine is measured; the anchors are untouched.
      delete draft.source.mezzanineAssetId;
    });
  } catch {
    return fail(404, 'conversation not found');
  }

  await audit(id, {
    action: 'source.upgraded',
    detail: { assetId, bytes: file.size, filename: file.name, rightsBasis },
  });
  const job = await enqueue({
    kind: 'ingest_source',
    conversationId: id,
    payload: { originalPath, assetId },
  });
  return json({ job }, { status: 202 });
}
