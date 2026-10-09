/**
 * An operations desk, and the audit trail nothing had ever read.
 *   [Doctrine §19, D-04, D-13, D-18, D-19, D-21; GO-VIRAL V-8]
 *
 * *"We would need an admin in BalanceVid Admin where we can
 * perform other functions for BalanceVid, deleting and others
 * would be part of the functions."*
 *
 * WHAT WAS MISSING WAS NOT POWER. Delete, publish and unpublish
 * all existed as routes for all three kinds. What never existed
 * is a page that says WHAT THERE IS — so an operator with
 * seventeen channels had to open seventeen pages, and the control
 * room's advice at 111% of real time, *"fewer channels"*, was
 * addressed to somebody with no inventory to choose from.
 *
 * AND THE AUDIT TRAIL IS THE SIXTH UNREACHABLE CAPABILITY FOUND
 * IN THIS SESSION, after `RotationEntry.loop`, `paceSays`,
 * `channel.filler`, `deadAir()` and `DELETE /api/channels/<id>`.
 * `readAudit` and `readChannelAudit` are both exported, both
 * correct, appended to on every channel edit and every lost feed
 * — and called by no surface in this product. `repository.ts`
 * writes the word *accountability* in the line above `audit()`.
 * A record nobody can read is not accountability. [D-13]
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  type Holding, doingNow, ledgerSays, mayRetire, maySuspend, orderHoldings,
} from '../../src/domain/operations.js';
import { mayBePublic } from '../../src/auth/policy.js';

const row = (over: Partial<Holding> = {}): Holding => ({
  kind: 'channel', id: 'chan_1', name: 'One', doing: 'draft',
  bytes: 0, at: '2026-10-07T09:00:00.000Z', changes: 0, ...over,
});

describe('what a record is doing', () => {
  /*
   * DECIDED ONCE, in the vocabulary three surfaces share. Writing
   * this test a fourth time in a page component is how two parts
   * of one product come to disagree about whether something is on
   * air. [C-31]
   */
  it('is live while the broadcast has not ended', () => {
    expect(doingNow({ live: { phase: 'on_air' } })).toBe('live');
    expect(doingNow({ live: { phase: 'armed' } })).toBe('live');
    expect(doingNow({ live: { phase: 'ended' } })).toBe('draft');
  });

  it('is published when it has a publication nobody withdrew', () => {
    expect(doingNow({ publication: {} })).toBe('published');
    expect(doingNow({ publication: { unpublishedAt: 'then' } })).toBe('draft');
  });

  /* On air outranks published: a live channel is both, and the
     one that matters to somebody about to act is the first. */
  it('says live even when it is also published', () => {
    expect(doingNow({ live: { phase: 'on_air' }, publication: {} })).toBe('live');
  });

  it('is a draft when it is neither', () => {
    expect(doingNow({})).toBe('draft');
  });
});

describe('the order the ledger is read in', () => {
  /*
   * WHAT IS ON AIR FIRST, because the one row that can be hurting
   * somebody right now must not be below the fold.
   */
  it('puts what is on air at the top', () => {
    const ordered = orderHoldings([
      row({ id: 'a', doing: 'draft', bytes: 9e9 }),
      row({ id: 'b', doing: 'live', bytes: 1 }),
      row({ id: 'c', doing: 'published', bytes: 5e9 }),
    ]);
    expect(ordered.map((one) => one.id)).toEqual(['b', 'c', 'a']);
  });

  /*
   * AND THEN BY WEIGHT, because this ledger's first job is to
   * answer "what is costing me" and an alphabetical list answers
   * that for nobody.
   */
  it('puts the heaviest first within a state', () => {
    const ordered = orderHoldings([
      row({ id: 'small', doing: 'published', bytes: 1e6 }),
      row({ id: 'big', doing: 'published', bytes: 9e9 }),
    ]);
    expect(ordered.map((one) => one.id)).toEqual(['big', 'small']);
  });

  /* Stable between two reads of an unchanged installation. */
  it('breaks ties by name rather than by luck', () => {
    const ordered = orderHoldings([
      row({ id: 'z', name: 'Zebra', bytes: 10 }),
      row({ id: 'a', name: 'Apple', bytes: 10 }),
    ]);
    expect(ordered.map((one) => one.name)).toEqual(['Apple', 'Zebra']);
  });

  it('does not mutate what it was given', () => {
    const given = [row({ id: 'a', doing: 'draft' }), row({ id: 'b', doing: 'live' })];
    orderHoldings(given);
    expect(given.map((one) => one.id)).toEqual(['a', 'b']);
  });
});

describe('what the installation adds up to', () => {
  it('counts the things, the weight, and what is on air', () => {
    const says = ledgerSays([
      row({ id: 'a', doing: 'live', bytes: 2e9 }),
      row({ id: 'b', doing: 'published', bytes: 3e9 }),
      row({ id: 'c', doing: 'draft', bytes: 1e8 }),
    ]);
    expect(says).toMatch(/3 things/);
    expect(says).toMatch(/5\.1 GB/);
    expect(says).toMatch(/1 on air/);
    expect(says).toMatch(/1 published/);
  });

  /* Nothing on air is not a line saying "0 on air" — a desk that
     reports every zero is a desk with nothing legible on it. */
  it('leaves out what there is none of', () => {
    const says = ledgerSays([row({ doing: 'draft', bytes: 1e6 })]);
    expect(says).not.toMatch(/on air/);
    expect(says).not.toMatch(/published/);
    expect(says).toMatch(/1 thing\b/);
  });

  it('says so plainly when there is nothing', () => {
    expect(ledgerSays([])).toMatch(/Nothing has been made here yet/);
  });
});

