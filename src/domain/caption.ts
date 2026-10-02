/**
 * What the caption says.  [Doctrine CHANNEL §13, §5, §6, D-04, D-25,
 * C-26, C-40, C-42]
 *
 *     JAMES CHAMA MEYEMBI
 *     STUDIO ONE · CONVERSATION
 *
 * THE BRIEF'S POINT 3: *"The viewer needs to know what they are
 * watching, not just which channel."* The lower third has carried
 * the programme's title since the identity was written, which is
 * half of that, and the half that was missing is the one the brief
 * keeps drawing: what KIND of thing this is.
 *
 * AND THE TITLE WAS OFTEN THE CHANNEL'S OWN NAME. `titleOf` falls
 * back to it for a live session with a segment up, for the
 * emergency cut, for the backup and for anything untitled — so the
 * caption said REDEMPTION TV under a bug that also said REDEMPTION
 * TV. The product condemns that in its own words at C-26: *"a name
 * in two corners of the same graphic is a station that does not
 * trust the viewer to have seen it."* It was doing it on air.
 *
 * TWO LINES, NEVER THREE. C-40 gave the renderer a name over a role;
 * this decides what goes on each. Three facts in the corner of a
 * broadcast is the brief's own point 10 — *"professional television
 * does not mean putting text everywhere"* — so a third fact
 * replaces rather than joins.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import type { OnAir, ProgrammeSource } from './channel.js';

/**
 * WHAT KIND OF THING IS ON, in the words a listing would use.
 *
 * Derived from the source rather than typed, because the schedule
 * already knows: a render carries which studio made it, a live
 * session is a camera that is on now, and a still is a still. A
 * field somebody fills in would be a field that disagrees with the
 * schedule by the second week.
 *
 * NULL WHERE THERE IS NOTHING HONEST TO SAY. A caption that said
 * "MEDIA" would be the product describing its own data model to a
 * viewer.
 */
export function sourceLine(source: ProgrammeSource | undefined): string | null {
  if (!source) return null;
  switch (source.kind) {
    case 'render':
      return source.document === 'conversation'
        ? 'Studio One · Conversation'
        : 'Studio Two · Performance';
    /*
     * "LIVE FROM THE STUDIO", which is the brief's own phrase and
     * is worth more than "LIVE": the lamp in the corner already
     * says it is live, and a caption repeating the lamp is the
     * second name in the second corner again.
     */
    case 'live': return 'Live from the studio';
    case 'media': return source.form === 'image' ? null : 'Film';
    default: return null;
  }
}

/** The source behind what is on, or nothing when the channel is off. */
export function sourceOf(on: OnAir): ProgrammeSource | undefined {
  return on.kind === 'off' ? undefined : on.source;
}

/**
 * AND THE TWO THINGS THAT OUTRANK THE SOURCE.
 *
 * The emergency cut and the backup are statements about the
 * TRANSMISSION rather than about the programme, and a viewer who has
 * just been cut away from needs to know that before they need to
 * know which studio made what replaced it. [§9]
 */
export function stateLine(on: OnAir): string | null {
  if (on.kind === 'emergency') return 'Interrupted';
  if (on.kind === 'backup') return 'Standing by';
  return null;
}

export interface Who {
  /** The person in front of the camera, typed by the operator. */
  presenter?: string;
  /** What they are. "Host", "Guest", "In conversation with…" */
  role?: string;
}

export interface Caption {
  /** The big line. */
  lead: string;
  /** The small line under it, or nothing. */
  under?: string;
}

/**
 * The two lines, decided.
 *
 * A LOWER THIRD IDENTIFIES THE PERSON WHEN THERE IS ONE, and the
 * programme when there is not. That is what a lower third is for and
 * it is what the brief draws twice: the name on top, what they are
 * underneath. A caption that led with the show's title over
 * somebody's face would be the station introducing itself while a
 * person is talking.
 *
 * THE ROLE BEATS THE SOURCE on the second line. Both are "what this
 * is", the operator typed one of them on purpose, and two of them
 * would be the third fact this refuses to draw.
 *
 * AND THE TITLE IS NOT REPEATED. When the programme has no title of
 * its own — which is most of the time, because `titleOf` falls back
 * to the channel's name — the lead is the source line and there is
 * no under at all. One true thing beats two, one of which is the
 * name already in the corner.
 */
export function captionFor(
  on: OnAir, title: string, who: Who = {}, channelName?: string,
): Caption | null {
  const state = stateLine(on);
  const source = sourceLine(sourceOf(on));
  const under = who.role?.trim() || state || source || undefined;

  const named = who.presenter?.trim();
  if (named) return under ? { lead: named, under } : { lead: named };

  /*
   * A TITLE THAT IS THE CHANNEL'S OWN NAME IS NOT A TITLE. It is
   * `titleOf` running out of answers, and printing it under a bug
   * that already says it is the fault this function was written to
   * stop.
   */
  const real = title.trim();
  const useful = real && real !== channelName?.trim() ? real : '';
  if (useful) return under ? { lead: useful, under } : { lead: useful };
  const only = state || source;
  return only ? { lead: only } : null;
}

/**
 * NEXT, with the time it starts.  [brief point 6]
 *
 * *"NOW / The Ancient of Days / NEXT / Live Conversation / 16:30."*
 * The mark has carried the title since the identity was written and
 * never the clock, which is the half a viewer deciding whether to
 * wait actually needs.
 *
 * THE TIME IS ALREADY FORMATTED when it arrives, because formatting
 * it needs the channel's own zone and this file does not get to know
 * what a timezone is. [§2]
 */
export function nextLine(
  next: { title?: string; at?: string } | undefined,
): string | null {
  const title = next?.title?.trim();
  if (!title) return null;
  const at = next?.at?.trim();
  return at ? `NEXT  ${at}  ${title}` : `NEXT  ${title}`;
}
