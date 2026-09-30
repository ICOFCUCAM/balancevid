/**
 * Four guests, in one tile the size of one tile.
 * [Doctrine CHANNEL §24, §29; ROOM §4; D-19, U-19]
 *
 *     ┌─────────┬─────────┐
 *     │ GUEST 1 │ GUEST 2 │
 *     ├─────────┼─────────┤
 *     │ GUEST 3 │ GUEST 4 │
 *     └─────────┴─────────┘
 *
 * *"the boxt must not be enlarge to deform the design but must rather devide
 *  into 4 halves of four guest cameras."*
 *
 * WHAT THIS IS NOT. It is not a second list of who is in the room, it does
 * not connect to anybody, and it does not decide who is on stage. The
 * Conversation Room does all three (ROOM §4, D-17), `useRoomMesh` holds the
 * peer connections and their states, and `useFeedLevels` measures every
 * microphone with the Room's own `measureVoice`. Every fact below was
 * already being measured somewhere and thrown away before it reached the
 * multi-view, which is what C-14 found. [D-19]
 *
 * SO WHAT THIS IS: the reading. Given the staged guests, what their links
 * are doing, which tracks are arriving and how loud each one is, it says
 * what each of four quarters shows — and it always says it for four, because
 * a grid that changed shape when a guest dropped would be a grid that moves
 * under the operator's hand at the worst possible moment.
 *
 * IT IS PURE, and that is the point: "a guest whose link failed reads LOST"
 * is a question about a table, and answering it by opening four cameras
 * would be answering it the expensive way — the same argument `identity.ts`
 * makes about marks.
 */

import { DEFAULT_POLICY } from './stage.js';

/** Four. The brief's number, and the number the grid is drawn for. */
export const GUEST_SLOTS = 4;

/**
 * What a peer connection is doing, in the browser's own vocabulary.
 *
 * Declared rather than imported from `lib.dom` because this module is domain
 * code and runs in the test process, but the strings are exactly
 * `RTCPeerConnectionState`'s — so the studio assigns one across without a
 * translation table that could drift. [U-19]
 */
export type Link =
  'new' | 'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed';

/** The microphone, as against the person. */
export type Mic = 'open' | 'muted' | 'none';

/**
 * The camera.
 *
 * `muted` is the browser's own word for a track that exists and is delivering
 * nothing — the remote end turned their camera off, or the connection is
 * starved. It is NOT the person pressing mute, which for video is `enabled`
 * at the far end and arrives here as the same silence. The grid does not
 * pretend to tell those apart, because nothing in the browser can.
 */
export type Eye = 'live' | 'dark' | 'none';

/** What the quarter is, in one word, in the order an operator triages. */
export type Health = 'live' | 'connecting' | 'unstable' | 'lost' | 'empty';

/** One staged guest, as the studio can see them. */
export interface GuestFeed {
  id: string;
  label?: string;
  /** Absent while the mesh has not opened a connection for them yet. */
  link?: Link;
  hasVideo: boolean;
  /** A video track that exists and is delivering nothing. */
  videoDark?: boolean;
  hasAudio: boolean;
  /** The far end's microphone is off, or the track has stopped arriving. */
  audioDark?: boolean;
  /** From `useFeedLevels`, which is the Room's own measurement. */
  energy?: number;
  speech?: number;
  /** The room's own floor for this microphone, if it has been measured. */
  noiseFloor?: number;
}

/** What one quarter of the tile shows. */
export interface GuestReading {
  /** 1..4, and it does not move when a guest leaves. */
  slot: number;
  id: string | null;
  /** The person's name, or `Guest 3` for a quarter nobody is in. */
  label: string;
  mic: Mic;
  eye: Eye;
  health: Health;
  /** 0–1, for the meter. Zero when there is nothing to meter. */
  energy: number;
  /** Speaking now, by the Room's own thresholds — not a louder-than guess. */
  speaking: boolean;
  /** This guest alone is on the programme bus, by the operator's choice. */
  soloed: boolean;
  /** Part of what is going out right now. */
  onAir: boolean;
  /**
   * The word laid over the picture, or empty when the picture is the answer.
   *
   * A quarter that is fine says nothing: four tiles each shouting LIVE is
   * four tiles saying nothing, and the tally is what says who is on.
   */
  says: string;
}

/**
 * A link that is doing its job.
 *
 * `new` and `connecting` are both "not yet"; `disconnected` is ICE having
 * lost its path, which usually recovers and so is UNSTABLE rather than lost;
 * `failed` and `closed` are over.
 */
function healthOf(feed: GuestFeed): Health {
  switch (feed.link) {
    case 'connected': return 'live';
    case 'disconnected': return 'unstable';
    case 'failed': case 'closed': return 'lost';
    case 'new': case 'connecting': return 'connecting';
    /*
     * NO LINK IS NOT A BROKEN LINK. The host's own camera has no peer
     * connection and never will, and a guest the mesh has not reached yet
     * is a guest whose row exists because the Room staged them. Both are
     * "the picture decides", which is what `live` means here — the eye
     * below downgrades it if nothing is arriving.
     */
    default: return 'live';
  }
}

