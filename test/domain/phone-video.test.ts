/**
 * The videos the rest of the world's phones record.
 *   [Doctrine D-03, U-02, D-21, §25; CHANNEL C-14, C-48]
 *
 * THE QUESTION THESE ANSWER, asked of a running installation:
 *
 * > *"some phone record video that is not mp4, is the balancevid
 * > studios supporting and intergrating all kinds of phone videos?"*
 *
 * HALF THE PRODUCT ALREADY DID AND THE OTHER HALF SAID NO. Every
 * path a take travels — the Take App's submission, a conversation
 * source, a performance take — hands its bytes to `ingest`, which
 * is ffmpeg, which reads HEVC out of a QuickTime file and H.263 out
 * of a 3GP without being asked twice. Those paths have no type gate
 * at all and never needed one.
 *
 * THE LIBRARY HAD THE ONLY GATE IN THE PRODUCT, and it was three
 * video containers wide: mp4, WebM, QuickTime — a list of what a
 * LAPTOP records. Measured against what a phone actually declares,
 * ten of thirteen realistic uploads were refused, each with *"that
 * is not a picture, a video or a song this can hold"*, about a
 * video. A handset writing `.3gp` is most of the handsets in most
 * of the markets this product is for. [D-03]
 *
 * AND THE COMMONEST REFUSAL WAS NOT AN EXOTIC CONTAINER AT ALL.
 * Android's picker reports `application/octet-stream` for any file
 * it has not indexed — one saved by a messaging app, one on an SD
 * card — so an ordinary `.mp4` shot on an ordinary phone was
 * refused for the phone's filing habits. The browser was not
 * claiming the file was binary; it was declining to say.
 *
 * EVERY CONTAINER NAMED HERE WAS PUT THROUGH THE REAL `ingest`
 * BEFORE IT WAS ADDED. A fixture per format came out as H.264/AAC
 * at the house rate; a type nobody has run is a type this product
 * only believes it supports. The fixtures are not rebuilt here —
 * that is `render/` work and takes minutes — but nothing entered
 * the table that had not survived it. [U-02]
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  ACCEPTS, accepted, acceptsAttribute,
} from '../../src/domain/libraryUpload.js';
import { CONTAINERS } from '../../src/store/libraryMedia.js';
import { FETCHABLE } from '../../src/domain/sources.js';

/**
 * What a phone hands over, and who hands it.
 *
 * NOT A LIST OF CONTAINERS — a list of SITUATIONS, which is the
 * difference between testing the table and testing the product.
 * Each row is a real device reporting a real thing.
 */
const FROM_A_PHONE: { type: string; name: string; who: string }[] = [
  { type: 'video/mp4', name: 'VID_20260101_120000.mp4', who: 'Android, indexed' },
  { type: 'video/quicktime', name: 'IMG_0042.MOV', who: 'iPhone camera roll' },
  { type: 'video/webm', name: 'take.webm', who: 'Android Chrome recorder' },
  { type: 'video/3gpp', name: 'VID.3gp', who: 'low-end Android' },
  { type: 'video/3gpp2', name: 'clip.3g2', who: 'older CDMA handset' },
  { type: 'video/x-matroska', name: 'clip.mkv', who: 'some Android builds' },
  { type: 'video/x-msvideo', name: 'clip.avi', who: 'a file off a card' },
  { type: 'video/avi', name: 'clip.avi', who: 'the other .avi spelling' },
  { type: 'video/x-m4v', name: 'clip.m4v', who: 'iPhone, exported' },
  { type: 'video/mpeg', name: 'clip.mpg', who: 'an older camera' },
  { type: 'video/ogg', name: 'clip.ogv', who: 'Firefox for Android' },
  { type: 'audio/amr', name: 'note.amr', who: 'a cheap voice recorder' },
  {
    type: 'application/octet-stream',
    name: 'WhatsApp Video 2026-10-06 at 09.12.44.mp4',
    who: 'Android picker, file not indexed',
  },
  {
    type: 'application/octet-stream', name: 'VID_20260101.3gp',
    who: 'the same picker, a 3gp',
  },
  { type: '', name: 'holiday.MOV', who: 'a picker that said nothing at all' },
];

