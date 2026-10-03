/**
 * The public face of a call.
 *   [GO-VIRAL V-4, §10, §20; Doctrine D-03, D-19]
 *
 * > **Judged on:** *"A stranger with no account reaches a
 * > campaign, reads the rules, watches entries and enters, on a
 * > phone; and a campaign that is `listed: false` is reachable by
 * > its link and absent from every index."*
 *
 * THE SECOND HALF IS TWO PROPERTIES THAT PULL APART, which is why
 * they are tested together: *reachable by its link* and *absent
 * from every index* are satisfied by different functions —
 * `bySlugOrId` and `publicCalls` — and a change that made one of
 * them agree with the other would break the requirement in one
 * direction or leak in the other.
 *
 * Nothing here touches a disk. The doors are driven in
 * `go-route.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import {
  type Campaign, bySlugOrId, callListed, callRow, loopNumbers, msLeft,
  publicCalls, takenCallSlugs, wallOf,
} from '../../src/domain/campaign.js';
import {
  CampaignError, newCampaign, setListed, setSlug,
} from '../../src/domain/campaignEdit.js';
import { consentFrom } from '../../src/domain/consent.js';
import type { ParticipationRequest } from '../../src/domain/participation.js';

const OPENED = '2026-06-01T09:00:00.000Z';
const NOW = '2026-06-02T09:00:00.000Z';
const HASH = 'a'.repeat(64);

function aCall(spec: {
  title?: string; closesAt?: string; opensAt?: string; taken?: string[];
  createdAt?: string;
} = {}): Campaign {
  const made = newCampaign({
    title: spec.title ?? 'Sing the second verse',
    track: { kind: 'performance', id: 'perf_one' },
    rules: { asks: 'Sing it outdoors', criteria: 'Tuning', prize: 'A day in the studio' },
    window: {
      respondable: true,
      access: 'anyone',
      opensAt: spec.opensAt ?? OPENED,
      closesAt: spec.closesAt ?? '2026-06-30T09:00:00.000Z',
    },
    taken: spec.taken ?? [],
    now: spec.createdAt ?? OPENED,
  });
  made.state = 'live';
  return made;
}

function entrant(spec: {
  id: string; campaign?: string; permits?: string[]; withdrawn?: boolean;
  sent?: { id: string; at: string; capture?: string }[];
  claimed?: boolean; participant?: string;
}): ParticipationRequest {
  const consent = spec.permits
    ? consentFrom({ termsHash: HASH, permits: spec.permits }, OPENED) : null;
  if (consent && spec.withdrawn) consent.withdrawnAt = NOW;
  return {
    id: spec.id,
    holder: { kind: 'performance', id: 'perf_one' },
    assignment: { kind: 'performance', asks: 'sing' },
    allowed: { video: true, takes: 3 },
    token: 'a-token-long-enough-to-be-a-credential',
    state: 'opened',
    createdAt: OPENED,
    history: [],
    ...(spec.campaign ? { campaign: spec.campaign as never } : {}),
    ...(spec.claimed ? { claimed: true } : {}),
    ...(spec.participant ? { participant: spec.participant } : {}),
    ...(consent ? { consent } : {}),
    ...(spec.sent ? {
      submissions: spec.sent.map((one) => ({
        id: one.id as never,
        assetId: one.id,
        kind: 'video' as const,
        at: one.at,
        ...(one.capture
          ? { capturedIn: { id: one.capture, offsetSamples: 0 } } : {}),
      })),
    } : {}),
  } as ParticipationRequest;
}

describe('the address a call answers on', () => {
  it('is suggested from the title and avoids what is taken', () => {
    expect(aCall().slug).toBe('sing-the-second-verse');
    expect(aCall({ taken: ['sing-the-second-verse'] }).slug)
      .not.toBe('sing-the-second-verse');
  });

  it('is found by slug', () => {
    const call = aCall();
    expect(bySlugOrId([call], 'sing-the-second-verse')).toBe(call);
    expect(bySlugOrId([call], 'SING-THE-SECOND-VERSE')).toBe(call);
    expect(bySlugOrId([call], 'something-else')).toBeNull();
    expect(bySlugOrId([call], '  ')).toBeNull();
  });

  /*
   * AND BY ID, WHICH IS WHAT EVERY CALL OPENED BEFORE V-4 HAS.
   * A slug cannot look like an id, because `slugProblem` refuses
   * the underscore `camp_` carries — so the two namespaces cannot
   * collide and the order of the two lookups is a convenience.
   */
  it('is found by id, for a call that never named one', () => {
    const call = aCall();
    delete call.slug;
    expect(bySlugOrId([call], call.id)).toBe(call);
    expect(bySlugOrId([call], 'camp_nothing')).toBeNull();
  });

  it('refuses an address that is not one', () => {
    const call = aCall();
    expect(() => setSlug(call, 'Not A Slug', [])).toThrow(CampaignError);
    expect(() => setSlug(call, 'a', [])).toThrow(CampaignError);
    expect(() => setSlug(call, 'two--hyphens', [])).toThrow(CampaignError);
    expect(call.slug).toBe('sing-the-second-verse');
  });

  it('refuses one another call already answers on', () => {
    const call = aCall();
    expect(() => setSlug(call, 'taken-already', ['taken-already']))
      .toThrow(CampaignError);
    setSlug(call, 'taken-already', ['something-else']);
    expect(call.slug).toBe('taken-already');
  });

  it('takes what somebody typed in upper case', () => {
    const call = aCall();
    setSlug(call, '  Summer-Song  ', []);
    expect(call.slug).toBe('summer-song');
  });

  it('lists every address but the one being edited', () => {
    const one = aCall({ title: 'One' });
    const two = aCall({ title: 'Two' });
    expect(takenCallSlugs([one, two])).toEqual(new Set(['one', 'two']));
    expect(takenCallSlugs([one, two], one.id)).toEqual(new Set(['two']));
  });
});

