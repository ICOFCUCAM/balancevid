/**
 * Who may take part, and who may find out.
 *   [TAKE-PLATFORM PART FIVE, P8, P10; U-31, D-03, D-19]
 *
 * THE CORRECTION THIS ENCODES. The first proposal was two booleans —
 * respondable and listed — and the author pushed back: those two do not
 * express the access model, because `listed: false` was being asked to
 * mean PRIVATE and it does not. An unlisted song open to anyone is open
 * to everybody holding the URL; an unlisted song open to invited people
 * is open to four. Different situations, and a boolean cannot say which.
 *
 * So there are three concepts and the third is a policy: discovery and
 * authorization stop carrying each other's meaning.
 *
 * THE TABLE BELOW IS THE BRIEF'S OWN, row for row. It is the
 * specification, so it is tested as one rather than paraphrased.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { licenceMissing } from '../../src/domain/performance.js';

import {
  DEFAULT_ACCESS, DEFAULT_LISTED, TAKE_ACCESS, TAKE_ACCESS_LABELS,
  TAKE_ACCESS_MEANS, accessOf, atLeastAsOpen, availabilityFrom,
  availabilityState, describeAvailability, isListed, isOpenAt, mayClaim,
  maySubmit, whenProblem,
  type TakeAccess, type TakeAvailability,
} from '../../src/domain/availability.js';

/**
 * ONE INSTANT, PASSED EVERYWHERE.  [GO-VIRAL V-1]
 *
 * The predicates take the clock rather than reading it, which is
 * what lets a test say *before it opens* and *after it shuts*
 * without waiting. Every assertion in this file that predates
 * V-1 passes this and means exactly what it meant: none of the
 * items below has a window, and an item with no window is open
 * at every instant there is.
 */
const NOW = '2026-06-01T12:00:00.000Z';

describe("the brief's six rows", () => {
  /*
   * REPRODUCED EXACTLY, including the two em-dashes: access is not a
   * question when nothing may be submitted, and the table says so by
   * leaving it blank rather than by choosing a value.
   */
  const ROWS: {
    respondable: boolean; listed: boolean; access?: TakeAccess;
    meaning: string; state: string;
  }[] = [
    { respondable: false, listed: true, meaning: 'discover but cannot Take', state: 'browse-only' },
    { respondable: true, listed: true, access: 'anyone', meaning: 'public Take opportunity', state: 'open' },
    { respondable: true, listed: false, access: 'invited', meaning: 'band-only/private', state: 'private' },
    { respondable: true, listed: false, access: 'link', meaning: 'unlisted Take opportunity', state: 'unlisted' },
    { respondable: true, listed: true, access: 'members', meaning: 'discoverable but restricted', state: 'restricted' },
    { respondable: false, listed: false, meaning: 'completely unavailable', state: 'unavailable' },
  ];

  it.each(ROWS)('$meaning', ({ respondable, listed, access, state }) => {
    const item: TakeAvailability = {
      respondable, listed, ...(access ? { access } : {}),
    };
    expect(availabilityState(item, NOW)).toBe(state);
  });

  /* Six rows, six distinct states: none of them collapses into another. */
  it('names each of the six differently', () => {
    const states = ROWS.map((row) => availabilityState({
      respondable: row.respondable, listed: row.listed,
      ...(row.access ? { access: row.access } : {}),
    }, NOW));
    expect(new Set(states).size).toBe(6);
  });

  /* And each says something different to the person setting it. */
  it('describes each of the six differently', () => {
    const said = ROWS.map((row) => describeAvailability({
      respondable: row.respondable, listed: row.listed,
      ...(row.access ? { access: row.access } : {}),
    }, NOW));
    expect(new Set(said).size).toBe(6);
    for (const one of said) expect(one.length).toBeGreaterThan(20);
  });
});

