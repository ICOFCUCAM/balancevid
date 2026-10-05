import { isOwner } from '../../../../../src/auth/request.js';
import { isPublished } from '../../../../../src/domain/channel.js';
import { loadAccount } from '../../../../../src/store/accounts.js';
import { OWNER_ACCOUNT_ID, hasExtra } from '../../../../../src/domain/account.js';
import { loadChannel } from '../../../../../src/store/channels.js';
import {
  masterPlaylist, renditions, subtitleRendition,
} from '../../../../../src/domain/hls.js';
import { producingAudio } from '../../../../../src/store/audioRenditions.js';
import { producingSubtitles } from '../../../../../src/store/subtitleRenditions.js';
import { producingRungs } from '../../../../../src/store/videoRenditions.js';
import {
  streamLadder, streamQuality,
} from '../../../../../src/domain/quality.js';
import { fail } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * THE CODECS THE SEGMENTER ACTUALLY WRITES.  [playout/segment.ts]
 *
 * H.264 main profile at level 3.1, and AAC-LC — which is what
 * `encodeArgs` asks ffmpeg for, written here in the form RFC 6381
 * requires. Stated rather than guessed at, and stated HERE rather
 * than in the playlist builder, because the builder must not know
 * about an encoder it cannot see: a figure invented there is a
 * player rejecting a stream that would have played.
 */
const CODECS = 'avc1.4d401f,mp4a.40.2';

/**
 * The master playlist.  [Doctrine CHANNEL §7, §17, N-10]
 *
 * ABSENT WHERE THERE IS NO CHOICE, which is most channels and is
 * not an error. A player asks for this, gets a 404, and plays
 * `/playlist` — which is what it would have done anyway, and
 * what every set-top box reading the M3U export already does.
 * A master naming one rendition would be a second address
 * answering the first one's question. [D-19, D-21]
 *
 * THE EXTRA IS CHECKED AGAINST THE CHANNEL'S OWNER AND NOT
 * AGAINST THE VIEWER. A stranger watching a station that pays
 * for multi-track audio hears every language it offers; a
 * stranger watching one that does not hears its default track
 * and is told nothing about what it might have had. The viewer
 * is not the customer. [account.ts `EXTRAS`]
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let channel;
  try {
    channel = await loadChannel(id);
  } catch {
    return fail(404, 'channel not found');
  }
  if (!isPublished(channel) && !(await isOwner(request))) {
    return fail(404, 'channel not found');
  }

  /*
   * A CHANNEL WHOSE ACCOUNT CANNOT BE READ IS A CHANNEL WITHOUT
   * THE EXTRA, which is the safe direction: it plays, in its
   * default language. The other way round advertises renditions
   * on an installation that cannot say who owns them. [U-19]
   */
  /*
   * THE OWNER'S ACCOUNT, which on a single-tenant installation
   * is the only one there is. When this product grows a second
   * tenant the channel will carry whose it is, and this becomes
   * that lookup rather than a new decision — the gate is already
   * asking the right question of the wrong constant. [U-24]
   */
  const account = await loadAccount(OWNER_ACCOUNT_ID).catch(() => null);
  const multiAudio = account ? hasExtra(account, 'multi-audio') : false;

  const wire = streamQuality();
  const ladder = streamLadder();
  const producing = await producingRungs(channel.id);
  const text = masterPlaylist(
    renditions(channel.station, { multiAudio }, await producingAudio(channel.id)),
    {
      variant: `/api/channels/${channel.id}/playlist`,
      audio: (language) => `/api/channels/${channel.id}/audio/${language}/playlist`,
      subtitles: (language) =>
        `/api/channels/${channel.id}/subtitles/${language}/playlist`,
    },
    {
      bitsPerSecond: wire.videoBitsPerSecond + wire.audioBitsPerSecond,
      codecs: CODECS,
      width: wire.width,
      height: wire.height,
    },
    /*
     * CAPTIONS NEED NO EXTRA AND SO NEED NO ACCOUNT. The audio
     * renditions above are gated on `multi-audio` because a
     * second language is a second audience a broadcaster is
     * reaching; a product that charged a station for its deaf
     * audience would be charging for access to itself. One
     * directory listing, and the same *is it being written*
     * rule. [station.ts `subtitles`]
     */
    subtitleRendition(channel.station, await producingSubtitles(channel.id)),
    /*
     * AND THE RUNGS THE ENGINE IS ACTUALLY WRITING.  [§23]
     *
     * The deployment's ladder says what it MEANT to transmit;
     * the directory says what is on the disk. A master naming
     * a 360p variant whose segments 404 is worse than naming
     * none — a player drops to it when the line gets tight and
     * finds nothing, so the stream fails at exactly the moment
     * the ladder existed to rescue it. [D-21, U-19]
     *
     * NO ACCOUNT CHECK. A ladder is not a feature a
     * broadcaster buys; it is how a viewer on a train sees the
     * channel at all, and the cost is the installation's.
     */
    ladder.filter((rung) => producing.includes(rung.id)).map((rung) => ({
      bitsPerSecond: rung.videoBitsPerSecond + rung.audioBitsPerSecond,
      width: rung.width,
      height: rung.height,
      uri: `/api/channels/${channel.id}/q/${rung.id}/playlist`,
    })),
  );
  if (!text) return fail(404, 'nothing beyond the one rendition');

  return new Response(text, {
    headers: {
      'content-type': 'application/vnd.apple.mpegurl',
      /* A master changes when a broadcaster adds a language, which
         is rare — but a cached one is a viewer stuck without the
         track they just paid for, so it is not cached either. */
      'cache-control': 'no-store, no-cache, must-revalidate',
    },
  });
}
