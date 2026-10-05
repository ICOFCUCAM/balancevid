/**
 * The master playlist, and the audio a channel offers.
 *   [CHANNEL §7, §17, D-19, D-21, N-10]
 *
 * > *"i plan for multitrack audio which is wise to include so it
 * > would not complecate in feature. however subscribers would
 * > have to pay extra for this special feature"*
 */

import { describe, expect, it } from 'vitest';

import {
  AUDIO_GROUP, SUBS_GROUP, masterPlaylist, renditions, subtitleRendition,
} from '../../src/domain/hls.js';
import type { Station } from '../../src/domain/station.js';

const WIRE = { bitsPerSecond: 2_564_000, codecs: 'avc1.4d401f,mp4a.40.2' };
const WHERE = {
  variant: '/api/channels/chan_1/playlist',
  audio: (language: string) => `/api/channels/chan_1/audio/${language}/playlist`,
  subtitles: (language: string) =>
    `/api/channels/chan_1/subtitles/${language}/playlist`,
};
const BOTH = { multiAudio: true };
const PAID = ['fr', 'es'];

function station(audio: Station['audio']): Station {
  return { slug: 'a-channel', ...(audio ? { audio } : {}) };
}

const THREE = station([
  { language: 'en', label: 'Original (English)', default: true },
  { language: 'fr' },
  { language: 'es', label: 'Español' },
]);

describe('what a channel offers (N-10)', () => {
  it('says nothing about a channel that declared no audio', () => {
    expect(renditions(station(undefined), BOTH, PAID)).toEqual([]);
    expect(renditions(undefined, BOTH, PAID)).toEqual([]);
  });

  /*
   * ONE TRACK IS NOT A CHOICE, and it is returned anyway: a
   * player that knows there is one track can say which language
   * it is. What it must not do is draw a MENU over it. [D-21]
   */
  it('returns the one track a single-track channel has', () => {
    const one = renditions(station([{ language: 'en' }]), BOTH, PAID);
    expect(one).toEqual([
      { language: 'en', label: 'English', isDefault: true },
    ]);
  });

  it('calls a track what the station calls it, or what it is', () => {
    const all = renditions(THREE, BOTH, PAID);
    expect(all.map((one) => one.label))
      .toEqual(['Original (English)', 'French', 'Español']);
  });

  it('puts the default first, whatever order the station wrote', () => {
    const all = renditions(station([
      { language: 'fr' },
      { language: 'en', default: true },
    ]), BOTH, ['fr']);
    expect(all.map((one) => one.language)).toEqual(['en', 'fr']);
    expect(all.filter((one) => one.isDefault)).toHaveLength(1);
  });

  /*
   * EXACTLY ONE DEFAULT REACHES THE PLAYLIST, WHATEVER THE
   * DOCUMENT SAYS. `setStation` allows only one — but a document
   * on disk predates any rule this file knows about, and two
   * `DEFAULT=YES` members in one group is a playlist a player
   * rejects outright. The channel goes dark for a fault nobody
   * can see in the UI that wrote it. [U-19]
   */
  it('lets only one track be the default, however many claim it', () => {
    const all = renditions(station([
      { language: 'en', default: true },
      { language: 'fr', default: true },
      { language: 'es', default: true },
    ]), BOTH, PAID);
    expect(all.filter((one) => one.isDefault).map((one) => one.language))
      .toEqual(['en']);
  });

  it('falls back to the first track where none was marked', () => {
    const all = renditions(station([
      { language: 'fr' }, { language: 'en' },
    ]), BOTH, ['en']);
    expect(all[0]!.language).toBe('fr');
    expect(all[0]!.isDefault).toBe(true);
  });

  /*
   * WITHOUT THE EXTRA, A CHANNEL IS ITS DEFAULT TRACK AND THE
   * VIEWER IS TOLD NOTHING ABOUT WHAT THEY ARE MISSING. A player
   * saying *3 languages, 2 locked* would be this product
   * charging a broadcaster by nagging their audience, who are
   * not the customer. [account.ts `EXTRAS`]
   */
  it('is one track without the extra, and says nothing about the rest', () => {
    const all = renditions(THREE, { multiAudio: false }, PAID);
    expect(all).toHaveLength(1);
    expect(all[0]!.language).toBe('en');
    expect(JSON.stringify(all)).not.toContain('fr');
    expect(JSON.stringify(all)).not.toContain('Español');
  });

  /*
   * NOTHING IS ADVERTISED THAT IS NOT BEING PRODUCED. A
   * rendition whose segments 404 is a player offering a language
   * that goes silent when it is chosen — and the viewer blames
   * their own connection. [D-21, U-19]
   */
  it('drops an alternate the engine is not writing', () => {
    const all = renditions(THREE, BOTH, ['fr']);
    expect(all.map((one) => one.language)).toEqual(['en', 'fr']);
  });

  it('offers nothing but the default when nothing is being written', () => {
    expect(renditions(THREE, BOTH, []).map((one) => one.language))
      .toEqual(['en']);
  });

  /* The default is muxed into the variant, so it is produced by
     definition and is never dropped for want of a rendition. */
  it('keeps the default even though nothing names it as produced', () => {
    expect(renditions(THREE, BOTH, []).at(0)?.isDefault).toBe(true);
  });
});

