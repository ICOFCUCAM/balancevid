/**
 * The master playlist, and the audio a channel offers.
 *   [CHANNEL §7, §17, D-19, D-21, N-10]
 *
 * > *"i plan for multitrack audio which is wise to include so it
 * > would not complecate in feature. however subscribers would
 * > have to pay extra for this special feature"*
 */

import { describe, expect, it } from 'vitest';

import { AUDIO_GROUP, masterPlaylist, renditions } from '../../src/domain/hls.js';
import type { Station } from '../../src/domain/station.js';

const WIRE = { bitsPerSecond: 2_564_000, codecs: 'avc1.4d401f,mp4a.40.2' };
const WHERE = {
  variant: '/api/channels/chan_1/playlist',
  audio: (language: string) => `/api/channels/chan_1/audio/${language}/playlist`,
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
