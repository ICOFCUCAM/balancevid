import {
  callListed, campaignSays, clockSays, msLeft,
} from '../../src/domain/campaign.js';
import { listCampaigns } from '../../src/store/campaigns.js';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Calls — BalanceVid' };

/**
 * Every call this installation has opened.  [GO-VIRAL V-2, V-5]
 *
 * THE ORGANISER'S LIST, NOT THE PUBLIC ONE. `/go` shows what is
 * listed and open; this shows everything, including the one still
 * being drafted and the one that finished last month — because
 * the thing an organiser needs from a list is the row they cannot
 * otherwise reach. [D-03]
 *
 * EVERY KIND OF CALL HAS A DOOR HERE, which is why this page
 * exists at all rather than only a link from the performance
 * inbox. A call on a conversation or a channel has no inbox of
 * its own to be linked from, and a call reachable only by typing
 * its id is a call nobody will run.
 */
export default async function CallsPage() {
  const now = new Date().toISOString();
  const campaigns = await listCampaigns().catch(() => []);
  return (
    <main className="shell" style={{
      padding: 'var(--space-6)', maxWidth: 900, margin: '0 auto',
    }}>
      <h1 style={{ margin: '0 0 var(--space-2)', fontSize: 'var(--text-xl)' }}>
        Calls
      </h1>
      <p className="small muted" style={{ margin: '0 0 var(--space-5)' }}>
        Everything this installation has opened, drafts and finished ones
        included. <a href="/go">What the public sees</a> is the listed,
        unfinished ones.
      </p>
      {campaigns.length === 0 ? (
        <p className="small muted" data-testid="calls-empty">
          No calls yet.
        </p>
      ) : (
        <ul data-testid="calls-list" style={{
          listStyle: 'none', margin: 0, padding: 0,
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {campaigns.map((one) => (
            <li key={one.id}>
              <a href={`/calls/${one.id}`} data-testid="calls-row"
                 data-state={one.state}
                 style={{
                   display: 'flex', gap: 8, alignItems: 'baseline',
                   padding: '8px 10px', textDecoration: 'none',
                   color: 'var(--text)', border: '1px solid var(--line)',
                   borderRadius: 'var(--radius-sm)',
                   background: 'var(--console-control)',
                 }}>
                <span className="grow" style={{
                  fontWeight: 'var(--weight-semi)',
                }}>{one.title}</span>
                <span className="small muted">{one.state}</span>
                <span className="small muted">
                  {callListed(one) ? 'listed' : 'unlisted'}
                </span>
              </a>
              <p className="small muted" style={{ margin: '2px 0 0 10px' }}>
                {campaignSays(one, now)}
                {clockSays(one, now) === 'closing' && msLeft(one, now) !== null
                  && ' — the last stretch'}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