describe('a video shot on a phone', () => {
  it('is taken, whatever the phone called it', () => {
    const refused = FROM_A_PHONE
      .filter((one) => !accepted(one.type, one.name))
      .map((one) => `${one.who} (${one.type || 'no type'})`);
    expect(refused).toEqual([]);
  });

  /*
   * AND IS STORED AS WHAT IT IS. C-48's finding was a PNG written
   * under a `.jpg` because `.jpg` was the only still the table had
   * — *"a file whose name lies to every reader of it"*. Widening a
   * gate without widening what it may be stored AS is how that is
   * committed again, in ten formats at once.
   */
  it('keeps the name honest about the container', () => {
    for (const { type, name, who } of FROM_A_PHONE) {
      const got = accepted(type, name)!;
      const extension = name.toLowerCase().slice(name.lastIndexOf('.') + 1);
      /* `.MOV` is `mov`; the gate lower-cases, and a file stored as
         `.MOV` would be a second spelling of one container. */
      expect(got.ext, who).toBe(extension === 'mov' ? 'mov' : extension);
    }
  });

  /*
   * AND THE LIBRARY CAN HAND IT BACK. A file this product will
   * store and cannot serve is the same fault pointed the other
   * way, and it is not hypothetical: widening the gate first made
   * `library-listings.test.ts` fail on exactly this, which is how
   * `libraryMedia.ts` came to be widened in the same commit.
   */
  it('can be served back out of the library', () => {
    const serves = new Set(CONTAINERS.map((one) => one.ext));
    for (const { type, name, who } of FROM_A_PHONE) {
      expect(serves.has(accepted(type, name)!.ext), who).toBe(true);
    }
  });
});

describe('a picker that declines to say what a file is', () => {
  /*
   * THE NAME IS CONSULTED ONLY WHEN THE TYPE SAID NOTHING, which
   * is the narrow version on purpose. A browser declaring
   * `image/gif` has made a positive claim and this refuses it; one
   * declaring `application/octet-stream` has made none.
   */
  it('refuses a positive claim it does not accept, whatever the name says', () => {
    expect(accepted('image/gif', 'actually-a-video.mp4')).toBeUndefined();
    expect(accepted('application/pdf', 'report.mp4')).toBeUndefined();
    expect(accepted('text/html', 'page.mov')).toBeUndefined();
  });

  it('refuses a file it has no evidence about at all', () => {
    expect(accepted('application/octet-stream', 'noextension')).toBeUndefined();
    expect(accepted('application/octet-stream', 'archive.zip')).toBeUndefined();
    expect(accepted('application/octet-stream', 'cv.pdf')).toBeUndefined();
    expect(accepted('', '')).toBeUndefined();
    expect(accepted(null, null)).toBeUndefined();
    expect(accepted(undefined, undefined)).toBeUndefined();
  });

  /* A type with parameters is still that type, and case is not a
     claim: `VIDEO/MP4; codecs=avc1` is what some clients send. */
  it('reads a type that arrives dressed up', () => {
    expect(accepted('video/mp4; codecs="avc1.42E01E"', 'a.mp4')?.ext).toBe('mp4');
    expect(accepted('  VIDEO/MP4  ', 'a.mp4')?.ext).toBe('mp4');
    expect(accepted('application/octet-stream', 'A.MP4')?.ext).toBe('mp4');
  });

  /*
   * AND THE NAME FALLBACK IS NOT A WAY PAST THE LIST. Every
   * extension it will believe is one of this table's own; an
   * extension nobody declared a MIME type for is not a container
   * this product knows.
   */
  it('believes only the extensions the table itself declared', () => {
    const known = new Set(Object.values(ACCEPTS).map((one) => one.ext));
    for (const ext of ['exe', 'sh', 'js', 'ts', 'json', 'svg', 'gif', 'heic']) {
      expect(known.has(ext), ext).toBe(false);
      expect(accepted('application/octet-stream', `x.${ext}`), ext).toBeUndefined();
    }
  });
});