describe('the band example, which is why this is three concepts', () => {
  /*
   *   Song
   *   ├── Respondable: YES
   *   ├── Listed: NO
   *   └── Access: INVITED PARTICIPANTS
   *
   * Two booleans could not say this. `listed: false` alone would have
   * had to imply private, which would make the unlisted-but-open case
   * unsayable in the same breath.
   */
  const band: TakeAvailability = {
    respondable: true, listed: false, access: 'invited',
  };
  const unlisted: TakeAvailability = {
    respondable: true, listed: false, access: 'link',
  };

  it('is private, and the unlisted one is not', () => {
    expect(availabilityState(band, NOW)).toBe('private');
    expect(availabilityState(unlisted, NOW)).toBe('unlisted');
  });

  /* Both are undiscoverable, and they differ only in who may submit —
     which is exactly the distinction a single boolean destroyed. */
  it('differs from it in access alone, not in discovery', () => {
    expect(isListed(band)).toBe(false);
    expect(isListed(unlisted)).toBe(false);
    expect(maySubmit(band, 'link', NOW)).toBe(false);
    expect(maySubmit(unlisted, 'link', NOW)).toBe(true);
  });
});

describe('access is meaningless when nothing may be submitted', () => {
  /*
   * ENFORCED RATHER THAN MERELY ALLOWED. A stored `access` on a
   * non-respondable item is a value somebody later reads as though it
   * meant something — and the two rows that differ only in `listed`
   * are exactly where that would happen.
   */
  it('reports no policy at all where nothing may be sent', () => {
    expect(accessOf({ respondable: false, access: 'anyone' })).toBeNull();
    expect(accessOf({ respondable: false, listed: true, access: 'link' })).toBeNull();
    expect(accessOf(undefined)).toBeNull();
    expect(accessOf({})).toBeNull();
  });

  /* And nobody may submit, whatever the stray value says. */
  it.each(TAKE_ACCESS)('refuses a %s holder on a closed item', (holds) => {
    expect(maySubmit({ respondable: false, access: 'anyone' }, holds, NOW)).toBe(false);
  });
});

describe('who may submit', () => {
  /*
   * WHAT THEY HOLD MUST BE AT LEAST AS STRONG AS WHAT THE POLICY ASKS,
   * which is the reverse of `atLeastAsOpen` and the one place this is
   * easy to write backwards.
   */
  it('admits a stronger claim than the policy demands', () => {
    const members: TakeAvailability = { respondable: true, access: 'members' };
    expect(maySubmit(members, 'anyone', NOW)).toBe(false);
    expect(maySubmit(members, 'members', NOW)).toBe(true);
    expect(maySubmit(members, 'link', NOW)).toBe(true);
    expect(maySubmit(members, 'invited', NOW)).toBe(true);
  });

  /*
   * AN INVITATION SATISFIES EVERY POLICY. A producer who narrows a song
   * from public to invited must not thereby refuse the people they have
   * already invited — which is the sort of thing that only shows up on
   * the evening of the session.
   */
  it.each(TAKE_ACCESS)('lets an invited person in under %s', (policy) => {
    expect(maySubmit({ respondable: true, access: policy }, 'invited', NOW)).toBe(true);
  });

  /* And the widest policy admits the weakest claim. */
  it('lets anybody in where the policy is anyone', () => {
    for (const holds of TAKE_ACCESS) {
      expect(maySubmit({ respondable: true, access: 'anyone' }, holds, NOW)).toBe(true);
    }
  });
});

