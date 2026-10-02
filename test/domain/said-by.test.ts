/**
 * What a person is told when a request fails.  [D-04, D-21, U-20, C-49]
 *
 * > *"JSON.parse: unexpected end of data at line 1 column 1 of the
 * > JSON data"*
 *
 * Shown to the author under a thirteen-megabyte video they had just
 * chosen, on the first screen of Studio One. It is the browser's
 * JSON parser complaining about a body, and the person reading it
 * had not asked for any JSON. There is nothing in it they can act
 * on.
 */

import { describe, expect, it } from 'vitest';

import { MOST_SAID, bodyOf, saysFor } from '../../src/domain/saidBy.js';
import { deckRefusalFor } from '../../src/domain/deletion.js';
import { nowAndNext, onAirTitle, viewerTitle } from '../../src/domain/onAir.js';
import { newChannel } from '../../src/domain/channelEdit.js';

describe('the parser is never the messenger (C-49)', () => {
  /*
   * THE EXACT SHAPE THAT PRODUCED THE AUTHOR'S SCREENSHOT: a status
   * and an empty body, which is what a refused upload, a gateway
   * timeout and a crashed route all look like. The status was
   * sitting right there, unread.
   */
  it('says what happened when the body is empty', () => {
    expect(saysFor(413, '')).toContain('larger');
    expect(saysFor(502, '')).toContain('not answering');
    expect(saysFor(500, '')).toBeTruthy();
  });

  /*
   * THE CLAIM IS NARROW AND IT IS THE RIGHT ONE: the PARSER'S
   * words never become the person's. A body that happens to
   * mention JSON is a server talking, and a server talking wins
   * — so this cannot be "the output never says json", which
   * would be a rule against the wrong thing.
   */
  const PARSER = [
    'JSON.parse', 'Unexpected token', 'unexpected end of data',
    'is not valid JSON', 'Unexpected end of JSON input',
  ];
  it('never repeats the parser’s complaint', () => {
    const bodies = ['', '   ', '{"half":', '<html><body>nope',
      'JSON.parse: unexpected end of data at line 1 column 1'];
    for (const status of [0, 400, 401, 403, 404, 408, 409, 413, 500, 502, 504]) {
      for (const body of bodies) {
        const said = saysFor(status, body);
        for (const leak of PARSER) {
          /* The one exception that proves it: a SERVER that chose
             to send that sentence is quoted, because it chose to.
             Nothing this product writes ever does. */
          if (body.includes(leak)) continue;
          expect(said, `${status} / ${body}`).not.toContain(leak);
        }
      }
    }
  });

  /*
   * AND THE FAULT IS THAT THIS WAS EVER REACHED. The author's
   * screenshot is `saysFor` never having been called: a `.json()`
   * before `response.ok`, so the status was unread and the parser
   * was the only thing with anything to say.
   */
  it('reads the status the old code threw away', () => {
    expect(saysFor(413, '')).not.toBe(saysFor(502, ''));
    expect(saysFor(401, '')).not.toBe(saysFor(403, ''));
  });

  /* And a status nobody listed still says something. */
  it('always has a sentence, for any status', () => {
    expect(saysFor(418, '')).toBeTruthy();
    expect(saysFor(599, '')).toContain('599');
  });

  /*
   * A STATUS OF ZERO IS NOT A STATUS. `fetch` rejects on a network
   * failure rather than resolving, so a caller constructing one of
   * these has nothing from the wire at all.
   */
  it('tells the truth about never reaching the server', () => {
    expect(saysFor(0, '')).toContain('did not reach');
  });
});

