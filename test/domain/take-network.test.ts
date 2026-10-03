/**
 * One device, many installations, and the network among them.
 *   [GO-VIRAL V-8, claims one and three; TAKE-PLATFORM P16, P24]
 *
 * > *"A self-hosted installation with the network's origin
 * > unreachable loses nothing of its own."*
 *
 * > *"Entering a network campaign is the ordinary Take protocol,
 * > outbound, against the network's origin."*
 *
 * BOTH CLAIMS ARE ABOUT ONE FUNCTION, which is why they are in
 * one file. `homeFrom` is everything the Take App knows: what the
 * installation that served the page said, and what each remembered
 * installation said when asked the same public question. There is
 * no other channel, and that absence is the architecture.
 *
 * THE MERGE USED TO BE INSIDE A `useEffect`, where *what happens
 * when the network is down* could only be asked by rendering a
 * page and stubbing a fetch. It is a function now, so the
 * question is a sentence. [D-19]
 */

import { describe, expect, it } from 'vitest';

import { type CallRow, callRow } from '../../src/domain/campaign.js';
import { newCampaign, begin, setListed } from '../../src/domain/campaignEdit.js';
import type { Connection } from '../../shared/src/connections.js';
import { type Answer, type Row, homeFrom, linkTo } from '../../app/take/home.js';
import { askInstance } from '../../app/take/connections.js';

const NOW = '2026-05-22T10:00:00.000Z';
const CLOSES = '2026-05-28T10:00:00.000Z';
const LATER = '2026-06-28T10:00:00.000Z';

const HERE = { name: 'Redemption Records', origin: 'https://studio.example' };
const NETWORK = { name: 'BalanceVid', origin: 'https://go.balancevid.com' };

function connection(origin: string): Connection {
  return { origin, name: 'somewhere', addedAt: NOW };
}

/** A call, made the way the installation that owns it makes one. */
function made(title: string, closesAt = CLOSES): CallRow {
  const one = newCampaign({
    title,
    track: { kind: 'performance', id: 'perf_one' },
    rules: { asks: 'Sing the second verse' },
    window: { respondable: true, access: 'anyone', closesAt },
    now: '2026-05-20T10:00:00.000Z',
  });
  setListed(one, true);
  begin(one, NOW);
  return callRow(one, NOW);
}

function row(id: string, publishedAt: string): Row {
  return {
    kind: 'music', id, title: id, publishedAt, respondable: true,
    access: 'anyone', state: 'open', watch: `/p/${id}/watch`,
    openToAnyone: true,
  };
}

function answered(
  instance: { name: string; origin: string },
  rows: Row[] = [], calls: CallRow[] = [],
): Answer {
  return { instance, rows, calls };
}

describe('with the network unreachable', () => {
  /*
   * THE FIRST CLAIM, STATED THE WAY IT IS JUDGED. Everything the
   * installation that served the page offers is there, in the
   * same order, with the network dead.
   */
  it('loses nothing of its own', () => {
    const mine = { instance: HERE, participate: [row('perf_a', NOW)], calls: [made('Spring')] };
    const alone = homeFrom(mine);
    const withNetwork = homeFrom(mine, [
      { connection: connection(NETWORK.origin), answer: null },
    ]);
    expect(withNetwork.rows).toEqual(alone.rows);
    expect(withNetwork.calls).toEqual(alone.calls);
    expect(alone.rows).toHaveLength(1);
    expect(alone.calls).toHaveLength(1);
  });

  /*
   * AND IT SAYS SO RATHER THAN SAYING NOTHING. A connection that
   * silently disappears is a person wondering whether they
   * imagined adding it. [U-19, P20]
   */
  it('says which one did not answer', () => {
    const home = homeFrom({ instance: HERE }, [
      { connection: connection(NETWORK.origin), answer: null },
      { connection: connection('https://friend.example'),
        answer: answered({ name: 'Friend', origin: 'https://friend.example' }) },
    ]);
    expect(home.asleep).toEqual([NETWORK.origin]);
  });

  /*
   * NOT EVEN A NONSENSE ANSWER CAN TAKE SOMETHING LOCAL AWAY. The
   * local half is built whole before any other is looked at, so
   * there is no filter a remote row could fall through and take a
   * local one with it.
   */
  it('keeps what is local when a remote answer is rubbish', () => {
    const rubbish = answered(
      { name: '', origin: '' },
      [undefined as unknown as Row].filter(Boolean),
      [{} as CallRow],
    );
    const home = homeFrom(
      { instance: HERE, participate: [row('perf_a', NOW)], calls: [made('Spring')] },
      [{ connection: connection(NETWORK.origin), answer: rubbish }]);
    expect(home.rows.map((one) => one.id)).toContain('perf_a');
    expect(home.calls.some((one) => one.title === 'Spring')).toBe(true);
  });
});

