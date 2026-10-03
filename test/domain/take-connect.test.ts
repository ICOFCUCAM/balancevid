/**
 * CONNECT, as a decision.  [TAKE-DESKTOP T-2; TAKE-PLATFORM P24]
 *
 * A pasted link, a typed address and an invitation code all
 * arrive as one string — *"a link is an origin plus a
 * credential"* — so this takes a string and says what kind of
 * thing it is, rather than asking a person to choose a tab first
 * and then be told they chose wrong.
 */

import { describe, expect, it } from 'vitest';

import { readTyped, says } from '../../desktop/src/connect.js';

describe('what somebody just typed (T-2)', () => {
  it('says nothing about nothing', () => {
    expect(readTyped('').kind).toBe('empty');
    expect(readTyped('   ').kind).toBe('empty');
    expect(says(readTyped(''))).toBe('');
  });

  it('reads a bare host as the studio somebody meant', () => {
    expect(readTyped('studio.example'))
      .toEqual({ kind: 'origin', origin: 'https://studio.example' });
  });

  /*
   * A LOCAL STUDIO IS PLAIN HTTP, which T-2's own criterion needs
   * — "a cloud installation, a self-hosted one and a local one" —
   * and which the shared parser now says, as `originFrom` on the
   * installation side already did.
   */
  it('reads a self-hosted studio on a port', () => {
    expect(readTyped('localhost:3101'))
      .toEqual({ kind: 'origin', origin: 'http://localhost:3101' });
    expect(readTyped('studio.example:8443'))
      .toEqual({ kind: 'origin', origin: 'https://studio.example:8443' });
  });

  /*
   * A LINK IS RECOGNISED BEFORE AN ORIGIN, because every link is
   * also an origin and answering "origin" would throw the
   * credential away — which is the whole of the invitation. The
   * person would be connected to the right studio and shown none
   * of the work they were invited to.
   */
  it('keeps the credential on a participation link', () => {
    expect(readTyped('https://studio.example/take/abc123.secret456'))
      .toEqual({
        kind: 'link',
        origin: 'https://studio.example',
        link: 'abc123.secret456',
      });
  });

  it('reads a link with a trailing slash', () => {
    const read = readTyped('https://studio.example/take/abc.def/');
    expect(read.kind).toBe('link');
    expect(read.kind === 'link' && read.link).toBe('abc.def');
  });

  /*
   * AND THE ORIGIN IN A LINK IS THE PARSED ONE, never the text
   * before the first slash. A reader scanning left to right sees
   * `studio.example`; the host is `evil.example`.
   */
  it('is not fooled by a studio written before an at-sign', () => {
    expect(readTyped('https://studio.example@evil.example/take/a.b').kind)
      .toBe('no');
  });

  /*
   * A PATH THAT IS NOT A LINK IS NOT AN ERROR. Somebody pastes
   * what was in their browser, and what they mean is "this
   * studio".
   */
  it('takes the studio out of any other page of it', () => {
    for (const pasted of ['https://studio.example/t/chan_abc/watch',
      'https://studio.example/tv/channels/redemption-tv',
      'https://studio.example/take', 'https://studio.example/?x=1']) {
      expect(readTyped(pasted), pasted)
        .toEqual({ kind: 'origin', origin: 'https://studio.example' });
    }
  });

  /* A link-shaped path under something else is not a link. */
  it('does not read a link out of a path that merely contains one', () => {
    expect(readTyped('https://studio.example/x/take/a.b').kind).toBe('origin');
    expect(readTyped('https://studio.example/take/a.b/c').kind).toBe('origin');
    expect(readTyped('https://studio.example/take/nodot').kind).toBe('origin');
  });

  /*
   * AND WHAT IS NOT AN ADDRESS IS REFUSED WITH A SENTENCE. The
   * same refusals `asOrigin` makes, which is the point of sharing
   * it: this screen does not get its own opinion about what a
   * studio is.
   */
  it('refuses what is not an address, and says so in words', () => {
    for (const bad of ['javascript:alert(1)', 'ftp://studio.example',
      'file:///etc/passwd', 'data:text/html,x', 'not a url at all!']) {
      const read = readTyped(bad);
      expect(read.kind, bad).toBe('no');
      expect(says(read).length, bad).toBeGreaterThan(10);
    }
  });

  it('refuses a URL carrying credentials', () => {
    expect(readTyped('https://user:pw@studio.example').kind).toBe('no');
    expect(readTyped('https://:pw@studio.example').kind).toBe('no');
  });
});

describe('what the screen says back (T-2)', () => {
  it('names the studio for an address', () => {
    expect(says(readTyped('studio.example'))).toBe('https://studio.example');
  });

  /* A link says it is one, because the difference matters: an
     invitation shows work, an address shows a studio. */
  it('says a link is an invitation, and where', () => {
    expect(says(readTyped('https://studio.example/take/a.b')))
      .toBe('An invitation at https://studio.example');
  });
});
