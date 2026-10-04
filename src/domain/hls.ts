/**
 * The master playlist, and the audio a channel offers.
 *   [Doctrine CHANNEL §7, §17, D-19, D-21, TV-NETWORK N-10]
 *
 *     #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Original",
 *                  LANGUAGE="en",DEFAULT=YES,AUTOSELECT=YES
 *     #EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aud",NAME="Français",
 *                  LANGUAGE="fr",DEFAULT=NO,AUTOSELECT=YES,URI="…"
 *     #EXT-X-STREAM-INF:BANDWIDTH=…,CODECS="…",AUDIO="aud"
 *     …/playlist
 *
 * > *"i plan for multitrack audio which is wise to include so it
 * > would not complecate in feature. however subscribers would
 * > have to pay extra for this special feature"*
 *
 * THE DEFAULT RENDITION HAS NO `URI`, AND THAT IS THE WHOLE
 * DESIGN. RFC 8216 says a member of an audio group with no URI
 * describes the audio ALREADY MUXED INTO THE VARIANT — which is
 * the channel's existing `<index>.ts`, with its one audio track,
 * exactly as every player has been receiving it since §7. So a
 * channel gains alternate languages without a second video
 * encode, without changing what the existing playlist serves,
 * and without touching the bytes a set-top box is already
 * reading. The alternates are audio-only and are the only new
 * thing on the disk.
 *
 * NOTHING IS ADVERTISED THAT IS NOT BEING PRODUCED. A master
 * playlist naming a rendition whose segments 404 is a player
 * offering a language that goes silent when it is chosen — the
 * worst shape this fault can take, because the viewer blames
 * their own connection. An alternate appears here only when the
 * channel DECLARES it, the account HOLDS the extra, and the
 * engine says it is WRITING it. Three facts, and the last one is
 * not a promise. [D-21, U-19]
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import { type AudioTrack, type Station, languageSays } from './station.js';

/** What the audio group is called, in the playlist. */
export const AUDIO_GROUP = 'aud';

/** One audio rendition, as a player will see it. */
export interface Rendition {
  language: string;
  /** What the station calls it, or the language's own name. */
  label: string;
  /** The one a player starts on: the track muxed into the variant. */
  isDefault: boolean;
}

/**
 * The tracks a channel actually offers a viewer.
 *
 * ONE TRACK IS NOT A CHOICE, and this returns it anyway. A player
 * that knows there is one track can say which language it is, and
 * a channel that says `Original (English)` has told a viewer
 * something true. What it must not do is draw a MENU over it.
 * [D-21]
 *
 * THE ORDER IS THE STATION'S, except that the default comes
 * first. A broadcaster's own ordering is a decision about their
 * own channel; which one a player starts on is not a matter of
 * taste. [`setStation` forces exactly one default]
 *
 * `producing` IS WHAT THE ENGINE IS WRITING, not what the
 * document wishes for. An alternate the encoder is not producing
 * is dropped here rather than advertised and broken.
 */
export function renditions(
  station: Pick<Station, 'audio'> | undefined,
  allowed: { multiAudio: boolean },
  producing: readonly string[] = [],
): Rendition[] {
  const tracks = station?.audio ?? [];
  if (tracks.length === 0) return [];
  const made = (one: AudioTrack): Rendition => ({
    language: one.language,
    label: one.label ?? languageSays(one.language),
    isDefault: one.default === true,
  });
  const all = tracks.map(made);
  const first = all.find((one) => one.isDefault) ?? all[0]!;
  /*
   * WITHOUT THE EXTRA, A CHANNEL IS ITS DEFAULT TRACK AND NOTHING
   * ELSE — and the viewer is told nothing about what they are
   * missing. A player saying *3 languages, 2 locked* would be
   * this product charging a broadcaster by nagging their
   * audience, who are not the customer. [account.ts `EXTRAS`]
   */
  if (!allowed.multiAudio) return [{ ...first, isDefault: true }];
  const rest = all
    .filter((one) => one !== first)
    .filter((one) => producing.includes(one.language))
    .map((one) => ({ ...one, isDefault: false }));
  return [{ ...first, isDefault: true }, ...rest];
}

/**
 * The master playlist, or nothing where there is no choice to
 * offer.
 *
 * NOTHING, RATHER THAN A MASTER WITH ONE RENDITION IN IT. A
 * single-track channel's master would be a second address
 * answering exactly what `/playlist` answers, and a second
 * address for one answer is two things to keep in step. The
 * player asks for the master, gets a 404, and plays the media
 * playlist it already knew about — which is what it would have
 * done anyway. [D-19, D-21]
 */
export function masterPlaylist(
  offered: readonly Rendition[],
  where: { variant: string; audio: (language: string) => string },
  /**
   * WHAT THE ENCODER IS ACTUALLY PRODUCING, handed in rather
   * than guessed at. A `BANDWIDTH` or a `CODECS` string invented
   * in this file is a player choosing a variant on a number
   * nobody measured, and it goes wrong silently — the picture
   * just never starts on the device that believed it.
   */
  wire: { bitsPerSecond: number; codecs: string },
): string | null {
  if (offered.length < 2) return null;
  const lines = ['#EXTM3U', '#EXT-X-VERSION:4'];
  for (const one of offered) {
    lines.push(mediaLine(one, where.audio(one.language)));
  }
  lines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${Math.round(wire.bitsPerSecond)},`
    + `CODECS="${quoted(wire.codecs)}",AUDIO="${AUDIO_GROUP}"`);
  lines.push(where.variant);
  return `${lines.join('\n')}\n`;
}

/**
 * One `EXT-X-MEDIA` line.
 *
 * THE DEFAULT CARRIES NO `URI`. See the note at the top: that is
 * what tells a player the audio is already in the variant.
 *
 * `AUTOSELECT=YES` ON EVERY MEMBER, because a player choosing by
 * the viewer's system language is the point of declaring the
 * language at all — and a rendition a player may not select
 * automatically is one most viewers will never find.
 */
function mediaLine(one: Rendition, uri: string): string {
  const parts = [
    'TYPE=AUDIO',
    `GROUP-ID="${AUDIO_GROUP}"`,
    `NAME="${quoted(one.label)}"`,
    `LANGUAGE="${quoted(one.language)}"`,
    `DEFAULT=${one.isDefault ? 'YES' : 'NO'}`,
    'AUTOSELECT=YES',
    ...(one.isDefault ? [] : [`URI="${quoted(uri)}"`]),
  ];
  return `#EXT-X-MEDIA:${parts.join(',')}`;
}

/**
 * An attribute value, made safe for a quoted-string.
 *
 * A LABEL IS A BROADCASTER'S OWN WORDS — *"Original"*, *"Audio
 * description"*, somebody's channel name — and a quotation mark
 * or a newline in one would end the attribute early and leave a
 * playlist no player can parse. The same reasoning `m3uValue`
 * already applies to the export, applied where the text arrives
 * from a document rather than from this file. [tvExport.ts]
 */
function quoted(text: string): string {
  return text.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/"/g, '').trim();
}
