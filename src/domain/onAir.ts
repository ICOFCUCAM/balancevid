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
import { whatIsOn } from './channel.js';

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
