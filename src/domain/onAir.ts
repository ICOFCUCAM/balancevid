/**
 * What the compositor is told about this instant.
 *   [Doctrine CHANNEL §6, §13, §2, D-19, C-42, C-47]
 *
 *     whatIsOn ─┬─► onAirTitle   what the VIEWER is told it is called
 *               ├─► intoProgramme  how far past the join, for the hold
 *               └─► nextUp         what follows, and when
 *                        │
 *                        └──► marksFor ──► Mark[] ──► the picture
 *
 * THESE FOUR LIVED INSIDE THE PLAYOUT WORKER AND NOTHING ELSE
 * COULD ASK THEM. They are pure arithmetic over the channel
 * document — no filesystem, no clock of their own, no ffmpeg — and
 * they were private functions at the bottom of the file that spawns
 * encoders. So the question *"what graphics are up at 21:02"* was
 * answerable in exactly one process, and the control room's
 * GRAPHICS lane, whose entire job is to answer it, could not.
 *
 * That is why that lane drew lower thirds and nothing else: not
 * because the other marks were missing — `marksFor` has computed
 * all four since the identity was written — but because the page
 * could not reach the three inputs it needs to call it.
 *
 * Moved rather than copied. A second copy would be a second answer,
 * and the whole argument for one compositor is that there is one.
 *
 * AND `onAirTitle` IS NOT THE CONTROL ROOM'S `titleOf`, WHICH IS
 * THE POINT OF THE NAME. The control room says "Off air" and "The
 * live studio", because an operator is looking at their own
 * channel's machinery. This says the CHANNEL'S OWN NAME for both,
 * because a viewer is not: it is what goes under the bug, and
 * `captionFor` exists to stop it being printed there twice [C-42].
 * Two functions because there are two questions, and merging them
 * would put the operator's word on the wire.
 */

import type { Channel, OnAir } from './channel.js';
import { nextAfter, programmeStart, whatIsOn } from './channel.js';
import { captionFor } from './caption.js';

/** What the viewer is told this is called. */
export function onAirTitle(channel: Channel, on: OnAir): string {
  if (on.kind === 'off') return channel.name;
  if (on.kind === 'live') return on.session.segment ? channel.name : 'Live';
  if (on.kind === 'emergency' || on.kind === 'backup') return channel.name;
  if (on.kind === 'programme') return on.programme.title ?? channel.name;
  return on.entry.title ?? channel.name;
}

/** How far into the current thing the channel is, for the at-start hold. */
export function intoProgramme(channel: Channel, at: number): number {
  const on = whatIsOn(channel, at);
  if (on.kind === 'programme') return at - Date.parse(on.programme.startsAt);
  if (on.kind === 'rotation') return on.entry.durationMs - (on.untilMs - at);
  return 0;
}

/**
 * WHAT FOLLOWS, AND WHEN IT STARTS.  [§6, brief point 6, C-42]
 *
 * The title has been here since the identity was written and the
 * clock never was — which is the half a viewer deciding whether to
 * wait actually needs. *"NEXT / Live Conversation / 16:30."*
 *
 * THE TIME IS THE CURRENT THING'S END, which is the next thing's
 * start, and it is the only instant either of them agrees on: a
 * rotation entry has no clock time of its own because it loops.
 * Formatted here, because formatting it needs the channel's own
 * zone and the identity does not get to know what a timezone is.
 * [§2]
 */
export function nextUp(
  channel: Channel, at: number,
): { title?: string; at?: string } | undefined {
  const on = whatIsOn(channel, at);
  if (on.kind !== 'rotation' || channel.rotation.length === 0) return undefined;
  const index = channel.rotation.findIndex((entry) => entry.id === on.entry.id);
  const after = channel.rotation[(index + 1) % channel.rotation.length];
  if (!after?.title) return undefined;
  return { title: after.title, at: clockAt(channel, on.untilMs) };
}

/** An instant as the channel's own wall clock reads it. */
export function clockAt(channel: Channel, atMs: number): string | undefined {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: channel.timezone,
    }).format(new Date(atMs));
  } catch {
    /* A zone the platform does not know is a zone nobody should be
       shown a time in. The title still goes out. */
    return undefined;
  }
}