describe('a call on another installation', () => {
  /*
   * THE THIRD CLAIM. A remote call's link is a WHOLE URL against
   * the origin this device actually reached, so pressing it lands
   * the person on that installation's own `/go` page, where the
   * ordinary Take protocol takes over. Nothing is proxied and this
   * installation is never told they went. [D-25]
   */
  it('is entered on that installation, by an ordinary link', () => {
    const theirs = made('Nationwide');
    const home = homeFrom({ instance: HERE }, [
      { connection: connection(NETWORK.origin), answer: answered(NETWORK, [], [theirs]) },
    ]);
    expect(home.calls).toHaveLength(1);
    expect(home.calls[0]!.at).toBe(`${NETWORK.origin}${theirs.at}`);
    expect(home.calls[0]!.from).toEqual(NETWORK);
  });

  /*
   * AND A LOCAL ONE KEEPS ITS PATH, which is not a cosmetic
   * difference: a remote call drawn as `/go/spring-song` resolves
   * against whatever page is showing it, and sends somebody to the
   * WRONG INSTALLATION'S call of that name.
   */
  it('is told apart from one of this installation\'s own', () => {
    const ours = made('Spring');
    const theirs = made('Nationwide');
    const home = homeFrom({ instance: HERE, calls: [ours] }, [
      { connection: connection(NETWORK.origin), answer: answered(NETWORK, [], [theirs]) },
    ]);
    const local = home.calls.find((one) => one.title === 'Spring')!;
    expect(local.at).toBe(ours.at);
    expect(local.at.startsWith('/')).toBe(true);
    expect(local.from).toEqual(HERE);
  });

  /*
   * THE ORIGIN IS THE ONE THIS DEVICE REACHED AND NEVER ONE AN
   * ANSWER NAMED. `instanceFrom` already refuses to take an
   * installation's word for where it is; this is the other end of
   * that rule — the link is built from what the merge was given.
   */
  it('is linked against the origin that answered, not one it claimed', () => {
    const theirs = made('Nationwide');
    const home = homeFrom({ instance: HERE }, [{
      connection: connection(NETWORK.origin),
      /* An answer that has already been through `instanceFrom`
         carries the reached origin, whatever it said. */
      answer: answered(NETWORK, [], [theirs]),
    }]);
    expect(home.calls[0]!.at.startsWith(NETWORK.origin)).toBe(true);
    expect(home.calls[0]!.at).not.toContain('evil');
  });

  /* The two halves of the one link rule, on their own. */
  it('builds a link from an origin only when there is one', () => {
    expect(linkTo('/go/spring', NETWORK.origin))
      .toBe(`${NETWORK.origin}/go/spring`);
    expect(linkTo('/go/spring')).toBe('/go/spring');
    expect(linkTo('/go/spring', '')).toBe('/go/spring');
  });
});

