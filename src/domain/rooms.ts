/**
 * Three production rooms, and what kind of production each is.
 *   [D-19, D-24, U-19; STUDIO-ONE §5; MASTER-EDIT §11]
 *
 * *"BalanceVid now has three production rooms, while only one has a true
 * room entrance."* And: *"They shouldn't merely be three copies of the
 * same shell… each room should immediately communicate what kind of
 * production is happening there."*
 *
 * TWO THINGS ARE BEING STATED HERE AND THEY PULL AGAINST EACH OTHER.
 * The rooms must be the same — one shell, one way in, one way back — and
 * the rooms must not feel the same, because what happens in them is not
 * the same work. A table is how both are true at once: the frame reads
 * this and is identical for all three, and what it reads is different for
 * each.
 *
 * WHY IT IS NOT IN `Workspace.tsx`, WHICH ALREADY HAS A STUDIO TABLE.
 * That one holds how a room LOOKS on the home page — its colour, its
 * veil, its photograph. This holds what a room IS, and it is read by the
 * home page, by the rail, and by the three rooms themselves. A room's
 * name living in the component that draws one of its four appearances is
 * how the rail and the card come to disagree about what a room is called.
 */

import { ALL_STUDIOS, STUDIOS, type StudioId } from './account.js';

export interface Room {
  id: StudioId;
  /**
   * What the tab is called: `Studio One`.
   *
   * FROM `account.ts`, WHICH ALREADY SAYS IT. That table names the
   * studios *as things that can be sold separately*, and the name a
   * customer buys is the name the rail shows — so restating it here
   * would be a fourth copy of one string, after the card, the rail and
   * the entitlement.
   */
  tab: string;
  /** The same, as the card's and the room's eyebrow: `STUDIO ONE`. */
  label: string;
  /** What it is called: `Conversation Studio`. */
  name: string;
  /**
   * THE SHAPE OF THE WORK, IN THREE WORDS OR TWO.
   *
   * *"SOURCE → RESPONSE… TAKES → TIMELINE → MASTER… PROGRAMME → PLAYOUT
   * → LIVE."* These are the author's own, and they are the one line that
   * tells somebody standing in a room what the room is for before they
   * have read a sentence of it.
   *
   * STAGES, NOT A STRING WITH ARROWS IN IT. `→` is a different length,
   * weight and baseline in every font — the reason `StudioCard` already
   * draws its arrow rather than typing one — and three of these stand in
   * a row on the home page. The frame draws the arrows.
   */
  stages: string[];
  /** One sentence, at the top of the room. */
  says: string;
  /**
   * What the way in is called.
   *
   * *"Enter Studio… Enter Studio… Open Control."* A control room is not
   * entered to make something in the way a studio is; it is opened, and
   * somebody is already on air behind it. The author's distinction, kept.
   */
  enter: string;
  /** Where the room is. */
  href: string;
  /**
   * What the room says about itself before it is asked to do anything.
   *
   * A STUDIO IS READY; A CONTROL ROOM'S SYSTEM IS. The distinction is
   * the author's and it is the same one that makes the third room's
   * entrance different from the other two: a studio is somewhere you
   * arrive to work, and a channel is a system that was already running.
   */
  ready: string;
  /**
   * A PHOTOGRAPH OF THE ROOM, AND THE COLOUR IT IS WASHED IN.
   *
   * These were fields of the home page's own studio table, on the
   * argument that they were "how a room LOOKS on this page". That was
   * true while the card was the only place a room appeared. The room's
   * front door shows the same photograph under the same veil, so they
   * are the room's and not the card's — and a second copy is how the
   * card and the door come to show two different pictures of one place.
   *
   * Built by `scripts/room-art.mjs` from the masters in `art/`.
   */
  art: string;
  /**
   * Where the crop holds when the band is wider than it is tall.
   *
   * Not the same answer three times: the conversation's subjects sit low
   * in frame behind a desk, the gallery's interest is the monitor wall.
   *
   * ONE VALUE SERVES A 132px CARD BAND AND A 208px HERO, and it has to:
   * a second field for the hero would be two crops of one photograph to
   * keep in agreement, and the difference between them is smaller than
   * the difference between the three rooms.
   */
  focus: string;
  /** The room's colour, at the strength type can sit on. */
  veil: string;
  /** And at full strength, for a button that belongs to this room. */
  accent: string;
  /**
   * What a thing made in this room is called, singular.
   *
   * Used for counts and for empty states, so that a room says "no
   * performances yet" rather than "nothing here yet" — which is what
   * every empty list in every product says, and says nothing.
   */
  noun: string;
}

/**
 * What is true of a room and of nothing else.
 *
 * A `Record<StudioId, …>` RATHER THAN A LIST, so that a fourth studio
 * added to the account model does not compile until somebody has said
 * what kind of production happens in it. That is a better guard than any
 * test: it fails at the moment the studio is invented, not the first
 * time somebody opens the page.
 */
const SAID: Record<StudioId, Omit<Room, 'id' | 'tab' | 'label'>> = {
  'studio-one': {
    name: 'Conversation Studio',
    stages: ['SOURCE', 'RESPONSE'],
    /*
     * THE AUTHOR'S OWN SENTENCE, taken off the banner they set it into.
     * Keeping a different one here would mean the picture and the page
     * said two things about the same room.
     */
    says: 'Bring something in, work through it, and publish the exchange '
      + 'as one finished piece.',
    enter: 'Enter Studio', href: '/c', ready: 'Ready', noun: 'conversation',
    art: '/rooms/conversation.webp', focus: '58% 50%',
    veil: 'var(--studio-one-veil)',
    accent: 'var(--studio-one)',
  },
  'studio-two': {
    name: 'Performance Studio',
    stages: ['TAKES', 'TIMELINE', 'MASTER'],
    says: 'Perform a song as many times as you like, from different angles '
      + 'or sources, then arrange the takes against one master song clock '
      + 'and create your finished performance.',
    enter: 'Enter Studio', href: '/p', ready: 'Ready', noun: 'performance',
    art: '/rooms/performance.webp', focus: '62% 50%',
    veil: 'var(--studio-two-veil)',
    accent: 'var(--studio-two)',
  },
  'online-tv': {
    name: 'Online TV',
    stages: ['PROGRAMME', 'PLAYOUT', 'LIVE'],
    says: 'Run a continuous channel from your programmes, scheduled '
      + 'content, live sessions and emergency sources.',
    enter: 'Open Control', href: '/t', ready: 'System ready', noun: 'channel',
    art: '/rooms/online-tv.webp', focus: 'center 38%',
    veil: 'var(--studio-tv-veil)',
    accent: 'var(--studio-tv)',
  },
};

export const ROOMS: Room[] = ALL_STUDIOS.map((id) => ({
  id,
  tab: STUDIOS[id].label,
  label: STUDIOS[id].label.toUpperCase(),
  ...SAID[id],
}));

export function roomFor(id: StudioId): Room {
  const found = ROOMS.find((one) => one.id === id);
  /*
   * A ROOM THAT IS NOT IN THE TABLE IS A PROGRAMMING ERROR, not a state
   * to render around. `StudioId` is a closed union, so the only way here
   * is a fourth studio added to the account model and not to this file —
   * which is exactly the moment somebody should be stopped.
   */
  if (!found) throw new Error(`no room for ${id}`);
  return found;
}
