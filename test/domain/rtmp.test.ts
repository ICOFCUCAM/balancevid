/**
 * Pushing the programme somewhere else.
 * [Doctrine CHANNEL §15, §11, D-21, D-06, U-22, C-29]
 *
 * The audit ranked this first of the things not yet built:
 *
 *   *"This unlocks three of the four platform cards without anybody's
 *   permission, and it is the single highest-value piece of work on
 *   this list."*
 *
 * TWO THINGS ARE TESTED HARDER THAN THE SENDING. A stream key lets
 * anybody broadcast as the account that owns it, so the redaction is
 * tested as a security property rather than a nicety; and the output
 * URL arrives from a form, so the allowlist that stops ffmpeg writing
 * to `file:///` is tested as one too. [D-06]
 */

import { describe, expect, it } from 'vitest';

import type { Destination } from '../../src/domain/distribution.js';
import {
  RETRY_CAP_MS, RETRY_FROM_MS, isSendable, redact, refusalFor, retryAfter,
  senderArgs, targetUrl,
} from '../../src/domain/rtmp.js';

/* Nothing in it occurs in the server address either, so the
   fragment test below cannot pass or fail by coincidence. */
const KEY = 'xk7Qv2Lm9ZpR4tWn8aBcDgHj';
const target = { server: 'rtmp://live.example.com/app', key: KEY };

const dest = (over: Partial<Destination> = {}): Destination => ({
  id: 'dest_1' as Destination['id'],
  kind: 'rtmp', label: 'Backup RTMP', enabled: true, shape: '16:9',
  createdAt: '2026-10-02T00:00:00.000Z', ...over,
});

describe('where a programme may be pushed (D-06, C-29)', () => {
  it('takes the two schemes RTMP uses', () => {
    expect(isSendable('rtmp://live.example.com/app')).toBe(true);
    expect(isSendable('rtmps://live.example.com:443/app')).toBe(true);
  });

  /*
   * THE WHOLE DEFENCE, AND IT IS AT THE DOOR. ffmpeg writes its output
   * wherever it is told: `file:///` plus a path is a sender that
   * overwrites whatever it is pointed at, with the engine's own
   * privileges, from a string somebody typed into a form.
   */
  it('refuses everything else, including the dangerous ones', () => {
    for (const bad of [
      'file:///etc/passwd',
      'file:///home/user/balancevid/var/accounts/acct/channel.json',
      'http://example.com/push',
      'https://example.com/push',
      'tcp://example.com:9000',
      'udp://239.0.0.1:1234',
      'pipe:1',
      '/var/tmp/out.flv',
      'rtmp:///app',
      '',
      '   ',
      'not a url at all',
    ]) {
      expect(isSendable(bad), `${bad} should not be sendable`).toBe(false);
    }
  });

  it('is not fooled by a scheme inside the rest of the string', () => {
    expect(isSendable('http://evil.example.com/rtmp://live')).toBe(false);
  });
});

describe('the key never reaches a log (D-21, C-29)', () => {
  /*
   * D-21: *"No credentials in the document… a stream key in one is a
   * stream key in somebody's backup."* The same argument applies to
   * every other place a URL gets written down, which is why there is
   * one function for printing a target and it is this one.
   */
  it('never prints the key', () => {
    const shown = redact(target);
    expect(shown).not.toContain(KEY);
    expect(shown).toContain('live.example.com');
  });

  it('does not print even a fragment of it', () => {
    const shown = redact(target);
    for (let from = 0; from + 4 <= KEY.length; from += 1) {
      expect(shown, `leaked ${KEY.slice(from, from + 4)}`)
        .not.toContain(KEY.slice(from, from + 4));
    }
  });

  /*
   * AND NOT ITS LENGTH EITHER. Showing the last four is the card-number
   * convention, where the rest is already known; a stream key is
   * uniformly secret, and a placeholder that grew with it would leak
   * how much there was to guess.
   */
  it('gives away nothing about how long it is', () => {
    const short = redact({ ...target, key: 'ab' });
    const long = redact({ ...target, key: 'a'.repeat(200) });
    expect(short).toBe(long);
  });

  it('says the server plainly when there is no key to hide', () => {
    expect(redact({ ...target, key: '' })).toBe('rtmp://live.example.com/app');
  });
});

describe('the URL ffmpeg is given (C-29)', () => {
  it('puts the key on the end', () => {
    expect(targetUrl(target)).toBe(`rtmp://live.example.com/app/${KEY}`);
  });

  /*
   * THE JOIN IS THE PART THAT GOES WRONG. Operators paste a server
   * with a trailing slash about half the time, and `…/app/` + `key`
   * naively concatenated gives `…/app//key` — which some ingests
   * accept, some reject, and one or two accept and drop ten minutes
   * later.
   */
  it('makes one slash out of however many were pasted', () => {
    for (const server of ['rtmp://live.example.com/app',
      'rtmp://live.example.com/app/', 'rtmp://live.example.com/app///',
      '  rtmp://live.example.com/app/  ']) {
      expect(targetUrl({ server, key: KEY }))
        .toBe(`rtmp://live.example.com/app/${KEY}`);
    }
  });

  it('trims a key somebody pasted with a newline on it', () => {
    expect(targetUrl({ ...target, key: `  ${KEY}\n` }))
      .toBe(`rtmp://live.example.com/app/${KEY}`);
  });
});