describe('asking an installation', () => {
  /*
   * THE FUNCTION THAT DROPPED THE CALLS FOR FOUR STAGES.
   * `/api/participate` has carried them since V-4 and this threw
   * them away, so no Take App home has ever shown one — on any
   * installation, including the one serving the page. A merge
   * tested on its own could not have caught it, because the merge
   * was never handed any. [GO-VIRAL V-4, V-8]
   */
  it('carries the calls as well as the rows', async () => {
    const theirs = made('Nationwide');
    const sent: string[] = [];
    const answer = await askInstance(NETWORK.origin, (async (url: string) => {
      sent.push(String(url));
      return {
        ok: true,
        json: async () => ({
          instance: { name: 'BalanceVid', origin: 'https://somewhere.else' },
          participate: [row('perf_a', NOW)],
          calls: [theirs],
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch);
    expect(sent).toEqual([`${NETWORK.origin}/api/participate`]);
    expect(answer!.calls.map((one) => one.title)).toEqual(['Nationwide']);
    expect(answer!.rows.map((one) => one.id)).toEqual(['perf_a']);
    /* And the origin is the one reached, never the one claimed. */
    expect(answer!.instance.origin).toBe(NETWORK.origin);
  });

  /* An installation with nothing open answers an empty list, not nothing. */
  it('answers an empty list when there is nothing to enter', async () => {
    const answer = await askInstance(NETWORK.origin, (async () => ({
      ok: true,
      json: async () => ({ instance: { name: 'BalanceVid' } }),
    } as unknown as Response)) as unknown as typeof fetch);
    expect(answer!.calls).toEqual([]);
    expect(answer!.rows).toEqual([]);
  });

  /* And one that is asleep is nothing at all, which is what the
     merge turns into a line saying so. */
  it('is nothing when the installation does not answer', async () => {
    const refused = await askInstance(NETWORK.origin, (async () => {
      throw new Error('unreachable');
    }) as unknown as typeof fetch);
    expect(refused).toBeNull();
    const notOk = await askInstance(NETWORK.origin, (async () => ({
      ok: false, json: async () => ({}),
    } as unknown as Response)) as unknown as typeof fetch);
    expect(notOk).toBeNull();
  });
});

describe('the merged list', () => {
  /*
   * THREE SORTED LISTS CONCATENATED ARE NOT A SORTED LIST, which
   * is the whole reason the order is done again here: a person
   * with three connections would otherwise see every call from
   * the first before the one closing in an hour on the third.
   */
  it('puts what is open first, soonest deadline first', () => {
    const soon = made('Soon', '2026-05-23T10:00:00.000Z');
    const later = made('Later', LATER);
    /*
     * THE SHUT ONE HAS THE EARLIEST DEADLINE OF THE THREE, which
     * is what makes this a test of *open first* rather than of
     * the sort beneath it. A fixture whose closed call also
     * closes last comes out in the same order either way. [C-49]
     */
    const shut = callRow(
      (() => {
        const one = newCampaign({
          title: 'Done',
          track: { kind: 'performance', id: 'perf_one' },
          rules: { asks: 'x' },
          window: { respondable: true, access: 'anyone', closesAt: '2026-05-21T10:00:00.000Z' },
          now: '2026-05-20T10:00:00.000Z',
        });
        setListed(one, true);
        return one;
      })(), NOW);
    expect(shut.open).toBe(false);
    expect(shut.closesAt! < soon.closesAt!).toBe(true);

    const home = homeFrom({ instance: HERE, calls: [later, shut] }, [
      { connection: connection(NETWORK.origin), answer: answered(NETWORK, [], [soon]) },
    ]);
    expect(home.calls.map((one) => one.title)).toEqual(['Soon', 'Later', 'Done']);
  });

  /*
   * `open` IS THE SERVER'S ANSWER AND NOT THE CLIENT'S. Three
   * clients re-deriving it from `state` and `clock` is three
   * readings, and the first one to get it wrong offers somebody a
   * call that will refuse them. [D-19]
   */
  it('takes whether a call is open from the installation running it', () => {
    const one = made('Spring');
    expect(one.open).toBe(true);
    /* And `takingEntries` is what answered it: a call nobody has
       opened is shut however open its window is. */
    const unopened = newCampaign({
      title: 'Spring',
      track: { kind: 'performance', id: 'perf_one' },
      rules: { asks: 'x' },
      window: { respondable: true, access: 'anyone', closesAt: LATER },
      now: '2026-05-20T10:00:00.000Z',
    });
    expect(callRow(unopened, NOW).open).toBe(false);

    /*
     * AND THE WINDOW IS THE OTHER HALF, WHICH THE STATE ALONE
     * CANNOT ANSWER. *"A call in LIVE whose window has closed is
     * shut too, which is the ordinary case: nobody presses a
     * button at midnight."* A client reading `state === 'live'`
     * would offer somebody a call that shut last night.
     */
    const past = made('Spring', '2026-05-23T10:00:00.000Z');
    expect(past.open).toBe(true);
    const ran = newCampaign({
      title: 'Spring',
      track: { kind: 'performance', id: 'perf_one' },
      rules: { asks: 'x' },
      window: { respondable: true, access: 'anyone', closesAt: '2026-05-23T10:00:00.000Z' },
      now: '2026-05-20T10:00:00.000Z',
    });
    begin(ran, NOW);
    expect(ran.state).toBe('live');
    expect(callRow(ran, '2026-05-24T10:00:00.000Z').open).toBe(false);
  });

  /* Rows stay newest first, which is what they were before. */
  it('keeps the listing newest first across installations', () => {
    const home = homeFrom(
      { instance: HERE, participate: [row('old', '2026-01-01T00:00:00.000Z')] },
      [{ connection: connection(NETWORK.origin),
        answer: answered(NETWORK, [row('new', '2026-05-01T00:00:00.000Z')]) }]);
    expect(home.rows.map((one) => one.id)).toEqual(['new', 'old']);
  });

  /* And every row says whose it is, including this installation's. */
  it('says which installation each thing came from', () => {
    const home = homeFrom(
      { instance: HERE, participate: [row('mine', NOW)], calls: [made('Spring')] },
      [{ connection: connection(NETWORK.origin),
        answer: answered(NETWORK, [row('theirs', NOW)], [made('Nationwide')]) }]);
    for (const one of [...home.rows, ...home.calls]) {
      expect(one.from, JSON.stringify(one)).toBeDefined();
    }
    expect(home.rows.find((one) => one.id === 'mine')!.from).toEqual(HERE);
    expect(home.rows.find((one) => one.id === 'theirs')!.from).toEqual(NETWORK);
  });

  /* An installation that said nothing about itself tags nothing. */
  it('leaves the label off when the local answer had none', () => {
    const home = homeFrom({ participate: [row('mine', NOW)] });
    expect(home.rows[0]!.from).toBeUndefined();
  });
});
