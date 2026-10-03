import {
  type Campaign, bySlugOrId, wallOf,
} from '../../../../../../../src/domain/campaign.js';
import { listCampaigns } from '../../../../../../../src/store/campaigns.js';
import { listRequests } from '../../../../../../../src/store/requests.js';
import { paths } from '../../../../../../../src/store/paths.js';
import { fail, serveFile } from '../../../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ handle: string; submissionId: string }> };

/**
 * One entry, playing.  [GO-VIRAL V-4; Doctrine D-03, D-25]
 *
 * > **Judged on:** *"A stranger with no account reaches a
 * > campaign, reads the rules, **watches entries** and enters."*
 *
 * THE PARTICIPANT'S OWN PERMISSION IS WHAT OPENS THIS, and there
 * is no stronger authority anywhere in this product for putting
 * somebody's face on a public page. `permits(consent, 'display')`
 * is the answer to a question asked in plain words, before the
 * camera opened, with nothing pre-ticked, naming this call's exact
 * terms by their hash — and revocable, so the file stops being
 * served the moment they take it back. [V-3]
 *
 * IT ASKS `wallOf` RATHER THAN ASKING AGAIN. The page lists what
 * may be shown and this serves what may be shown; two readings of
 * *may this be shown* is two answers, and the one that is wrong is
 * the one nobody is looking at. So this route finds the entry IN
 * the wall or serves nothing. [D-19]
 *
 * WHICH IS A DIFFERENT LINE FROM THE ONE `policy.ts` DRAWS ABOUT
 * RAW MATERIAL, and the difference is stated rather than stepped
 * over. That rule withholds *"the song, the takes' own media and
 * the document"* from a published performance, because nobody
 * consented to those being handed out — they are the material a
 * finished thing was made from. A competition entry is not
 * material: it is the thing itself, made to be entered, by
 * somebody who said it could be shown here.
 *
 * AND THE SONG IT WAS SUNG OVER IS STILL NOT HERE. What this
 * serves is the entrant's own recording, in the request's own
 * store. The master stays where INV-15 left it.
 *
 * BYTE RANGES, because `serveFile` does them and a phone seeking
 * through a four-minute video without them re-downloads it.
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { handle, submissionId } = await params;
  /* One refusal for every way of being wrong, as everywhere here. */
  const no = () => fail(404, 'no such entry');

  const campaigns = await listCampaigns().catch(() => [] as Campaign[]);
  const call = bySlugOrId(campaigns, handle);
  if (!call) return no();

  const requests = await listRequests().catch(() => []);
  const entry = wallOf(call, requests)
    .find((one) => one.submissionId === submissionId);
  if (!entry) return no();

  /*
   * WEBM, BECAUSE THAT IS WHAT ARRIVED. The submission route joins
   * the segments a browser recorded and does nothing else to them
   * — no transcode, because ffmpeg never runs in the web tier
   * (U-23) and because a submission is not production material
   * until a producer accepts it. What plays here is the file the
   * phone made. [D-25]
   */
  return serveFile(
    request, paths.requestAsset(entry.requestId, entry.assetId, 'webm'),
    entry.kind === 'audio' ? 'audio/webm' : 'video/webm');
}
