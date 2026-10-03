/**
 * What a television reads.  [CHANNEL §2, §4, §7, D-03, D-19, N-7]
 *
 * M3U is the lineup and XMLTV is the guide. Neither is a new
 * capability: the stream they name has been public since "a viewer
 * gets the transmission" was written, and the walk they list is
 * `airtime`, which the web guide already uses.
 */

import { describe, expect, it } from 'vitest';

import type { Channel } from '../../src/domain/channel.js';
import type { Genre } from '../../src/domain/station.js';
import { newChannel, setStation } from '../../src/domain/channelEdit.js';
import {
  type Carried, carried, m3uLineup, m3uValue, xmlText, xmltvGuide, xmltvTime,
} from '../../src/domain/tvExport.js';

const MIN = 60_000;
const AT = Date.parse('2026-10-02T20:00:00.000Z');
const WHEN = new Date(AT).toISOString();
const HERE = 'https://balancevid.example';

function station(
  name: string,
  how: Partial<{
    slug: string; genre: Genre; callsign: string; logo: string;
    listed: boolean; published: boolean; titles: string[]; each: number;
  }> = {},
): Channel {
  const channel = newChannel(name, 'Europe/London', WHEN);
  setStation(channel, {
    ...(how.slug === undefined ? {} : { slug: how.slug }),
    ...(how.genre ? { genre: how.genre } : {}),
    ...(how.callsign ? { callsign: how.callsign } : {}),
    ...(how.logo ? { logoAssetId: how.logo } : {}),
  });
  if (how.published !== false) {
    channel.publication = {
      publishedAt: WHEN,
      ...(how.listed === false ? { listed: false } : {}),
    };
  }
  channel.rotation = (how.titles ?? []).map((title, at) => ({
    id: `r${at}`, title, durationMs: (how.each ?? 30) * MIN,
    source: { kind: 'media', assetId: `a${at}`, form: 'video' },
  })) as never;
  return channel;
}

function rows(...carrieds: [Channel, number][]): Carried[] {
  return carrieds.map(([channel, number]) => ({ channel, number }));
}

/* ------------------------------------------------------------------ *
 *  Text that survives a channel called `Rock & Roll "Live"`.
 * ------------------------------------------------------------------ */

describe('an M3U attribute value (N-7)', () => {
  /*
   * THE FORMAT HAS NO ESCAPE. `key="value"` with no sequence
   * meaning a literal quote, so the only honest thing to do with
   * one is take it out.
   */
  it('takes the quote out, because there is nowhere to put it', () => {
    expect(m3uValue('Rock "Live" Roll')).toBe('Rock Live Roll');
    expect(m3uValue('Rock "Live" Roll')).not.toContain('\\');
  });

  /*
   * A NEWLINE INSIDE A NAME IS A LINE A PARSER READS AS A URL, and
   * one channel with a stray byte would take every other channel
   * on the installation off the viewer's television.
   */
  it('flattens a name that would become two lines', () => {
    expect(m3uValue('Redemption\nTV')).toBe('Redemption TV');
    expect(m3uValue('Redemption\r\nTV')).toBe('Redemption  TV');
    expect(m3uValue('Red\u0000emption')).toBe('Red emption');
    expect(m3uValue('Red\u007Femption')).toBe('Red emption');
  });

  it('trims what the stripping leaves behind', () => {
    expect(m3uValue('\n Redemption TV \t')).toBe('Redemption TV');
  });

  /* A comma is legal: the display name runs to the end of the line. */
  it('keeps a comma, which the format allows in a name', () => {
    expect(m3uValue('Praise, Worship')).toBe('Praise, Worship');
  });
});

