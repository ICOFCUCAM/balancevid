/**
 * The ways into a conversation.  [STUDIO-ONE §1, §2, §8; U-35 §6]
 *
 * Two things are under test and only one of them is a feature.
 *
 * The first is the table: four doors open, one deferred, and the author's
 * own instruction that it stays that size — *"I would not immediately add
 * 20 sources just because we can."*
 *
 * The second is `planForUrl`, which decides whether this product makes an
 * outbound request for something a person typed. That is a security
 * boundary wearing a helpful message, and it is tested like one.
 */

import { describe, expect, it } from 'vitest';
import {
  ACCEPTS_MEDIA, FETCHABLE, NEVER_FETCHED, SOURCE_WAYS,
  planForUrl, waysIn, whereFrom,
} from '../../src/domain/sources.js';

describe('the doors, and how many there are', () => {
  it('opens exactly the four the brief asked for', () => {
    expect(waysIn().map((one) => one.kind))
      .toEqual(['upload', 'link', 'record', 'screen']);
  });

  /*
   * THE DEFERRED ONE IS IN THE TABLE AND NOT OPEN. Deleting it would lose
   * the author's "Later"; opening it would ship something that does not
   * exist. It is listed so the studio can say so.
   */
  it('keeps the live source, and keeps it shut', () => {
    const live = SOURCE_WAYS.find((one) => one.kind === 'live');
    expect(live?.value).toBe('later');
    expect(waysIn()).not.toContain(live);
  });

  it('describes every door it opens', () => {
    for (const way of waysIn()) {
      expect(way.label.length, way.kind).toBeGreaterThan(0);
      expect(way.says.length, way.kind).toBeGreaterThan(0);
      expect(way.asks.length, way.kind).toBeGreaterThan(0);
    }
  });

  /*
   * ONE LINE OF HTML WAS THE WHOLE OF §7. The file picker said
   * `video/*`, and the ingest engine had been synthesising a black
   * picture for audio-only material since the day it was written.
   */
  it('accepts audio as well as video', () => {
    expect(ACCEPTS_MEDIA).toContain('audio/');
    expect(ACCEPTS_MEDIA).toContain('video/');
  });
});

