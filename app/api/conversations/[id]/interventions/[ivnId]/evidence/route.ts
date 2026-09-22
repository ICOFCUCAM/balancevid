import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AssetId, Evidence, EvidenceId, EvidenceKind } from '../../../../../../../src/domain/document.js';
import { EditError, attachEvidence } from '../../../../../../../src/domain/edit.js';
import { newId } from '../../../../../../../src/domain/ids.js';
import { paths } from '../../../../../../../src/store/paths.js';
import { enqueue } from '../../../../../../../src/store/queue.js';
import { audit, mutateConversation } from '../../../../../../../src/store/repository.js';
import { fail, json } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; ivnId: string }> };

const IMAGE_TYPES = /^image\/(png|jpeg|webp|gif|avif)$/;

/**
 * Attach evidence.  [Doctrine §44, U-33]
 *
 * The record is created immediately and archived in the worker, because
 * archiving opens sockets and spawns a browser — neither of which belongs in
 * the web tier (U-23, D-06). Until the archive succeeds the evidence is
 * attached but not shown: an unarchived citation is not yet verifiable.
 */
export async function POST(request: Request, { params }: Params): Promise<Response> {
  const { id, ivnId } = await params;
  const contentType = request.headers.get('content-type') ?? '';
  const evidenceId = newId('ev') as EvidenceId;
  const assetId = newId('asset') as AssetId;

  let evidence: Evidence;
  let payload: Record<string, unknown>;

  if (contentType.includes('multipart/form-data')) {
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return fail(400, 'a file is required');

    const kind: EvidenceKind = IMAGE_TYPES.test(file.type) ? 'image' : 'document';
    const title = String(form.get('title') ?? '').trim() || file.name;

    const uploadDir = join(paths.evidence(id), 'uploads');
    await mkdir(uploadDir, { recursive: true });
    const uploadPath = join(uploadDir, `${assetId}.upload`);
    await writeFile(uploadPath, Buffer.from(await file.arrayBuffer()));

    evidence = {
      id: evidenceId, kind, title,
      retrievedAt: new Date().toISOString(),
      locator: {}, archived: false,
    };
    payload = { interventionId: ivnId, evidenceId, assetId, uploadPath, kind, title };
  } else {
    const body = await request.json().catch(() => ({})) as { url?: string; title?: string };
    if (!body.url?.trim()) return fail(400, 'a url is required');
    evidence = {
      id: evidenceId, kind: 'web',
      title: body.title?.trim() || body.url.trim(),
      url: body.url.trim(),
      retrievedAt: new Date().toISOString(),
      locator: {}, archived: false,
    };
    payload = { interventionId: ivnId, evidenceId, assetId, url: body.url.trim() };
  }

  try {
    await mutateConversation(id, (draft) => attachEvidence(draft, ivnId, evidence));
  } catch (error) {
    if (error instanceof EditError) return fail(400, error.message);
    return fail(404, 'conversation not found');
  }

  const job = await enqueue({ kind: 'archive_evidence', conversationId: id, payload });
  await audit(id, {
    action: 'evidence.attached',
    detail: { interventionId: ivnId, evidenceId, kind: evidence.kind, url: evidence.url },
  });

  return json({ evidence, job }, { status: 202 });
}
