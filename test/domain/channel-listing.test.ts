/**
 * Which channels a stranger may be shown.  [D-03, D-04, U-31, N-3]
 *
 * A channel has been watchable by a stranger for a long time. What
 * has never existed is any way to find one. The door opens; nothing
 * points at it.
 */

import { describe, expect, it } from 'vitest';

import type { Channel } from '../../src/domain/channel.js';
import { newChannel, setStation } from '../../src/domain/channelEdit.js';
import {
  byGenre, bySlug, directory, inDirectory, listingFor, standingOf, tuning,
} from '../../src/domain/channelListing.js';

const AT = '2026-10-02T20:00:00.000Z';

function made(name: string, how: Partial<{
  slug: string; published: boolean; listed: boolean;
  access: 'anyone' | 'members' | 'link' | 'invited';
}> = {}): Channel {
  const channel = newChannel(name, 'Europe/London', AT);
  if (how.slug !== false as never) setStation(channel, how.slug ? { slug: how.slug } : {});
  if (how.published !== false) {
    channel.publication = {
      publishedAt: AT,
      ...(how.listed === false ? { listed: false } : {}),
      ...(how.access ? { access: how.access } : {}),
    };
  }
  return channel;
}

describe('the four standings (N-3)', () => {
  /*
   * TWO AXES, NOT ONE. `availability.ts` already had this argument
   * and settled it — "listed: false was being asked to mean
   * PRIVATE" — and these are the four answers that fall out.
   */
  it('reads a published, listed channel as public', () => {
    expect(standingOf(made('A'))).toBe('public');
  });

  it('reads a published, unlisted channel as unlisted', () => {
    expect(standingOf(made('A', { listed: false }))).toBe('unlisted');
  });

  it('reads a narrowed channel as private', () => {
    expect(standingOf(made('A', { access: 'invited' }))).toBe('private');
    expect(standingOf(made('A', { access: 'members' }))).toBe('private');
    /* `anyone` is not a narrowing and does not make it private. */
    expect(standingOf(made('A', { access: 'anyone' }))).toBe('public');
  });

  it('reads an unpublished channel as offline', () => {
    expect(standingOf(made('A', { published: false }))).toBe('offline');
  });

  it('reads a withdrawn channel as offline', () => {
    const channel = made('A');
    channel.publication!.unpublishedAt = AT;
    expect(standingOf(channel)).toBe('offline');
  });

  /*
   * AN ABSENT `listed` MEANS LISTED. `channelEdit` writes
   * `listed: false` and omits the field when true, so reading the
   * absence as "not listed" would hide every channel published
   * before this file existed.
   */
  it('treats a channel published before this existed as listed', () => {
    const channel = made('A');
    delete channel.publication!.listed;
    expect(standingOf(channel)).toBe('public');
  });
});

describe('the directory (N-3)', () => {
  it('holds only the public ones', () => {
    const rows = directory([
      made('Public One'),
      made('Unlisted', { listed: false }),
      made('Private', { access: 'invited' }),
      made('Offline', { published: false }),
    ]);
    expect(rows.map((r) => r.name)).toEqual(['Public One']);
    expect(inDirectory(made('Unlisted', { listed: false }))).toBe(false);
  });

  /*
   * A CHANNEL WITHOUT AN ADDRESS CANNOT BE LISTED, because the row's
   * whole purpose is to be a link. Listing it with its id would be
   * the machine-chosen address this stage exists to replace.
   */
  it('leaves out a channel that has no address', () => {
    const channel = newChannel('No Address', 'Europe/London', AT);
    channel.publication = { publishedAt: AT };
    expect(listingFor(channel)).toBe(null);
    expect(directory([channel])).toEqual([]);
  });

  /* Predictable, because there are no channel numbers yet and a
     front page that moves under a returning viewer is not one. */
  it('is in an order a viewer can predict', () => {
    const rows = directory([made('Zulu TV'), made('Alpha TV'), made('Mike TV')]);
    expect(rows.map((r) => r.name)).toEqual(['Alpha TV', 'Mike TV', 'Zulu TV']);
  });
});

