import { callRow, publicCalls } from '../../src/domain/campaign.js';
import { listCampaigns } from '../../src/store/campaigns.js';
import { theAccount } from '../../src/store/accounts.js';
import { CallCard, GoFrame } from './Go.js';
import Icon from '../Icon.js';
import { NETWORK_ART } from '../tv/art.js';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Calls — BalanceVid Go',
  description: 'Open calls for takes on this BalanceVid installation.',
};

/**
 * What is open.  [GO-VIRAL V-4, §10]
 *
 * SERVER-RENDERED, LIKE THE STATION DIRECTORY AND FOR ITS REASON.
 * This page's whole job is to be found — by a crawler, by a link
 * preview, by a phone on a bad connection — and a page that
 * fetched its own API after loading would be a page all three of
 * those read as empty. [TV-NETWORK N-4]
 *
 * IT READS THE STORE RATHER THAN ITS OWN ROUTE, which is the same
 * shape `/tv/channels` has: a server page cannot round-trip to
 * itself, and `publicCalls` is the one function that decides what
 * is shown, so the page and `/api/go` cannot disagree. [D-19]
 *
 * AN EMPTY DIRECTORY SAYS SO IN A SENTENCE. A new installation has
 * no calls, and a bare heading over nothing reads as broken.
 */
export default async function GoPage() {
  const now = new Date().toISOString();
  const calls = publicCalls(await listCampaigns().catch(() => []), now)
    .map((one) => callRow(one, now));

  let name = 'BalanceVid';
  try {
    name = (await theAccount()).name || name;
  } catch {
    /* An installation that cannot read its own account still lists. */
  }

  /*
   * SOONEST TO CLOSE, FIRST.  [D-04, V-4]
   *
   * A directory of calls is read with one question — *what can
   * I still enter* — and the one with fourteen minutes left is
   * the one that stops being enterable first. `publicCalls`
   * decides WHICH are shown; this decides the order they are
   * read in, which is a question about this page.
   *
   * A CALL THAT HAS NOT OPENED GOES LAST rather than first,
   * because it is the only kind nobody can act on yet.
   */
  /*
   * WHAT CAN STILL BE ENTERED, SOONEST FIRST; then what has
   * not opened; then what has shut. The first draft put the
   * closed one at the top, because a call that has ended has
   * no time left and no time left sorted first — found in a
   * screenshot. A reader of this page is deciding what to
   * record, so the ones they cannot record for go under the
   * ones they can, in the order they stop being possible.
   */
  const rank = (one: typeof calls[number]) =>
    (one.clock === 'over' ? 2 : one.clock === 'scheduled' ? 1 : 0);
  const sorted = [...calls].sort((a, b) => rank(a) - rank(b)
    || (a.msLeft ?? Infinity) - (b.msLeft ?? Infinity)
    || a.title.localeCompare(b.title));

  return (
    <GoFrame>
      {/*
        * A BAND WITH A PICTURE BEHIND IT. The page opened on a
        * heading over a sentence over three rows, which is a
        * document. `NETWORK_ART` is the one place this
        * product's pictures are named, so swapping it is
        * editing that file. [N-4]
        */}
      <div className="go-hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src={NETWORK_ART.calls}
             style={{ objectPosition: NETWORK_ART.callsFocus }} />
        <span aria-hidden="true" className="go-hero-wash" />
        <div className="go-hero-said">
          <p className="go-kind">
            <Icon name="live" size={12} />
            Open calls
          </p>
          <h1 className="go-hero-lead">Open calls</h1>
          <p className="go-hero-under">
            What {name} is asking for right now.<br />
            Anyone can enter — no account, no sign-up.
          </p>
        </div>
        {/*
          * COUNTED, NOT CLAIMED. The design puts a stat card
          * here too; this is the one number on the page that
          * is a fact about this installation. [D-21]
          */}
        {calls.length > 0 && (
          <div className="go-hero-stat" data-testid="go-count">
            <span aria-hidden="true" className="go-hero-stat-mark">
              <Icon name="faders" size={17} />
            </span>
            <span>
              <strong>{calls.length === 1 ? '1 call' : `${calls.length} calls`}</strong>
              <span>Open for takes</span>
            </span>
          </div>
        )}
      </div>

      <div className="go-body" data-testid="go-calls">
        {sorted.length === 0 ? (
          <p className="tk-empty" data-testid="go-empty">
            Nothing is open at the moment. A call appears here when its
            organiser opens one and lists it.
          </p>
        ) : sorted.map((call) => <CallCard key={call.id} call={call} />)}
      </div>
    </GoFrame>
  );
}
