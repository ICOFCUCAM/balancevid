/**
 * Setting availability, and reading it back.
 *   [TAKE-PLATFORM P8, P10, U5, P24, PART FIVE; U-31, D-03, D-19, U-19]
 *
 * The model landed in #27; this is the pair it was built for — the
 * control that SETS it and the listing that READS it.
 *
 * TWO THINGS WERE UNREACHABLE BEFORE THIS. `publishPerformance` wrote
 * `respondable: false` as a constant, so "Available for Takes" was not a
 * setting a producer could reach — and the panel said so, in a sentence
 * that was true about a decision nobody had made: *"Nobody can answer it
 * — this is a performance, not an argument."* And a conversation's
 * publish panel had one checkbox answering three questions, two of them
 * silently.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { availabilityFrom } from '../../src/domain/availability.js';
import { publishPerformance } from '../../src/domain/performanceEdit.js';
import type { Performance } from '../../src/domain/performance.js';

const ROOT = join(import.meta.dirname, '..', '..');
const code = (file: string) => readFileSync(join(ROOT, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*/gm, '');

const FIELDS = code('app/AvailabilityFields.tsx');
const STUDIO_TWO = code('app/p/[id]/PublishPanel.tsx');
const STUDIO_ONE = code('app/c/[id]/PublishPanel.tsx');
const LIST = code('app/api/participate/route.ts');
const POLICY = code('src/auth/policy.ts');

/** The least a performance needs to be publishable. */
function song(): Performance {
  return {
    schemaVersion: 3,
    id: 'perf_test',
    title: 'A song',
    master: { assetId: 'asset_x', title: 'A song', class: 'own' },
    takes: [],
    scenes: [{ fromSample: 0, toSample: 48_000, takeId: 'take_a' }],
  } as unknown as Performance;
}

describe('a song can be made available for takes', () => {
  /*
   * IT COULD NOT BEFORE. `respondable: false` was written into
   * `publishPerformance` with nothing able to change it, which made
   * the whole Studio Two → Take App relationship unreachable.
   */
  it('publishes open when the producer asks for it', () => {
    const one = song();
    publishPerformance(one, {
      planHash: 'h', publishedAt: '2026-01-01T00:00:00.000Z',
      availability: { respondable: true, listed: true, access: 'invited' },
    });
    expect(one.publication?.respondable).toBe(true);
    expect(one.publication?.access).toBe('invited');
  });

  /*
   * AND THE DEFAULT IS STILL CLOSED. Publishing a master has always
   * meant "anyone with the link can watch this" and must go on meaning
   * only that: opening a song to takes is a second decision.
   */
  it('publishes closed when nobody asked', () => {
    const one = song();
    publishPerformance(one, { planHash: 'h', publishedAt: '2026-01-01T00:00:00.000Z' });
    expect(one.publication?.respondable).toBe(false);
    expect(one.publication?.access).toBeUndefined();
  });

  /*
   * ACCESS IS NOT STORED WHERE IT MEANS NOTHING — the author's two
   * em-dashes made durable. `accessOf` refuses to report a policy on a
   * closed item, and this refuses to keep one, so the two cannot drift.
   */
  it('keeps no access policy on a song nobody may take', () => {
    const one = song();
    publishPerformance(one, {
      planHash: 'h', publishedAt: '2026-01-01T00:00:00.000Z',
      availability: { respondable: false, access: 'anyone' },
    });
    expect(one.publication?.access).toBeUndefined();
  });

  /* Listed is the common case, so only its absence is written down. */
  it('writes listed only when it is false', () => {
    const open = song();
    publishPerformance(open, {
      planHash: 'h', publishedAt: '2026-01-01T00:00:00.000Z',
      availability: { respondable: true, listed: true },
    });
    expect(open.publication?.listed).toBeUndefined();

    const hidden = song();
    publishPerformance(hidden, {
      planHash: 'h', publishedAt: '2026-01-01T00:00:00.000Z',
      availability: { respondable: true, listed: false },
    });
    expect(hidden.publication?.listed).toBe(false);
  });
});

describe('what a publish request is allowed to say', () => {
  /*
   * AN UNKNOWN POLICY IS THE NARROWEST ONE, and this is the opposite
   * of how `qualityFor` resolves a word it does not know — deliberately.
   * A stale preset falls back to a picture nobody minded; a stale
   * ACCESS word falling back to `anyone` would publish somebody's song
   * to the world because a field was misspelled. Where the meaning is
   * permission, the safe direction is closed.
   */
  it('treats an access word it does not know as the narrowest', () => {
    expect(availabilityFrom({ respondable: true, access: 'everyone' }).access)
      .toBe('invited');
    expect(availabilityFrom({ respondable: true, access: 'public' }).access)
      .toBe('invited');
    expect(availabilityFrom({ respondable: true, access: 'constructor' }).access)
      .toBe('invited');
  });

  /* An absent policy is the default, which is what U-31 already says. */
  it('uses the default when none was given', () => {
    expect(availabilityFrom({ respondable: true }).access).toBe('anyone');
  });

  /* Anything but an explicit true is closed: a missing field must not
     open a song, and neither must the string "true". */
  it('opens nothing without an explicit true', () => {
    for (const value of [undefined, null, 'true', 1, {}, []]) {
      expect(availabilityFrom({ respondable: value }).respondable).toBe(false);
    }
  });

  /* And listed defaults on, because everything published already is. */
  it('lists unless told otherwise', () => {
    expect(availabilityFrom({}).listed).toBe(true);
    expect(availabilityFrom({ listed: false }).listed).toBe(false);
  });

  /* No policy is carried on something closed, at the boundary too. */
  it('carries no policy on a closed item', () => {
    expect(availabilityFrom({ respondable: false, access: 'anyone' }).access)
      .toBeUndefined();
  });
});

