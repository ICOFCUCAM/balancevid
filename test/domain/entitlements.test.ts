/**
 * Studios are separable, and that is architecture.
 * [MASTER-EDIT §11; Doctrine U-24, D-03, D-06, D-19]
 *
 * The brief:
 *
 *   "A customer buying Studio One only must not automatically receive
 *    Studio Two guest functionality, Online TV guest functionality, or a
 *    broadcast channel… The underlying room/participant technology can be
 *    shared. But permissions, invitations, terminology and UX are
 *    studio-specific."
 *
 * This is the one item on the list that is not a feature. It is a field on
 * `Account` and a rule every surface consults, and it gets harder to add
 * the longer the product assumes all three.
 *
 * WHAT IS PROVED HERE:
 *
 *   an account with no plan has everything, because the deploy that adds
 *   this field must not take two studios off everybody who had them;
 *   an empty plan is a real answer and a different one from no plan;
 *   the path table places every studio route and nothing else;
 *   a guest's room is NOT a studio route, or every invite link in the
 *   product would stop working the day a plan was set;
 *   turning every studio off cannot lock anybody out of settings, which is
 *   how they would turn one back on.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ALL_STUDIOS, type Account, type StudioId, STUDIOS,
  isStudioId, ownsStudio, ownerAccount, studiosOf,
} from '../../src/domain/account.js';
import { mayBePublic, studioForPath } from '../../src/auth/policy.js';

function account(over: Partial<Account> = {}): Account {
  return { ...ownerAccount(new Date('2026-01-01T00:00:00.000Z')), ...over };
}

describe('what an account has', () => {
  /*
   * THE MIGRATION, AND IT IS THE WHOLE MIGRATION. Every instance running
   * today has no such field. A default of "none", or of "the first one",
   * would mean the deploy that adds entitlements silently takes two studios
   * away from everybody who already had them — the same mistake
   * `sessionsValidFrom` was written to avoid, where defaulting to the
   * account's creation date would have signed out every session in
   * existence on the upgrade.
   */
  it('has all three when nothing has been said', () => {
    expect(studiosOf(account())).toEqual([...ALL_STUDIOS]);
    for (const id of ALL_STUDIOS) expect(ownsStudio(account(), id)).toBe(true);
  });

  /*
   * AND AN EMPTY LIST IS NOT THE SAME AS NO LIST. One is an account with
   * nothing; the other is an account nobody has decided about. Collapsing
   * them would make "turn off my last studio" mean "give me all of them".
   */
  it('has nothing when it says it has nothing', () => {
    expect(studiosOf(account({ studios: [] }))).toEqual([]);
    for (const id of ALL_STUDIOS) {
      expect(ownsStudio(account({ studios: [] }), id)).toBe(false);
    }
  });

  it('has exactly what it names', () => {
    const one = account({ studios: ['studio-one'] });
    expect(ownsStudio(one, 'studio-one')).toBe(true);
    expect(ownsStudio(one, 'studio-two')).toBe(false);
    expect(ownsStudio(one, 'online-tv')).toBe(false);
  });

  /*
   * A name this build does not understand is not a permission this build
   * can honour. The record is a JSON file a forward version may have
   * written a fourth studio into.
   */
  it('drops a studio it has never heard of', () => {
    const odd = account({ studios: ['studio-one', 'studio-nine' as StudioId] });
    expect(studiosOf(odd)).toEqual(['studio-one']);
    expect(isStudioId('studio-nine')).toBe(false);
  });

  it('names the three the product actually has', () => {
    expect(ALL_STUDIOS).toEqual(['studio-one', 'studio-two', 'online-tv']);
    for (const id of ALL_STUDIOS) {
      expect(STUDIOS[id].label.length, id).toBeGreaterThan(0);
    }
  });
});