describe('what can be done with a pasted link', () => {
  it('embeds the two platforms it is allowed to embed', () => {
    const youtube = planForUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(youtube.can).toBe('embed');
    expect(planForUrl('https://vimeo.com/123456789').can).toBe('embed');
  });

  it('fetches a file its publisher served', () => {
    const plan = planForUrl('https://lectures.example.edu/talks/2024/ethics.mp4');
    expect(plan).toEqual({
      can: 'fetch', extension: 'mp4', host: 'lectures.example.edu',
    });
  });

  it('fetches audio too, which is the point of §7', () => {
    const plan = planForUrl('https://podcast.example.org/ep/41.mp3');
    expect(plan.can).toBe('fetch');
  });

  /*
   * U-35 §6, TWICE OVER.
   *
   * A platform's media URL is refused by name even when it is dressed as
   * a file — and a platform's WATCH page is not refused at all, because
   * it is embedded. Both halves matter: a test that only checked the
   * refusal would pass on a function that refused YouTube entirely.
   */
  it('never fetches a platform’s own media, however it is dressed', () => {
    for (const url of [
      'https://rr3---sn-x.googlevideo.com/videoplayback/x.mp4',
      'https://player.vimeocdn.com/progressive/file.mp4',
      'https://v16-web.tiktokcdn.com/video/x.mp4',
      'https://scontent.cdninstagram.com/v/x.mp4',
      'https://video.twimg.com/ext_tw_video/x.mp4',
      'https://cf-hls-media.sndcdn.com/media/x.mp3',
    ]) {
      const plan = planForUrl(url);
      expect(plan.can, url).toBe('no');
      if (plan.can === 'no') expect(plan.because).toMatch(/platform/i);
    }
  });

  it('still embeds the page those platforms want you to watch on', () => {
    expect(planForUrl('https://youtu.be/dQw4w9WgXcQ').can).toBe('embed');
  });

  /*
   * THE ORDER OF THE TWO BRANCHES IS THE TEST. A YouTube URL ending
   * `.mp4` must reach the embed branch first; if the fetch branch ran
   * first it would be downloaded, which is the exact outcome the rule
   * forbids, arrived at by ordering rather than by intent.
   */
  it('embeds before it fetches', () => {
    expect(planForUrl('https://www.youtube.com/embed/dQw4w9WgXcQ').can)
      .toBe('embed');
  });

  it('refuses a page that merely contains a video', () => {
    const plan = planForUrl('https://news.example.com/article/the-interview');
    expect(plan.can).toBe('no');
    if (plan.can === 'no') expect(plan.because).toMatch(/media file/i);
  });

  it('refuses a file type it cannot open', () => {
    const plan = planForUrl('https://example.org/report.pdf');
    expect(plan.can).toBe('no');
    if (plan.can === 'no') expect(plan.because).toMatch(/\.pdf/);
  });

  it('refuses anything that is not http', () => {
    for (const url of [
      'file:///etc/passwd', 'ftp://example.org/x.mp4',
      'data:video/mp4;base64,AAAA', 'javascript:alert(1)',
    ]) {
      expect(planForUrl(url).can, url).toBe('no');
    }
  });

  it('says something useful about an empty box', () => {
    const plan = planForUrl('   ');
    expect(plan.can).toBe('no');
    if (plan.can === 'no') expect(plan.because).toMatch(/paste/i);
  });

  /*
   * A SUBDOMAIN OF A REFUSED HOST IS REFUSED, AND A LOOKALIKE IS NOT.
   *
   * This test asserted the opposite first, and the assertion was wrong
   * rather than the code. `vimeo.com.attacker.example` is not Vimeo: it
   * is a host under `attacker.example`, and a `.mp4` on it is a file its
   * own publisher served, which is precisely what this product is
   * allowed to fetch. U-35 §6 is about not taking media from platforms
   * that forbid it — it is not a domain-similarity filter, and writing
   * one here would refuse a university's `vimeo-mirror.ac.uk` while
   * doing nothing an attacker could not undo by renaming a host.
   *
   * WHAT PROTECTS THE PERSON IS THAT THE HOST IS SHOWN. `UrlPlan` carries
   * the host it resolved for exactly this reason, and the studio prints
   * it before anything is fetched.
   */
  it('matches refused hosts on the label boundary', () => {
    expect(planForUrl('https://a.b.googlevideo.com/x.mp4').can).toBe('no');
    expect(planForUrl('https://notgooglevideo-mirror.example/x.mp4').can)
      .toBe('fetch');
    const lookalike = planForUrl('https://vimeo.com.attacker.example/x.mp4');
    expect(lookalike.can).toBe('fetch');
    if (lookalike.can === 'fetch') {
      expect(lookalike.host).toBe('vimeo.com.attacker.example');
    }
  });

  it('does not list a fetchable extension twice', () => {
    expect(new Set(FETCHABLE).size).toBe(FETCHABLE.length);
  });

  it('refuses every host it names', () => {
    for (const host of NEVER_FETCHED) {
      expect(planForUrl(`https://${host}/x.mp4`).can, host).toBe('no');
    }
  });
});

describe('where a conversation’s source came from', () => {
  it('names the platform for an embedded source', () => {
    expect(whereFrom({ class: 'B', provider: 'youtube' })).toBe('YouTube');
    expect(whereFrom({ class: 'B', provider: 'vimeo' })).toBe('Vimeo');
  });

  it('says Link when an embed forgot which platform', () => {
    expect(whereFrom({ class: 'B' })).toBe('Link');
  });

  it.each([
    ['record', 'Recorded'], ['screen', 'Screen'], ['link', 'Link'],
    ['upload', 'Upload'],
  ] as const)('names a %s source %s', (capturedAs, expected) => {
    expect(whereFrom({ class: 'A', capturedAs })).toBe(expected);
  });

  /*
   * EVERYTHING MADE BEFORE THE FOUR DOORS EXISTED WAS AN UPLOAD, and
   * saying so is truthful rather than a default — there was no other way
   * to make a Class A source.
   */
  it('calls a source with no door an upload', () => {
    expect(whereFrom({ class: 'A' })).toBe('Upload');
  });
});
