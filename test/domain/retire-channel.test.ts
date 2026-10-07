/**
 * The route to retire a channel, and the page that never called it.
 *   [CHANNEL §1, §19; Doctrine D-13, D-18, D-21, INV-17]
 *
 * THE FIFTH TIME IN ONE SESSION. `RotationEntry.loop`, `paceSays`,
 * `channel.filler` and `deadAir()` were each built, correct,
 * documented, and pointed at by nothing. This is the same shape
 * and the most expensive version of it, because the product was
 * actively telling the operator to use the thing they could not
 * reach:
 *
 * > *"The engine is taking longer to make the broadcast than the
 * > broadcast lasts (111% of real time). … **Fewer channels**, a
 * > simpler source, or a bigger box."*
 *
 * `DELETE /api/channels/<id>` has existed the whole time. It is
 * guarded, it counts what it would take, and its own comment says
 * the count goes back *"so the page can say how many before
 * asking, rather than after"*. There was no page. The only way to
 * act on the control room's first recommendation was `curl`.
 *
 * MEASURED on this machine, on the installation that prompted it:
 *
 *     17 channels   623% of real time, round trip 74.7s, starving
 *      1 channel    see below
 *
 * WHAT MAKES IT SAFE TO OFFER AT ALL is the rule the whole product
 * is built on: a channel points at renders and never owns them.
 * Retiring one takes six months of programming off the air and
 * deletes nothing anybody made — except the two things a channel
 * does own, saved live sessions and requested recordings, which
 * is exactly what the route counts. [§19, D-18, INV-17]
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const bare = (path: string) => readFileSync(path, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const STUDIO = bare('app/t/[id]/ChannelStudio.tsx');
const ROUTE = bare('app/api/channels/[id]/route.ts');

describe('a channel can be retired from the room it is operated in', () => {
  /*
   * THE WHOLE FAULT, IN ONE ASSERTION. The route existed; nothing
   * sent the request.
   */
  it('the studio actually calls the route', () => {
    expect(STUDIO).toMatch(/fetch\(`\/api\/channels\/\$\{id\}`, \{ method: 'DELETE' \}\)/);
    expect(STUDIO).toMatch(/data-testid="retire-channel"/);
  });

  it('and the route is still the one that answers', () => {
    expect(ROUTE).toMatch(/export async function DELETE/);
    expect(ROUTE).toMatch(/recordingsLost: owned/);
  });

  /*
   * ASKED WITH THE NUMBER IN HAND. The route returns the count
   * precisely so the question can carry it; a dialog that said
   * "this cannot be undone" without saying what goes is a dialog
   * people learn to click through. [D-21]
   */
  it('asks with the count of what it would actually delete', () => {
    /*
     * AND IT IS THE ROUTE'S OWN COUNT. This first counted
     * `recordings` from a second fetch, which is one more request
     * and the wrong number — `channelOwns` is what DELETE uses
     * and it counts saved live sessions too. A dialog promising
     * to delete two things and a route deleting three is how a
     * confirmation stops being worth reading. [deletion.ts]
     */
    expect(STUDIO).toMatch(/const owned = channelOwns\(channel\);/);
    expect(ROUTE).toMatch(/const owned = channelOwns\(channel\);/);
    expect(STUDIO).toMatch(/\$\{owned\} saved/);
    /* And no second request to learn what it already has. */
    expect(STUDIO).not.toMatch(
      /fetch\(`\/api\/channels\/\$\{id\}`, \{ cache: 'no-store' \}\)[\s\S]{0,200}recordings/);
  });

  /*
   * AND SAYS WHAT SURVIVES, which is the more important half and
   * the one nobody would guess: a channel owns none of the
   * television it transmits. An operator who believes retiring a
   * channel deletes six months of renders will never press it,
   * and the one who presses it believing that will never trust
   * the product again. [§19, D-18]
   */
  it('and says what it does NOT delete, which is almost everything', () => {
    expect(STUDIO).toMatch(/points at renders, it never owns them/);
  });

  /*
   * THE NAME IS TYPED. The one irreversible control on a desk
   * whose channel may be on air, so the confirmation is an action
   * rather than a reflex — and a mismatch deletes nothing and
   * says so.
   */
  it('requires the channel’s name, and refuses a mismatch', () => {
    expect(STUDIO).toMatch(/Type the channel's name to confirm/);
    expect(STUDIO).toMatch(
      /\(typed \?\? ''\)\.trim\(\) !== channel\.name\.trim\(\)/);
    expect(STUDIO).toMatch(/nothing was deleted/);
  });

  /* And it warns when the thing being retired is on the wire. */
  it('says so when the channel is on air', () => {
    expect(STUDIO).toMatch(/onAir \? 'IT IS ON AIR RIGHT NOW\. ' : ''/);
  });

  /*
   * AND IT IS NOT A BUTTON ANYBODY PRESSES BY ACCIDENT. Last in
   * the panel, behind a fold, and coloured as a hazard rather
   * than as an action.
   */
  it('is placed last and painted as a hazard', () => {
    const retire = STUDIO.indexOf('data-testid="retire-channel"');
    const publish = STUDIO.indexOf('data-testid="publish-channel"');
    expect(publish).toBeGreaterThan(0);
    expect(retire).toBeGreaterThan(publish);
    const near = STUDIO.slice(retire - 400, retire + 400);
    expect(near).toMatch(/var\(--state-bad\)/);
  });
});
