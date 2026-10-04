/**
 * What an account has paid for beyond its rooms.
 *   [D-19, U-24; TV-NETWORK N-4]
 *
 * THE FIRST PRICED CAPABILITY IN THIS PRODUCT, and the shape it
 * takes is the thing worth testing rather than the feature behind
 * it. Multi-track audio is modelled before it is built — the
 * encoder is the real work — so what exists today is a record, a
 * gate, and the rule that a gate nobody can observe is worthless.
 *
 * AND IT IS AN ENTITLEMENT, WHICH THIS PRODUCT USES CAREFULLY.
 * V-8 refused to make operating the public network one, because
 * *"an entitlement is something an account can be granted and
 * this is the one capability that cannot be."* This is the
 * opposite case: a priced capability, granted per account, that
 * changes what a BROADCASTER may offer and never what a viewer
 * may hear.
 */

import { describe, expect, it } from 'vitest';

import {
  type Account, EXTRAS, extrasOf, hasExtra, isExtraId,
} from '../../src/domain/account.js';
import type { Channel } from '../../src/domain/channel.js';
import { ChannelEditError, setStation } from '../../src/domain/channelEdit.js';

function account(over: Partial<Account> = {}): Account {
  return {
    schemaVersion: 1, id: 'acct_owner', name: 'Owner',
    createdAt: '2026-01-01T00:00:00.000Z', ...over,
  } as Account;
}

