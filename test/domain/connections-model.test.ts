/**
 * The installations a device takes part in.
 *   [TAKE-PLATFORM P22, P24; TAKE-DESKTOP T-2]
 *
 * The browser keeps this list in `localStorage` and Take Software
 * for desktop keeps it in a file beside its own settings. The
 * rules are the same on both, so they are tested once.
 */

import { describe, expect, it } from 'vitest';

import {
  type Connection, MOST_CONNECTIONS, NAME_LONGEST, instanceFrom,
  readConnectionList, withConnection, withoutConnection,
} from '../../shared/src/connections.js';

const made = (origin: string, name = origin): Connection =>
  ({ origin, name, addedAt: '2026-10-03T08:00:00.000Z' });

describe('reading a stored list (T-2)', () => {
  it('reads what a device wrote', () => {
    const list = [made('https://studio.example', 'Studio')];
    expect(readConnectionList(JSON.stringify(list))).toEqual(list);
  });

  it('reads nothing from nothing', () => {
    expect(readConnectionList(null)).toEqual([]);
    expect(readConnectionList(undefined)).toEqual([]);
    expect(readConnectionList('')).toEqual([]);
  });

  /*
   * NEVER A THROW. Both applications read this on the way to
   * their first screen, and one that will not start because a
   * stored value was truncated is worse than one that starts with
   * no connections in it. [D-21]
   */
  it('reads nothing from rubbish rather than throwing', () => {
    for (const bad of ['{', 'not json', '"a string"', '42',
      '{"origin":"https://x.example"}']) {
      expect(readConnectionList(bad), bad).toEqual([]);
    }
  });

  /*
   * AND EVERY ORIGIN GOES BACK THROUGH `asOrigin`, because a file
   * on disk is not a type. A hand-edited list holding
   * `javascript:alert(1)` must not become a place this device
   * sends somebody. [N-3's lesson, on the other side of the
   * product]
   */
  it('refuses an origin a file could hold and a parser would not', () => {
    const raw = JSON.stringify([
      { origin: 'javascript:alert(1)', name: 'Bad', addedAt: '' },
      { origin: 'ftp://studio.example', name: 'Also bad', addedAt: '' },
      { origin: 'https://user:pw@studio.example', name: 'Dressed up', addedAt: '' },
      { origin: 'https://good.example', name: 'Good', addedAt: '' },
    ]);
    expect(readConnectionList(raw).map((one) => one.origin))
      .toEqual(['https://good.example']);
  });

  /* And normalises one it accepts, so two spellings are one row. */
  it('normalises what it accepts', () => {
    const raw = JSON.stringify([
      { origin: 'https://studio.example/take?x', name: 'A', addedAt: '' },
      { origin: 'studio.example', name: 'B', addedAt: '' },
    ]);
    const read = readConnectionList(raw);
    expect(read.length).toBe(1);
    expect(read[0]!.origin).toBe('https://studio.example');
  });

  it('drops an entry with no origin at all', () => {
    const raw = JSON.stringify([null, 7, 'x', { name: 'No origin' },
      { origin: 'https://good.example', name: 'Good', addedAt: '' }]);
    expect(readConnectionList(raw).length).toBe(1);
  });

  it('caps the name and tolerates a missing one', () => {
    const raw = JSON.stringify([
      { origin: 'https://a.example', name: 'x'.repeat(200), addedAt: '' },
      { origin: 'https://b.example', addedAt: '' },
    ]);
    const read = readConnectionList(raw);
    expect(read.find((one) => one.origin === 'https://a.example')!.name.length)
      .toBe(NAME_LONGEST);
    expect(read.find((one) => one.origin === 'https://b.example')!.name).toBe('');
  });

  it('stops at the cap, whatever the stored value says', () => {
    const many = Array.from({ length: MOST_CONNECTIONS + 20 },
      (_, at) => made(`https://s${at}.example`));
    expect(readConnectionList(JSON.stringify(many)).length)
      .toBe(MOST_CONNECTIONS);
  });

  it('tolerates a missing timestamp rather than inventing one', () => {
    const raw = JSON.stringify([{ origin: 'https://a.example', name: 'A' }]);
    expect(readConnectionList(raw)[0]!.addedAt).toBe('');
  });
});

