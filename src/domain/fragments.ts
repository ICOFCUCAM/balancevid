/**
 * What a link into the control room asks for.  [Doctrine CHANNEL §1,
 * D-04, D-22, U-19]
 *
 *     /t/<id>#schedules   →   the SCHEDULES tab, and say so
 *     /t/<id>#live        →   the camera desk, and say so
 *
 * THE AUDIT'S §3, which came from the author's own observation that
 * *"most of bottons leads to one direction"*:
 *
 *   *"Six of the seven open the same page… `#schedules` does not
 *   select the SCHEDULES tab. The hash handler sets the desk tab for
 *   `identity` and `live` only… Clicking 'Schedule' from the landing
 *   page can therefore land on PLAYLIST. Nothing acknowledges the
 *   jump. **The behaviour is real and the feedback is nil**, which is
 *   indistinguishable from a dead button."*
 *
 * A CONSOLE CANNOT ANSWER A LINK BY SCROLLING. D-22: the control
 * room is a place and every panel is already on screen, so
 * `scrollIntoView` is a no-op and the link still looks dead. What a
 * fragment names is a thing to DO — bring a desk up, select a tab,
 * open a drawer — and then something has to move, or the operator
 * cannot tell it worked.
 *
 * AND TWO OF THE FOUR TARGETS WERE NOT ELEMENTS. `#schedules` and
 * `#live` were `display: contents` anchors with no box: nothing to
 * scroll to and nothing to flash. A fragment now names a real panel,
 * which is the only kind of thing that can acknowledge anything.
 *
 * ONE TABLE, HERE, because the links are written in one file
 * (`ControlRoom.tsx`), the targets in another (`ChannelStudio.tsx`),
 * and nothing connected them: a renamed tab was a dead link nobody
 * would notice until somebody pressed it. The test walks the table
 * against both.
 */

/** The left rail's three views. */
export type RailTab = 'playlist' | 'library' | 'schedules';

/** The live studio's desks. */
export type DeskTab =
  | 'camera' | 'guests' | 'screens' | 'media' | 'set' | 'graphics'
  | 'audio' | 'answers'
  /*
   * WHAT THE WORLD CALLS IT, which is not what it draws.
   * `graphics` is the bug, the lamp and the lower third — things
   * composited onto the picture. This is the address, the
   * callsign and the shelf: what a stranger sees in a directory
   * before they have watched a frame. Two desks because the model
   * holds them apart for the same reason. [TV-NETWORK N-1]
   */
  | 'listing';

export interface Jump {
  /** Which view of the left rail this fragment is about. */
  rail?: RailTab;
  /** Which desk it brings up. */
  desk?: DeskTab;
  /**
   * The element to reveal and flash.
   *
   * A REAL PANEL, never a zero-size anchor. Something has to move
   * for a link to have been answered, and `display: contents` has
   * nothing to move.
   */
  panel: string;
}

/**
 * Every fragment this product links to, and what each one means.
 *
 * Nothing else is honoured. A fragment that is not here is a typo or
 * a link from somewhere this product does not control, and doing
 * something approximate for it would be worse than doing nothing.
 */
export const JUMPS: Record<string, Jump> = {
  /* "Go live" from the landing page: the camera desk, where the
     button that actually starts a broadcast is. */
  live: { desk: 'camera', panel: 'live-studio' },
  /* "Schedule" and "View schedule": the rail's SCHEDULES view. This
     is the one the audit found landing on PLAYLIST. */
  schedules: { rail: 'schedules', panel: 'channel-rail' },
  /* The station's own graphics. */
  identity: { desk: 'graphics', panel: 'identity' },
  /* "Manage distribution": the drawer in the transport bar. */
  distribution: { panel: 'distribution' },
  /* Not linked from the landing page, but typed by people who have
     seen the other two, and cheap to honour. */
  playlist: { rail: 'playlist', panel: 'channel-rail' },
  library: { rail: 'library', panel: 'channel-rail' },
};

/** What this fragment asks for, or nothing. */
export function jumpFor(hash: string): Jump | null {
  const asked = hash.replace(/^#/, '').trim().toLowerCase();
  return JUMPS[asked] ?? null;
}

/**
 * How long the arrival is marked.
 *
 * LONG ENOUGH TO CATCH AN EYE THAT WAS ELSEWHERE, short enough that
 * it is gone before it becomes part of the furniture. A highlight
 * that stayed would be a panel that looks selected for the rest of
 * the session, which is a worse lie than no feedback at all. [D-04]
 */
export const FLASH_MS = 1_100;
