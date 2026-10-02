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
  bySlug, directory, inDirectory, listingFor, standingOf,
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
