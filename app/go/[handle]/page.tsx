import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import {
  type Campaign, bySlugOrId, callRow, judgementsOf, loopNumbers, panelOf,
  scorecardOf, wallOf,
} from '../../../src/domain/campaign.js';
import { resultsFor, saidAbout } from '../../../src/domain/judging.js';
import { listCampaigns } from '../../../src/store/campaigns.js';
import { listRequests } from '../../../src/store/requests.js';
import { claimable, doorFor } from '../../../src/web/claim.js';
import { GoFrame, Standing } from '../Go.js';
import { Deadline, EnterButton, Loop, Results, Wall } from './Call.js';
import Icon, { type IconName } from '../../Icon.js';

/**
 * A CALL'S SUBJECT, AS A READER'S WORD FOR IT.
 *
 * The same three the Take App draws, and for the same reason:
 * `about` is the track's kind, which is a word about how this
 * product stores things. The mapping lives on the surface
 * because the domain must not acquire an opinion about
 * English. [D-19]
 */
const ABOUT: Record<string, { says: string; mark: IconName }> = {
  performance: { says: 'Music', mark: 'music' },
  conversation: { says: 'Video', mark: 'play' },
  channel: { says: 'Programme', mark: 'broadcast' },
};

/* A call from a newer installation still draws. [V-8, U-19] */
function aboutSays(kind: string): { says: string; mark: IconName } {
  return ABOUT[kind] ?? { says: 'Open', mark: 'live' };
}

export const dynamic = 'force-dynamic';

/**
 * The call at this address, with what has answered it.
 *
 * READ FROM THE STORE AND NOT FROM `/api/go/<handle>`, which is
 * the shape `/tv/channels/<slug>` has and for its stated reason:
 * *"the page must render on the server without a round trip to
 * itself."* The DECIDING is shared — `bySlugOrId`, `wallOf` and
 * `loopNumbers` are the same functions the route calls — so the
 * two cannot come to different conclusions about what may be
 * shown. That duplication was a real bug on the station page,
 * where the route knew the channel number and the page did not,
 * and the fix was to share the function rather than the fetch.
 * [D-19]
 */
/**
 * The track's own answer, or `open` where there is no door at
 * all to ask.
 *
 * A CALL ABOUT A KIND THIS INSTALLATION DOES NOT KNOW is a call
 * from a newer installation, and the page draws it rather than
 * refusing it — the same decision `aboutSays` makes two
 * screens up. The route is the one that refuses, and it does.
 * [V-8, U-19]
 */
async function openDoor(call: Campaign): Promise<'open' | 'closed' | 'missing'> {
  const kind = doorFor(call.track.kind);
  if (!kind) return 'open';
  return claimable({ kind, id: call.track.id, now: new Date().toISOString() });
}

async function found(handle: string) {
  const campaigns = await listCampaigns().catch(() => [] as Campaign[]);
  const call = bySlugOrId(campaigns, handle);
  if (!call) return null;
  const now = new Date().toISOString();
  const requests = await listRequests().catch(() => []);
  const wall = wallOf(call, requests);
  const shown = new Set(wall.map((one) => one.submissionId));
  /*
   * THE RESULT, ONCE IT HAS BEEN ANNOUNCED, AND NOT BEFORE.
   *   [GO-VIRAL V-6]
   *
   * The same two conditions the route applies, through the same
   * functions: `announce` is the organiser saying the marking is
   * done, and only entries on the wall are named in a public
   * standing. A page that decided either for itself would be a
   * second answer to a question about somebody's face. [D-19]
   */
  const announced = call.state === 'results' || call.state === 'completed';
  /*
   * WHETHER THE DOOR WOULD ACTUALLY OPEN.  [V-4; D-21, D-19]
   *
   * `callRow` answers the CALL's own clock and state, which is
   * what this page has always drawn the button from. The TRACK
   * has conditions of its own — published, not withdrawn from
   * strangers, under the producer's ceiling — and they are the
   * ones `/api/go/<handle>/enter` actually applies. A campaign
   * whose song had been unpublished drew a live call with a
   * working-looking ENTER and answered *that is not open for
   * anybody to take part in* when somebody pressed it.
   *
   * ASKED THROUGH THE DOOR'S OWN FUNCTION so the two cannot
   * disagree, and asked only while the call's own gate is open,
   * because a finished competition's button is already gone and
   * `claimable` costs a scan of the requests. [D-19]
   */
  const row = callRow(call, now);
  const shut = row.clock !== 'over' && row.state !== 'completed'
      && row.state !== 'judging' && row.state !== 'results'
    ? await openDoor(call)
    : 'open';
  return {
    entry: shut,
    call,
    row,
    wall,
    numbers: loopNumbers(call, requests),
    panel: panelOf(call).map((one) => one.name),
    standings: announced
      ? resultsFor(scorecardOf(call), judgementsOf(call))
        .filter((verdict) => shown.has(verdict.entry))
        .map((verdict, place) => ({
          place: place + 1,
          entry: verdict.entry,
          score: verdict.score,
          outOf: verdict.outOf,
          judges: verdict.judges,
          byCriterion: verdict.byCriterion,
          said: saidAbout(verdict.entry, judgementsOf(call), panelOf(call)),
        }))
      : [],
  };
}