function channel(): Channel {
  return {
    schemaVersion: 1, id: 'chan_one', name: 'Redemption TV',
    timezone: 'UTC', programmes: [], rotation: [], recordings: [],
    blocks: [], ingests: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as Channel;
}

describe('what an account has bought', () => {
  /*
   * ABSENT MEANS NONE, WHICH IS THE OPPOSITE OF `studios`. An
   * unset `studios` grants everything, because the alternative
   * locks an existing owner out of their own work on the deploy
   * that adds the field. Nobody is locked out of a feature that
   * did not exist yesterday.
   */
  it('grants nothing by default, unlike a studio', () => {
    expect(extrasOf(account())).toEqual([]);
    expect(hasExtra(account(), 'multi-audio')).toBe(false);
    /* And the studio it lives in is granted by that same absence. */
    expect(account().studios).toBeUndefined();
  });

  it('grants what was bought', () => {
    const paid = account({ extras: ['multi-audio'] });
    expect(hasExtra(paid, 'multi-audio')).toBe(true);
  });

  /*
   * AN EXTRA IS WORTHLESS WITHOUT THE ROOM IT IS INSIDE. An
   * account that bought multi-track audio and then gave up
   * Online TV does not have multi-track audio; it has a line
   * item. Asked here so no surface has to remember to ask it.
   */
  it('is nothing without the studio it belongs to', () => {
    const lost = account({
      extras: ['multi-audio'], studios: ['studio-one', 'studio-two'],
    });
    expect(hasExtra(lost, 'multi-audio')).toBe(false);
    const kept = account({ extras: ['multi-audio'], studios: ['online-tv'] });
    expect(hasExtra(kept, 'multi-audio')).toBe(true);
  });

  /*
   * A NAME THIS BUILD DOES NOT UNDERSTAND IS NOT A PERMISSION
   * THIS BUILD CAN HONOUR — `studiosOf`'s own rule, and the same
   * reason: the list comes out of a JSON file a forward version
   * of this product may have written into.
   */
  it('drops a name it does not know', () => {
    const odd = account({ extras: ['four-k', 'multi-audio'] as never });
    expect(extrasOf(odd)).toEqual(['multi-audio']);
    expect(isExtraId('four-k')).toBe(false);
    expect(isExtraId('multi-audio')).toBe(true);
  });

  /* Every extra names a room that exists. */
  it('puts every extra inside a studio', () => {
    for (const [id, extra] of Object.entries(EXTRAS)) {
      expect(['studio-one', 'studio-two', 'online-tv'], id)
        .toContain(extra.within);
    }
  });
});

describe('declaring the languages a channel is heard in', () => {
  const two = [{ language: 'en' }, { language: 'fr' }];

  /*
   * REFUSED RATHER THAN IGNORED. A station owner who declared
   * four languages and found three missing a week later would
   * have no way to know why. [U-19]
   */
  it('refuses a second track without the extra', () => {
    const one = channel();
    expect(() => setStation(one, { slug: 'redemption-tv', audio: two }))
      .toThrow(/multi-track audio extra/);
    expect(() => setStation(one, { slug: 'redemption-tv', audio: two },
      [], { multiAudio: false })).toThrow(/multi-track audio extra/);
  });

  it('takes them when the extra is held', () => {
    const one = channel();
    setStation(one, { slug: 'redemption-tv', audio: two }, [], { multiAudio: true });
    expect(one.station?.audio?.map((a) => a.language)).toEqual(['en', 'fr']);
  });

  /*
   * ONE TRACK IS WHAT EVERY CHANNEL ALREADY HAS, and `language`
   * is where it is said. A list of one is noise — and it must not
   * cost anybody the extra.
   */
  it('keeps no list for a single track, and charges nothing for it', () => {
    const one = channel();
    setStation(one, { slug: 'redemption-tv', audio: [{ language: 'en' }] });
    expect(one.station?.audio).toBeUndefined();
  });

  /*
   * EXACTLY ONE DEFAULT. Zero is a player with no instruction;
   * two is a stream whose opening audio depends on which
   * rendition the player parsed first — a bug that appears for
   * some viewers and not others.
   */
  it('settles on exactly one default, whatever it was given', () => {
    const none = channel();
    setStation(none, { slug: 'station-a', audio: two }, [], { multiAudio: true });
    expect(none.station!.audio!.filter((a) => a.default)).toHaveLength(1);
    expect(none.station!.audio![0]!.default).toBe(true);

    const both = channel();
    setStation(both, {
      slug: 'station-b',
      audio: [{ language: 'en', default: true }, { language: 'fr', default: true }],
    }, [], { multiAudio: true });
    expect(both.station!.audio!.filter((a) => a.default)).toHaveLength(1);

    const second = channel();
    setStation(second, {
      slug: 'station-c', audio: [{ language: 'en' }, { language: 'fr', default: true }],
    }, [], { multiAudio: true });
    expect(second.station!.audio![1]!.default).toBe(true);
    expect(second.station!.audio![0]!.default).toBeUndefined();
  });

  /*
   * ONE LANGUAGE ONCE. Two renditions with the same tag is a
   * master playlist whose player picks whichever it read first,
   * which is a different stream for different viewers.
   */
  it('keeps one rendition per language', () => {
    const one = channel();
    setStation(one, {
      slug: 'station-d',
      audio: [{ language: 'en' }, { language: 'EN' }, { language: 'fr' }],
    }, [], { multiAudio: true });
    expect(one.station!.audio!.map((a) => a.language)).toEqual(['en', 'fr']);
  });

  /* A tag that is not a tag is not a track. */
  it('drops anything that is not a language tag', () => {
    const one = channel();
    setStation(one, {
      slug: 'station-e',
      audio: [{ language: 'en' }, { language: 'english!' }, { language: '' },
        { language: 'pt-BR' }],
    }, [], { multiAudio: true });
    expect(one.station!.audio!.map((a) => a.language)).toEqual(['en', 'pt-br']);
  });

  /* The station's own word for a track is kept, bounded. */
  it('keeps the label the station chose', () => {
    const one = channel();
    setStation(one, {
      slug: 'station-f',
      audio: [{ language: 'en', label: 'Original' }, { language: 'fr' }],
    }, [], { multiAudio: true });
    expect(one.station!.audio![0]!.label).toBe('Original');
    expect(one.station!.audio![1]!.label).toBeUndefined();
  });

  /* And refusing is the same refusal every other station rule makes. */
  it('refuses in the way the rest of this module refuses', () => {
    expect(() => setStation(channel(), { slug: 'station-g', audio: two }))
      .toThrow(ChannelEditError);
  });
});
