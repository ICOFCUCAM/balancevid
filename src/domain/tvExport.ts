/**
 * What a television reads.
 *   [Doctrine CHANNEL §2, §4, §7, D-03, D-19, TV-NETWORK N-7]
 *
 *     #EXTM3U url-tvg="https://…/api/tv/guide.xml"
 *     #EXTINF:-1 tvg-id="chan_a1b2" tvg-chno="100" …,Redemption TV
 *     https://…/api/channels/chan_a1b2/playlist
 *
 * > *"EPG data can also be exported to standard TV/IPTV clients
 * > alongside channel streams; M3U + XMLTV is already widely used
 * > for this kind of thing."*
 *
 * TWO DOCUMENTS, AND NEITHER IS A NEW CAPABILITY. The M3U is the
 * directory and the XMLTV is the guide, written for a reader that
 * is not a browser. Everything they name has been public since
 * before this file existed:
 *
 *   the lineup    `directory()` and the registry      [N-3, N-6]
 *   the guide     `airtime` and `viewerTitle`         [N-5, N-2]
 *   the stream    `/api/channels/<id>/playlist`       [§7]
 *   the logo      `/api/tv/channels/<slug>/logo`      [N-7]
 *
 * NO SECOND BROADCAST ENGINE, which is the first line of the
 * network document's *what must not happen*. The M3U points a
 * set-top box at the same HLS playlist the watch page's player
 * asks for — the same four-second segments, the same function of
 * the clock. A television and a browser watch the identical
 * channel, which is the only arrangement in which they can agree
 * about what is on.
 *
 * THE IDENTITY A CLIENT KEYS ON IS THE CHANNEL ID, and that is
 * the brief's own instruction rather than a convenience:
 *
 * > *"Channel ID: immutable. Channel Number: assigned/display
 * > identity… That prevents the whole system from breaking if you
 * > later reorganize channel numbers."*
 *
 * Not the number, which N-6 hands out lowest-free and therefore
 * reuses. Not the slug, which the owner edits. A client that
 * recorded tonight's film against `tvg-id` must still find it
 * tomorrow, and the id is the one name that never moves.
 *
 * AND NOTHING HERE IS CONFIGURABLE. There is no "export settings"
 * page, no per-channel opt-in beyond the `listed` flag that
 * already decides the directory, and no span a caller can ask
 * for. A channel in the directory is in the M3U, for the same
 * reason and by the same test.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import type { Channel } from './channel.js';
import { airtime } from './airtime.js';
import { inDirectory } from './channelListing.js';
import { genreSays } from './station.js';
import { usableNumber } from './registry.js';
import { viewerTitle } from './onAir.js';

/**
 * How far ahead the exported guide reaches.
 *
 * TWELVE HOURS, AND THE CEILING IS `airtime`'s, NOT A PREFERENCE.
 * The walk stops after 240 stretches per channel, so a rotation of
 * short clips runs out before a long window does, and a guide that
 * claimed twenty-four hours and delivered eight for the busiest
 * channels would be a document that lies about its own extent.
 * Twelve is what a channel with programming every few minutes can
 * actually fill, and a client refreshes.
 */
export const EXPORT_SPAN_MS = 12 * 60 * 60 * 1000;

/* ------------------------------------------------------------------------ *
 *  Making text that survives a channel called `Rock & Roll "Live"`.
 * ------------------------------------------------------------------------ */

/**
 * A control character is in no document.
 *
 * XML 1.0 forbids them outright below 0x20 except tab, newline and
 * carriage return; an M3U is line-oriented, so a newline inside a
 * channel name is a line a parser reads as a URL. One channel with
 * a stray byte in its name would make the whole file unreadable,
 * which is the failure worth preventing: every other channel on
 * the installation disappears from the viewer's television.
 */
function printable(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
}

/**
 * A value inside an M3U attribute.
 *
 * THE FORMAT HAS NO ESCAPE. `#EXTINF` attributes are
 * `key="value"` and there is no sequence that means a literal
 * quote, so the only honest thing to do with one is take it out.
 * A backslash would be printed by half the clients and swallowed
 * by the other half.
 */