/**
 * WHAT A SHARED LINK SAYS ABOUT ITSELF.  [TV-NETWORK N-4; V-4]
 *
 * This is the half of the loop that happens off BalanceVid
 * entirely. A call pasted into a message, a post or a group chat
 * is represented by these two strings, and a competition whose
 * link carried the site-wide description — *"A conversation editor
 * for recorded media"* — is a competition nobody clicks.
 *
 * NO IMAGE IS NAMED, and that is deliberate rather than missing. A
 * card would have to be a frame of somebody's entry, and whose
 * entry a link preview shows is not a thing to decide on their
 * behalf — not even among the ones who agreed to be displayed,
 * because agreeing to appear on a results page is not agreeing to
 * be the thumbnail of a share. Recorded here and in **Not built**.
 */
export async function generateMetadata(
  { params }: { params: Promise<{ handle: string }> },
): Promise<Metadata> {
  const { handle } = await params;
  const it = await found(handle);
  if (!it) return { title: 'Call not found — BalanceVid Go' };
  return {
    title: `${it.call.title} — BalanceVid Go`,
    description: it.call.rules.asks,
    /*
     * AN UNLISTED CALL IS NOT INDEXED, which is the other half of
     * what unlisted means. It is reachable by its address — that
     * is the whole point — and a crawler putting it in a search
     * result would hand the address to everybody the organiser
     * did not give it to. [D-03]
     */
    ...(it.row.listed ? {} : { robots: { index: false, follow: false } }),
  };
}

/**
 * The campaign page.  [GO-VIRAL V-4, §10, §20]
 *
 * > **Judged on:** *"A stranger with no account reaches a
 * > campaign, reads the rules, watches entries and enters, on a
 * > phone; and a campaign that is `listed: false` is reachable by
 * > its link and absent from every index."*
 *
 * BOTH HALVES ARE HERE. The page renders for anybody with the
 * address, listed or not; `publicCalls` is what keeps an unlisted
 * one out of `/go` and out of `/api/participate`, and
 * `generateMetadata` is what keeps it out of a search engine.
 *
 * THE RULES ARE SERVER-RENDERED AND THE REST IS NOT. What a
 * crawler and a slow phone must have is the title, the ask and
 * the criteria; the countdown ticks and the wall plays, and both
 * need a browser. Same split as the station page. [N-4]
 */
