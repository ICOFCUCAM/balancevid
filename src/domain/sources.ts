/**
 * What a conversation can be about.  [STUDIO-ONE §1, §2, §4, §7, §8; U-01, U-35 §6]
 *
 * *"Bring something you want to watch, analyze, interrupt, question,
 * explain, criticize, or respond to."*
 *
 * THE PRODUCT IS `SOURCE → RESPONSE`, AND THE SOURCE IS THE OPEN END.
 * Everything after it — watch, pause, respond, continue, respond again,
 * finished video — has been built since the beginning and does not care
 * where the material came from. What was narrow was the door: a link to
 * two video platforms, or a file with a picture in it. This module is the
 * door, stated once, so that a studio page, a dashboard card and a test
 * cannot disagree about how many ways in there are. [D-19]
 *
 * IT IS A CLOSED LIST ON PURPOSE. *"I would not immediately add 20 sources
 * just because we can."* Six ways in and one deferred is the author's own
 * table, and a module that makes adding a seventh a one-line temptation is
 * how that instruction gets lost.
 */

import { PROVIDER_LABELS, parseProviderUrl, type ProviderId } from './providers.js';

export type SourceKind = 'upload' | 'link' | 'record' | 'screen' | 'live';

/**
 * How much of the first version each way in is.
 *
 * The author's own column, kept as data rather than as prose, because the
 * one thing this table must survive is somebody deciding that a `later`
 * is nearly ready.
 */
export type SourceValue = 'essential' | 'useful' | 'later';

export interface SourceWay {
  kind: SourceKind;
  /** On the card. */
  label: string;
  /** Under it — the author's own two lines, unchanged. */
  says: string;
  /** What the card asks for once it is chosen. [§6] */
  asks: string;
  value: SourceValue;
}

/**
 * The four cards, and the fifth that is not built.
 *
 * ORDER IS THE BRIEF'S ORDER, which is also the order of how likely a
 * person is to want each: a file they have, a link they have, a camera
 * they have, and a screen they are already looking at.
 */
export const SOURCE_WAYS: SourceWay[] = [
  {
    kind: 'upload', label: 'Upload media',
    says: 'Video or audio from your computer',
    asks: 'Drop video or audio here, or choose a file',
    value: 'essential',
  },
  {
    kind: 'link', label: 'Paste a link',
    says: 'YouTube, Vimeo, direct video URL',
    asks: 'Paste a source URL',
    value: 'essential',
  },
  {
    kind: 'record', label: 'Record now',
    says: 'Camera and microphone, start immediately',
    asks: 'Camera / Microphone',
    value: 'useful',
  },
  {
    kind: 'screen', label: 'Screen capture',
    says: 'Record something on your screen',
    asks: 'Screen / Window / Tab',
    value: 'useful',
  },
  {
    kind: 'live', label: 'Live source',
    says: 'Camera, browser, RTMP, SRT or a network source',
    asks: 'Not yet',
    value: 'later',
  },
];

/** The ways in that are actually open. */
export function waysIn(): SourceWay[] {
  return SOURCE_WAYS.filter((one) => one.value !== 'later');
}

/**
 * WHAT THE FILE PICKER ACCEPTS.  [§2A, §7]
 *
 * `video/*` was the whole of it, and that one attribute was the only thing
 * standing between this product and *"someone could upload a podcast
 * episode and say: I want to respond to this statement at 12:42"* —
 * because `src/render/ingest.ts` has synthesised a black picture for
 * audio-only material since the day it was written. The engine was ready;
 * the door was not.
 */
export const ACCEPTS_MEDIA = 'video/*,audio/*';

/**
 * The extensions a fetched URL is allowed to end in.
 *
 * NOT A LIST OF WHAT FFMPEG CAN READ — it reads far more. It is a list of
 * what a link is allowed to CLAIM to be before this product will make an
 * outbound request for it, which is a different and much shorter question.
 * See `planForUrl`.
 */
export const FETCHABLE = [
  'mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'mpg', 'mpeg',
  /*
   * AND WHAT A PHONE WRITES. `.3gp` is what most handsets in most
   * of the markets this product is for record, and `.ogv` is
   * Firefox for Android. They are here because the UPLOAD gate
   * takes them: a product that will go and download a `.3gp` from
   * a link and refuse the same file from the person holding it is
   * two answers to one question, which is the C-14 shape this
   * repository keeps finding. [libraryUpload.ACCEPTS, D-03]
   *
   * It widens nothing that matters. This list governs what a link
   * may CLAIM before an outbound request is made; `NEVER_FETCHED`
   * below is the wall, and it is second on purpose.
   */
  '3gp', '3g2', 'ogv',
  'mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'oga', 'opus', 'amr',
];

