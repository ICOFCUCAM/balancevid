import { callRow, publicCalls } from '../../src/domain/campaign.js';
import { listCampaigns } from '../../src/store/campaigns.js';
import { theAccount } from '../../src/store/accounts.js';
import { CallCard, GoFrame } from './Go.js';
import Icon from '../Icon.js';

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

  return (
    <GoFrame>
      <div className="go-head">
        <div className="go-head-row">
          <div style={{ minWidth: 0 }}>
            <h1 className="go-title">
              <Icon name="live" size={24} />
              Open calls
            </h1>
            <p className="go-lede">
              What {name} is asking for right now. Anyone can enter — no
              account, no sign-up.
            </p>
          </div>
          {calls.length > 0 && (
            <span className="go-count" data-testid="go-count">
              {calls.length === 1 ? '1 call' : `${calls.length} calls`}
            </span>
          )}
        </div>
      </div>

      <div className="go-body" data-testid="go-calls">
        {calls.length === 0 ? (
          <p className="tk-empty" data-testid="go-empty">
            Nothing is open at the moment. A call appears here when its
            organiser opens one and lists it.
          </p>
        ) : calls.map((call) => <CallCard key={call.id} call={call} />)}
      </div>
    </GoFrame>
  );
}