describe('which studio a path is in', () => {
  it('places every studio route', () => {
    for (const [path, studio] of [
      ['/c/conv_1', 'studio-one'],
      ['/c/conv_1/room', 'studio-one'],
      /*
       * THE STUDIO ITSELF AND NOT ONLY WHAT IS IN IT. `/c` was not
       * covered while the rule was `^/c/` with a trailing slash, and
       * `/c` did not exist to notice. [STUDIO-ONE §5]
       */
      ['/c', 'studio-one'],
      ['/api/conversations', 'studio-one'],
      ['/api/conversations/conv_1/renders', 'studio-one'],
      ['/p/perf_1', 'studio-two'],
      ['/p/perf_1/watch', 'studio-two'],
      ['/api/performances', 'studio-two'],
      ['/api/performances/perf_1/history', 'studio-two'],
      ['/t/chan_1', 'online-tv'],
      ['/api/channels/chan_1/room/invite', 'online-tv'],
    ] as [string, StudioId][]) {
      expect(studioForPath(path), path).toBe(studio);
    }
  });

  /*
   * NULL-BY-DEFAULT, WHICH IS THE OPPOSITE OF THE PUBLIC ALLOWLIST NEXT
   * DOOR, on purpose. A route that is accidentally public is a disclosure;
   * a route that is accidentally unreachable is an outage — and the one
   * that would be unreachable first is the page you sign in on.
   */
  it('places the building itself in no studio at all', () => {
    for (const path of [
      '/', '/signin', '/settings', '/api/auth/me', '/api/auth/signin',
      '/api/health', '/api/published', '/api/library', '/api/jobs',
    ]) {
      expect(studioForPath(path), path).toBeNull();
    }
  });

  /*
   * THE ONE THAT WOULD HAVE BROKEN EVERYTHING. `/r/<token>` is a guest
   * arriving at an invitation. They have no account and therefore no plan,
   * so asking "do you own Studio One?" of them answers no — and every
   * invite link in the product stops working the day the owner sets a plan.
   */
  it('does not place a guest room in a studio', () => {
    expect(studioForPath('/r/tok_1')).toBeNull();
    /* And it is still reachable without the owner's session. */
    expect(mayBePublic('/r/tok_1', 'GET')).toBe(true);
  });

  /*
   * SETTINGS IS THE WAY BACK. An owner who turns off all three studios has
   * to be able to turn one on again, and the only thing that makes that
   * true is that settings is in no studio. This is the assertion behind the
   * words "by construction" in the route that lets them do it.
   */
  it('leaves the way back open when every studio is off', () => {
    const none = account({ studios: [] });
    for (const path of ['/settings', '/api/auth/me', '/']) {
      const studio = studioForPath(path);
      expect(studio, path).toBeNull();
      /* Which is what makes the entitlement check let it through. */
      expect(studio === null || ownsStudio(none, studio)).toBe(true);
    }
  });

  /*
   * A prefix and not a substring: a conversation id that happens to contain
   * the letters of another route must not be re-homed by it.
   */
  it('matches the beginning of the path and not the middle of it', () => {
    expect(studioForPath('/api/conversations/conv_p_1')).toBe('studio-one');
    expect(studioForPath('/api/performances/perf_c_1')).toBe('studio-two');
    /* `/api/conversationsomething` is not the conversations API. */
    expect(studioForPath('/api/conversationsomething')).toBeNull();
    /* And `/c` is the studio, not a prefix of any word that starts with c. */
    expect(studioForPath('/channels')).toBeNull();
    expect(studioForPath('/cabinet')).toBeNull();
  });
});

/*
 * AND THE GATE IS IN THE ONE PLACE NOBODY CAN GO ROUND.
 * [MASTER-EDIT §11, D-06, D-19]
 *
 * Three places were tried before this one, and the reasons the first two
 * failed are written out in `src/store/entitlement.ts`. The short version:
 *
 *   the navigation bar is a courtesy, because the URL is still typeable;
 *   `isOwner` would have to derive the studio from the request's path, and
 *   half the callers in this codebase build `new Request('http://local/')`
 *   to pass a cookie — those calls would have READ as protected and been
 *   nothing, which is worse than no check at all;
 *   the middleware sees every real path and its own opening paragraph
 *   rules it out: it "has no business reading storage", and a plan is in
 *   the account document.
 *
 * So it is in the store, and this is the test that keeps it there. Sixty-
 * four route files and seven pages reach a document through these three
 * modules because there is nowhere else to get one; a sixty-fifth added
 * tomorrow is covered the moment it calls `loadPerformance`. What is NOT
 * covered by that argument is somebody adding an exported reader to one of
 * these three modules and forgetting the gate, which is exactly what this
 * reads the files to prevent.
 */
describe('every door into a studio has the lock on it', () => {
  const ROOT = join(process.cwd(), 'src', 'store');

  /** Comments stripped, so a gate mentioned in prose does not count. */
  function code(file: string): string {
    return readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
  }

  const GATED: [string, StudioId][] = [
    ['performances.ts', 'studio-two'],
    ['channels.ts', 'online-tv'],
    ['repository.ts', 'studio-one'],
  ];

  for (const [file, studio] of GATED) {
    it(`${file} asks before it answers`, () => {
      const lines = code(join(ROOT, file)).split('\n');
      const ungated: string[] = [];
      let found = 0;
      for (let i = 0; i < lines.length; i += 1) {
        const declared = /^export async function (\w+)/.exec(lines[i]!);
        if (!declared) continue;
        found += 1;
        /*
         * Within the opening of the function and not merely somewhere in
         * the file: a gate twenty lines down, after the document has
         * already been read off disk, is not a gate.
         */
        const opening = lines.slice(i, i + 12).join('\n');
        if (!opening.includes(`await requireStudio('${studio}')`)) {
          ungated.push(declared[1]!);
        }
      }
      /* The count is asserted so that a file which stops exporting
         anything cannot pass this by having nothing to check. */
      expect(found, `${file} exports nothing`).toBeGreaterThan(4);
      expect(ungated, `${file} has doors with no lock`).toEqual([]);
    });
  }

  /* And the gate itself is the shared one, not a copy per module. */
  it('is one gate and not three', () => {
    for (const [file] of GATED) {
      expect(code(join(ROOT, file)), file)
        .toContain("from './entitlement.js'");
    }
  });
});