describe('the server’s own words win (C-49)', () => {
  /*
   * BECAUSE THIS PRODUCT WRITES THEM ON PURPOSE. *"it is on the
   * air: REdemption TV (the filler). Take it off the schedule
   * first"* is worth more than anything a status could say.
   */
  it('prefers a reason the server gave', () => {
    const said = 'it is on the air: REdemption TV (the filler).';
    expect(saysFor(409, JSON.stringify({ error: said }))).toBe(said);
  });

  it('ignores an error field that is empty or not a string', () => {
    expect(saysFor(500, JSON.stringify({ error: '  ' }))).not.toBe('  ');
    expect(saysFor(500, JSON.stringify({ error: 42 }))).toBe(saysFor(500, ''));
    expect(saysFor(500, JSON.stringify({ ok: false }))).toBe(saysFor(500, ''));
  });

  /* A plain sentence from something in the path is still a sentence. */
  it('passes on a short plain-text reason', () => {
    expect(saysFor(400, 'the stream key is wrong')).toBe('the stream key is wrong');
  });

  /*
   * AND A PROXY'S HTML IS SOMEBODY ELSE'S MARKUP. nginx answers a
   * refused upload with a page; showing it to a person shows them
   * a web page where a sentence belongs. The status is the honest
   * part of such a response.
   */
  it('never shows a proxy’s error page', () => {
    const page = '<html>\n<head><title>413 Request Entity Too Large</title>';
    expect(saysFor(413, page)).toBe(saysFor(413, ''));
    expect(saysFor(413, page)).not.toContain('<');
  });

  /*
   * AND A COMPACT ONE IS STILL A PAGE. The multi-line fixture
   * above is caught by the rule against dumps before markup is
   * ever considered, so it proved nothing about markup: a
   * one-line `<h1>413 Request Entity Too Large</h1>`, which is
   * exactly what several proxies emit, went straight through as
   * a person's error message until this existed.
   */
  it('never shows a one-line error page either', () => {
    for (const page of [
      '<h1>413 Request Entity Too Large</h1>',
      '<!doctype html><title>502 Bad Gateway</title>',
      '<?xml version="1.0"?><Error><Code>EntityTooLarge</Code></Error>',
    ]) {
      expect(saysFor(413, page), page).not.toContain('<');
      expect(saysFor(413, page), page).toBe(saysFor(413, ''));
    }
  });

  /* A stack trace is the machine talking to itself. */
  it('does not relay a dump', () => {
    const dump = `Error: boom\n    at thing (file.js:1:1)\n`.repeat(12);
    expect(saysFor(500, dump)).toBe(saysFor(500, ''));
    expect(saysFor(500, 'x'.repeat(MOST_SAID + 1))).toBe(saysFor(500, ''));
  });
});

describe('reading a body that may not be one (C-49)', () => {
  /*
   * A SUCCESSFUL REQUEST WITH AN EMPTY BODY IS ORDINARY: a 204, a
   * DELETE that simply worked. The parser's opinion about an empty
   * string is not information.
   */
  it('gives an object back for anything', () => {
    expect(bodyOf('')).toEqual({});
    expect(bodyOf('not json')).toEqual({});
    expect(bodyOf('null')).toEqual({});
    expect(bodyOf('[1,2]')).toEqual([1, 2]);
  });

  it('gives the fields back when there are some', () => {
    expect(bodyOf('{"conversation":{"id":"cnv_1"}}'))
      .toEqual({ conversation: { id: 'cnv_1' } });
  });
});

describe('a deck still needs its pages (C-49)', () => {
  /*
   * THE ASSET DELETION ASKED THE CHANNELS AND NOT THE DECKS, which
   * was invisible for as long as nothing could reach the route at
   * all. Offer the verb and the gap becomes reachable: a deck's
   * page removed from the library leaves the deck pointing at a
   * file that is not there, and a deck transmits a page at a time.
   */
  const DECK = {
    title: 'Admission Package',
    slides: [{ assetId: 'asset_1' }, { assetId: 'asset_2' }],
  };

  it('refuses a page a deck is holding', () => {
    const said = deckRefusalFor([DECK], 'asset_2');
    expect(said).toContain('Admission Package');
    expect(said).toContain('Delete the slide from the deck');
  });

  it('lets go of anything no deck holds', () => {
    expect(deckRefusalFor([DECK], 'asset_other')).toBe(null);
    expect(deckRefusalFor([], 'asset_1')).toBe(null);
  });

  /* One page can be in two decks, and both are worth naming. */
  it('names every deck holding it', () => {
    const second = { title: 'Evening Slides', slides: [{ assetId: 'asset_1' }] };
    const said = deckRefusalFor([DECK, second], 'asset_1')!;
    expect(said).toContain('Admission Package');
    expect(said).toContain('Evening Slides');
  });

  /*
   * A PAGE IS NOT "ON THE AIR" and does not borrow that sentence:
   * the channel refusal tells somebody to unschedule, which is
   * not what to do about a deck. [D-04]
   */
  it('does not tell them to unschedule something', () => {
    const said = deckRefusalFor([DECK], 'asset_1')!;
    expect(said).not.toContain('on the air');
    expect(said).not.toContain('schedule');
  });

  /* An untitled deck is still a deck somebody has to look in. */
  it('has something to call a deck with no name', () => {
    const said = deckRefusalFor([{ title: '', slides: [{ assetId: 'a' }] }], 'a')!;
    expect(said).toContain('untitled deck');
  });
});