function micOf(feed: GuestFeed): Mic {
  if (!feed.hasAudio) return 'none';
  return feed.audioDark ? 'muted' : 'open';
}

function eyeOf(feed: GuestFeed): Eye {
  if (!feed.hasVideo) return 'none';
  return feed.videoDark ? 'dark' : 'live';
}

/**
 * Is this person speaking?
 *
 * BY THE ROOM'S OWN THRESHOLDS, from `DEFAULT_POLICY`, and above their own
 * measured floor — so the dot on the multi-view and the automatic speaker
 * switching cannot disagree about who has the floor. A second threshold here
 * would be a second answer to the one question this indicator exists to
 * answer. [D-19, ROOM §4]
 *
 * WITHOUT the dwell and hysteresis `decideStage` applies, deliberately: those
 * exist to stop the PICTURE flicking between people, and a meter that waited
 * 600ms to admit somebody had spoken would be a meter that lied for 600ms.
 */
function speakingIn(feed: GuestFeed, mic: Mic): boolean {
  if (mic !== 'open') return false;
  const above = Math.max(0, (feed.energy ?? 0) - (feed.noiseFloor ?? 0));
  return above >= DEFAULT_POLICY.energyThreshold
    && (feed.speech ?? 0) >= DEFAULT_POLICY.confidenceThreshold;
}

/**
 * What to say over the picture, if anything.
 *
 * ONE WORD, AND THE WORST ONE. A guest whose link has failed also has no
 * video, and stacking `LOST` over `NO VIDEO` would be two labels for one
 * fault. The order below is the order an operator can act on: a lost link is
 * a different job from a guest who turned their camera off.
 */
function saysFor(health: Health, eye: Eye, present: boolean): string {
  if (!present) return 'NO GUEST';
  if (health === 'lost') return 'LOST';
  if (health === 'connecting') return 'CONNECTING';
  if (eye === 'none' || eye === 'dark') return 'NO VIDEO';
  if (health === 'unstable') return 'UNSTABLE';
  return '';
}

/**
 * The four quarters, always four.
 *
 * `feeds` arrives in the Room's staging order — who is on the left is a
 * decision somebody made — and the first four take the slots. A fifth guest
 * is staged, mixed and audible; they are simply not one of the four monitors,
 * which `tooMany` on the tile says out loud rather than leaving to be
 * discovered.
 */
export function readGuests(
  feeds: readonly GuestFeed[],
  { solo = null, transmitting = false }: {
    /** The one guest the operator has put on the programme bus alone. */
    solo?: string | null;
    /** Is anything going out at all? Nothing is on air off air. */
    transmitting?: boolean;
  } = {},
): GuestReading[] {
  /*
   * THE CAP IS THE LENGTH, and there is no `slice` above it.
   *
   * There was one, and a mutation sweep removed it without a single test
   * noticing — because `Array.from({ length: 4 })` asks for index 0..3 and
   * a fifth feed was never reachable. A guard nothing can observe is
   * decoration, and decoration here reads as though the cap were enforced
   * twice. `guestCount` is what tells the operator about the fifth guest.
   */
  return Array.from({ length: GUEST_SLOTS }, (unused, index) => {
    const feed = feeds[index];
    const slot = index + 1;
    if (!feed) {
      return {
        slot, id: null, label: `Guest ${slot}`,
        mic: 'none' as Mic, eye: 'none' as Eye, health: 'empty' as Health,
        energy: 0, speaking: false, soloed: false, onAir: false,
        says: 'NO GUEST',
      };
    }
    const mic = micOf(feed);
    const eye = eyeOf(feed);
    const link = healthOf(feed);
    /*
     * A CONNECTED LINK WITH NO PICTURE IS NOT "LIVE". The link state answers
     * "can we reach them"; the tracks answer "is anything arriving". A
     * monitor that read LIVE while showing black would be the one thing a
     * multi-view must never do. [U-19]
     */
    const health: Health = link === 'live' && eye !== 'live' && mic === 'none'
      ? 'unstable' : link;
    const soloed = solo !== null && solo === feed.id;
    return {
      slot,
      id: feed.id,
      label: feed.label ?? `Guest ${slot}`,
      mic,
      eye,
      health,
      energy: mic === 'open' ? Math.min(1, Math.max(0, feed.energy ?? 0)) : 0,
      speaking: speakingIn(feed, mic),
      soloed,
      /*
       * ON AIR IS THE TRANSMISSION, NOT THE SELECTION. Every staged guest is
       * in the composited picture unless one has been soloed, and none of
       * them is on air when nothing is going out — which is the same rule
       * the six tiles' own tally follows, so the grid cannot claim the air
       * while the tile around it says READY.
       */
      onAir: transmitting && (solo === null || soloed),
      says: saysFor(health, eye, true),
    };
  });
}

/** `4`, or `4 of 6` when the room is fuller than the grid. */
export function guestCount(feeds: readonly { id: string }[]): string {
  return feeds.length > GUEST_SLOTS
    ? `${GUEST_SLOTS} of ${feeds.length}` : String(feeds.length);
}
