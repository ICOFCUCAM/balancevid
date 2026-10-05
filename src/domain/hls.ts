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
/** And the subtitle group. */
export const SUBS_GROUP = 'subs';

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
 * The caption track a channel offers, or nothing.
 *
 * ONE OR NONE, WHICH IS NOT THE SHAPE `renditions` HAS. A
 * channel's captions come from the transcript of whatever was
 * scheduled, in whatever language was spoken; there is no second
 * one to choose between until something in this product
 * translates a caption file. Returning a list of one would be a
 * player drawing a MENU over a single choice — the fault the
 * audio note above spends a paragraph on. [D-21, D-04]
 *
 * `producing` IS WHAT THE ENGINE IS WRITING, exactly as for
 * audio. A subtitle track advertised and not produced is a
 * viewer pressing CC, seeing nothing, and deciding this product
 * has no captions — which would be a false conclusion drawn from
 * a true observation, and the worst kind.
 */
export function subtitleRendition(
  station: Pick<Station, 'subtitles' | 'language' | 'audio'> | undefined,
  producing: readonly string[] = [],
): Rendition | null {
  if (station?.subtitles !== true) return null;
  const tracks = station.audio ?? [];
  const spoken = tracks.find((one) => one.default === true) ?? tracks[0];
  /*
   * THE SAME THREE-STEP FALLBACK `subtitleOf` APPLIES IN THE
   * ENGINE, and it has to be: the engine writes the directory
   * this then has to find. Two answers to *which language are
   * the captions in* is a playlist naming `fr` over a directory
   * called `en`. [D-19, playout/subtitleRendition.ts]
   */
  const language = (station.language ?? spoken?.language ?? 'und').toLowerCase();
  if (!producing.includes(language)) return null;
  return {
    language,
    label: languageSays(language),
    /*
     * NEVER THE DEFAULT. `DEFAULT=YES` on a subtitle rendition
     * turns captions on for every viewer who did not ask, which
     * is a broadcaster's decision to make about their own
     * channel and not this product's to make for them. A viewer
     * who wants them has a button. [D-21]
     */
    isDefault: false,
  };
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
  where: {
    variant: string;
    audio: (language: string) => string;
    subtitles?: (language: string) => string;
  },
  /**
   * WHAT THE ENCODER IS ACTUALLY PRODUCING, handed in rather
   * than guessed at. A `BANDWIDTH` or a `CODECS` string invented
   * in this file is a player choosing a variant on a number
   * nobody measured, and it goes wrong silently — the picture
   * just never starts on the device that believed it.
   */
  wire: { bitsPerSecond: number; codecs: string; width?: number; height?: number },
  /**
   * THE CAPTION TRACK, WHICH ON ITS OWN IS REASON ENOUGH FOR A
   * MASTER.
   *
   * The `offered.length < 2` line below is about AUDIO — one
   * audio track needs no master, because `/playlist` already
   * answers it. A subtitle rendition cannot be expressed in a
   * media playlist at all: `EXT-X-MEDIA` lives in a master, so a
   * single-language channel that captions its programmes needs
   * one for that alone. [RFC 8216 §4.3.4]
   */
  captions: Rendition | null = null,
  /**
   * THE LOWER RUNGS, BEST FIRST AND NOT INCLUDING THE WIRE.
   *   [§23]
   *
   * A ladder is a way DOWN from what the channel transmits:
   * the variant above is the house rendition every player has
   * read since §7, and these are the sizes a player may step
   * to when the line will not carry it. Handed in measured,
   * for the reason `wire` is — a `BANDWIDTH` invented in this
   * file is a player choosing a rung on a number nobody
   * measured, and it goes wrong silently.
   */
  rungs: readonly Rung[] = [],
): string | null {
  if (offered.length < 2 && !captions && rungs.length === 0) return null;
  const lines = ['#EXTM3U', '#EXT-X-VERSION:4'];
  /*
   * AND A SINGLE-TRACK CHANNEL'S ONE AUDIO RENDITION IS NOT
   * DECLARED AT ALL. With no alternate there is nothing for the
   * group to be a choice between, and an `EXT-X-MEDIA` with no
   * `URI` and no sibling is a line that tells a player what it
   * already has. The variant then carries no `AUDIO=` either.
   */
  const group = offered.length > 1;
  if (group) {
    for (const one of offered) {
      lines.push(mediaLine(one, where.audio(one.language)));
    }
  }
  if (captions && where.subtitles) {
    lines.push(subtitleLine(captions, where.subtitles(captions.language)));
  }
  const tail = (group ? `,AUDIO="${AUDIO_GROUP}"` : '')
    + (captions && where.subtitles ? `,SUBTITLES="${SUBS_GROUP}"` : '');
  const inf = (one: { bitsPerSecond: number; width?: number; height?: number }) =>
    `#EXT-X-STREAM-INF:BANDWIDTH=${Math.round(one.bitsPerSecond)},`
    + (one.width && one.height ? `RESOLUTION=${one.width}x${one.height},` : '')
    + `CODECS="${quoted(wire.codecs)}"${tail}`;

  /*
   * THE HOUSE RENDITION FIRST, which is not decoration. A
   * player with no measurement yet starts on the FIRST variant
   * in the master, and starting a viewer on 360p and letting
   * them climb would make every channel look soft for the
   * first ten seconds — the one impression a television gets
   * to make. It steps DOWN in a second if the line cannot
   * carry it, which is what a ladder is for. [D-21]
   *
   * EVERY RUNG CARRIES THE SAME `CODECS`, because every rung
   * is the same encoder at a different size — H.264 main at
   * 3.1 and AAC-LC, whatever the picture measures. A rung
   * declaring a codec string of its own would be this file
   * inventing a fact about an encoder it cannot see.
   */
  lines.push(inf(wire));
  lines.push(where.variant);
  for (const rung of rungs) {
    lines.push(inf(rung));
    lines.push(rung.uri);
  }
  return `${lines.join('\n')}\n`;
}

/** One lower rung, as the master describes it. */
export interface Rung {
  bitsPerSecond: number;
  width: number;
  height: number;
  uri: string;
}

/**
 * One `EXT-X-MEDIA` line for the caption track.
 *
 * `URI` ALWAYS, unlike the default audio rendition: there is no
 * such thing as a subtitle track muxed into the variant here —
 * the picture carries no closed captions, which is exactly why
 * this rendition exists. [RFC 8216 §4.3.4.1]
 *
 * `AUTOSELECT=NO` BESIDE `DEFAULT=NO`. `AUTOSELECT=YES` lets a
 * player turn captions on by itself from the viewer's system
 * preferences, which is right for audio — where the question is
 * *which language* — and wrong here, where it is *do you want
 * words on your screen*. A viewer who wants them has a button,
 * and one who does not should not have to find it to make them
 * stop. [D-21]
 */
function subtitleLine(one: Rendition, uri: string): string {
  const parts = [
    'TYPE=SUBTITLES',
    `GROUP-ID="${SUBS_GROUP}"`,
    `NAME="${quoted(one.label)}"`,
    `LANGUAGE="${quoted(one.language)}"`,
    'DEFAULT=NO',
    'AUTOSELECT=NO',
    `URI="${quoted(uri)}"`,
  ];
  return `#EXT-X-MEDIA:${parts.join(',')}`;
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