describe('XML text (N-7)', () => {
  /*
   * AMPERSAND FIRST, or the escapes escape each other. The exact
   * string is asserted because `&amp;amp;` is the failure and it
   * contains `&amp;`.
   */
  it('escapes the ampersand before the escapes it introduces', () => {
    expect(xmlText('Rock & Roll')).toBe('Rock &amp; Roll');
    expect(xmlText('a < b')).toBe('a &lt; b');
    expect(xmlText('a > b')).toBe('a &gt; b');
    expect(xmlText('say "this"')).toBe('say &quot;this&quot;');
  });

  /*
   * THE ORDERING BUG, STATED AS A FIXTURE. Escape `<` first and
   * this comes out `&amp;lt;`, which renders as the literal text
   * `&lt;` on a television.
   */
  it('does not escape its own escapes', () => {
    expect(xmlText('& < > "')).toBe('&amp; &lt; &gt; &quot;');
    expect(xmlText('<tag>')).toBe('&lt;tag&gt;');
    expect(xmlText('<tag>')).not.toContain('&amp;lt;');
  });

  /* XML 1.0 forbids these outright, escaped or not. */
  it('removes a byte no XML document may contain', () => {
    expect(xmlText('Red\u0001emption')).toBe('Red emption');
    expect(xmlText('Red\u001Femption')).toBe('Red emption');
  });

  it('leaves text that needs nothing alone', () => {
    expect(xmlText('Redemption TV')).toBe('Redemption TV');
  });
});

describe('an XMLTV instant (N-7)', () => {
  /*
   * EVERY FIELD IS PADDED, AND THE FIXTURE IS SINGLE-DIGIT IN ALL
   * SIX so that dropping any one `padStart` shortens the string.
   * A guide whose month reads `1` instead of `01` is a guide every
   * client misparses by one character.
   */
  it('pads every field, month through second', () => {
    expect(xmltvTime(Date.parse('2026-01-02T03:04:05.000Z')))
      .toBe('20260102030405 +0000');
  });

  /* And January is 01, not 00: the month is zero-based in Date. */
  it('counts January as the first month', () => {
    expect(xmltvTime(Date.parse('2026-01-15T12:00:00.000Z')))
      .toMatch(/^202601/);
    expect(xmltvTime(Date.parse('2026-12-15T12:00:00.000Z')))
      .toMatch(/^202612/);
  });

  it('leaves a two-digit field as it is', () => {
    expect(xmltvTime(Date.parse('2026-12-25T23:59:59.000Z')))
      .toBe('20261225235959 +0000');
  });

  /*
   * ALWAYS UTC, NEVER THE CHANNEL'S ZONE. The guide's argument is
   * one clock for every row; XMLTV without an offset is read as
   * the reader's local time, which is the same error with a
   * longer fuse.
   */
  it('writes the offset out, and it is zero', () => {
    expect(xmltvTime(AT).endsWith(' +0000')).toBe(true);
  });

  /*
   * AND THE FIELDS ARE UTC TOO, WHICH THIS BOX CANNOT SEE BY
   * ITSELF. `getHours` for `getUTCHours` survived every
   * assertion above, because the test machine runs in UTC and
   * the mutant and the code agree there. A server does not have
   * to: an installation in Lagos would have stamped every
   * programme an hour late and said `+0000` underneath it, which
   * is worse than no offset at all because it looks right.
   */
  it('reads UTC on a machine that is not in it', () => {
    const was = process.env['TZ'];
    try {
      process.env['TZ'] = 'Asia/Tokyo';
      /* The zone took effect, or this asserts nothing. */
      expect(new Date(Date.parse('2026-01-02T03:04:05.000Z')).getHours())
        .not.toBe(3);
      expect(xmltvTime(Date.parse('2026-01-02T03:04:05.000Z')))
        .toBe('20260102030405 +0000');
      process.env['TZ'] = 'America/Los_Angeles';
      expect(xmltvTime(Date.parse('2026-01-02T03:04:05.000Z')))
        .toBe('20260102030405 +0000');
    } finally {
      if (was === undefined) delete process.env['TZ'];
      else process.env['TZ'] = was;
    }
  });
});