describe('what appears in an index', () => {
  it('is listed by default and can be taken out', () => {
    const call = aCall();
    expect(callListed(call)).toBe(true);
    setListed(call, false);
    expect(callListed(call)).toBe(false);
    setListed(call, true);
    expect(callListed(call)).toBe(true);
  });

  /*
   * THE WHOLE OF THE SECOND JUDGING CLAUSE, and both halves in one
   * test because they are the thing that must not collapse into
   * each other: out of the index, still at its address.
   */
  it('leaves an unlisted call out of the index and at its address', () => {
    const call = aCall();
    setListed(call, false);
    expect(publicCalls([call], NOW)).toEqual([]);
    expect(bySlugOrId([call], call.slug!)).toBe(call);
  });

  it('leaves a completed call out', () => {
    const call = aCall();
    call.state = 'completed';
    expect(publicCalls([call], NOW)).toEqual([]);
    /* And it is still at its address, for whoever kept the link. */
    expect(bySlugOrId([call], call.slug!)).toBe(call);
  });

  /*
   * OPEN FIRST, SOONEST DEADLINE FIRST; THEN THE REST, NEWEST
   * FIRST. The fixture is built so the two orderings DISAGREE with
   * each other and with creation order — an index sorted by one
   * rule would put these in a different order whichever rule it
   * picked.
   */
  it('puts what is open first, by deadline, and the rest newest first', () => {
    const march = aCall({
      title: 'March', closesAt: '2027-03-01T09:00:00.000Z', createdAt: OPENED,
    });
    const friday = aCall({
      title: 'Friday', closesAt: '2026-06-05T09:00:00.000Z',
      createdAt: '2026-05-01T09:00:00.000Z',
    });
    const judged = aCall({ title: 'Judged', createdAt: '2026-04-01T09:00:00.000Z' });
    judged.state = 'judging';
    const older = aCall({ title: 'Older', createdAt: '2026-03-01T09:00:00.000Z' });
    older.state = 'judging';

    expect(publicCalls([march, judged, friday, older], NOW).map((one) => one.title))
      .toEqual(['Friday', 'March', 'Judged', 'Older']);
  });

  it('is empty where nothing was opened', () => {
    expect(publicCalls([], NOW)).toEqual([]);
  });
});

describe('how long is left', () => {
  it('is the distance to the deadline', () => {
    expect(msLeft(aCall({ closesAt: '2026-06-02T10:00:00.000Z' }), NOW))
      .toBe(3_600_000);
  });

  /* Never negative: a countdown running backwards past zero is unreadable. */
  it('is nothing once the deadline has passed', () => {
    expect(msLeft(aCall({ closesAt: '2026-06-01T10:00:00.000Z' }), NOW)).toBe(0);
  });

  it('is unknown where there is no deadline', () => {
    const call = aCall();
    call.window = { ...call.window, closesAt: undefined };
    expect(msLeft(call, NOW)).toBeNull();
    expect(msLeft(aCall(), 'not a date')).toBeNull();
  });
});