describe('the master playlist (N-10)', () => {
  /*
   * NOTHING, RATHER THAN A MASTER WITH ONE RENDITION IN IT. A
   * second address answering what `/playlist` answers is two
   * things to keep in step. [D-19]
   */
  it('is absent where there is no choice to offer', () => {
    expect(masterPlaylist([], WHERE, WIRE)).toBeNull();
    expect(masterPlaylist(
      renditions(station([{ language: 'en' }]), BOTH, PAID), WHERE, WIRE,
    )).toBeNull();
  });

  it('names every rendition in one group, with the variant under them', () => {
    const text = masterPlaylist(renditions(THREE, BOTH, PAID), WHERE, WIRE)!;
    expect(text.startsWith('#EXTM3U\n')).toBe(true);
    expect(text.match(/#EXT-X-MEDIA:/g)).toHaveLength(3);
    expect(text).toContain(`GROUP-ID="${AUDIO_GROUP}"`);
    expect(text).toContain(`AUDIO="${AUDIO_GROUP}"`);
    expect(text.trimEnd().endsWith(WHERE.variant)).toBe(true);
  });

  /*
   * THE DEFAULT RENDITION HAS NO `URI`, AND THAT IS THE WHOLE
   * DESIGN. RFC 8216: a member with no URI describes the audio
   * already muxed into the variant — the channel's existing
   * segments, unchanged, with no second video encode.
   */
  it('gives the default no address of its own', () => {
    const text = masterPlaylist(renditions(THREE, BOTH, PAID), WHERE, WIRE)!;
    const [first] = text.split('\n').filter((line) => line.includes('LANGUAGE="en"'));
    expect(first).toContain('DEFAULT=YES');
    expect(first).not.toContain('URI=');
  });

  it('never writes two defaults into one group', () => {
    const text = masterPlaylist(renditions(station([
      { language: 'en', default: true },
      { language: 'fr', default: true },
    ]), BOTH, ['fr']), WHERE, WIRE)!;
    expect(text.match(/DEFAULT=YES/g)).toHaveLength(1);
  });

  it('gives every alternate one', () => {
    const text = masterPlaylist(renditions(THREE, BOTH, PAID), WHERE, WIRE)!;
    for (const line of text.split('\n')) {
      if (!line.startsWith('#EXT-X-MEDIA:') || line.includes('DEFAULT=YES')) continue;
      expect(line).toContain('URI="/api/channels/chan_1/audio/');
      expect(line).toContain('DEFAULT=NO');
    }
  });

  it('lets a player pick by the viewer’s own language', () => {
    const text = masterPlaylist(renditions(THREE, BOTH, PAID), WHERE, WIRE)!;
    expect(text.match(/AUTOSELECT=YES/g)).toHaveLength(3);
  });

  it('carries the wire it was handed and not a figure of its own', () => {
    const text = masterPlaylist(renditions(THREE, BOTH, PAID), WHERE, WIRE)!;
    expect(text).toContain('BANDWIDTH=2564000');
    expect(text).toContain('CODECS="avc1.4d401f,mp4a.40.2"');
  });

  /*
   * A LABEL IS A BROADCASTER'S OWN WORDS, and a quotation mark
   * or a newline in one ends the attribute early and leaves a
   * playlist no player can parse. [tvExport.ts]
   */
  it('cannot be broken by what a broadcaster typed', () => {
    const text = masterPlaylist(renditions(station([
      { language: 'en', default: true },
      { language: 'fr', label: 'Le "grand" \n commentaire' },
    ]), BOTH, ['fr']), WHERE, WIRE)!;
    const lines = text.split('\n').filter((one) => one.startsWith('#EXT-X-MEDIA:'));
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line.match(/"/g)!.length % 2).toBe(0);
      expect(line).not.toContain('\n');
    }
    expect(text).toContain('NAME="Le grand');
  });
});

/**
 * The caption track.  [§17, N-10, D-21]
 *
 * THE WORDS WERE ALWAYS THERE AND NEVER REACHED THE WIRE. Every
 * render this product finishes is written with a WebVTT sidecar
 * beside it, and a channel scheduling that render broadcast the
 * picture and the sound and left the captions on the disk.
 */
describe('the captions a channel offers (§17)', () => {
  const CAPTIONED: Station = {
    slug: 'a-channel', language: 'en', subtitles: true,
  };

  it('offers none until a broadcaster switches them on', () => {
    expect(subtitleRendition({ slug: 'a' } as Station, ['en'])).toBeNull();
    expect(subtitleRendition(undefined, ['en'])).toBeNull();
  });

  /*
   * NOT ADVERTISED UNLESS IT IS BEING WRITTEN, exactly as for
   * audio. A CC button over a channel producing nothing is a
   * viewer pressing it, seeing no words, and concluding this
   * product has no captions — a false conclusion drawn from a
   * true observation, which is the worst kind.
   */
  it('says nothing about a track nobody is writing', () => {
    expect(subtitleRendition(CAPTIONED, [])).toBeNull();
    expect(subtitleRendition(CAPTIONED, ['fr'])).toBeNull();
  });

  it('offers the channel’s own language when it is being written', () => {
    expect(subtitleRendition(CAPTIONED, ['en'])).toEqual({
      language: 'en', label: 'English', isDefault: false,
    });
  });

  /*
   * NEVER THE DEFAULT. `DEFAULT=YES` turns captions on for
   * every viewer who did not ask, which is a broadcaster's
   * decision about their own channel and not this product's to
   * make for them.
   */
  it('is never on until somebody asks for it', () => {
    const text = masterPlaylist([], WHERE, WIRE,
      subtitleRendition(CAPTIONED, ['en']))!;
    const line = text.split('\n')
      .find((one) => one.includes('TYPE=SUBTITLES'))!;
    expect(line).toContain('DEFAULT=NO');
    expect(line).toContain('AUTOSELECT=NO');
    expect(line).toContain('URI="/api/channels/chan_1/subtitles/en/playlist"');
  });

  /*
   * A CAPTION TRACK IS REASON ENOUGH FOR A MASTER ON ITS OWN.
   * `EXT-X-MEDIA` lives in a master playlist, so a channel with
   * one audio track and captions cannot express them any other
   * way — the `offered.length < 2` rule is about AUDIO.
   * [RFC 8216 §4.3.4]
   */
  it('makes a master for a single-language channel that captions', () => {
    const text = masterPlaylist(
      renditions(station([{ language: 'en' }]), BOTH, []), WHERE, WIRE,
      subtitleRendition(CAPTIONED, ['en']));
    expect(text).not.toBeNull();
    expect(text).toContain(`SUBTITLES="${SUBS_GROUP}"`);
    /* And no audio group, because there is no choice of audio
       to be a member of one. */
    expect(text).not.toContain(`AUDIO="${AUDIO_GROUP}"`);
    expect(text).not.toContain('TYPE=AUDIO');
  });

  it('still makes none for a channel with neither', () => {
    expect(masterPlaylist(
      renditions(station([{ language: 'en' }]), BOTH, []), WHERE, WIRE, null))
      .toBeNull();
  });

  /* Both, where a channel has both, and the variant names each
     group exactly once. */
  it('carries the audio group and the caption group together', () => {
    const text = masterPlaylist(renditions(THREE, BOTH, PAID), WHERE, WIRE,
      subtitleRendition(CAPTIONED, ['en']))!;
    const variant = text.split('\n')
      .find((one) => one.startsWith('#EXT-X-STREAM-INF:'))!;
    expect(variant).toContain(`AUDIO="${AUDIO_GROUP}"`);
    expect(variant).toContain(`SUBTITLES="${SUBS_GROUP}"`);
    expect(text.match(/TYPE=SUBTITLES/g)).toHaveLength(1);
    expect(text.match(/TYPE=AUDIO/g)).toHaveLength(3);
  });

  /*
   * AND THE PLAYLIST THE PLAYER READS IS STILL THE LAST LINE.
   * A master whose variant URI is not last is a master a
   * player reads as having no variant at all.
   */
  it('ends with the variant, whatever is declared above it', () => {
    const text = masterPlaylist(renditions(THREE, BOTH, PAID), WHERE, WIRE,
      subtitleRendition(CAPTIONED, ['en']))!;
    expect(text.trimEnd().split('\n').at(-1))
      .toBe('/api/channels/chan_1/playlist');
  });
});
