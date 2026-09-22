import { readFile, stat } from 'node:fs/promises';

import { buildAttribution } from '../../../../../src/domain/plan.js';
import { buildBundle } from '../../../../../src/publish/bundle.js';
import { listJobs } from '../../../../../src/store/queue.js';
import { paths, safe } from '../../../../../src/store/paths.js';
import { loadRepresentationContext } from '../../../../../src/web/context.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * The publication bundle.  [Doctrine U-30, §39]
 *
 * Everything the author needs to publish, already written. With `?thumbnail=`
 * it serves one rendered candidate instead; the bundle names the candidates
 * whether or not the worker has drawn them yet, so the panel can show what is
 * coming rather than an empty box.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;

  let context;
  try {
    context = await loadRepresentationContext(id);
  } catch {
    return fail(404, 'conversation not found');
  }

  const wanted = new URL(request.url).searchParams.get('thumbnail');
  if (wanted) {
    let path: string;
    try {
      path = paths.thumbnail(id, wanted);
    } catch {
      return fail(400, 'bad thumbnail id');
    }
    try {
      const bytes = await readFile(path);
      return new Response(new Uint8Array(bytes), {
        headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
      });
    } catch {
      return fail(404, 'that thumbnail has not been rendered yet');
    }
  }

  const bundle = buildBundle({
    conversation: context.conversation,
    sourceTranscript: context.sourceTranscript ?? null,
    generatedAt: context.generatedAt,
    attribution: buildAttribution(context.conversation, context.generatedAt).text,
  });

  // Which candidates actually exist as pixels right now. The bundle itself is
  // pure and does not know about the filesystem, so this is answered here.
  const ready = await Promise.all(bundle.thumbnails.map(async (candidate) => {
    try {
      await stat(paths.thumbnail(id, safe(candidate.id)));
      return candidate.id;
    } catch {
      return null;
    }
  }));

  // The drawing job, so the panel knows whether to keep waiting or to stop —
  // a placeholder that never resolves is indistinguishable from a bug. [D-13]
  const jobs = await listJobs(id);
  const thumbnailJob = jobs.find((j) => j.kind === 'render_thumbnails');

  return json({
    bundle,
    renderedThumbnails: ready.filter((x): x is string => x !== null),
    ...(thumbnailJob
      ? {
        thumbnailJob: {
          state: thumbnailJob.state,
          progress: thumbnailJob.progress ?? 0,
          ...(thumbnailJob.error ? { error: thumbnailJob.error } : {}),
          ...(thumbnailJob.result?.['failed']
            ? { failed: thumbnailJob.result['failed'] }
            : {}),
        },
      }
      : {}),
  });
}