describe('three answers to "what is on" (N-2)', () => {
  /*
   * THEY DIFFER ON PURPOSE, and the difference is the audience.
   * `onAirTitle` goes UNDER THE BUG, where "Off air" would be a
   * caption on a black frame nobody is watching; a viewer reading
   * a listing is asking whether there is anything on, and the
   * honest answer to that is "Off air".
   */
  const channel = { name: 'REdemption TV' } as never;

  it('tells the wire and the viewer different things about silence', () => {
    expect(onAirTitle(channel, { kind: 'off' })).toBe('REdemption TV');
    expect(viewerTitle(channel, { kind: 'off' })).toBe('Off air');
  });

  /* And the same thing about everything else, which is why one
     copy of each is enough and a fourth would be a disagreement. */
  it('agrees with itself everywhere else', () => {
    const film = { kind: 'media', assetId: 'a', form: 'video' } as never;
    for (const on of [
      { kind: 'programme', programme: { title: 'Worship' }, source: film,
        fromMs: 0, untilMs: 1 },
      { kind: 'rotation', entry: { title: 'Ident' }, source: film,
        fromMs: 0, untilMs: 1 },
      { kind: 'emergency', source: film, fromMs: 0 },
      { kind: 'backup', source: film, fromMs: 0 },
    ] as never[]) {
      expect(viewerTitle(channel, on)).toBe(onAirTitle(channel, on));
    }
  });

  /*
   * AN EMERGENCY IS NOT ANNOUNCED. The viewer is shown a caption
   * card because something went wrong behind it, and a channel
   * that captioned its own fault "BACKUP" would be telling them
   * about a problem they cannot do anything about. [§9]
   */
  it('never names the fault to the viewer', () => {
    const film = { kind: 'media', assetId: 'a', form: 'video' } as never;
    for (const kind of ['emergency', 'backup'] as const) {
      const said = viewerTitle(channel, { kind, source: film, fromMs: 0 } as never);
      expect(said).toBe('REdemption TV');
      expect(said.toLowerCase()).not.toContain('backup');
      expect(said.toLowerCase()).not.toContain('emergency');
    }
  });

  /* An untitled slot is the channel's name, never the id behind it. */
  it('never leaks an identifier through an untitled slot', () => {
    const source = { kind: 'render', document: 'conversation',
      documentId: 'conv_a1b2c3', planHash: 'x' } as never;
    const said = viewerTitle(channel,
      { kind: 'rotation', entry: { id: 'r1' }, source, fromMs: 0, untilMs: 1 } as never);
    expect(said).toBe('REdemption TV');
    expect(said).not.toContain('conv_');
  });
});

