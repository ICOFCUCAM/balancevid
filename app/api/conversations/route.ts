import { mkdir, writeFile } from 'node:fs/promises';
import { SCHEMA_VERSION, type Conversation, type ConversationId, type SourceId } from '../../../src/domain/document.js';
import { newId } from '../../../src/domain/ids.js';
import { ensureDirs, paths } from '../../../src/store/paths.js';
import { enqueue } from '../../../src/store/queue.js';
import { audit, listConversations, saveConversation } from '../../../src/store/repository.js';
import { fail, json } from '../../../src/web/http.js';

export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const conversations = await listConversations();
  return json({
    conversations: conversations.map((c) => ({
      id: c.id, title: c.title,
      sourceTitle: c.source.title,
      sourceClass: c.source.class,
      durationFrames: c.source.durationFrames,
      interventions: c.interventions.length,
      updatedAt: c.updatedAt,
      ready: Boolean(c.source.mezzanineAssetId) && c.source.durationFrames > 0,
    })),
  });
}

/**
 * Create a Conversation from an uploaded source.
 *
 * MVP is Class A only (U-36): we hold the frames, so the composed export is
 * both technically possible and legally clean. Class B arrives with the
 * Conversation Manifest.
 *
 * The rights attestation is a record, not a checkbox (U-35 §2) -- it is stored
 * with the source and shown on the project.
 */
export async function POST(request: Request): Promise<Response> {
  await ensureDirs();
  const form = await request.formData();
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return fail(400, 'a source video file is required');

  const rightsBasis = String(form.get('rightsBasis') ?? '').trim();
  if (!rightsBasis) return fail(400, 'a rights basis is required before a source can be added');

  const sourceTitle = String(form.get('sourceTitle') ?? file.name).trim() || file.name;
  const creator = String(form.get('creator') ?? '').trim();
  const url = String(form.get('url') ?? '').trim();
  const title = String(form.get('title') ?? '').trim() || `My Response to "${sourceTitle}"`;

  const id = newId('conv');
  const assetId = newId('asset');
  const extension = (file.name.split('.').pop() ?? 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';

  await mkdir(paths.assets(id), { recursive: true });
  const originalPath = paths.asset(id, assetId, extension);
  await writeFile(originalPath, Buffer.from(await file.arrayBuffer()));

  const now = new Date().toISOString();
  const conversation: Conversation = {
    schemaVersion: SCHEMA_VERSION,
    id: id as ConversationId,
    title,
    source: {
      id: newId('src') as SourceId,
      class: 'A',
      title: sourceTitle,
      ...(creator ? { creator } : {}),
      ...(url ? { url } : {}),
      originalAssetId: assetId,
      // Set by the worker once the mezzanine exists and has been measured.
      durationFrames: 0,
      rightsAttestationId: `rights_${Date.now()}`,
    },
    interventions: [],
    layoutProfileId: 'default',
    createdAt: now,
    updatedAt: now,
  };
  await saveConversation(conversation);
  await audit(id, {
    action: 'source.added',
    detail: { assetId, bytes: file.size, filename: file.name, rightsBasis, sourceTitle, creator, url },
  });

  // ffmpeg never runs in the web tier (U-23), so even ingest is queued.
  const job = await enqueue({
    kind: 'ingest_source',
    conversationId: id,
    payload: { originalPath, assetId },
  });

  return json({ conversation, job }, { status: 201 });
}