describe('the order of the four', () => {
  /*
   * ORDERED WIDEST FIRST, and the order is a claim rather than a
   * convenience: each admits everybody the next admits and more, which
   * is what makes "at least as open as" a comparison instead of a table.
   */
  it('runs widest to narrowest', () => {
    expect(TAKE_ACCESS).toEqual(['anyone', 'members', 'link', 'invited']);
  });

  /*
   * AND IT POINTS THE WAY IT SAYS.
   *
   * A MUTATION SURVIVED HERE: reversing the comparison left every test
   * passing, because the transitivity check below holds just as well
   * for a reversed relation. Transitivity is a property of the shape,
   * not of the direction, and only the direction is the claim —
   * `anyone` admits everybody `invited` admits and more.
   */
  it('says the wide one is the open one', () => {
    expect(atLeastAsOpen('anyone', 'invited')).toBe(true);
    expect(atLeastAsOpen('invited', 'anyone')).toBe(false);
    expect(atLeastAsOpen('members', 'link')).toBe(true);
    expect(atLeastAsOpen('link', 'members')).toBe(false);
    /* Reflexive: as open as itself, at every step. */
    for (const one of TAKE_ACCESS) expect(atLeastAsOpen(one, one)).toBe(true);
  });

  it('is transitive, so a comparison means what it says', () => {
    for (const a of TAKE_ACCESS) {
      for (const b of TAKE_ACCESS) {
        for (const c of TAKE_ACCESS) {
          if (atLeastAsOpen(a, b) && atLeastAsOpen(b, c)) {
            expect(atLeastAsOpen(a, c)).toBe(true);
          }
        }
      }
    }
  });

  /* Each is named and explained, or a producer is choosing by guesswork. */
  it.each(TAKE_ACCESS)('says what %s means', (id) => {
    expect(TAKE_ACCESS_LABELS[id].length).toBeGreaterThan(5);
    expect(TAKE_ACCESS_MEANS[id].length).toBeGreaterThan(25);
  });
});

describe('nothing on disk changes', () => {
  /*
   * THE DEFAULTS PRESERVE U-31 EXACTLY. "A published conversation is a
   * Class A source. Anyone can open it and respond to it." Everything
   * already published is listed — `/api/published` returns it — and
   * open to anyone, so a field added today must not quietly withdraw
   * or restrict anything.
   */
  it('leaves an existing published conversation exactly as it was', () => {
    const before = { respondable: true };
    expect(isListed(before)).toBe(true);
    expect(accessOf(before)).toBe('anyone');
    expect(availabilityState(before, NOW)).toBe('open');
    expect(maySubmit(before, 'anyone', NOW)).toBe(true);
  });

  it('states those defaults rather than implying them', () => {
    expect(DEFAULT_LISTED).toBe(true);
    expect(DEFAULT_ACCESS).toBe('anyone');
  });

  /*
   * AND AN UNPUBLISHED ONE IS STILL NOTHING. `respondable` has no
   * default because it has never had one: absent means false, which is
   * what `isRespondable` already does. [D-03]
   */
  it('treats an absent respondable as closed', () => {
    expect(accessOf({})).toBeNull();
    expect(availabilityState({}, NOW)).toBe('browse-only');
    expect(availabilityState({ listed: false }, NOW)).toBe('unavailable');
  });
});

/* ------------------------------------------------------------------ *
 *  A call opens and shuts on a clock.  [GO-VIRAL V-1]
 * ------------------------------------------------------------------ */

/**
 * WHAT WAS MISSING WAS A CLOCK, NOT A CEILING.
 *
 * `claims` bounds how many strangers may come through; nothing
 * bounded *until when*. So a song opened to `anyone` stayed open
 * until somebody unticked it or the hundredth arrived — no closing
 * time, which means no moment at which a call can be judged, no
 * countdown to show, and nothing that can honestly be labelled
 * *ending soon*.
 *
 * AND IT IS NOT `expiresAt`. That is one person's link running out;
 * forty invitations are forty deadlines. This is the call's own
 * clock, and a call has one. The request machine is untouched.
 */
const BEFORE = '2026-06-01T09:00:00.000Z';
const DURING = '2026-06-01T12:00:00.000Z';
const AFTER = '2026-06-01T18:00:00.000Z';

const window = (one?: string, shut?: string): TakeAvailability => ({
  respondable: true,
  access: 'anyone',
  ...(one ? { opensAt: one } : {}),
  ...(shut ? { closesAt: shut } : {}),
});

