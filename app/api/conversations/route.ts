import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SCHEMA_VERSION, type Conversation, type ConversationId, type SourceId } from '../../../src/domain/document.js';
import { PROVIDER_LABELS, parseProviderUrl } from '../../../src/domain/providers.js';
import { newId } from '../../../src/domain/ids.js';
import { ensureDirs, paths } from '../../../src/store/paths.js';
import { enqueue } from '../../../src/store/queue.js';
import { ConsentError, assertRespondable, lineageFor } from '../../../src/domain/publish.js';
import { audit, listConversations, loadConversation, saveConversation } from '../../../src/store/repository.js';
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
  if ((request.headers.get('content-type') ?? '').includes('application/json')) {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    if (typeof body['respondToConversationId'] === 'string') {
      return respondToConversation(body as { respondToConversationId: string; title?: string });
    }
    return createEmbedded(body as never);
  }
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

/**
 * Create a Class B conversation from an embeddable link.  [Doctrine U-01]
 *
 * Nothing is fetched and nothing is downloaded. The video stays on its
 * provider and is played through the provider's own embed; what we store is
 * which video it is (U-35 §6).
 *
 * The duration is not known yet — only the provider's player can say — so it
 * is reported back by the player once it loads, rather than guessed.
 */
async function createEmbedded(body: {
  providerUrl?: string; title?: string; sourceTitle?: string;
  creator?: string; rightsBasis?: string;
}): Promise<Response> {

  const embedded = parseProviderUrl(body.providerUrl ?? '');
  if (!embedded) {
    return fail(400, 'that is not a link to a video we can embed officially');
  }
  const rightsBasis = (body.rightsBasis ?? '').trim()
    || 'Fair use / fair dealing — transformative commentary';

  const id = newId('conv');
  const sourceTitle = (body.sourceTitle ?? '').trim()
    || `${PROVIDER_LABELS[embedded.provider]} video ${embedded.videoId}`;
  const now = new Date().toISOString();

  const conversation: Conversation = {
    schemaVersion: SCHEMA_VERSION,
    id: id as ConversationId,
    title: (body.title ?? '').trim() || `My Response to "${sourceTitle}"`,
    source: {
      id: newId('src') as SourceId,
      class: 'B',
      title: sourceTitle,
      ...(body.creator?.trim() ? { creator: body.creator.trim() } : {}),
      url: embedded.canonicalUrl,
      provider: embedded.provider,
      providerVideoId: embedded.videoId,
      embedUrl: embedded.embedUrl,
      // Reported by the provider's player once it loads.
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
    detail: {
      class: 'B', provider: embedded.provider, videoId: embedded.videoId,
      url: embedded.canonicalUrl, rightsBasis,
    },
  });
  return json({ conversation }, { status: 201 });
}

/**
 * Answer a published conversation.  [Doctrine U-31, §40]
 *
 * "Response chains form without any collaboration feature being built: A
 *  responds to a video, B responds to A, A responds to B."
 *
 * The published render is copied into the new conversation as its own source
 * rather than referenced. That is not waste: the parent can be edited,
 * re-rendered, withdrawn or deleted, and a response must go on answering the
 * thing it actually answered.
 */
async function respondToConversation(
  body: { respondToConversationId: string; title?: string },
): Promise<Response> {
  let parent;
  try {
    parent = await loadConversation(body.respondToConversationId);
  } catch {
    return fail(404, 'that conversation does not exist');
  }

  try {
    assertRespondable(parent);
  } catch (error) {
    if (error instanceof ConsentError) return fail(403, error.message);
    throw error;
  }

  const publishedRender = join(
    paths.render(parent.id, parent.publication!.planHash), 'FINAL.mp4');
  try {
    await access(publishedRender);
  } catch {
    return fail(409, 'the published version of that conversation is no longer on disk');
  }

  const id = newId('conv');
  const assetId = newId('asset');
  await mkdir(paths.assets(id), { recursive: true });
  const originalPath = paths.asset(id, assetId, 'mp4');
  await copyFile(publishedRender, originalPath);

  const now = new Date().toISOString();
  const conversation: Conversation = {
    schemaVersion: SCHEMA_VERSION,
    id: id as ConversationId,
    title: (body.title ?? '').trim() || `My Response to "${parent.title}"`,
    source: {
      id: newId('src') as SourceId,
      class: 'A',
      title: parent.title,
      ...(parent.publication?.author ? { creator: parent.publication.author } : {}),
      url: `/c/${parent.id}/watch`,
      sourceConversationId: parent.id,
      originalAssetId: assetId,
      durationFrames: 0,
      rightsAttestationId: `rights_${Date.now()}`,
    },
    interventions: [],
    layoutProfileId: 'default',
    lineage: lineageFor(parent),
    createdAt: now,
    updatedAt: now,
  };

  await saveConversation(conversation);
  await audit(id, {
    action: 'source.added',
    detail: {
      class: 'A', respondingTo: parent.id,
      chainDepth: conversation.lineage!.chain.length,
      // Consent given by the author of what is being answered. [U-31]
      rightsBasis: 'Permission granted — the author allowed responses',
    },
  });
  const job = await enqueue({
    kind: 'ingest_source',
    conversationId: id,
    payload: { originalPath, assetId },
  });
  return json({ conversation, job }, { status: 201 });
}