/**
 * What the VIEWER is told is on.  [§2, §9, D-04, TV-NETWORK N-2]
 *
 * THE THIRD ANSWER TO ONE QUESTION, and the three differ on
 * purpose:
 *
 * | function | audience | `off` reads |
 * |---|---|---|
 * | `onAirTitle` | the wire | the channel's name |
 * | `viewerTitle` | a viewer | `Off air` |
 * | the control room's `titleOf` | the operator | `Off air` |
 *
 * `onAirTitle` says the channel's name when nothing is on because
 * it goes UNDER THE BUG, where "Off air" would be a caption on a
 * black frame nobody is watching. A viewer reading a listing is
 * asking a different question — *is there anything on* — and the
 * honest answer to that is "Off air".
 *
 * IT LIVED INSIDE `/api/channels/<id>/now`, which was fine while
 * one endpoint asked it. The directory, the guide, the station page
 * and every future client all need exactly this answer, and a
 * fourth copy is how they come to disagree about what a channel is
 * showing. Moved before they are written rather than after. [D-19]
 *
 * A SLOT WITH NO TITLE IS THE CHANNEL'S NAME, not the document id
 * behind it. Falling back to `render conv_a1b2c3…` would leak an
 * identifier through the one hole a careful route left open, and
 * the channel's name is what a listing without a title says anyway.
 */
export function viewerTitle(channel: Channel, on: OnAir): string {
  switch (on.kind) {
    case 'off': return 'Off air';
    case 'live': return on.session.segment ? channel.name : 'Live';
    case 'programme': return on.programme.title ?? channel.name;
    case 'rotation': return on.entry.title ?? channel.name;
    /*
     * An emergency or a failover is NOT ANNOUNCED. The viewer is
     * being shown a caption card because something went wrong
     * behind it, and a channel that captioned its own fault
     * "BACKUP" would be telling them about a problem they cannot
     * do anything about. [§9]
     */
    default: return channel.name;
  }
}

/* ------------------------------------------------------------------------ *
 *  Now and next, for a viewer.  [§2, §4, C-42, C-43, TV-NETWORK N-4]
 * ------------------------------------------------------------------------ */

export interface NowAndNext {
  /** What is on, as a caption's two lines. */
  title: string | null;
  kind: string | null;
  live: boolean;
  /** When the thing on air ends, as an instant. */
  untilMs: number | null;
  next: string | null;
  nextAt: number | null;
}

/**
 * The two sentences a viewer's page needs.
 *
 * LIFTED OUT OF THE ROUTE BECAUSE A SECOND SURFACE NOW ASKS. The
 * station page, the directory's LIVE NOW row and the guide all want
 * what `/api/channels/<id>/now` has computed alone until now, and
 * each of them re-deriving it is how four pages come to disagree
 * about what a channel is showing. [D-19]
 *
 * NEXT IS RARELY THE NEXT FIXED SLOT, in a channel with a loop: it
 * is whichever comes sooner, the programme that pre-empts or the
 * turn of the rotation after this one. A listing that skipped the
 * loop would be wrong most of the day. [§4]
 *
 * AND NOT THE CHANNEL'S NAME. A loop of untitled items listed
 * "NEXT REdemption TV" — the station announcing itself as its own
 * next programme. An untitled item has no title and the listing
 * says nothing rather than something false. [C-42, C-43]
 *
 * AN INSTANT, NOT A COUNTDOWN: a cached countdown is wrong by its
 * own age.
 */
export function nowAndNext(channel: Channel, at: number): NowAndNext {
  const on = whatIsOn(channel, at);
  const coming = nextAfter(channel, at);

  let next: string | null = coming?.title ?? null;
  let nextAt: number | null = coming ? programmeStart(coming) : null;
  if (on.kind === 'rotation' && channel.rotation.length > 0) {
    const index = channel.rotation.findIndex((entry) => entry.id === on.entry.id);
    const after = channel.rotation[(index + 1) % channel.rotation.length]!;
    const soonest = coming ? programmeStart(coming) : Infinity;
    if (on.untilMs <= soonest) {
      next = after.title ?? null;
      nextAt = on.untilMs;
    }
  }

  /*
   * WHAT IS ON, SAID THE SAME WAY THE PICTURE SAYS IT. The lower
   * third had the identical fault and C-42 fixed it in
   * `captionFor`; this is that judgement reused rather than a
   * second opinion about what a programme is called. [§13]
   */
  const caption = captionFor(on, viewerTitle(channel, on), {}, channel.name);

  return {
    title: caption?.lead ?? null,
    kind: caption?.under ?? null,
    live: on.kind === 'live',
    untilMs: on.kind === 'programme' || on.kind === 'rotation' ? on.untilMs : null,
    next,
    nextAt,
  };
}