/**
 * Platforms whose media is never fetched, whatever the URL looks like.
 *
 * U-35 §6 IS THE REASON THIS FILE EXISTS IN THIS SHAPE. *"Nothing in the
 * product downloads from a platform that forbids it. No exceptions, no
 * user-supplied workarounds, no third-party extraction integrations. This
 * rule is not subject to growth arguments."*
 *
 * The extension rule below already refuses most of what would be pasted
 * here, because a platform's own media URL is usually signed and
 * extensionless. This list is the second wall, and it is second on
 * purpose: a rule this important should not depend on a CDN's URL
 * formatting habits staying the same.
 *
 * A YOUTUBE WATCH PAGE IS NOT REFUSED — it is EMBEDDED, by the branch
 * above this one, which is the whole point. What is refused is the
 * player's media, dressed as a file.
 */
export const NEVER_FETCHED = [
  'googlevideo.com', 'ytimg.com', 'youtube.com', 'youtu.be',
  'vimeocdn.com', 'vimeo.com', 'akamaized.net',
  'tiktokcdn.com', 'tiktok.com', 'fbcdn.net', 'facebook.com',
  'cdninstagram.com', 'instagram.com', 'twimg.com', 'x.com',
  'twitter.com', 'dailymotion.com', 'dmcdn.net', 'twitch.tv',
  'ttvnw.net', 'sndcdn.com', 'soundcloud.com', 'spotify.com',
  'scdn.co',
];

/**
 * What can be done with a pasted URL, and in the honest cases, why not.
 *   [§2B]
 *
 * *"The system should tell the user whether the URL can be played
 * directly, imported, or embedded."* Three answers, and the third carries
 * a sentence, because "that is not a link to a video we can embed
 * officially" was the only thing this product said to anybody who pasted a
 * lecture recording from a university's own server — and it was not true.
 */
export type UrlPlan =
  | { can: 'embed'; provider: ProviderId; platform: string }
  | { can: 'fetch'; extension: string; host: string }
  | { can: 'no'; because: string };

export function planForUrl(raw: string): UrlPlan {
  const text = raw.trim();
  if (!text) return { can: 'no', because: 'Paste a link to get started.' };

  /*
   * THE EMBED IS ASKED FIRST AND THAT IS NOT AN OPTIMISATION. If the
   * fetch branch ran first, a YouTube URL that happened to end `.mp4`
   * would be downloaded instead of embedded — which is the exact
   * outcome U-35 §6 forbids, arrived at through ordering.
   */
  const embedded = parseProviderUrl(text);
  if (embedded) {
    return {
      can: 'embed', provider: embedded.provider,
      platform: PROVIDER_LABELS[embedded.provider],
    };
  }

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { can: 'no', because: 'That does not look like a web address.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { can: 'no', because: 'Only http and https links can be opened.' };
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (NEVER_FETCHED.some((one) => host === one || host.endsWith(`.${one}`))) {
    return {
      can: 'no',
      because: 'That is a platform’s own media link. This product plays a '
        + 'platform’s video in the platform’s player and never downloads '
        + 'it — paste the page you watch it on instead.',
    };
  }

  /*
   * AN EXTENSION, AND NOT A CONTENT-TYPE PROBE.
   *
   * The tempting version of this function asks the server what the URL
   * is. That turns "is this a video?" into an outbound request to any
   * address a person can type, before anything has been decided — which
   * is a request-forgery primitive with a text field attached. The fetch
   * itself is still guarded (`assertPublicUrl` resolves the host and
   * refuses everything that means "inside"), but the cheapest guard is
   * the one that never makes the request at all.
   *
   * It also matches what the author asked for, which is a DIRECT file:
   * "direct MP4/MOV URL". A page that happens to contain a video is not
   * one, and pretending to accept it would mean scraping.
   */
  const extension = (/\.([a-z0-9]{2,5})$/i.exec(url.pathname)?.[1] ?? '').toLowerCase();
  if (!extension) {
    return {
      can: 'no',
      because: 'That link does not point at a media file. A direct link ends '
        + 'in something like .mp4 or .mp3.',
    };
  }
  if (!FETCHABLE.includes(extension)) {
    return {
      can: 'no',
      because: `A .${extension} file is not audio or video this can open.`,
    };
  }
  return { can: 'fetch', extension, host };
}

/**
 * What a conversation's source came in as, for the recent list.  [§5]
 *
 * *"The Ancient… / YouTube / 04:12 / Yesterday."* The second column is
 * this: one word for where the material came from, derived from the
 * document rather than stored beside it, because a stored word is a word
 * that can disagree with the source it describes.
 */
export function whereFrom(source: {
  class: 'A' | 'B'; provider?: ProviderId; url?: string; capturedAs?: SourceKind;
}): string {
  if (source.class === 'B') {
    return source.provider ? PROVIDER_LABELS[source.provider] : 'Link';
  }
  if (source.capturedAs === 'record') return 'Recorded';
  if (source.capturedAs === 'screen') return 'Screen';
  if (source.capturedAs === 'link') return 'Link';
  return 'Upload';
}