describe('what to run (§11, C-29)', () => {
  const args = senderArgs({ playlist: '/var/stream/playlist.m3u8', target });

  it('copies rather than re-encodes', () => {
    expect(args).toContain('copy');
    /* No filter, no scale: the sender is a remux and the box it
       shares with the encoder notices nothing. */
    expect(args).not.toContain('-vf');
    expect(args).not.toContain('-c:v');
    expect(args.join(' ')).not.toContain('libx264');
  });

  /*
   * `-re` PACES INPUT AT ITS NATIVE RATE, which is right for a file
   * and wrong for a live playlist that is already arriving in real
   * time. Pacing a live source twice is how a sender drifts further
   * behind every hour until the ingest drops it.
   */
  it('does not pace a source that is already live', () => {
    expect(args).not.toContain('-re');
  });

  it('sends FLV, which is what RTMP carries', () => {
    expect(args[args.indexOf('-f') + 1]).toBe('flv');
  });

  it('puts the target last, where ffmpeg wants its output', () => {
    expect(args[args.length - 1]).toBe(targetUrl(target));
  });

  it('reads the playlist it was given', () => {
    expect(args[args.indexOf('-i') + 1]).toBe('/var/stream/playlist.m3u8');
  });
});

describe('what cannot be sent to, and why (D-21, U-22, C-29)', () => {
  it('sends to a configured 16:9 RTMP destination', () => {
    expect(refusalFor(dest(), target)).toBe(null);
  });

  it('asks for the key before anything else', () => {
    expect(refusalFor(dest(), null)).toContain('No stream key');
    expect(refusalFor(dest(), { ...target, key: '  ' }))
      .toContain('No stream key');
  });

  it('says so when the address is not an RTMP URL', () => {
    expect(refusalFor(dest(), { server: 'file:///tmp/x', key: KEY }))
      .toContain('rtmp://');
  });

  /*
   * D-21 AND U-22 BOTH FORBID THE CROP BY NAME. A vertical output is
   * a different edit; this sender copies. Refusing is the honest
   * answer, and a vertical destination that silently arrived as a
   * cropped 16:9 would be the product doing the forbidden thing
   * anyway.
   */
  it('refuses a different shape rather than cropping to it', () => {
    const says = refusalFor(dest({ shape: '9:16' }), target);
    expect(says).toContain('different composition');
    expect(says).toContain('not a crop');
  });

  /* The reviewed platforms keep their own connectors. What this gives
     them is the door: their server URL in a plain RTMP destination. */
  it('points a reviewed platform at the door that is open', () => {
    for (const kind of ['tiktok', 'youtube', 'facebook', 'x'] as const) {
      const says = refusalFor(dest({ kind }), target);
      expect(says, kind).toContain('approved app');
      expect(says, kind).toContain('RTMP');
    }
  });

  it('does not send the channel to itself', () => {
    expect(refusalFor(dest({ kind: 'own' }), target)).toContain('already going out');
  });

  /* The refusal is read before the key is, so a destination nobody
     can send to never asks for a credential it cannot use. */
  it('refuses a reviewed platform even with a key in hand', () => {
    expect(refusalFor(dest({ kind: 'tiktok' }), target)).not.toBe(null);
  });
});

describe('trying again (C-29)', () => {
  it('does not wait at all the first time', () => {
    expect(retryAfter(0)).toBe(0);
  });

  /* An ingest that refused once will refuse again, and platforms
     rate-limit reconnection — some ban an address that hammers them. */
  it('backs off further each time', () => {
    expect(retryAfter(1)).toBe(RETRY_FROM_MS);
    expect(retryAfter(2)).toBe(RETRY_FROM_MS * 2);
    expect(retryAfter(3)).toBe(RETRY_FROM_MS * 4);
    expect(retryAfter(2)).toBeGreaterThan(retryAfter(1));
  });

  /* But it is capped, because the other reason a sender dies is a
     network blip, and a broadcast that waited an hour to retry after
     one of those is a broadcast nobody was watching. */
  it('never waits longer than the cap', () => {
    for (const failures of [10, 20, 100, 1000]) {
      expect(retryAfter(failures)).toBeLessThanOrEqual(RETRY_CAP_MS);
    }
    expect(retryAfter(100)).toBe(RETRY_CAP_MS);
  });
});