/* ------------------------------------------------------------------ *
 *  Who is carried, and in what order.
 * ------------------------------------------------------------------ */

describe('who a television is offered (N-7)', () => {
  it('carries only what the directory shows', () => {
    const open = station('Open');
    const quiet = station('Quiet', { listed: false });
    const dark = station('Dark', { published: false });
    expect(carried([open, quiet, dark], {}).map((row) => row.channel.name))
      .toEqual(['Open']);
  });

  /*
   * NUMBERED FIRST, IN NUMBER ORDER. Given out of order so that
   * reversing the comparison is visible.
   */
  it('runs down the numbers', () => {
    const a = station('Zebra');
    const b = station('Apple');
    const c = station('Mango');
    const order = carried([a, b, c], { [a.id]: 102, [b.id]: 100, [c.id]: 101 });
    expect(order.map((row) => row.number)).toEqual([100, 101, 102]);
    expect(order.map((row) => row.channel.name))
      .toEqual(['Apple', 'Mango', 'Zebra']);
  });

  /*
   * AND A CHANNEL WITH NO NUMBER IS STILL CARRIED, which is not
   * `lineupOf`, which drops it. `channelListing.ts` wrote the
   * reason for exactly this case: "a row that vanished for want
   * of a number would make an unreadable file into a blank
   * television network". On the web that is cosmetic; here it is
   * a channel missing from somebody's television.
   */
  it('carries a channel the lineup never reached, at the end', () => {
    const numbered = station('Zebra');
    const not = station('Apple');
    const order = carried([not, numbered], { [numbered.id]: 100 });
    expect(order.map((row) => row.channel.name)).toEqual(['Zebra', 'Apple']);
    expect(order.map((row) => row.number)).toEqual([100, 0]);
  });

  /* Whichever way round the unnumbered one arrives. */
  it('puts it last from either side of the comparison', () => {
    const numbered = station('Apple');
    const not = station('Zebra');
    expect(carried([numbered, not], { [numbered.id]: 100 })
      .map((row) => row.number)).toEqual([100, 0]);
    expect(carried([not, numbered], { [numbered.id]: 100 })
      .map((row) => row.number)).toEqual([100, 0]);
  });

  it('orders the unnumbered among themselves by name', () => {
    const z = station('Zebra');
    const a = station('Apple');
    expect(carried([z, a], {}).map((row) => row.channel.name))
      .toEqual(['Apple', 'Zebra']);
  });

  /*
   * THE FILE COMES OFF DISK AND CAN SAY ANYTHING. A hand-edited
   * lineup holding 5 — below the first number — is not a number,
   * and carrying it would put a station in front of the network's
   * own reserved band.
   */
  it('treats a number outside the band as no number at all', () => {
    const one = station('Apple');
    expect(carried([one], { [one.id]: 5 })[0]!.number).toBe(0);
    expect(carried([one], { [one.id]: 10_000 })[0]!.number).toBe(0);
    expect(carried([one], { [one.id]: 100.5 })[0]!.number).toBe(0);
    expect(carried([one], { [one.id]: 'rubbish' as never })[0]!.number).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 *  The lineup.
 * ------------------------------------------------------------------ */

describe('the M3U (N-7)', () => {
  it('names the guide on the header, so one subscription brings both', () => {
    const text = m3uLineup([], HERE, `${HERE}/api/tv/guide.xml`);
    expect(text.split('\n')[0])
      .toBe(`#EXTM3U url-tvg="${HERE}/api/tv/guide.xml"`);
  });

  /*
   * NO SECOND BROADCAST ENGINE. The URL is the same HLS playlist
   * the watch page's player asks for — the same four-second
   * segments, the same function of the clock.
   */
  it('points a television at the playlist the browser already reads', () => {
    const one = station('Redemption TV', { slug: 'redemption-tv' });
    const text = m3uLineup(rows([one, 100]), HERE, 'g');
    expect(text).toContain(`${HERE}/api/channels/${one.id}/playlist`);
    expect(text).not.toContain('/watch');
  });

  /*
   * THE IDENTITY A CLIENT KEYS ON IS THE IMMUTABLE ID, per the
   * brief: "that prevents the whole system from breaking if you
   * later reorganize channel numbers". Not the number, which N-6
   * reuses; not the slug, which the owner edits.
   */
  it('keys on the id, not the number and not the address', () => {
    const one = station('Redemption TV', { slug: 'redemption-tv' });
    const text = m3uLineup(rows([one, 100]), HERE, 'g');
    expect(text).toContain(`tvg-id="${one.id}"`);
    expect(text).not.toContain('tvg-id="100"');
    expect(text).not.toContain('tvg-id="redemption-tv"');
  });

  it('gives a channel no duration, because a channel has none', () => {
    const one = station('Redemption TV', { slug: 'redemption-tv' });
    expect(m3uLineup(rows([one, 100]), HERE, 'g')).toContain('#EXTINF:-1 ');
  });

  it('carries the number, the name, the logo and the genre', () => {
    const one = station('Redemption TV', {
      slug: 'redemption-tv', genre: 'faith', logo: 'asset_logo',
    });
    const text = m3uLineup(rows([one, 102]), HERE, 'g');
    expect(text).toContain('tvg-chno="102"');
    expect(text).toContain('tvg-name="Redemption TV"');
    expect(text).toContain(
      `tvg-logo="${HERE}/api/tv/channels/redemption-tv/logo"`);
    expect(text).toContain('group-title="Faith"');
    expect(text.trimEnd().endsWith('/playlist')).toBe(true);
  });

  /* The display name runs to the end of the line, after the comma. */
  it('ends the EXTINF line with the name a viewer reads', () => {
    const one = station('Redemption TV', { slug: 'redemption-tv' });
    const line = m3uLineup(rows([one, 100]), HERE, 'g')
      .split('\n').find((row) => row.startsWith('#EXTINF'))!;
    expect(line.endsWith(',Redemption TV')).toBe(true);
  });

  /*
   * AN UNNUMBERED CHANNEL GETS NO `tvg-chno`, NOT A ZERO. Zero is
   * outside the band and a television would list it at the front
   * of the lineup, in front of the numbers the network allocated.
   */
  it('writes no number for a channel that has none', () => {
    const one = station('Redemption TV', { slug: 'redemption-tv' });
    const text = m3uLineup(rows([one, 0]), HERE, 'g');
    expect(text).not.toContain('tvg-chno');
    expect(text).toContain(`tvg-id="${one.id}"`);
  });

  it('writes no group for a channel that has not said a genre', () => {
    const one = station('Redemption TV', { slug: 'redemption-tv' });
    expect(m3uLineup(rows([one, 100]), HERE, 'g')).not.toContain('group-title');
  });

  /*
   * A LOGO NEEDS AN ADDRESS TO BE SERVED FROM. The logo route is
   * keyed by slug — the question it answers is "may a stranger
   * see this station?" — so a station document holding an empty
   * slug, which N-3 showed is a thing a file on disk can say, has
   * a logo and nowhere to fetch it from. The channel is still
   * carried: it transmits by id and the only thing it loses is
   * the picture.
   */
  it('carries a slugless channel, without claiming a logo for it', () => {
    const one = station('Redemption TV', { slug: 'redemption-tv', logo: 'a1' });
    one.station!.slug = '';
    const text = m3uLineup(rows([one, 100]), HERE, 'g');
    expect(text).not.toContain('tvg-logo');
    expect(text).toContain(`${HERE}/api/channels/${one.id}/playlist`);
  });

  it('claims no logo for a channel that has not uploaded one', () => {
    const one = station('Redemption TV', { slug: 'redemption-tv' });
    expect(m3uLineup(rows([one, 100]), HERE, 'g')).not.toContain('tvg-logo');
  });

  /*
   * ONE PAIR OF LINES PER CHANNEL, IN THE ORDER GIVEN. An EXTINF
   * without its URL on the next line is an entry every client
   * drops.
   */
  it('writes a URL under every EXTINF, in the order carried', () => {
    const a = station('A', { slug: 'aa' });
    const b = station('B', { slug: 'bb' });
    const lines = m3uLineup(rows([a, 100], [b, 101]), HERE, 'g')
      .trimEnd().split('\n');
    expect(lines.length).toBe(5);
    expect(lines[1]!.startsWith('#EXTINF')).toBe(true);
    expect(lines[2]).toBe(`${HERE}/api/channels/${a.id}/playlist`);
    expect(lines[3]!.startsWith('#EXTINF')).toBe(true);
    expect(lines[4]).toBe(`${HERE}/api/channels/${b.id}/playlist`);
  });

  /*
   * AND A NAME WITH A QUOTE IN IT DOES NOT END THE ATTRIBUTE
   * EARLY. The whole file after that point would be unparseable.
   */
  it('survives a channel whose name contains a quote', () => {
    const one = station('The "Best" Channel', { slug: 'best' });
    const line = m3uLineup(rows([one, 100]), HERE, 'g')
      .split('\n').find((row) => row.startsWith('#EXTINF'))!;
    expect(line).toContain('tvg-name="The Best Channel"');
    expect((line.match(/"/g) ?? []).length % 2).toBe(0);
  });
});

/* ------------------------------------------------------------------ *
 *  The guide.
 * ------------------------------------------------------------------ */

function parsable(xml: string): void {
  /* No bare ampersand: every one must open an entity we wrote. */
  expect(xml.replace(/&(amp|lt|gt|quot|apos);/g, '')).not.toContain('&');
  const opens = (xml.match(/<channel |<programme /g) ?? []).length;
  const closes = (xml.match(/<\/channel>|<\/programme>/g) ?? []).length;
  expect(opens).toBe(closes);
}

describe('the XMLTV (N-7)', () => {
  it('is a document, with a root and a declaration', () => {
    const text = xmltvGuide([], HERE, AT, AT + 60 * MIN);
    expect(text.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n'))
      .toBe(true);
    expect(text).toContain('<tv generator-info-name="BalanceVid">');
    expect(text.trimEnd().endsWith('</tv>')).toBe(true);
  });

  /*
   * EVERY CHANNEL DECLARED BEFORE ANY PROGRAMME. A `<programme>`
   * naming a channel the file never declared is what makes a
   * client drop the row without saying so.
   */
  it('declares every channel before it schedules anything', () => {
    const a = station('A', { slug: 'aa', titles: ['One', 'Two'] });
    const b = station('B', { slug: 'bb', titles: ['Three'] });
    const text = xmltvGuide(rows([a, 100], [b, 101]), HERE, AT, AT + 60 * MIN);
    expect(text.lastIndexOf('</channel>'))
      .toBeLessThan(text.indexOf('<programme '));
    expect(text).toContain(`<channel id="${a.id}">`);
    expect(text).toContain(`<channel id="${b.id}">`);
  });

  /*
   * SEVERAL DISPLAY NAMES, MOST USEFUL FIRST. A client shows the
   * first it can fit and matches on any of them, so a viewer
   * searching "RTV" and a lineup sorted by 102 are both answered.
   */
  it('gives the name, then the number, then the callsign', () => {
    const one = station('Redemption TV', { slug: 'rtv', callsign: 'RTV' });
    const names = [...xmltvGuide(rows([one, 102]), HERE, AT, AT)
      .matchAll(/<display-name>(.*)<\/display-name>/g)].map((m) => m[1]);
    expect(names).toEqual(['Redemption TV', '102', 'RTV']);
  });

  it('writes no number for a channel the lineup never reached', () => {
    const one = station('Redemption TV', { slug: 'rtv' });
    const names = [...xmltvGuide(rows([one, 0]), HERE, AT, AT)
      .matchAll(/<display-name>(.*)<\/display-name>/g)].map((m) => m[1]);
    expect(names).toEqual(['Redemption TV']);
  });

  it('points the icon at the station logo, not the library', () => {
    const one = station('R', { slug: 'rtv', logo: 'asset_logo' });
    const text = xmltvGuide(rows([one, 100]), HERE, AT, AT);
    expect(text)
      .toContain(`<icon src="${HERE}/api/tv/channels/rtv/logo" />`);
    expect(text).not.toContain('/api/library/');
  });

  it('claims no icon for a station with no logo', () => {
    const one = station('R', { slug: 'rtv' });
    expect(xmltvGuide(rows([one, 100]), HERE, AT, AT)).not.toContain('<icon');
  });

  /*
   * NOR FOR ONE WITH NOWHERE TO SERVE IT FROM. The logo route is
   * keyed by slug, so a station document holding an empty one —
   * which N-3 showed is a thing a file on disk can say — would
   * get `<icon src="…/api/tv/channels//logo" />`: a 404 on every
   * television that tried to draw it. The channel is still
   * declared and still scheduled.
   */
  it('claims no icon for a station with no address', () => {
    const one = station('R', { slug: 'rtv', logo: 'asset_logo' });
    one.station!.slug = '';
    const text = xmltvGuide(rows([one, 100]), HERE, AT, AT + 30 * MIN);
    expect(text).not.toContain('<icon');
    expect(text).toContain(`<channel id="${one.id}">`);
    expect(text).toContain('<programme ');
  });

  /*
   * THE SAME WALK THE WEB GUIDE USES, loop and all. A guide that
   * read the programme list alone would be wrong about every gap
   * the rotation fills, which is most of a channel's day.
   */
  it('lists what is actually on, including the loop coming round', () => {
    const one = station('R', { slug: 'rtv', titles: ['Worship', 'Talk'] });
    const text = xmltvGuide(rows([one, 100]), HERE, AT, AT + 90 * MIN);
    const titles = [...text.matchAll(/<title>(.*)<\/title>/g)].map((m) => m[1]);
    expect(titles).toEqual(['Worship', 'Talk', 'Worship']);
  });

  it('writes a start and a stop on every programme', () => {
    const one = station('R', { slug: 'rtv', titles: ['Worship'] });
    const text = xmltvGuide(rows([one, 100]), HERE, AT, AT + 30 * MIN);
    expect(text).toContain(
      `<programme start="${xmltvTime(AT)}" stop="${xmltvTime(AT + 30 * MIN)}"`
      + ` channel="${one.id}">`);
  });

  /*
   * A CHANNEL WITH NOTHING ON IS STILL ON AIR, AND SAYS SO. The
   * viewer's word is "Off air", not the channel's name — somebody
   * reading a listing is asking whether there is anything on.
   */
  it('says Off air rather than the station name', () => {
    const one = station('Redemption TV', { slug: 'rtv' });
    const text = xmltvGuide(rows([one, 100]), HERE, AT, AT + 30 * MIN);
    expect(text).toContain('<title>Off air</title>');
    expect(text).not.toContain('<title>Redemption TV</title>');
  });

  it('tags a programme with the station genre, where there is one', () => {
    const faith = station('A', { slug: 'aa', genre: 'faith', titles: ['W'] });
    const plain = station('B', { slug: 'bb', titles: ['W'] });
    expect(xmltvGuide(rows([faith, 100]), HERE, AT, AT + 30 * MIN))
      .toContain('<category>Faith</category>');
    expect(xmltvGuide(rows([plain, 101]), HERE, AT, AT + 30 * MIN))
      .not.toContain('<category>');
  });

  /*
   * ONE CHANNEL WITH AN AWKWARD NAME MUST NOT TAKE THE FILE DOWN
   * FOR EVERY OTHER CHANNEL. This is the failure the escaping
   * exists for, asserted on the whole document rather than on the
   * helper.
   */
  it('stays parsable with an ampersand in a name and a title', () => {
    const one = station('Rock & Roll <TV>', {
      slug: 'rock', titles: ['Praise & Worship'],
    });
    const text = xmltvGuide(rows([one, 100]), HERE, AT, AT + 30 * MIN);
    parsable(text);
    expect(text)
      .toContain('<display-name>Rock &amp; Roll &lt;TV&gt;</display-name>');
    expect(text).toContain('<title>Praise &amp; Worship</title>');
  });

  /*
   * AND FOR THE FIELDS THE EDITOR WOULD NEVER LET THROUGH.
   * `callsignProblem` allows capitals and digits, and the genre
   * is one of ten words, so neither can carry an ampersand by any
   * route through `setStation`. A CHANNEL DOCUMENT IS JSON ON
   * DISK — N-3's own lesson — and a hand-edited file can say
   * anything, so these are set the way a file would set them.
   * Escaping them is not decoration: one bad byte in one
   * station's document takes every other channel's guide down
   * with it.
   */
  it('escapes fields the editor itself would have refused', () => {
    const one = station('Ordinary', { slug: 'rock', titles: ['W'] });
    one.station!.callsign = 'R&R';
    one.station!.genre = 'rock & roll' as never;
    const text = xmltvGuide(rows([one, 100]), HERE, AT, AT + 30 * MIN);
    parsable(text);
    expect(text).toContain('<display-name>R&amp;R</display-name>');
    expect(text).toContain('<category>Rock &amp; roll</category>');
  });

  it('stays parsable for an ordinary lineup', () => {
    const a = station('A', { slug: 'aa', genre: 'faith', titles: ['W', 'T'] });
    const b = station('B', { slug: 'bb', callsign: 'BB', logo: 'x' });
    parsable(xmltvGuide(rows([a, 100], [b, 101]), HERE, AT, AT + 90 * MIN));
  });
});

/* ------------------------------------------------------------------ *
 *  How far ahead the guide actually reaches.
 * ------------------------------------------------------------------ */

describe('the reach of the exported guide (N-7)', () => {
  /*
   * THE CEILING IS `airtime`'s, NOT A PREFERENCE. The walk stops
   * after 240 stretches per channel, so the question a span has to
   * answer is how short an item can be and still be covered to the
   * end. Measured here rather than divided out, because the
   * constant it depends on is in another module and may move.
   */
  function reach(eachMinutes: number, spanMs: number): number {
    const one = station('R', {
      slug: 'rtv', each: eachMinutes,
      titles: ['A', 'B', 'C', 'D'],
    });
    const text = xmltvGuide(rows([one, 100]), HERE, AT, AT + spanMs);
    const stops = [...text.matchAll(/stop="(\d{14}) /g)].map((m) => m[1]!);
    return stops.length === 0 ? 0 : Number(stops[stops.length - 1]!.slice(8, 12));
  }

  const TWELVE = 12 * 60 * 60 * 1000;

  it('covers twelve hours of a channel changing every five minutes', () => {
    /* 20:00 UTC plus twelve hours is 08:00 the next day. */
    expect(reach(5, TWELVE)).toBe(800);
  });

  /*
   * AND IT IS HONEST ABOUT WHERE IT STOPS. A channel of
   * two-minute clips runs the walker out before the window ends,
   * and the document simply ends early rather than inventing
   * something to fill it. A client refreshes.
   */
  it('ends early, rather than wrongly, for a very short loop', () => {
    expect(reach(2, TWELVE)).toBeLessThan(800);
    expect(reach(2, TWELVE)).toBeGreaterThan(0);
  });
});
