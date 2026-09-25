import { join } from 'node:path';

import { accessTo } from '../../../../../../../src/auth/request.js';
import { paths, safe } from '../../../../../../../src/store/paths.js';
import { loadPerformance } from '../../../../../../../src/store/performances.js';
import { fail, serveFile } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; planHash: string }> };

/**
 * The finished master video.  [Doctrine STUDIO-TWO §14]
 *
 * Addressed by plan hash rather than by "the latest", because two shapes of
 * the same performance are two files and an author comparing them wants both
 * to still be there. [U-16]
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id, planHash } = await params;
  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }
  /*
   * A published performance's video is public; an unpublished one's is not.
   * 404 rather than 403 for a stranger: 403 confirms it exists, and that a
   * draft exists is itself private (D-03).
   */
  const access = await accessTo(request, performance);
  if (access === 'denied') return fail(404, 'performance not found');
  // A hash that is not a hash is a 404, not a thrown identifier check.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(planHash)) return fail(404, 'not found');

  /*
   * AND ONLY THE ONE THAT WAS PUBLISHED.  [INV-15, U-31]
   *
   * The first version of this route served any render this performance had on
   * disk to anyone, once anything at all had been published — including a
   * private copy exported under the rights exemption, which is a video the
   * author asked to keep rather than to give away. Publishing a performance
   * publishes ONE video: the one named in the publication.
   */
  if (access !== 'owner' && performance.publication?.planHash !== safe(planHash)) {
    return fail(404, 'performance not found');
  }
  const dir = join(paths.performanceRenders(id), safe(planHash));
  const wantsAudio = new URL(request.url).searchParams.get('kind') === 'mp3';

  /*
   * THE AUDIO IS THE AUTHOR'S, EVEN WHEN THE VIDEO IS PUBLIC.  [INV-15, U-01]
   *
   * A published performance is a finished video, and the same reasoning that
   * keeps the master track off the public list applies here: an MP3 of a
   * performance over somebody else's record is the closest thing this system
   * can produce to a music file, and a link that hands one to a stranger is
   * distributing the record with a voice on it. The video is what was
   * published; this is the author's own copy of its sound.
   *
   * The Conversation Studio's copy of this route has no such clause on
   * purpose: two people talking is not a record.
   */
  if (wantsAudio && access !== 'owner') return fail(404, 'not found');

  // The same render, listened to rather than watched. [STUDIO-TWO §14, U-22]
  return wantsAudio
    ? serveFile(request, join(dir, 'audio.mp3'), 'audio/mpeg')
    : serveFile(request, join(dir, 'master.mp4'), 'video/mp4');
}