describe('a call with no window', () => {
  /*
   * THE WHOLE OF "BYTE-IDENTICAL TO TODAY". Every item already on
   * disk has neither field, and must behave at every instant
   * exactly as it did before the fields existed.
   */
  it('is open at every instant there is', () => {
    const open = window();
    for (const at of [BEFORE, DURING, AFTER, '1999-01-01T00:00:00.000Z']) {
      expect(isOpenAt(open, at), at).toBe(true);
      expect(maySubmit(open, 'anyone', at), at).toBe(true);
      expect(availabilityState(open, at), at).toBe('open');
    }
  });
});

describe('a call that opens later', () => {
  const soon = window('2026-06-01T10:00:00.000Z');

  it('refuses before, admits after', () => {
    expect(maySubmit(soon, 'anyone', BEFORE)).toBe(false);
    expect(maySubmit(soon, 'anyone', DURING)).toBe(true);
  });

  /*
   * SCHEDULED IS NOT OPEN AND NOT CLOSED, and a surface that drew
   * it as open would invite people to press a button that refuses
   * them.
   */
  it('is scheduled, which is a state of its own', () => {
    expect(availabilityState(soon, BEFORE)).toBe('scheduled');
    expect(availabilityState(soon, DURING)).toBe('open');
  });

  /*
   * AND IT IS STILL LISTED. Discovery is not the clock: a call
   * nobody can find before it opens is a call nobody enters when
   * it does. `isListed` is untouched by this stage.
   */
  it('can still be found before it opens', () => {
    expect(isListed(soon)).toBe(true);
  });

  /* The sentence says so too, rather than saying "anybody can". */
  it('says it opens later rather than saying it is open', () => {
    expect(describeAvailability(soon, BEFORE)).toMatch(/opens for takes later/);
    expect(describeAvailability(soon, DURING)).toMatch(/Anybody who finds this/);
  });
});

describe('a call that shuts', () => {
  const until = window(undefined, '2026-06-01T15:00:00.000Z');

  it('admits before, refuses after', () => {
    expect(maySubmit(until, 'anyone', DURING)).toBe(true);
    expect(maySubmit(until, 'anyone', AFTER)).toBe(false);
    expect(availabilityState(until, AFTER)).toBe('closed');
  });

  /*
   * AT THE MINUTE IT SAYS, NOT AFTER IT. A call that shuts at three
   * does not take a take stamped three — a deadline somebody can be
   * one millisecond the wrong side of is a deadline, and this is
   * which side.
   */
  it('shuts at the instant it names', () => {
    expect(maySubmit(until, 'anyone', '2026-06-01T14:59:59.999Z')).toBe(true);
    expect(maySubmit(until, 'anyone', '2026-06-01T15:00:00.000Z')).toBe(false);
  });

  /* And the ceiling is not what refused: this one is not full. */
  it('refuses a claim on the clock, not on the count', () => {
    expect(mayClaim(until, 0, AFTER)).toBe(false);
    expect(mayClaim(until, 0, DURING)).toBe(true);
  });

  it('says it has closed', () => {
    expect(describeAvailability(until, AFTER)).toMatch(/has closed/);
  });
});

describe('a window at both ends', () => {
  const both = window('2026-06-01T10:00:00.000Z', '2026-06-01T15:00:00.000Z');

  it('is scheduled, then open, then closed', () => {
    expect(availabilityState(both, BEFORE)).toBe('scheduled');
    expect(availabilityState(both, DURING)).toBe('open');
    expect(availabilityState(both, AFTER)).toBe('closed');
  });

  /*
   * THE CLOCK IS ASKED ONLY WHERE SOMETHING MAY BE SUBMITTED. An
   * item nothing can be sent to is `browse-only` whatever the hour,
   * because the question *when* does not arise.
   */
  it('does not reach an item nothing may be sent to', () => {
    const shut = { respondable: false, opensAt: both.opensAt, closesAt: both.closesAt };
    for (const at of [BEFORE, DURING, AFTER]) {
      expect(availabilityState(shut, at), at).toBe('browse-only');
    }
  });
});