describe('what a stranger is told about a call', () => {
  /*
   * THE TRACK IS WITHHELD, which is the one thing this projection
   * exists to decide. A row carrying the performance id would let
   * a directory of competitions be read as a directory of this
   * installation's unpublished work. [D-03]
   */
  it('withholds the track and the terms', () => {
    const call = aCall();
    call.terms = [{ hash: HASH, text: 'the words', from: OPENED }];
    const row = callRow(call, NOW);
    expect(row).not.toHaveProperty('track');
    expect(row).not.toHaveProperty('terms');
    expect(JSON.stringify(row)).not.toContain('perf_one');
    expect(JSON.stringify(row)).not.toContain('the words');
  });

  it('carries the address, the instant and both answers about where it is', () => {
    const row = callRow(aCall({ closesAt: '2026-06-02T10:00:00.000Z' }), NOW);
    expect(row.at).toBe('/go/sing-the-second-verse');
    expect(row.msLeft).toBe(3_600_000);
    /*
     * AND THE TWO ANSWERS DISAGREE HERE ON PURPOSE. `state` is
     * where the organiser moved it to and `clock` is where its
     * window says it should be: an hour from a deadline whose
     * last stretch is a day, a call somebody left LIVE is
     * CLOSING. A row carrying only the first would draw *Open*
     * over a countdown with an hour on it. [V-2 `clockSays`]
     */
    expect(row.state).toBe('live');
    expect(row.clock).toBe('closing');
    expect(row.listed).toBe(true);
  });

  it('addresses by id where there is no slug', () => {
    const call = aCall();
    delete call.slug;
    expect(callRow(call, NOW).at).toBe(`/go/${call.id}`);
    expect(callRow(call, NOW)).not.toHaveProperty('slug');
  });
});

describe('the entries wall', () => {
  const call = aCall();

  it('shows only what its maker agreed may be shown', () => {
    const wall = wallOf(call, [
      entrant({
        id: 'req_yes', campaign: call.id, permits: ['entry', 'display'],
        sent: [{ id: 'sub_yes', at: '2026-06-01T12:00:00.000Z' }],
      }),
      entrant({
        id: 'req_entry_only', campaign: call.id, permits: ['entry'],
        sent: [{ id: 'sub_no', at: '2026-06-01T13:00:00.000Z' }],
      }),
      entrant({
        id: 'req_none', campaign: call.id,
        sent: [{ id: 'sub_none', at: '2026-06-01T14:00:00.000Z' }],
      }),
    ]);
    expect(wall.map((one) => one.submissionId)).toEqual(['sub_yes']);
  });

  /* And it leaves the moment they take it back. [V-3] */
  it('drops an entry that was taken back', () => {
    const withdrawn = entrant({
      id: 'req_gone', campaign: call.id, permits: ['entry', 'display'],
      withdrawn: true,
      sent: [{ id: 'sub_gone', at: '2026-06-01T12:00:00.000Z' }],
    });
    expect(wallOf(call, [withdrawn])).toEqual([]);
  });

  it('shows nothing from another call', () => {
    const elsewhere = entrant({
      id: 'req_other', campaign: 'camp_elsewhere', permits: ['entry', 'display'],
      sent: [{ id: 'sub_other', at: '2026-06-01T12:00:00.000Z' }],
    });
    expect(wallOf(call, [elsewhere])).toEqual([]);
  });

  /*
   * ONE ROW PER CAPTURE, HOWEVER MANY CAMERAS SAW IT. B-3's own
   * finding one layer down: four angles of one performance
   * arriving in the inbox as four strangers. A wall drawing them
   * as four entries would be a competition somebody appeared in
   * four times for singing once.
   */
  it('draws four angles of one capture once', () => {
    const wall = wallOf(call, [entrant({
      id: 'req_cap', campaign: call.id, permits: ['entry', 'display'],
      sent: [
        { id: 'sub_a', at: '2026-06-01T12:00:00.000Z', capture: 'cap_1' },
        { id: 'sub_b', at: '2026-06-01T12:00:00.000Z', capture: 'cap_1' },
        { id: 'sub_c', at: '2026-06-01T12:00:00.000Z', capture: 'cap_1' },
        { id: 'sub_d', at: '2026-06-01T12:00:00.000Z', capture: 'cap_1' },
      ],
    })]);
    expect(wall).toHaveLength(1);
    expect(wall[0]!.submissionId).toBe('sub_a');
  });

  /* And two separate takes from one person are two entries. */
  it('draws two takes with no capture as two', () => {
    const wall = wallOf(call, [entrant({
      id: 'req_two', campaign: call.id, permits: ['entry', 'display'],
      sent: [
        { id: 'sub_1', at: '2026-06-01T12:00:00.000Z' },
        { id: 'sub_2', at: '2026-06-01T13:00:00.000Z' },
      ],
    })]);
    expect(wall.map((one) => one.submissionId)).toEqual(['sub_1', 'sub_2']);
  });

  /*
   * ARRIVAL ORDER, so the wall does not reshuffle under somebody
   * reading it. The fixture arrives out of order on purpose: a
   * sort that did nothing would pass a fixture already in order.
   */
  it('is in arrival order whatever order the requests are read in', () => {
    const wall = wallOf(call, [
      entrant({
        id: 'req_late', campaign: call.id, permits: ['entry', 'display'],
        sent: [{ id: 'sub_late', at: '2026-06-01T18:00:00.000Z' }],
      }),
      entrant({
        id: 'req_early', campaign: call.id, permits: ['entry', 'display'],
        sent: [{ id: 'sub_early', at: '2026-06-01T08:00:00.000Z' }],
      }),
    ]);
    expect(wall.map((one) => one.submissionId)).toEqual(['sub_early', 'sub_late']);
  });

  it('carries the name the producer wrote, and nothing where they wrote none', () => {
    const [named, anonymous] = wallOf(call, [
      entrant({
        id: 'req_named', campaign: call.id, permits: ['entry', 'display'],
        participant: 'James',
        sent: [{ id: 'sub_named', at: '2026-06-01T08:00:00.000Z' }],
      }),
      entrant({
        id: 'req_anon', campaign: call.id, permits: ['entry', 'display'],
        claimed: true,
        sent: [{ id: 'sub_anon', at: '2026-06-01T09:00:00.000Z' }],
      }),
    ]);
    expect(named!.participant).toBe('James');
    expect(anonymous!.participant).toBeUndefined();
  });
});