describe('a row is a poster, not a schedule (N-3)', () => {
  /*
   * WHAT IS NOT HERE IS THE POINT, and it is the line `policy.ts`
   * already draws for the transmission. [D-03]
   */
  it('carries nothing a broadcaster works with', () => {
    const channel = made('A', { slug: 'a-tv' });
    channel.programmes.push({ id: 'p1', startsAt: AT, durationMs: 1,
      source: { kind: 'media', assetId: 'secret', form: 'video' } } as never);
    const row = listingFor(channel)!;
    const printed = JSON.stringify(row);
    for (const leak of ['programmes', 'rotation', 'destinations', 'ingests',
      'secret', 'publication', 'identity', 'recordings']) {
      expect(printed, leak).not.toContain(leak);
    }
  });

  it('carries what a viewer needs to choose', () => {
    const channel = made('Redemption TV', { slug: 'redemption-tv' });
    setStation(channel, { callsign: 'RDTV', genre: 'faith',
      language: 'en', country: 'CM', description: 'A station.' });
    const row = listingFor(channel)!;
    expect(row).toMatchObject({
      slug: 'redemption-tv', name: 'Redemption TV', callsign: 'RDTV',
      genre: 'faith', language: 'en', country: 'CM',
    });
    expect(row.says).toBe('Faith · English · CM');
  });
});

describe('reaching a channel by its address (N-3)', () => {
  /* Unlisted is reachable by address — that is the whole of what
     unlisted means. */
  it('finds a public one and an unlisted one', () => {
    const open = made('Open', { slug: 'open-tv' });
    const quiet = made('Quiet', { slug: 'quiet-tv', listed: false });
    expect(bySlug([open, quiet], 'open-tv')?.name).toBe('Open');
    expect(bySlug([open, quiet], 'quiet-tv')?.name).toBe('Quiet');
  });

  /*
   * AND ANSWERS THE SAME WAY FOR PRIVATE, OFFLINE AND NONSENSE,
   * because "a 403 would confirm that something is there to guess
   * at." [D-03]
   */
  it('cannot tell you that a private or offline channel exists', () => {
    const shut = made('Shut', { slug: 'shut-tv', access: 'invited' });
    const dark = made('Dark', { slug: 'dark-tv', published: false });
    expect(bySlug([shut, dark], 'shut-tv')).toBeUndefined();
    expect(bySlug([shut, dark], 'dark-tv')).toBeUndefined();
    expect(bySlug([shut, dark], 'no-such-channel')).toBeUndefined();
  });

  it('is not fooled by case or space', () => {
    const open = made('Open', { slug: 'open-tv' });
    expect(bySlug([open], '  OPEN-TV ')?.name).toBe('Open');
  });

  it('finds nothing for an empty address', () => {
    expect(bySlug([made('Open', { slug: 'open-tv' })], '   ')).toBeUndefined();
  });
});

describe('a document on disk is not a type (N-3)', () => {
  /*
   * `Station.slug` is REQUIRED by the type, so nothing in this
   * product can produce a station without one — `setStation`
   * refuses an empty slug before it writes. But a channel document
   * is JSON on disk: hand-edited, migrated from an older shape, or
   * written by a version that did not have this field. The type is
   * a claim about code, not about a file.
   *
   * TWO GUARDS SURVIVED EVERY MUTATION UNTIL THIS FIXTURE EXISTED,
   * and both for the same reason: every channel the tests built
   * had either a good slug or no station at all, so "station with
   * an empty slug" — the one state that tells the guards apart —
   * never occurred.
   */
  function fromDisk(name: string): Channel {
    const channel = newChannel(name, 'Europe/London', AT);
    channel.publication = { publishedAt: AT };
    (channel as { station?: unknown }).station = { slug: '' };
    return channel;
  }

  it('does not list a channel whose address is empty', () => {
    expect(listingFor(fromDisk('Broken'))).toBe(null);
    expect(directory([fromDisk('Broken')])).toEqual([]);
  });

  /*
   * AND AN EMPTY ADDRESS MATCHES NOTHING, which without the guard
   * would make `/tv/channels/` resolve to whichever broken channel
   * came first.
   */
  it('does not let an empty address reach it', () => {
    expect(bySlug([fromDisk('Broken')], '')).toBeUndefined();
    expect(bySlug([fromDisk('Broken')], '   ')).toBeUndefined();
  });
});