describe('a date nobody can read', () => {
  /*
   * AN UNREADABLE DATE IS AN OPEN DOOR, which is `isOpen`'s own
   * decision about `expiresAt` and is taken here for the reason it
   * gives: a corrupt deadline that locked a room is a worse failure
   * than one that outlives its terms, and there is a revocation
   * that always works — unticking it, or unpublishing.
   */
  it('does not shut a door on a damaged record', () => {
    expect(isOpenAt({ respondable: true, closesAt: 'the end of June' }, DURING))
      .toBe(true);
    expect(isOpenAt({ respondable: true, opensAt: 'soon' }, DURING)).toBe(true);
  });

  /*
   * AND WRITING ONE IS REFUSED, at the moment the producer types
   * it, where the thing that is wrong is still in front of them.
   * Forgiven at the read and refused at the write is not two minds
   * about one question. [U-19]
   */
  it('is refused when somebody is setting it', () => {
    expect(whenProblem({ closesAt: 'the end of June' }))
      .toBe('that is not a date to close at');
    expect(whenProblem({ opensAt: 'soon' })).toBe('that is not a date to open at');
    expect(whenProblem({})).toBe('');
    expect(whenProblem({ opensAt: '', closesAt: null })).toBe('');
  });

  /*
   * A WINDOW THAT IS ALREADY SHUT IS NOT A WINDOW. Closing before
   * opening is a typo every time, and what it would produce is an
   * item nobody can ever take part in.
   */
  it('refuses a window that closes before it opens', () => {
    expect(whenProblem({
      opensAt: '2026-06-01T15:00:00.000Z', closesAt: '2026-06-01T10:00:00.000Z',
    })).toBe('it cannot close before it opens');
    /* The same instant is no window at all, which is the same fault. */
    expect(whenProblem({ opensAt: DURING, closesAt: DURING }))
      .toBe('it cannot close before it opens');
  });
});

describe('what a publish request says about a window', () => {
  /*
   * STORED AS THE INSTANT RATHER THAN AS WHAT WAS TYPED, so two
   * producers in two time zones write the same record and the
   * predicates compare like with like.
   */
  it('normalises what it keeps', () => {
    const kept = availabilityFrom({
      respondable: true, access: 'anyone',
      opensAt: '2026-06-01T10:00:00+02:00',
    });
    expect(kept.opensAt).toBe('2026-06-01T08:00:00.000Z');
  });

  /*
   * ONLY WHERE SOMETHING MAY BE SUBMITTED, for the reason `access`
   * is: a closing time on an item nothing can be sent to is a value
   * somebody later reads as though it meant something.
   */
  it('keeps no window on an item nothing may be sent to', () => {
    const kept = availabilityFrom({
      respondable: false, opensAt: BEFORE, closesAt: AFTER,
    });
    expect(kept.opensAt).toBeUndefined();
    expect(kept.closesAt).toBeUndefined();
  });

  /*
   * AND NOTHING AT ALL IF THE PAIR IS WRONG — the same parse
   * reaching the same conclusion as `whenProblem`, so a route that
   * forgot to ask cannot store a window the door will not read.
   */
  it('keeps nothing of a window it would refuse', () => {
    const kept = availabilityFrom({
      respondable: true, access: 'anyone',
      opensAt: AFTER, closesAt: BEFORE,
    });
    expect(kept.opensAt).toBeUndefined();
    expect(kept.closesAt).toBeUndefined();
    /* And the rest of the decision survives it. */
    expect(kept.respondable).toBe(true);
  });

  it('keeps nothing of a date it cannot read', () => {
    expect(availabilityFrom({
      respondable: true, access: 'anyone', closesAt: 'the end of June',
    }).closesAt).toBeUndefined();
  });
});