describe('an origin dressed up as another (T-2)', () => {
  /*
   * CREDENTIALS IN A URL ARE A WAY TO MAKE ONE ORIGIN LOOK LIKE
   * ANOTHER in a string a person is reading:
   * `https://studio.example@evil.example` has a HOST of
   * `evil.example`, and somebody reading it left to right does
   * not.
   *
   * THE PASSWORD HALF WAS NEVER TESTED, in this file's previous
   * home or this one. `|| url.password` survived mutation, and
   * measuring showed why it must not be deleted:
   *
   *     new URL('https://:pw@studio.example')
   *       username = ''   password = 'pw'
   *
   * A URL may carry a password and no username at all, which is
   * exactly the shape of `https://:token@studio.example`. The
   * clause is reachable, needed, and now has the fixture that
   * says so.
   */
  it('refuses a URL carrying credentials, either half of them', () => {
    const of = (one: string) => readConnectionList(
      JSON.stringify([{ origin: one, name: 'X', addedAt: '' }]));
    expect(of('https://user:pw@studio.example')).toEqual([]);
    expect(of('https://user@studio.example')).toEqual([]);
    expect(of('https://:pw@studio.example')).toEqual([]);
  });

  /* And the host is the one after the @, which is the trick. */
  it('is not fooled by a host written before the at-sign', () => {
    const of = (one: string) => readConnectionList(
      JSON.stringify([{ origin: one, name: 'X', addedAt: '' }]));
    expect(of('https://studio.example@evil.example')).toEqual([]);
  });
});

describe('adding and removing (T-2)', () => {
  /*
   * KEYED ON THE ORIGIN, so adding one twice is not two of them
   * and a renamed installation is the same one under a new name
   * rather than a duplicate nobody can tell apart.
   */
  it('adds one, and a second add is a rename', () => {
    let list = withConnection([], made('https://a.example', 'Studio'));
    expect(list.length).toBe(1);
    list = withConnection(list, made('https://a.example', 'Studio Two'));
    expect(list.length).toBe(1);
    expect(list[0]!.name).toBe('Studio Two');
  });

  /*
   * SORTED BY NAME, because this is a list a person reads to
   * recognise where they work. The order they were added in is
   * not an order anybody remembers.
   */
  it('reads in the order a person recognises', () => {
    let list = withConnection([], made('https://z.example', 'Zebra'));
    list = withConnection(list, made('https://a.example', 'Apple'));
    expect(list.map((one) => one.name)).toEqual(['Apple', 'Zebra']);
  });

  it('never changes the list it was given', () => {
    const was = [made('https://a.example', 'A')];
    expect(withConnection(was, made('https://b.example', 'B'))).not.toBe(was);
    expect(was.length).toBe(1);
    expect(withoutConnection(was, 'https://a.example')).toEqual([]);
    expect(was.length).toBe(1);
  });

  it('removes one, and removing one that is absent is not an error', () => {
    const was = [made('https://a.example', 'A')];
    expect(withoutConnection(was, 'https://a.example')).toEqual([]);
    expect(withoutConnection(was, 'https://b.example')).toEqual(was);
  });

  it('holds the cap when adding past it', () => {
    let list: Connection[] = [];
    for (let at = 0; at < MOST_CONNECTIONS + 5; at += 1) {
      list = withConnection(list, made(`https://s${at}.example`,
        `S${String(at).padStart(3, '0')}`));
    }
    expect(list.length).toBe(MOST_CONNECTIONS);
  });
});

describe('what an installation may say about itself (T-2)', () => {
  /*
   * WHAT IT CALLS ITSELF IS ITS OWN BUSINESS; WHERE IT IS, IS
   * NOT. An installation that could name its own origin could
   * name somebody else's, and a connection list is a list of
   * places this device will later send a person to.
   */
  it('keeps the origin the device reached, never the one it was told', () => {
    const said = instanceFrom('https://real.example', {
      instance: { name: 'Studio', origin: 'https://attacker.example' },
    });
    expect(said).toEqual({ name: 'Studio', origin: 'https://real.example' });
  });

  it('caps the name, which somebody else chose', () => {
    const said = instanceFrom('https://real.example',
      { instance: { name: 'x'.repeat(500) } });
    expect(said!.name.length).toBe(NAME_LONGEST);
  });

  /* An answer with no name is not an installation answering. */
  it('answers nothing for an answer that names nothing', () => {
    for (const body of [null, undefined, 42, 'text', {},
      { instance: {} }, { instance: { name: '' } },
      { instance: { name: 7 } }, { instance: null }]) {
      expect(instanceFrom('https://real.example', body), JSON.stringify(body))
        .toBe(null);
    }
  });
});
