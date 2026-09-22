import { join } from 'node:path';
import { paths } from '../../../../../../../src/store/paths.js';
import { serveFile } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string; planHash: string }> };

/**
 * Serve a render output: the MP4 or either caption sidecar.
 *
 * The sidecars are not an extra -- every export ships them (INV-07), so they
 * are addressable from the same place as the video.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id, planHash } = await params;
  const kind = new URL(request.url).searchParams.get('kind') ?? 'mp4';
  const dir = paths.render(id, planHash);

  switch (kind) {
    case 'srt': return serveFile(request, join(dir, 'FINAL.mp4.srt'), 'application/x-subrip');
    case 'vtt': return serveFile(request, join(dir, 'FINAL.mp4.vtt'), 'text/vtt');
    default: return serveFile(request, join(dir, 'FINAL.mp4'), 'video/mp4');
  }
}