describe('the gate and the engine agree', () => {
  /*
   * THE CLAIM THIS FILE IS ABOUT, held as an assertion rather than
   * a comment. `sources.ts` records the same finding one floor
   * down — *"The engine was ready; the door was not"* — about
   * `video/*` refusing audio. The door is the thing that keeps
   * being narrower than what is behind it.
   */
  it('takes by upload every moving container it will fetch by link', () => {
    const uploadable = new Set(Object.values(ACCEPTS).map((one) => one.ext));
    /*
     * ASKED OF THE WHOLE LIST, not of seven names copied out of
     * it. A product that will go and DOWNLOAD a `.mkv` and refuse
     * the same file from the person holding it is two answers to
     * one question — and a test naming its own seven cannot
     * notice the eighth being added to one list only. [C-14]
     *
     * `mpeg` and `oga` are spellings of containers stored under
     * another name, which is the gate's business and not this
     * assertion's: what matters is that nothing a link may claim
     * is a thing an upload may not be.
     */
    const SPELT_DIFFERENTLY: Record<string, string> = {
      mpeg: 'mpg', oga: 'ogg', opus: 'ogg', aac: 'm4a',
    };
    const refused = FETCHABLE
      .map((ext) => SPELT_DIFFERENTLY[ext] ?? ext)
      .filter((ext) => !uploadable.has(ext));
    expect(refused).toEqual([]);
  });

  /* The picker and the server are one list, read from one table. */
  it('never offers the picker something the server would refuse', () => {
    for (const one of acceptsAttribute().split(',')) {
      const got = one.startsWith('.')
        ? accepted('application/octet-stream', `file${one}`)
        : accepted(one, 'file.unknown-extension');
      expect(got, one).toBeTruthy();
    }
  });

  /*
   * AND THE UPLOADER SENDS THE NAME. The fallback is machinery on
   * the server and nothing at all unless the browser hands the
   * filename over — and this one deliberately strips the
   * extension off before putting it in `x-label`, because a label
   * is somebody's words and a filename is a path. Measured at the
   * call site, which is where it regressed in draft.
   */
  it('is sent the filename by the room that uploads', () => {
    const studio = readFileSync('app/t/[id]/ChannelStudio.tsx', 'utf8');
    expect(studio).toMatch(/'x-filename': file\.name/);
    const route = readFileSync('app/api/library/route.ts', 'utf8');
    expect(route).toMatch(/accepted\(type, request\.headers\.get\('x-filename'\)\)/);
  });
});

describe('a container this browser cannot draw', () => {
  const STUDIO = readFileSync('app/t/[id]/ChannelStudio.tsx', 'utf8');

  /*
   * THE TILE WAS A BLACK RECTANGLE, which is what a broken upload
   * looks like. Widening the gate to `.3gp`, `.mkv`, `.avi` and
   * `.amr` would have made the library full of them — and `.mov`
   * has done it since long before, because a Chromium built
   * without proprietary codecs declines QuickTime. The file is
   * correct and will go to air; only this browser cannot draw a
   * frame of it, and that is a sentence rather than a void.
   */
  it('says so, rather than showing a black rectangle', () => {
    expect(STUDIO).toMatch(/onError=\{\(\) => setUndrawable\(true\)\}/);
    expect(STUDIO).toMatch(/if \(undrawable\) return <Hatch says="NO PREVIEW" \/>;/);
  });

  /*
   * AND IT ASKS THE BROWSER RATHER THAN GUESSING. A list of
   * containers "browsers can play" is a guess that is wrong per
   * browser and per build — Safari draws a `.mov` and this
   * Chromium does not. The element's own `error` is the one party
   * that knows. [U-02]
   */
  it('does not keep its own list of what a browser can decode', () => {
    const code = STUDIO
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(code).not.toMatch(/canPlayType/);
    for (const ext of ['3gp', 'mkv', 'avi', 'mpg', 'amr']) {
      expect(code.includes(`'${ext}'`), ext).toBe(false);
    }
  });

  /* One hatch, used by both the empty slot and the undrawable
     file: two spellings would drift apart on the first theme
     change. [D-19] */
  it('draws the same slab the empty slot already used', () => {
    expect((STUDIO.match(/repeating-linear-gradient\(45deg,/g) ?? []).length)
      .toBe(1);
    expect((STUDIO.match(/<Hatch says=/g) ?? []).length).toBe(2);
  });
});