describe('the control', () => {
  /*
   * ONE DEFINITION FOR EVERY SURFACE THAT PUBLISHES. A conversation, a
   * song and a programme mean the same thing by these three, and a
   * second copy is how two surfaces come to disagree about who is
   * allowed in. [D-19]
   */
  it('is defined once and used by both panels', () => {
    const defining = ['app/AvailabilityFields.tsx', 'app/p/[id]/PublishPanel.tsx',
      'app/c/[id]/PublishPanel.tsx']
      .filter((file) => /export default function AvailabilityFields/.test(code(file)));
    expect(defining).toEqual(['app/AvailabilityFields.tsx']);
    expect(STUDIO_TWO).toMatch(/<AvailabilityFields/);
    expect(STUDIO_ONE).toMatch(/<AvailabilityFields/);
  });

  /*
   * THE ACCESS ROW IS ABSENT, NOT DIMMED, when nothing may be sent —
   * a control that cannot do anything looks like a fault. [U-19]
   */
  it('hides the access menu where nothing may be sent', () => {
    expect(FIELDS).toMatch(/\{respondable && \(/);
  });

  /*
   * AND IT SAYS THE WHOLE THING IN ONE SENTENCE, from the same
   * function everything else reads — so the panel cannot describe a
   * state the model does not have.
   */
  it('describes the combination from the model, not its own words', () => {
    expect(FIELDS).toMatch(/describeAvailability\(value\)/);
    expect(FIELDS).not.toMatch(/'Nobody can find this/);
  });

  /*
   * AND SAYS IT ONCE. A screenshot caught the first version printing
   * the access explanation as a line of its own directly above the
   * summary: "Only the people you send an invitation to." then
   * "Nobody can find this. Only the people you invite can take part."
   * Two sentences saying nearly the same thing, and only the summary
   * covers discovery as well. The explanation moved to the control.
   */
  it('does not print the access explanation beside the summary', () => {
    expect(FIELDS).not.toMatch(/<span[^>]*>\s*\{TAKE_ACCESS_MEANS/);
    expect(FIELDS).toMatch(/title=\{TAKE_ACCESS_MEANS\[value\.access \?\? 'anyone'\]\}/);
    /* One sentence of summary on screen, and it is the model's. */
    const shown = FIELDS.match(/\{describeAvailability\(value\)\}/g);
    expect(shown).toHaveLength(1);
  });

  /*
   * THE NOUN IS A PROP. Asking a musician whether anyone may "respond
   * to" their song is the wrong verb for the right question.
   */
  it('is told what the thing is called', () => {
    expect(FIELDS).toMatch(/\{noun\}/);
    expect(STUDIO_TWO).toMatch(/noun="song"/);
    expect(STUDIO_ONE).toMatch(/noun="conversation"/);
  });

  /*
   * AND THE SENTENCE THAT WAS ABOUT TO BECOME A LIE IS GONE. Studio
   * Two said "Nobody can answer it — this is a performance, not an
   * argument", which was true only because `respondable` was a
   * constant. The moment a song can be taken, it is false.
   */
  it('no longer claims a performance cannot be answered', () => {
    expect(STUDIO_TWO).not.toMatch(/not an argument/);
    expect(STUDIO_TWO).toMatch(/describeAvailability\(performance\.publication\)/);
  });
});

describe('the listing', () => {
  /*
   * ONE QUERY, NOT THREE SECTIONS. Music, Video and Online TV are this
   * list filtered by kind. Three endpoints would be the mistake the
   * timeline brief already named. [D-19]
   */
  it('answers for all three kinds from one route', () => {
    expect(LIST).toMatch(/kind: 'music'/);
    expect(LIST).toMatch(/kind: 'video'/);
    expect(LIST).toMatch(/kind: 'programme'/);
  });

  /*
   * THREE CONDITIONS, ALL THE AUTHOR'S OWN DECISION. Published, not
   * withdrawn, and listed. The existence of a draft is private. [D-03]
   */
  it('lists nothing unpublished, withdrawn or unlisted', () => {
    const guards = LIST.match(/if \(!publication \|\| publication\.unpublishedAt\) continue;/g);
    expect(guards).toHaveLength(3);
    const listed = LIST.match(/if \(!isListed\(publication\)\) continue;/g);
    expect(listed).toHaveLength(3);
  });

  /*
   * AND IT READS THE PREDICATE THAT ALREADY EXISTED for a
   * conversation rather than a second reading of the same question.
   */
  it('uses isRespondable for a conversation', () => {
    expect(LIST).toMatch(/isRespondable\(conversation\)/);
  });

  /*
   * A ROW SAYS WHETHER SOMEBODY ARRIVING WITH NOTHING MAY TAKE PART,
   * because that is the only question a browsing surface can answer
   * for itself — anything narrower needs a link or an invitation, and
   * a button that will refuse is worse than no button. [U-19]
   */
  it('says whether a browser can act on it', () => {
    expect(LIST).toMatch(/openToAnyone: maySubmit\(publication, 'anyone'\)/);
  });

  /* Same-origin, always: the origin is never written into a record. [T14] */
  it('points at this installation and no other', () => {
    expect(LIST).toMatch(/watch: `\/p\/\$\{performance\.id\}\/watch`/);
    expect(LIST).not.toMatch(/https?:\/\//);
  });

  /*
   * AND IT IS REACHABLE WITHOUT AN ACCOUNT, which is the point: a
   * person browsing for a song to sing on has none here by
   * construction, and a discovery surface behind a session is one only
   * the owner can discover anything on.
   */
  it('is public', () => {
    expect(POLICY).toMatch(/'\/api\/participate'/);
  });
});