/* ------------------------------------------------------------------ *
 *  A rule that existed and nothing asked.  [GO-VIRAL V-1, G7; INV-15]
 * ------------------------------------------------------------------ */

/**
 * `assertPublishable` HAS CARRIED THE LICENCE RULE SINCE INV-15 WAS
 * WRITTEN, with nine assertions over it in `performance.test.ts` — and
 * a search for its callers turns up that test file and nothing else.
 *
 * SO A `licensed` MASTER WITH NO WORD ABOUT WHAT PERMITS IT could be
 * published, made `respondable`, opened to `anyone`, and sung on by a
 * thousand people. `mayPublish` was enforced at the publish and this
 * half was enforced nowhere.
 *
 * A RULE WITH A TEST SUITE AND NO CALLER IS WORSE THAN ONE WITH
 * NEITHER: it reads as live. The predicate is one function now, and
 * both the invariant and the publish ask it.
 */
describe('a master that does not say what permits it', () => {
  const master = (cls: string, licence?: string) => ({
    assetId: 'asset_1', title: 'A Song', class: cls, durationSamples: 1,
    ...(licence === undefined ? {} : { licence }),
  } as unknown as Parameters<typeof licenceMissing>[0]);

  it('is what `licenceMissing` is for, in one place', () => {
    expect(licenceMissing(master('licensed'))).toBe(true);
    expect(licenceMissing(master('open'))).toBe(true);
    /* Named, and it is fine. */
    expect(licenceMissing(master('licensed', 'PRS 12345'))).toBe(false);
    /* Whitespace is not a licence. */
    expect(licenceMissing(master('open', '   '))).toBe(true);
    /* And a class that needs no note never needs one. */
    expect(licenceMissing(master('own'))).toBe(false);
    expect(licenceMissing(master('third_party'))).toBe(false);
  });

  /*
   * BOTH CALLERS ASK THE SAME FUNCTION, which is the repair. Two
   * copies of *licensed but silent* is how the invariant and the
   * publish come to disagree about a rights question. [D-19]
   */
  it('is asked by the invariant and by the publish', () => {
    const invariants = readFileSync(
      join(import.meta.dirname, '..', '..', 'src', 'domain', 'invariants.ts'), 'utf8');
    const edit = readFileSync(
      join(import.meta.dirname, '..', '..', 'src', 'domain', 'performanceEdit.ts'),
      'utf8');
    expect(invariants).toMatch(/licenceMissing\(performance\.master\)/);
    expect(edit).toMatch(/licenceMissing\(performance\.master\)/);
    /* And neither spells the rule out for itself any more. */
    for (const [name, source] of [['invariants', invariants], ['edit', edit]] as const) {
      expect(source, name)
        .not.toMatch(/needsLicenceNote\([^)]*\)\s*&&\s*!/);
    }
  });

  /*
   * AND IT IS REFUSED AT THE MOMENT THE DOOR OPENS, which is the
   * publish: `availability` is written two statements later, so one
   * refusal covers the publication and the participation. A separate
   * check at the moment somebody claims would be the same rule in a
   * second place, after a person had decided to sing. [V-1]
   */
  it('is refused where the audience is given, not where it is noticed', () => {
    const edit = readFileSync(
      join(import.meta.dirname, '..', '..', 'src', 'domain', 'performanceEdit.ts'),
      'utf8');
    const publish = edit.slice(edit.indexOf('export function publishPerformance'));
    const refusal = publish.indexOf('licenceMissing');
    const availability = publish.indexOf('availability: TakeAvailability');
    expect(refusal).toBeGreaterThan(-1);
    expect(refusal).toBeGreaterThan(availability);
    expect(publish.slice(refusal, refusal + 400)).toMatch(/Name the licence/);
  });
});
