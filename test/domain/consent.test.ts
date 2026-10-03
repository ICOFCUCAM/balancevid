/**
 * What a participant was told, and what they agreed to.
 *   [GO-VIRAL V-3; Doctrine D-03, D-25]
 *
 * > **Judged on:** *"An entry with no consent record cannot be
 * > accepted into a campaign; an ordinary submission with no consent
 * > record behaves exactly as today; a withdrawal removes the entry
 * > from every public surface and leaves the audit intact; and the
 * > terms hash of a given entry still verifies after the terms text
 * > is changed for new entrants."*
 *
 * THE LAST CLAUSE IS THE ONE THAT SHAPED THE MODEL. A single
 * mutable string of terms can satisfy *new entrants see the new
 * words* or *old entries still verify*, and not both. An
 * append-only list satisfies both, and the test for it is the one
 * at the bottom of this file.
 *
 * Nothing here touches a disk. The doors are driven for real in
 * `consent-route.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import {
  CONSENT_MEANS, CONSENT_SCOPES, type ConsentRecord,
  consentFrom, consentSays, permits, withdrawConsent,
} from '../../src/domain/consent.js';
import {
  type Campaign, currentTerms, entryProblem, needsConsent, termsSigned,
} from '../../src/domain/campaign.js';
import {
  CampaignError, TERMS_LONGEST, newCampaign, setTerms, termsHashOf,
} from '../../src/domain/campaignEdit.js';

const WORDS = 'Your video may be judged and may be shown publicly.';
const HASH = termsHashOf(WORDS);
const AT = '2026-06-01T10:00:00.000Z';

function aCall(): Campaign {
  return newCampaign({
    title: 'Sing the second verse',
    track: { kind: 'performance', id: 'perf_one' },
    rules: { asks: 'Sing it outdoors' },
    window: {
      respondable: true,
      access: 'anyone',
      opensAt: '2026-06-01T09:00:00.000Z',
      closesAt: '2026-06-30T09:00:00.000Z',
    },
    now: AT,
  });
}

function agreed(...scopes: string[]): ConsentRecord {
  const record = consentFrom({ termsHash: HASH, permits: scopes }, AT);
  if (!record) throw new Error('that fixture agreed to nothing');
  return record;
}

describe('what a participant said', () => {
  /*
   * NOTHING IS INFERRED. The product knows four things somebody may
   * agree to and takes exactly the ones that were named. A word it
   * does not know is dropped rather than guessed at — when the
   * meaning is permission, the safe reading of an unknown word is
   * that it was not given.
   */
  it('takes the scopes that were named and no others', () => {
    const record = agreed('broadcast', 'entry', 'hypnosis');
    expect(record.permits).toEqual(['entry', 'broadcast']);
  });

  /*
   * AND A RECORD THAT PERMITS NOTHING IS NOT A RECORD. Somebody who
   * agrees to the display of a video they have not agreed to enter
   * has described nothing anybody can act on.
   */
  it('refuses an agreement that does not cover entering', () => {
    expect(consentFrom({ termsHash: HASH, permits: ['display'] }, AT))
      .toBeNull();
    expect(consentFrom({ termsHash: HASH, permits: [] }, AT)).toBeNull();
    expect(consentFrom({ termsHash: HASH }, AT)).toBeNull();
  });

  /*
   * THE HASH IS THE WORDS. A client that sent anything else has not
   * shown anybody the terms, so there is nothing to record.
   *
   * AT THE LENGTH AND NOT NEAR IT: sixty-three characters of hex is
   * the fixture a `{64}` written `{63}` would let through, and a
   * suite that only ever sent `'nonsense'` would never meet it.
   */
  it('refuses anything that is not a sha256', () => {
    expect(consentFrom({ termsHash: 'nonsense', permits: ['entry'] }, AT))
      .toBeNull();
    expect(consentFrom({ termsHash: HASH.slice(0, 63), permits: ['entry'] }, AT))
      .toBeNull();
    expect(consentFrom({ termsHash: `${HASH}a`, permits: ['entry'] }, AT))
      .toBeNull();
    expect(consentFrom({ termsHash: HASH.toUpperCase(), permits: ['entry'] }, AT))
      .toBeNull();
    expect(consentFrom({ termsHash: 7, permits: ['entry'] }, AT)).toBeNull();
    expect(consentFrom({ termsHash: HASH, permits: 'entry' }, AT)).toBeNull();
  });

  /* A hash with a newline around it is the hash. */
  it('takes a hash that arrived with whitespace', () => {
    const record = consentFrom(
      { termsHash: ` ${HASH}\n`, permits: ['entry'] }, AT);
    expect(record?.termsHash).toBe(HASH);
  });

  it('records when they agreed', () => {
    expect(agreed('entry').at).toBe(AT);
    expect(agreed('entry').withdrawnAt).toBeUndefined();
  });

  /* Four scopes, four sentences, and a person can act on each. */
  it('has words for every scope', () => {
    for (const scope of CONSENT_SCOPES) {
      expect(CONSENT_MEANS[scope].length).toBeGreaterThan(10);
    }
    expect(new Set(Object.values(CONSENT_MEANS)).size)
      .toBe(CONSENT_SCOPES.length);
  });
});