describe('the loop, measured', () => {
  const call = aCall();

  /*
   * ALL FOUR NUMBERS DIFFERENT IN ONE FIXTURE, which is the only
   * way any of them is tested: four counts that happen to agree
   * are one count written four times, and a mutation swapping two
   * of them would survive.
   */
  it('counts entries, finishers, arrivals and arrivals who finished', () => {
    const numbers = loopNumbers(call, [
      /* Invited, finished. */
      entrant({
        id: 'req_1', campaign: call.id,
        sent: [{ id: 'sub_1', at: OPENED }],
      }),
      /* Invited, never recorded. */
      entrant({ id: 'req_2', campaign: call.id }),
      /* Arrived on their own, finished. */
      entrant({
        id: 'req_3', campaign: call.id, claimed: true,
        sent: [{ id: 'sub_3', at: OPENED }],
      }),
      /* Arrived on their own, did not. Twice. */
      entrant({ id: 'req_4', campaign: call.id, claimed: true }),
      entrant({ id: 'req_5', campaign: call.id, claimed: true }),
      /* And somebody else's call. */
      entrant({ id: 'req_6', campaign: 'camp_elsewhere', claimed: true }),
      /* And a request under no call at all. */
      entrant({ id: 'req_7' }),
    ]);
    expect(numbers).toEqual({
      entries: 5, finishers: 2, arrivals: 3, arrivalsWhoEntered: 1,
    });
  });

  it('is four zeroes for a call nobody answered', () => {
    expect(loopNumbers(call, [])).toEqual({
      entries: 0, finishers: 0, arrivals: 0, arrivalsWhoEntered: 0,
    });
  });

  /*
   * AND THERE IS NO FIFTH. Shares cannot be counted without
   * watching where a visitor came from, and this installation does
   * not — `favorites.ts` is per device and says so. A count this
   * product cannot honestly take is a count it does not print, and
   * a field that appeared here later would be the one that started
   * it. [§20]
   */
  it('reports no number it cannot honestly take', () => {
    expect(Object.keys(loopNumbers(call, []))).toEqual(
      ['entries', 'finishers', 'arrivals', 'arrivalsWhoEntered']);
  });
});
