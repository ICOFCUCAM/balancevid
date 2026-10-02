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
