import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SCHEMA_VERSION, type Conversation, type ConversationId, type SourceId } from '../../../src/domain/document.js';
import { PROVIDER_LABELS, parseProviderUrl } from '../../../src/domain/providers.js';
import { planForUrl, type SourceKind } from '../../../src/domain/sources.js';
import { UnsafeUrlError, assertPublicUrl } from '../../../src/evidence/ssrf.js';
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
    /*
     * A LINK IS TWO DIFFERENT THINGS AND THE DOMAIN DECIDES WHICH.
     * [STUDIO-ONE §2B, U-35 §6]
     *
     * `planForUrl` is the only place that answers "embed, fetch, or
     * neither", and it is asked here rather than re-implemented,
     * because the ordering of its two branches IS the rule: a
     * platform's page is embedded, a platform's media is refused, and
     * only a file somebody else's server publishes is fetched.
     */
    const asked = String(body['providerUrl'] ?? body['url'] ?? '');
    if (asked) {
      const plan = planForUrl(asked);
      if (plan.can === 'fetch') return createFetched(body as never);
      /*
       * AND THE REFUSAL SAYS WHY.
       *
       * A browser run posted a `googlevideo.com` media URL here and got
       * back "that is not a link to a video we can embed officially" —
       * because anything that was not `fetch` fell through to
       * `createEmbedded`, whose one refusal message is about embedding.
       * The outcome was right and the sentence was not: it is not that
       * we cannot embed it, it is that it is a platform's own media and
       * this product does not take that. The same message was what a
       * university lecture recording used to get, which is the specific
       * fault §2B asks to be fixed.
       */
      if (plan.can === 'no') return fail(400, plan.because);
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
  /*
   * WHICH DOOR THIS CAME IN BY.  [STUDIO-ONE §2, §5]
   *
   * A chosen file, a camera and a screen capture all arrive here as
   * multipart bytes and all leave as the same mezzanine — which is the
   * point, and also why the document has to be told, once, before that
   * difference is gone for good. An unrecognised word is treated as an
   * upload rather than stored: the recent list would otherwise print
   * whatever a client sent it.
   */
  const claimed = String(form.get('capturedAs') ?? '');
  const capturedAs: SourceKind = claimed === 'record' || claimed === 'screen'
    ? claimed : 'upload';

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
      capturedAs,
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
    detail: {
      assetId, bytes: file.size, filename: file.name, rightsBasis,
      sourceTitle, creator, url, capturedAs,
    },
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
 * A source that is a file somebody else's server publishes.
 *   [STUDIO-ONE §2B; U-02, U-35 §6, D-06]
 *
 * *"Not just YouTube… direct MP4/MOV URL, supported video hosting URLs,
 * public media URLs."* Marked **Essential** in the author's own table, and
 * refused by this product until now — not by oversight but by doctrine:
 *
 * > "Nothing in the product downloads from a platform that forbids it. No
 * > exceptions, no user-supplied workarounds, no third-party extraction
 * > integrations. This rule is not subject to growth arguments." (U-35 §6)
 *
 * BOTH ARE TRUE AT ONCE, AND THE DIFFERENCE IS THE PUBLISHER. Fetching
 * `https://lectures.example.edu/ethics.mp4` is fetching a file a university
 * put on the web to be fetched. Fetching a URL belonging to a platform's
 * player is extraction, whatever the URL looks like. `planForUrl` holds
 * that line and this function does not restate it — it asks.
 *
 * THREE GUARDS, AND THEY GUARD DIFFERENT THINGS.
 *
 *   `planForUrl`      is this a file, and is it a platform's? — decided
 *                     before any request leaves the building.
 *   `assertPublicUrl` does this name resolve to somewhere INSIDE? — the
 *                     same guard evidence archiving uses, because this is
 *                     the same primitive: a text field that makes the
 *                     server fetch a URL. [D-06]
 *   `CEILING`         how much of it are we willing to take? — a stream
 *                     read with a running total, not a `Content-Length`
 *                     header, which a server is free to lie about.
 *
 * THE FETCH IS THE ONLY NEW THING; EVERYTHING AFTER IT IS THE UPLOAD PATH.
 * The bytes land in exactly the place a chosen file lands, and the same
 * `ingest_source` job normalises, measures and proxies them. A fetched
 * source and an uploaded one differ in `capturedAs` and in nothing else.
 */
const CEILING = 4 * 1024 * 1024 * 1024;

async function createFetched(body: {
  providerUrl?: string; url?: string; title?: string; sourceTitle?: string;
  creator?: string; rightsBasis?: string; capturedAs?: SourceKind;
}): Promise<Response> {
  const asked = (body.providerUrl ?? body.url ?? '').trim();
  const plan = planForUrl(asked);
  if (plan.can !== 'fetch') {
    return fail(400, plan.can === 'no' ? plan.because : 'that link is embedded, not fetched');
  }

  let safe: URL;
  try {
    safe = await assertPublicUrl(asked);
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return fail(400, 'that address is not reachable from the public internet');
    }
    throw error;
  }

  let response: Response;
  try {
    response = await fetch(safe, {
      redirect: 'error',
      headers: {
        /*
         * Identify honestly, as the evidence archiver does. A product
         * whose subject is accountability does not lie about what it is
         * while making a request.
         */
        'user-agent': 'BalanceVid/0.1 (source import; +https://github.com/ICOFCUCAM/balancevid)',
      },
    });
  } catch {
    /*
     * `redirect: 'error'` is deliberate. A redirect is a second URL that
     * nothing has checked — the classic way past an SSRF guard that
     * inspected only the first one — so a link that redirects is refused
     * and the person is told to paste where it ends up.
     */
    return fail(400, 'that link could not be opened, or it redirects somewhere else');
  }
  if (!response.ok || !response.body) {
    return fail(400, `that link answered ${response.status}`);
  }

  const id = newId('conv');
  const assetId = newId('asset');
  await mkdir(paths.assets(id), { recursive: true });
  const originalPath = paths.asset(id, assetId, plan.extension);

  let bytes = 0;
  const parts: Buffer[] = [];
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    bytes += chunk.byteLength;
    if (bytes > CEILING) {
      return fail(413, 'that file is larger than this studio will import');
    }
    parts.push(Buffer.from(chunk));
  }
  if (bytes === 0) return fail(400, 'that link answered with nothing');
  await writeFile(originalPath, Buffer.concat(parts));

  const named = decodeURIComponent(safe.pathname.split('/').pop() ?? '')
    .replace(/\.[^.]+$/, '');
  const sourceTitle = (body.sourceTitle ?? '').trim() || named || plan.host;
  const creator = (body.creator ?? '').trim();
  const rightsBasis = (body.rightsBasis ?? '').trim()
    || 'Fair use / fair dealing — transformative commentary';
  const now = new Date().toISOString();

  const conversation: Conversation = {
    schemaVersion: SCHEMA_VERSION,
    id: id as ConversationId,
    title: (body.title ?? '').trim() || `My Response to "${sourceTitle}"`,
    source: {
      id: newId('src') as SourceId,
      class: 'A',
      title: sourceTitle,
      ...(creator ? { creator } : {}),
      url: safe.toString(),
      capturedAs: 'link',
      originalAssetId: assetId,
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
      assetId, bytes, url: safe.toString(), host: plan.host,
      rightsBasis, sourceTitle, creator, fetched: true,
    },
  });

  const job = await enqueue({
    kind: 'ingest_source',
    conversationId: id,
    payload: { originalPath, assetId },
  });
  return json({ conversation, job }, { status: 201 });
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