describe('numbers on a listing (N-6)', () => {
  /*
   * OPTIONAL, AND THAT IS NOT LAZINESS. A channel published
   * before the lineup existed, or one on an installation whose
   * numbers file cannot be read, has no number and must still
   * appear. A row that vanished for want of one would make an
   * unreadable file into a blank television network. [D-21]
   */
  it('lists a channel that has no number', () => {
    const channel = made('Unnumbered', { slug: 'un-tv' });
    expect(listingFor(channel)!.number).toBeUndefined();
    expect(directory([channel], {})).toHaveLength(1);
  });

  it('carries the number the network allocated', () => {
    const channel = made('Numbered', { slug: 'num-tv' });
    const rows = directory([channel], { [channel.id]: 102 });
    expect(rows[0]!.number).toBe(102);
  });

  /* A number nothing could use is no number at all. */
  it('ignores an unusable number from a numbers file', () => {
    const channel = made('Odd', { slug: 'odd-tv' });
    for (const bad of [7, 0, 100.5, 'x' as never]) {
      expect(directory([channel], { [channel.id]: bad })[0]!.number)
        .toBeUndefined();
    }
  });

  /*
   * AND THE DIRECTORY IS STILL BY NAME. A directory is browsed —
   * somebody is reading names — where a LINEUP is tuned and is
   * ordered by number. Making this numeric would turn browsing
   * into looking up. [D-04]
   */
  it('is ordered by name even once numbers exist', () => {
    const zulu = made('Zulu TV', { slug: 'zulu' });
    const alpha = made('Alpha TV', { slug: 'alpha' });
    const rows = directory([zulu, alpha],
      { [zulu.id]: 100, [alpha.id]: 101 });
    expect(rows.map((r) => r.name)).toEqual(['Alpha TV', 'Zulu TV']);
    expect(rows.map((r) => r.number)).toEqual([101, 100]);
  });
});

/* ------------------------------------------------------------------ *
 *  The remote control.  [N-9]
 * ------------------------------------------------------------------ */

describe('CH+ and CH− (N-9)', () => {
  const lineup = () => {
    const a = made('Apple', { slug: 'apple' });
    const b = made('Mango', { slug: 'mango' });
    const c = made('Zebra', { slug: 'zebra' });
    return {
      all: [c, a, b],
      numbers: { [a.id]: 100, [b.id]: 101, [c.id]: 102 },
      a, b, c,
    };
  };

  it('goes up and down the numbers, not the names', () => {
    const { all, numbers } = lineup();
    const from101 = tuning(all, numbers, 101);
    expect(from101.up?.number).toBe(102);
    expect(from101.down?.number).toBe(100);
    expect(from101.up?.slug).toBe('zebra');
    expect(from101.down?.slug).toBe('apple');
  });

  /*
   * IT WRAPS, because a lineup is a ring on every television ever
   * made. A viewer holding CH− on the first channel and stopping
   * is a viewer who thinks the set is broken.
   */
  it('wraps at both ends', () => {
    const { all, numbers } = lineup();
    expect(tuning(all, numbers, 102).up?.number).toBe(100);
    expect(tuning(all, numbers, 100).down?.number).toBe(102);
  });

  /*
   * NOTHING EITHER WAY FOR A LINEUP OF ONE. A CH+ button that
   * reloads the same channel is a button that looks broken.
   */
  it('offers nothing when there is nowhere to go', () => {
    const only = made('Only', { slug: 'only' });
    const alone = tuning([only], { [only.id]: 100 }, 100);
    expect(alone.up).toBe(null);
    expect(alone.down).toBe(null);
  });

  /*
   * TUNING FROM OUTSIDE THE LINEUP IS NOT AN EDGE CASE. An
   * unlisted station is reached by its slug or its own domain and
   * is not in the directory, so `from` is a number the ring does
   * not contain. [N-8]
   */
  it('lands on the nearest in the direction asked, from off the dial', () => {
    const { all, numbers } = lineup();
    expect(tuning(all, numbers, 0).up?.number).toBe(100);
    expect(tuning(all, numbers, 0).down?.number).toBe(102);
    expect(tuning(all, numbers, 500).up?.number).toBe(100);
    expect(tuning(all, numbers, 500).down?.number).toBe(102);
  });

  /*
   * AND ONLY THE DIRECTORY IS ON THE DIAL. A remote tunes what a
   * viewer can browse; an unlisted or offline channel is reachable
   * by address and is not a number anybody presses.
   */
  it('never tunes to something the directory does not show', () => {
    const open = made('Open', { slug: 'open' });
    const quiet = made('Quiet', { slug: 'quiet', listed: false });
    const dark = made('Dark', { slug: 'dark', published: false });
    const numbers = { [open.id]: 100, [quiet.id]: 101, [dark.id]: 102 };
    /* One channel on the dial, so there is nowhere to go. */
    expect(tuning([open, quiet, dark], numbers, 100).up).toBe(null);
    expect(tuning([open, quiet, dark], numbers, 101).up?.slug).toBe('open');
  });

  /* A channel the lineup never numbered is not on the dial either. */
  it('skips a channel with no number', () => {
    const { all, numbers, b } = lineup();
    const without = { ...numbers };
    delete without[b.id];
    expect(tuning(all, without, 100).up?.number).toBe(102);
  });
});