describe('now and next, for a viewer (N-4)', () => {
  /*
   * LIFTED OUT OF THE ROUTE because the station page, the
   * directory's LIVE NOW row and the guide all ask it, and each
   * re-deriving it is how four pages disagree about what a channel
   * is showing.
   */
  const MIN = 60_000;
  const AT = Date.parse('2026-10-02T20:00:00.000Z');

  function looping(titles: (string | undefined)[]) {
    const channel = newChannel('REdemption TV', 'Europe/London',
      new Date(AT).toISOString());
    channel.rotation = titles.map((title, at) => ({
      id: `r${at}`, durationMs: 10 * MIN,
      ...(title ? { title } : {}),
      source: { kind: 'media', assetId: `a${at}`, form: 'video' },
    })) as never;
    return channel;
  }

  it('names what follows in the loop, not the next fixed slot', () => {
    const said = nowAndNext(looping(['Worship', 'Live Talk']), AT);
    expect(said.title).toBe('Worship');
    expect(said.next).toBe('Live Talk');
    expect(said.nextAt).toBeGreaterThan(AT);
  });

  /*
   * AND NOT THE CHANNEL'S NAME. A loop of untitled items listed
   * "NEXT REdemption TV" — the station announcing itself as its
   * own next programme. [C-42, C-43]
   */
  it('says nothing rather than announcing the station as its own next', () => {
    const said = nowAndNext(looping(['Worship', undefined]), AT);
    expect(said.next).toBe(null);
    expect(said.next).not.toBe('REdemption TV');
  });

  /* An instant, not a countdown: a cached countdown is wrong by
     its own age. */
  it('gives an instant and never a remaining time', () => {
    const said = nowAndNext(looping(['Worship', 'Talk']), AT);
    expect(said.untilMs).toBe(AT + 10 * MIN);
  });

  it('knows a channel with nothing on is not live', () => {
    const empty = newChannel('Quiet', 'Europe/London', new Date(AT).toISOString());
    const said = nowAndNext(empty, AT);
    expect(said.live).toBe(false);
    expect(said.title).toBe('Off air');
  });
});

describe('now and next: the two cases a plain loop cannot show (N-4)', () => {
  const MIN = 60_000;
  const AT = Date.parse('2026-10-02T20:00:00.000Z');

  function channelWith(titles: (string | undefined)[]) {
    const channel = newChannel('REdemption TV', 'Europe/London',
      new Date(AT).toISOString());
    channel.rotation = titles.map((title, at) => ({
      id: `r${at}`, durationMs: 10 * MIN,
      ...(title ? { title } : {}),
      source: { kind: 'media', assetId: `a${at}`, form: 'video' },
    })) as never;
    return channel;
  }

  /*
   * NEXT IS WHICHEVER COMES SOONER. A loop turning every ten
   * minutes, with a scheduled programme five minutes away, must
   * name the PROGRAMME — it is what pre-empts. Every fixture above
   * had no schedule at all, so the comparison that decides this
   * was never exercised and `if (true)` passed everything. [§4]
   */
  it('names the programme that pre-empts, not the next turn of the loop', () => {
    const channel = channelWith(['Worship', 'Live Talk']);
    channel.programmes.push({
      id: 'p1', startsAt: new Date(AT + 5 * MIN).toISOString(),
      durationMs: 30 * MIN, title: 'The Evening Feature',
      source: { kind: 'media', assetId: 'film', form: 'video' },
    } as never);
    const said = nowAndNext(channel, AT);
    expect(said.next).toBe('The Evening Feature');
    expect(said.nextAt).toBe(AT + 5 * MIN);
  });

  /* And the loop wins when it turns first. */
  it('names the next turn when the loop turns first', () => {
    const channel = channelWith(['Worship', 'Live Talk']);
    channel.programmes.push({
      id: 'p1', startsAt: new Date(AT + 60 * MIN).toISOString(),
      durationMs: 30 * MIN, title: 'Much Later',
      source: { kind: 'media', assetId: 'film', form: 'video' },
    } as never);
    expect(nowAndNext(channel, AT).next).toBe('Live Talk');
  });

  /*
   * AND THE CAPTION IS `captionFor`'s, NOT THE RAW TITLE. An
   * untitled item makes `viewerTitle` fall back to the channel's
   * name, and printing that would put REdemption TV under a header
   * that already says REdemption TV — the fault C-42 exists to
   * stop. `captionFor` drops it and says what the thing IS instead.
   */
  it('never captions a channel with its own name', () => {
    const said = nowAndNext(channelWith([undefined, 'Later']), AT);
    expect(said.title).not.toBe('REdemption TV');
    expect(said.title).toBe('Film');
  });
});