describe('taking it back', () => {
  /*
   * IT STOPS FUTURE USE AND UNMAKES NOTHING. `permits` is false from
   * that moment, for every scope and every caller — which is what
   * makes one predicate worth having: a withdrawal honoured by
   * three surfaces and missed by the fourth is not a withdrawal.
   */
  it('permits nothing afterwards', () => {
    const record = agreed('entry', 'display', 'broadcast');
    expect(permits(record, 'entry')).toBe(true);
    expect(permits(record, 'broadcast')).toBe(true);
    withdrawConsent(record, '2026-06-02T10:00:00.000Z');
    for (const scope of CONSENT_SCOPES) {
      expect(permits(record, scope)).toBe(false);
    }
  });

  /*
   * AND THE RECORD STILL SAYS WHAT WAS AGREED. A withdrawal that
   * deleted the consent would delete the evidence there had ever
   * been any — the opposite of an audit, and it would leave nobody
   * able to say on what basis last week's broadcast went out.
   */
  it('leaves the audit intact', () => {
    const record = agreed('entry', 'broadcast');
    withdrawConsent(record, '2026-06-02T10:00:00.000Z');
    expect(record.permits).toEqual(['entry', 'broadcast']);
    expect(record.at).toBe(AT);
    expect(record.withdrawnAt).toBe('2026-06-02T10:00:00.000Z');
  });

  /* The first one is the one that counts: the date is when they said so. */
  it('does not move the date when it is pressed twice', () => {
    const record = agreed('entry');
    withdrawConsent(record, '2026-06-02T10:00:00.000Z');
    withdrawConsent(record, '2026-06-09T10:00:00.000Z');
    expect(record.withdrawnAt).toBe('2026-06-02T10:00:00.000Z');
  });

  it('is absent from nothing at all', () => {
    expect(permits(undefined, 'entry')).toBe(false);
  });
});

describe('what to tell somebody reading a record', () => {
  it('names one', () => {
    expect(consentSays(agreed('entry'))).toBe('Agreed: may be entered in this call.');
  });

  it('joins two with and', () => {
    expect(consentSays(agreed('entry', 'display')))
      .toBe('Agreed: may be entered in this call and shown publicly.');
  });

  /* Three is where a comma appears, which is why three is tested. */
  it('commas all but the last of three', () => {
    expect(consentSays(agreed('entry', 'display', 'broadcast')))
      .toBe('Agreed: may be entered in this call, shown publicly and broadcast.');
  });

  it('says so when there is nothing, and when it was taken back', () => {
    expect(consentSays(undefined)).toBe('Nothing was agreed to.');
    const record = agreed('entry');
    withdrawConsent(record, AT);
    expect(consentSays(record)).toContain('Taken back');
    expect(consentSays(record)).toContain('already done stands');
  });
});

