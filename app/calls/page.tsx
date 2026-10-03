import {
  beforeRunning, callListed, campaignSays, clockSays, msLeft,
} from '../../src/domain/campaign.js';
import { listCampaigns } from '../../src/store/campaigns.js';
import { Building } from '../Room.js';
import { theBuilding } from '../building.js';

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
  const [campaigns, building] = await Promise.all([
    listCampaigns().catch(() => []), theBuilding(),
  ]);
  const running = campaigns.filter(
    (one) => clockSays(one, now) !== 'over' && !beforeRunning(one)
      && one.state !== 'completed').length;

  return (
    <Building owned={building.owned} space={building.space}
              libraryCount={building.libraryCount} current="calls"
              where="Calls"
              {...(building.heroHref ? { heroHref: building.heroHref } : {})}
              ready={running === 1 ? '1 RUNNING'
                : running > 0 ? `${running} RUNNING` : 'NONE RUNNING'}>
      {/*
        * A HEADING AND A LIST, IN THE BUILDING'S OWN BODY.
        *
        * THE PAGE USED TO CARRY `className="shell"`, which is the
        * EDITOR's frame: `height: 100dvh`, `overflow: hidden`, and
        * `grid-template-rows: auto 1fr auto`. Three children in that
        * grid meant the middle one — the sentence under the heading —
        * was stretched to fill the window, so the first call sat seven
        * hundred pixels below its own title, and any call past the fold
        * could not be scrolled to at all. Found in a screenshot.
        * [GO-VIRAL V-8]
        */}
      <section className="room-head" style={{ paddingBottom: 0 }}>
        <h1 className="room-hero-stages" style={{ fontSize: 'var(--text-2xl)' }}>
          Calls
        </h1>
        <p className="room-hero-says">
          Everything this installation has opened, drafts and finished ones
          included. <a href="/go">What the public sees</a> is the listed,
          unfinished ones.
        </p>
      </section>

      {campaigns.length === 0 ? (
        <div data-testid="nothing-yet" className="panel room-empty">
          <strong className="room-empty-title" data-testid="calls-empty">
            No calls yet
          </strong>
          <span className="room-empty-says">
            A call is opened from the song, conversation or channel it is
            about.
          </span>
        </div>
      ) : (
        /*
          * ONE CARD PER CALL, IN THE SAME GRID THE ROOMS USE.
          *
          * `room-cards` and `room-card-flat` are the classes Studio One
          * and Studio Two list their work in, and a call is the same
          * kind of thing to look at: a made record with a state and a
          * date. A second card style would be a second answer to a
          * question the building has already answered. [D-19]
          *
          * FLAT, BECAUSE A CALL HAS NO FIRST FRAME. A well kept for a
          * picture that can never arrive is a column of empty
          * rectangles — `RoomWork`'s own rule, applied here.
          */
        <div data-testid="calls-list" className="room-cards">
          {campaigns.map((one) => (
            <a key={one.id} href={`/calls/${one.id}`} data-testid="calls-row"
               data-state={one.state}
               className="panel room-card room-card-flat">
              <span className="room-card-tags">
                <span className="room-card-kind is-inline"
                      data-testid="calls-state">{one.state}</span>
                {callListed(one) && !beforeRunning(one) && (
                  <span className="room-card-kind is-inline">listed</span>
                )}
              </span>
              <span className="room-card-said">
                <strong className="room-card-title">{one.title}</strong>
                <span className="room-card-under">
                  {campaignSays(one, now)}
                  {clockSays(one, now) === 'closing' && msLeft(one, now) !== null
                    && ' — the last stretch'}
                </span>
                <span className="row" style={{ gap: 8, marginTop: 8 }}>
                  <span className="room-card-when">
                    {callListed(one)
                      ? (beforeRunning(one)
                        ? 'In the directory once it runs' : 'In the directory')
                      : 'Not listed'}
                  </span>
                  <span className="grow" />
                </span>
              </span>
            </a>
          ))}
        </div>
      )}
    </Building>
  );
}
