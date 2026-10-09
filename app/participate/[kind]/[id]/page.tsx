import type { Metadata } from 'next';

import { GROUND, INSTALLS } from '../../../take/installs.js';
import { claimable, isClaimKind } from '../../../../src/web/claim.js';
import { loadPerformance } from '../../../../src/store/performances.js';
import Door from './Door.js';

export const dynamic = 'force-dynamic';
export const viewport = GROUND;

export const metadata: Metadata = {
  ...INSTALLS,
  title: 'BalanceVid — take part',
};

type Params = { params: Promise<{ kind: string; id: string }> };

/**
 * One link, sent to everybody, and each person gets their own goes.
 *   [TAKE-PLATFORM P1, P6, P39, P41; D-03, D-13, D-19, D-25]
 *
 * *"I WANT THE TAKE THREE CHANCES FOR A PARTICULAR SONG TO HAVE AN
 * OPTION WHERE IT COULD BE SEND TO MORE THAN ONE PERSON. AT THE END
 * THE STUDIO WILL HAVE MULTIPLE SUBMISSION FROM THE DIFFERENT
 * INDIVIDUALS TO CREATE THE MASTER FROM."*
 *
 * AND ALL OF IT WAS BUILT EXCEPT THE DOOR. `claim()` has created a
 * performance request with `allowed: { video: true, takes: 3 }`
 * since claiming existed; `POST /api/participate/music/<id>` is
 * already guest-writable, so a stranger may call it with no
 * account; each claim mints its OWN token, so one person's three
 * goes are their own and revoking one leaves the others alone; and
 * every request carries `holder: { kind: 'performance', id }`, so
 * the submissions land together in the one song the master is cut
 * from. The concept was complete and reachable only by browsing
 * the Take App and happening to find the song.
 *
 * WHICH IS WHY THIS IS A PAGE AND NOT A MECHANISM. It resolves the
 * song, says whether it is open, and presses the button that
 * already exists. There is no second claim path, no second request
 * shape, and no `/api/door/*`. [D-19]
 *
 * IT DOES NOT DEPEND ON THE SONG BEING *LISTED*. `/api/participate`
 * answers only with what its author published AND chose to list,
 * which is right for a public browse list and wrong for this: a
 * choir is sent a link privately and the song has no business on a
 * stranger's home screen. Publishing opens the door; listing
 * decides whether it is also advertised. Two decisions, and this
 * one needs only the first.
 *
 * NOTHING ABOUT THE SONG IS RENDERED UNTIL IT IS KNOWN TO BE OPEN —
 * the rule `/take/<link>` keeps. A page source must not carry a
 * title its author has not decided to show. [D-03]
 */
export default async function ParticipatePage({ params }: Params) {
  const { kind, id } = await params;
  if (!isClaimKind(kind)) return <Door state="missing" kind="music" id={id} />;

  const open = await claimable({ kind, id, now: new Date().toISOString() });
  if (open !== 'open') {
    /*
     * CLOSED AND MISSING ARE TOLD APART HERE AND NOT TO A
     * STRANGER. The door collapses them for the reason it always
     * did: the id came off a URL somebody could have guessed, and
     * "that song exists but is shut" is a fact about a song its
     * author has not published. [D-03]
     */
    return <Door state="missing" kind={kind} id={id} />;
  }

  /* Only now, with the author's own decision confirmed. */
  let title = 'this song';
  if (kind === 'music') {
    title = await loadPerformance(id)
      .then((one) => one.master.title)
      .catch(() => 'this song');
  }
  return <Door state="open" kind={kind} id={id} title={title} />;
}
