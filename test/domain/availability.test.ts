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

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ACCESS, DEFAULT_LISTED, TAKE_ACCESS, TAKE_ACCESS_LABELS,
  TAKE_ACCESS_MEANS, accessOf, atLeastAsOpen, availabilityState,
  describeAvailability, isListed, maySubmit,
  type TakeAccess, type TakeAvailability,
} from '../../src/domain/availability.js';

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
    expect(availabilityState(item)).toBe(state);
  });

  /* Six rows, six distinct states: none of them collapses into another. */
  it('names each of the six differently', () => {
    const states = ROWS.map((row) => availabilityState({
      respondable: row.respondable, listed: row.listed,
      ...(row.access ? { access: row.access } : {}),
    }));
    expect(new Set(states).size).toBe(6);
  });

  /* And each says something different to the person setting it. */
  it('describes each of the six differently', () => {
    const said = ROWS.map((row) => describeAvailability({
      respondable: row.respondable, listed: row.listed,
      ...(row.access ? { access: row.access } : {}),
    }));
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
    expect(availabilityState(band)).toBe('private');
    expect(availabilityState(unlisted)).toBe('unlisted');
  });

  /* Both are undiscoverable, and they differ only in who may submit —
     which is exactly the distinction a single boolean destroyed. */
  it('differs from it in access alone, not in discovery', () => {
    expect(isListed(band)).toBe(false);
    expect(isListed(unlisted)).toBe(false);
    expect(maySubmit(band, 'link')).toBe(false);
    expect(maySubmit(unlisted, 'link')).toBe(true);
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
    expect(maySubmit({ respondable: false, access: 'anyone' }, holds)).toBe(false);
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
    expect(maySubmit(members, 'anyone')).toBe(false);
    expect(maySubmit(members, 'members')).toBe(true);
    expect(maySubmit(members, 'link')).toBe(true);
    expect(maySubmit(members, 'invited')).toBe(true);
  });

  /*
   * AN INVITATION SATISFIES EVERY POLICY. A producer who narrows a song
   * from public to invited must not thereby refuse the people they have
   * already invited — which is the sort of thing that only shows up on
   * the evening of the session.
   */
  it.each(TAKE_ACCESS)('lets an invited person in under %s', (policy) => {
    expect(maySubmit({ respondable: true, access: policy }, 'invited')).toBe(true);
  });

  /* And the widest policy admits the weakest claim. */
  it('lets anybody in where the policy is anyone', () => {
    for (const holds of TAKE_ACCESS) {
      expect(maySubmit({ respondable: true, access: 'anyone' }, holds)).toBe(true);
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
    expect(availabilityState(before)).toBe('open');
    expect(maySubmit(before, 'anyone')).toBe(true);
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
    expect(availabilityState({})).toBe('browse-only');
    expect(availabilityState({ listed: false })).toBe('unavailable');
  });
});