export default async function CallPage(
  { params }: { params: Promise<{ handle: string }> },
) {
  const { handle } = await params;
  const it = await found(handle);
  if (!it) notFound();
  const { call, row, wall, numbers, panel, standings, entry } = it;
  const shownWall = wall.map((one) => ({
    submissionId: one.submissionId,
    kind: one.kind,
    at: one.at,
    ...(one.participant ? { participant: one.participant } : {}),
    ...(one.durationSamples !== undefined
      ? { durationSamples: one.durationSamples } : {}),
    media: `/api/go/${encodeURIComponent(handle)}/entries/`
      + `${encodeURIComponent(one.submissionId)}/media`,
  }));

  return (
    <GoFrame>
      {/*
        * THE CALL'S OWN BAND, the same shape the directory and
        * every television page carries: what this is, in one
        * line, with the one fact that decides whether to enter
        * — how long is left — beside it rather than buried in
        * the prose. [D-04]
        */}
      <div className="go-head">
        <div className="go-head-row">
          <div style={{ minWidth: 0 }}>
            {/*
              * THE SUBJECT, AS A KICKER. `about` is the track's
              * own kind rather than a label somebody typed, so
              * a reader arriving from a shared link knows what
              * sort of thing is being asked of them before
              * reading a word of the brief. [V-4, D-19]
              */}
            <p className="go-kind" data-about={row.about}>
              <Icon name={aboutSays(row.about).mark} size={12} />
              {aboutSays(row.about).says} campaign
            </p>
            <h1 className="go-title" data-testid="go-title">{call.title}</h1>
            <p className="go-lede" data-testid="go-says">{row.says}</p>
            <p className="go-lede" style={{ marginTop: 4 }}>
              <Deadline call={row} />
            </p>
          </div>
          <span className="go-count"><Standing call={row} /></span>
        </div>
      </div>

      <article className="go-body">

        {/* WHAT TO DO, in the organiser's own words. [V-2] */}
        <div className="go-cards">
        <section className="go-said">
          <span aria-hidden="true" className="go-said-mark" data-mark="do">
            <Icon name="list" size={15} />
          </span>
          <h2 className="go-h">What to do</h2>
          <p data-testid="go-asks" className="go-prose">
            {call.rules.asks}
          </p>
        </section>

        {/*
          * AND WHAT IT WILL BE JUDGED ON, BEFORE ANYBODY ENTERS.
          * *"A competition whose basis is announced after the
          * entries is not one."* [V-2, V-5]
          */}
        {call.rules.criteria && (
          <section className="go-said">
            <span aria-hidden="true" className="go-said-mark" data-mark="judge">
              <Icon name="passed" size={15} />
            </span>
            <h2 className="go-h">Judged on</h2>
            <p data-testid="go-criteria" className="go-prose">
              {call.rules.criteria}
            </p>
          </section>
        )}

        {/*
          * THE PRIZE AS TEXT, AND THIS PRODUCT DOES NOT PAY IT.
          * `docs/GO-VIRAL.md`'s **Not built** says why: a system
          * that sat between two people and a sum of money would
          * acquire obligations that have nothing to do with
          * recorded speech. [V-2, §17]
          */}
        {call.rules.prize && (
          <section className="go-said">
            {/* NOT THE TICK AGAIN. `passed` marks *judged on*,
                and two cards wearing one glyph is a set that
                has stopped distinguishing anything. There is no
                trophy in this icon set and inventing one for a
                single card is a thirteenth glyph nobody
                maintains. [Icon.tsx] */}
            <span aria-hidden="true" className="go-said-mark" data-mark="prize">
              <Icon name="sun" size={15} />
            </span>
            <h2 className="go-h">Prize</h2>
            <p data-testid="go-prize" className="go-prose">
              {call.rules.prize}
            </p>
          </section>
        )}

        </div>

        {/* The way in, where there still is one. */}
        {row.clock !== 'over' && row.state !== 'completed'
          && row.state !== 'judging' && row.state !== 'results' && (
          entry === 'open'
            ? (
              <EnterButton handle={handle}
                           asksConsent={(call.terms?.length ?? 0) > 0} />
            )
            : (
              /*
                * A SENTENCE WHERE THE BUTTON WOULD HAVE BEEN,
                * AND NOT A DISABLED BUTTON. [D-21, U-19]
                *
                * A greyed-out ENTER is a control a person tries
                * to press and then wonders whether their phone
                * is broken. The call is still worth reading —
                * the rules, the wall, the standing are all here
                * — so the page says what is true about entering
                * and leaves the rest alone.
                *
                * TWO SENTENCES, BECAUSE THEY ARE TWO FACTS AND
                * THE ORGANISER PUBLISHED BOTH. The door
                * collapses them into one 404 because there an
                * id came off a URL a stranger could have
                * guessed; here the organiser listed this call
                * and named what it is about, so *the thing is
                * gone* and *it is not taking entries* are
                * theirs already. [D-03]
                */
              <p className="go-shut" data-testid="go-shut"
                 data-why={entry}>
                {entry === 'missing'
                  ? 'What this call is about is no longer available, '
                    + 'so nothing more can be entered.'
                  : 'This call is not taking entries just now.'}
              </p>
            )
        )}

        {/*
          * THE RESULT ABOVE THE ENTRIES, because once it is out
          * it is what the page is for. Before it, there is no
          * section at all rather than an empty heading saying
          * the competition has not finished. [D-04]
          */}
        {standings.length > 0 && (
          <Results standings={standings} entries={shownWall} panel={panel} />
        )}

        <section>
          <h2 className="go-h">Entries</h2>
          <Wall entries={shownWall} />
        </section>

        <section>
          <h2 className="go-h">How it is going</h2>
          <Loop numbers={numbers} />
        </section>
      </article>
    </GoFrame>
  );
}