export function m3uValue(text: string): string {
  return printable(text).replace(/"/g, '');
}

/**
 * Text or an attribute value inside XML.
 *
 * AMPERSAND FIRST, or the escapes escape each other and `&` comes
 * out `&amp;amp;`. The classic ordering bug, and the reason this
 * is one function rather than a chain at four call sites.
 */
export function xmlText(text: string): string {
  return printable(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * An instant as XMLTV writes one: `20261003020000 +0000`.
 *
 * ALWAYS UTC, NEVER THE CHANNEL'S ZONE. A stretch is an instant,
 * and the guide's whole argument is that one clock covers every
 * channel — *"a grid that drew each row in its own zone would put
 * 20:00 in twelve places"*. The offset is written out because
 * XMLTV without one is read as the reader's local time, which is
 * the same error with a longer fuse.
 */
export function xmltvTime(atMs: number): string {
  const at = new Date(atMs);
  const pad = (value: number) => String(value).padStart(2, '0');
  /*
   * THE YEAR IS NOT PADDED, because `padStart` cannot truncate and
   * therefore `padStart(4, '0')` did nothing for any year the
   * clock can produce. It survived every mutation; the only
   * fixture that reaches it is a document claiming a programme in
   * the year 500, which is one malformed line rather than the
   * unparseable file the escaping above exists to prevent.
   * [the twenty-second]
   */
  return `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}`
    + `${pad(at.getUTCDate())}${pad(at.getUTCHours())}`
    + `${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())} +0000`;
}

/* ------------------------------------------------------------------------ *
 *  Who is in an export, and in what order.
 * ------------------------------------------------------------------------ */

export interface Carried {
  channel: Channel;
  /** The allocated number, or 0 for a channel the lineup has not reached. */
  number: number;
}

/**
 * The channels a television is offered, in the order it lists them.
 *
 * NUMBERED FIRST, IN NUMBER ORDER, then the rest by name. This is
 * not `lineupOf`, which drops a channel that has no number, and
 * the reason is written down in `channelListing.ts` for exactly
 * this case:
 *
 * > *"A row that vanished for want of a number would make an
 * > unreadable file into a blank television network."*
 *
 * A numbers file that could not be written is a cosmetic fault on
 * the web directory and would be a channel missing from somebody's
 * television. The same judgement, one surface along.
 *
 * AND ONLY WHAT THE DIRECTORY SHOWS. `inDirectory` is the test, so
 * an unlisted channel is absent here as it is absent from `/tv` —
 * *"works through direct link/domain but doesn't appear in the
 * directory"*, and an M3U is a directory. [§10]
 */
export function carried(
  channels: readonly Channel[], assigned: Readonly<Record<string, number>>,
): Carried[] {
  const rows = channels
    .filter(inDirectory)
    .map((channel) => {
      const held = assigned[channel.id];
      return { channel, number: usableNumber(held) ? held : 0 };
    });
  return rows.sort((a, b) => {
    if (a.number !== b.number) {
      /* Unnumbered last, whichever way round the pair comes. */
      if (a.number === 0) return 1;
      if (b.number === 0) return -1;
      return a.number - b.number;
    }
    return a.channel.name.localeCompare(b.channel.name);
  });
}

/* ------------------------------------------------------------------------ *
 *  The lineup.
 * ------------------------------------------------------------------------ */

/**
 * The M3U a set-top box subscribes to.
 *
 * `#EXTINF:-1` BECAUSE A CHANNEL HAS NO DURATION. The field is a
 * length in seconds and a live channel does not have one; `-1` is
 * how every IPTV playlist in existence says so, and a `0` there is
 * read by some clients as a zero-length item to skip.
 *
 * `url-tvg` ON THE HEADER is what makes the guide arrive without
 * the viewer pasting a second address. One subscription, and the
 * television has both the lineup and what is on it.
 *
 * A CHANNEL WITH NO SLUG STILL TRANSMITS. The web directory drops
 * it because a row there is a link to `/tv/channels/<slug>` and
 * there is nowhere to link to; a television needs no such address
 * — it needs the stream, which is keyed by id. So the only thing
 * a missing slug costs here is the logo.
 */
export function m3uLineup(
  rows: readonly Carried[], origin: string, guideUrl: string,
): string {
  const lines = [`#EXTM3U url-tvg="${m3uValue(guideUrl)}"`];
  for (const { channel, number } of rows) {
    const station = channel.station;
    const name = m3uValue(channel.name);
    const attributes = [
      `tvg-id="${m3uValue(channel.id)}"`,
      `tvg-name="${name}"`,
      ...(number > 0 ? [`tvg-chno="${number}"`] : []),
      ...(station?.logoAssetId && station.slug
        ? [`tvg-logo="${m3uValue(`${origin}/api/tv/channels/${station.slug}/logo`)}"`]
        : []),
      /*
       * THE GENRE IS THE GROUP, which is how a television sorts a
       * lineup into folders. A channel that has not said one is
       * left ungrouped rather than put in "Other": an invented
       * group is a folder the viewer has to open to find it is
       * empty of meaning.
       */
      ...(station?.genre
        ? [`group-title="${m3uValue(genreSays(station.genre))}"`] : []),
    ];
    /*
     * THE NAME AFTER THE COMMA RUNS TO THE END OF THE LINE, which
     * is the format's one rule about it, and is why a newline had
     * to go before we got here.
     */
    lines.push(`#EXTINF:-1 ${attributes.join(' ')},${name}`);
    lines.push(`${origin}/api/channels/${channel.id}/playlist`);
  }
  return `${lines.join('\n')}\n`;
}

/* ------------------------------------------------------------------------ *
 *  The guide.
 * ------------------------------------------------------------------------ */

/**
 * The XMLTV a television reads the grid from.
 *
 * THE SAME WALK THE WEB GUIDE USES. `airtime` answers *what is on
 * across this window* including the loop, and `viewerTitle` names
 * it the way a viewer is told — *"Off air"* rather than the
 * channel's name, because somebody reading a listing is asking
 * whether there is anything on. A second walk here would be a
 * fourth answer to a question N-2 exists to keep at one. [D-19]
 *
 * EVERY CHANNEL IS DECLARED EVEN WITH NOTHING TO SHOW. A
 * `<programme>` naming a channel the file never declared is what
 * makes a client drop the row silently, so the declarations come
 * first and in full.
 *
 * NO `<desc>`. The station has a description and the programme
 * does not, and printing the channel's blurb under every item
 * would be a guide where each row says the same paragraph twelve
 * times. The field stays empty until there is something that
 * belongs in it.
 */
export function xmltvGuide(
  rows: readonly Carried[], origin: string, fromMs: number, toMs: number,
): string {
  const out = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE tv SYSTEM "xmltv.dtd">',
    '<tv generator-info-name="BalanceVid">',
  ];

  for (const { channel, number } of rows) {
    const station = channel.station;
    out.push(`  <channel id="${xmlText(channel.id)}">`);
    /*
     * SEVERAL DISPLAY NAMES, MOST USEFUL FIRST, which is what the
     * format is for: a client shows the first it can fit and
     * matches on any of them. The name, then the number, then the
     * callsign — a viewer searching "RTV" and a lineup sorted by
     * 102 are both answered without a second document.
     */
    out.push(`    <display-name>${xmlText(channel.name)}</display-name>`);
    if (number > 0) out.push(`    <display-name>${number}</display-name>`);
    if (station?.callsign) {
      out.push(`    <display-name>${xmlText(station.callsign)}</display-name>`);
    }
    if (station?.logoAssetId && station.slug) {
      const src = `${origin}/api/tv/channels/${station.slug}/logo`;
      out.push(`    <icon src="${xmlText(src)}" />`);
    }
    out.push('  </channel>');
  }

  for (const { channel } of rows) {
    const genre = channel.station?.genre;
    for (const stretch of airtime(channel, fromMs, toMs)) {
      const start = xmltvTime(stretch.fromMs);
      const stop = xmltvTime(stretch.toMs);
      out.push(
        `  <programme start="${start}" stop="${stop}"`
        + ` channel="${xmlText(channel.id)}">`);
      out.push(`    <title>${xmlText(viewerTitle(channel, stretch.on))}</title>`);
      if (genre) out.push(`    <category>${xmlText(genreSays(genre))}</category>`);
      out.push('  </programme>');
    }
  }

  out.push('</tv>');
  return `${out.join('\n')}\n`;
}