describe('the words a call asks entrants to agree to', () => {
  it('asks nothing until somebody writes some', () => {
    const call = aCall();
    expect(needsConsent(call)).toBe(false);
    expect(currentTerms(call)).toBeNull();
    expect(call.terms).toBeUndefined();
  });

  it('keeps the words beside their hash', () => {
    const call = aCall();
    const written = setTerms(call, WORDS, AT);
    expect(written).toEqual({ hash: HASH, text: WORDS, from: AT });
    expect(needsConsent(call)).toBe(true);
    expect(currentTerms(call)).toEqual(written);
  });

  it('trims what came out of a form', () => {
    const call = aCall();
    expect(setTerms(call, `\n  ${WORDS}  \n`, AT).text).toBe(WORDS);
  });

  it('will not accept terms nobody can read', () => {
    expect(() => setTerms(aCall(), '   \n ', AT)).toThrow(CampaignError);
  });

  /*
   * BOUNDED AT THE BOUND, because a limit is only tested at the
   * limit: a fixture of a hundred characters passes whatever the
   * number is. [T-5]
   */
  it('bounds the length', () => {
    const call = aCall();
    expect(setTerms(call, 'x'.repeat(TERMS_LONGEST), AT).text)
      .toHaveLength(TERMS_LONGEST);
    expect(setTerms(call, 'y'.repeat(TERMS_LONGEST + 1), AT).text)
      .toHaveLength(TERMS_LONGEST);
  });

  /*
   * THE SAME WORDS TWICE ARE THE SAME WORDS. Pressing save on an
   * unchanged form must not write a second entry with a later date:
   * the wording came into use when it came into use.
   */
  it('does not append the same words again', () => {
    const call = aCall();
    setTerms(call, WORDS, AT);
    const again = setTerms(call, WORDS, '2026-06-20T10:00:00.000Z');
    expect(call.terms).toHaveLength(1);
    expect(again.from).toBe(AT);
  });
});

describe('why an entry may not go into a call', () => {
  it('refuses nothing where the call asks nothing', () => {
    const call = aCall();
    expect(entryProblem(call, undefined)).toBe('');
    expect(entryProblem(call, agreed('entry'))).toBe('');
  });

  it('refuses an entry with no agreement at all', () => {
    const call = aCall();
    setTerms(call, WORDS, AT);
    expect(entryProblem(call, undefined)).toContain('agree to its terms');
  });

  it('refuses one that was taken back', () => {
    const call = aCall();
    setTerms(call, WORDS, AT);
    const record = agreed('entry');
    withdrawConsent(record, '2026-06-02T10:00:00.000Z');
    expect(entryProblem(call, record)).toBe('that agreement was taken back');
  });

  /*
   * AND ONE POINTING AT WORDS THIS CALL HAS NEVER SHOWN ANYBODY.
   * A client that invents a hash has shown nobody anything, and the
   * record would be a signature on a sealed envelope.
   */
  it('refuses a hash the call has never used', () => {
    const call = aCall();
    setTerms(call, WORDS, AT);
    const elsewhere = consentFrom(
      { termsHash: termsHashOf('some other call'), permits: ['entry'] }, AT);
    expect(entryProblem(call, elsewhere!))
      .toBe('those are not the terms of this call');
  });

  /*
   * THE CLAUSE THE WHOLE MODEL IS SHAPED BY.
   *
   * An organiser improves the wording on Tuesday. Monday's entrant
   * agreed to Monday's words and their entry must still verify —
   * and Tuesday's entrant must see Tuesday's. A single mutable
   * string can do one or the other.
   *
   * `currentTerms` IS CHECKED TOO, because a `termsSigned` that
   * simply returned the first entry would pass the line above and
   * leave new entrants agreeing to the old words.
   */
  it('still verifies an old entry after the words are changed', () => {
    const call = aCall();
    setTerms(call, WORDS, AT);
    const monday = agreed('entry', 'display');

    const LATER = 'Your video may be judged, shown publicly, and clipped.';
    setTerms(call, LATER, '2026-06-10T10:00:00.000Z');

    expect(call.terms).toHaveLength(2);
    expect(currentTerms(call)!.text).toBe(LATER);
    expect(termsSigned(call, HASH)!.text).toBe(WORDS);
    expect(entryProblem(call, monday)).toBe('');

    const tuesday = consentFrom(
      { termsHash: termsHashOf(LATER), permits: ['entry'] },
      '2026-06-11T10:00:00.000Z');
    expect(entryProblem(call, tuesday!)).toBe('');
  });
});