describe('what may be done from a list', () => {
  /*
   * WHAT IS ON AIR IS NOT DELETED FROM A TABLE — not because it
   * cannot be done, but because that decision belongs in the room
   * where the words IT IS ON AIR RIGHT NOW are on the screen.
   */
  it('refuses to retire something that is on air, and says why', () => {
    const { may, because } = mayRetire(row({ doing: 'live' }));
    expect(may).toBe(false);
    expect(because).toMatch(/on air/);
    expect(because).toMatch(/its own room/);
  });

  it('and allows it otherwise', () => {
    expect(mayRetire(row({ doing: 'draft' })).may).toBe(true);
    expect(mayRetire(row({ doing: 'published' })).may).toBe(true);
  });

  /*
   * SUSPEND IS `unpublish`, NOT A NEW CONCEPT. A second mechanism
   * doing something subtly different would be two switches for
   * one light. So there is nothing to suspend on a draft.
   */
  it('refuses to suspend a draft, because nothing is public', () => {
    const { may, because } = maySuspend(row({ doing: 'draft' }));
    expect(may).toBe(false);
    expect(because).toMatch(/never published/);
  });

  it('and allows it for anything the public can reach', () => {
    expect(maySuspend(row({ doing: 'published' })).may).toBe(true);
    expect(maySuspend(row({ doing: 'live' })).may).toBe(true);
  });

  /* The refusal is a sentence in both cases — a control greyed
     for a reason nobody states is a bug report waiting. [D-21] */
  it('never refuses silently', () => {
    for (const one of [row({ doing: 'live' }), row({ doing: 'draft' })]) {
      const said = [mayRetire(one), maySuspend(one)]
        .filter((answer) => !answer.may);
      for (const answer of said) expect(answer.because.length).toBeGreaterThan(20);
    }
  });
});

/* ------------------------------------------------------------------ *
 *  And the desk itself.
 * ------------------------------------------------------------------ */

describe('the operations desk', () => {
  const bare = (path: string) => readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const ADMIN = bare('app/admin/Admin.tsx');
  const PAGE = bare('app/admin/page.tsx');
  const RAIL = bare('app/Rail.tsx');
  const HOLDINGS = bare('src/store/holdings.ts');

  /*
   * A PAGE NOTHING LINKS TO IS THE FAULT THIS WHOLE FILE IS
   * ABOUT, committed again. [D-13]
   */
  it('is reachable from the rail', () => {
    expect(RAIL).toMatch(/href="\/admin"/);
  });

  /*
   * AND IT IS NOT PUBLIC. This page can delete a channel. The
   * policy is an allow-list, so the correct answer is that it was
   * never added to it — asserted here because the cost of being
   * wrong is a stranger with a delete button. [V-8, D-21]
   */
  it('is not reachable by a stranger, by any method', () => {
    for (const method of ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE']) {
      expect(mayBePublic('/admin', method), method).toBe(false);
    }
  });

  /*
   * IT READS THE AUDIT TRAIL — the first thing in this product
   * ever to do so.
   */
  it('reads the audit trail that nothing had read', () => {
    expect(HOLDINGS).toMatch(/readChannelAudit\(one\.id\)/);
    expect(HOLDINGS).toMatch(/readAudit\(one\.id\)/);
    expect(ADMIN).toMatch(/\{one\.changes \|\| '—'\}/);
  });

  /*
   * AND IT ACTS THROUGH THE ROUTES THAT ALREADY EXISTED. A second
   * way to delete a channel would be the thing this product keeps
   * being told not to build. [D-19]
   */
  it('acts through the existing routes, not new ones', () => {
    expect(ADMIN).toMatch(/\$\{where\.api\}\/\$\{holding\.id\}`, \{ method: 'DELETE' \}/);
    expect(ADMIN).toMatch(/action: 'unpublish'/);
    /* And no admin-only API was invented to do it. */
    expect(ADMIN).not.toMatch(/\/api\/admin/);
  });

  /* Opening it changes nothing: it runs over a live volume. */
  it('writes nothing when it is opened', () => {
    expect(HOLDINGS).not.toMatch(/writeFile|appendFile|rename|mkdir|rm\(/);
    expect(PAGE).not.toMatch(/writeFile|appendFile|mutate/);
  });

  /*
   * AND IT SAYS WHAT IT WILL NOT DO. An operator looking for
   * "pause" must find out on the page that it does not exist and
   * why, rather than concluding the product is broken. [D-21]
   */
  it('says on the page why there is no pause', () => {
    expect(ADMIN).toMatch(/cannot be paused/);
    expect(ADMIN).toMatch(/Suspend\s+stops the public link/);
  });
});