/*
 * THE NETWORK BY WHAT IS ON IT.  [N-4, D-04, D-19]
 *
 * `/tv/categories` draws a section per kind and the guide draws
 * a sidebar of counts. They each grouped their own, which is two
 * answers to one question and one edit away from disagreeing
 * about what the network carries.
 */
describe('grouping the directory by kind (N-4)', () => {
  function kinded(name: string, slug: string, genre?: string) {
    const listing = listingFor(made(name, { slug }))!;
    return genre ? { ...listing, genre } : listing;
  }

  it('is most-carried first, and by name where two kinds tie', () => {
    const groups = byGenre([
      kinded('One', 'one', 'music'),
      kinded('Two', 'two', 'faith'),
      kinded('Three', 'three', 'music'),
      kinded('Four', 'four', 'culture'),
      kinded('Five', 'five', 'faith'),
      kinded('Six', 'six', 'music'),
    ]);
    expect(groups.map(([kind, under]) => [kind, under.length]))
      .toEqual([['music', 3], ['faith', 2], ['culture', 1]]);
  });

  /*
   * A CHANNEL THAT NAMED NO GENRE IS NOT FILED UNDER *OTHER*.
   * `genre` is optional on a station and a bucket called Other is
   * a heading nobody chose.
   */
  it('files a channel that named no kind under nothing', () => {
    const groups = byGenre([
      kinded('One', 'one', 'music'),
      kinded('Two', 'two'),
      kinded('Three', 'three'),
    ]);
    expect(groups).toEqual([['music', [expect.objectContaining({ slug: 'one' })]]]);
  });

  it('keeps every channel of a kind, not just the first', () => {
    const [[, under]] = byGenre([
      kinded('One', 'one', 'music'),
      kinded('Two', 'two', 'music'),
    ]) as [[string, unknown[]]];
    expect(under.map((one) => (one as { slug: string }).slug))
      .toEqual(['one', 'two']);
  });

  /*
   * THE TIE IS BROKEN BY NAME AND NOT BY WHO WAS FOUND FIRST. A
   * sidebar that reordered itself because a channel was
   * published is a sidebar that moves under the hand reaching
   * for it. [D-04]
   */
  it('orders two kinds of equal size by name, not by arrival', () => {
    const groups = byGenre([
      kinded('One', 'one', 'sport'),
      kinded('Two', 'two', 'faith'),
      kinded('Three', 'three', 'sport'),
      kinded('Four', 'four', 'faith'),
    ]);
    expect(groups.map(([kind]) => kind)).toEqual(['faith', 'sport']);
  });

  it('says nothing about a directory with no kinds in it', () => {
    expect(byGenre([])).toEqual([]);
  });
});
