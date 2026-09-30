/**
 * The media player, and what a song is.
 * [Doctrine CHANNEL §25, §28, C-14; D-18, D-19, U-19]
 *
 *                     LIBRARY
 *                        │
 *               ┌────────┴────────┐
 *             VIDEO             AUDIO
 *               └────────┬────────┘
 *                   MEDIA PLAYER
 *               ┌────────┴────────┐
 *            PREVIEW           PROGRAMME
 *
 * *"I would NOT create a separate music-loading system. BalanceVid already
 *  has Library."*
 *
 * SO THIS IS NOT A MEDIA SYSTEM. It holds no files, copies nothing, and
 * knows no paths. `broadcastLibrary()` already lists every finished render
 * and every piece of other media as REFERENCES — D-18's rule, enforced since
 * the first channel existed — and a player that kept its own pool would be
 * exactly the duplication the brief refuses. What the player has is a
 * SELECTION and a STATE: which library item is loaded, and how far along the
 * road to air it has got.
 *
 * *"The Media Player does not care whether it is a song, interview, video
 *  package or announcement."* Nor does anything here. A song is a library
 * item whose picture happens to be absent; that is the only difference, and
 * it is one field.
 *
 * WHAT C-14 FOUND, and why this file exists at all: tile 05 was not a
 * player. It MIRRORED THE SCHEDULE — `sub: scheduled ? nameOf(scheduled) :
 * 'Idle'` — so "Idle" never meant "nothing is loaded", it meant "nothing is
 * scheduled", and there was no way to load anything. The path the brief
 * asks for, `Library → Media Player → Programme`, had no middle.
 */

/** What a library item is, once the player is asked to think about it. */
export type MediaKind = 'video' | 'audio' | 'image';

/**
 * How far a loaded item has got.
 *
 *     Load  →  Preview  →  Play  →  Take Live
 *
 * FOUR WORDS, THREE OF WHICH ARE STATES. "Load" is the act that produces
 * `loaded`; the other three are what the operator does next and what the
 * player is doing meanwhile. A cued item is on the preview bus and not on
 * the air; a playing item is running in preview so the operator can hear
 * where it is before taking it; a taken item is on programme and the
 * PLAYER stops claiming it, because from that moment the channel's own
 * roll-in owns what is going out. [§25, §5]
 */
export type PlayerPhase = 'empty' | 'loaded' | 'playing' | 'taken';

export interface PlayerState {
  phase: PlayerPhase;
  /** The library item's key, or null. Never the media itself. */
  key: string | null;
  /** Where the preview has got to, in milliseconds. */
  atMs: number;
}

export const IDLE: PlayerState = { phase: 'empty', key: null, atMs: 0 };

/**
 * `4:04`, or `1:02:44` when it is long enough to need the hours.
 *
 * NOT ZERO-PADDED AT THE FRONT. `04:04` is what a stopwatch shows and
 * `4:04` is what a track listing shows, and this is a track listing — the
 * brief's own mock-up writes `04:12`, and it also writes `00:18` for
 * eighteen seconds, which is a clock rather than a length. A duration
 * column reads down a list, so the minutes column must be ragged or every
 * short thing looks like a time of day.
 *
 * AND AN UNKNOWN DURATION IS AN EM DASH, not `0:00`. Zero is a claim.
 */
export function clock(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return '—';
  const total = Math.round(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

/**
 * What kind of thing this is, from what the file turned out to contain.
 *
 * MEASURED, NOT NAMED. A `.mp4` with no video stream is audio, whatever it
 * is called, and a channel that put it on air as a video would transmit a
 * black rectangle for four minutes. The one thing an extension decides is
 * a still, because a JPEG has neither stream and there is nothing to
 * measure. [§25]
 */
export function kindOf(
  { hasVideo, hasAudio }: { hasVideo?: boolean; hasAudio?: boolean },
  fallback: MediaKind = 'video',
): MediaKind {
  if (hasVideo) return 'video';
  if (hasAudio) return 'audio';
  return fallback;
}

/** One row of the picker, which is one row of the Library. */
export interface PlayableItem {
  key: string;
  title: string;
  /** Who it belongs to: an artist, a studio, a station. */
  artist?: string;
  durationMs?: number;
  kind: MediaKind;
  /** A picture for it, if there is one. Never invented. */
  artwork?: string;
}

/**
 * The picker's search.
 *
 * TITLE AND ARTIST, because *"Search Library…"* over a list of songs that
 * matched only titles would fail on the one search a person actually makes
 * — everything by somebody. Case-folded, trimmed, and a blank query keeps
 * everything rather than nothing: an empty box is not a filter.
 *
 * NO FUZZY MATCHING. An operator is looking for a thing they know the name
 * of, thirty seconds before it has to go out. A list that helpfully offers
 * near-misses is a list they have to read twice.
 */
export function search<T extends PlayableItem>(
  items: readonly T[], query: string,
): T[] {
  const needle = query.trim().toLowerCase();
  /*
   * AND THERE IS NO EMPTY-QUERY GUARD, on purpose. One stood here and a
   * mutation sweep removed it without a single assertion noticing, because
   * `includes('')` is true of every string — the filter already keeps
   * everything. A branch that only restates what the line below does is
   * decoration, and the trim is what actually does the work: a box holding
   * three spaces is an empty box.
   */
  return items.filter((item) =>
    item.title.toLowerCase().includes(needle)
    || (item.artist ?? '').toLowerCase().includes(needle));
}

/**
 * The player's transitions, as a table rather than as scattered `if`s.
 *
 * WHY A TABLE. Four controls that each set a phase is four places for the
 * rule "you cannot play what is not loaded" to be got wrong, and the one
 * that matters most — a take is only possible from a loaded item — is the
 * one that puts something on the air. Here it is one function, and the
 * studio's buttons ask it whether they are enabled. [U-19]
 */
export type PlayerAct = 'load' | 'play' | 'pause' | 'take' | 'eject';

export function may(state: PlayerState, act: PlayerAct): boolean {
  switch (act) {
    /* Loading over a loaded item is how an operator changes their mind. */
    case 'load': return true;
    case 'play': return state.phase === 'loaded';
    case 'pause': return state.phase === 'playing';
    /*
     * TAKEN FROM EITHER. An operator who has cued a thing and not pressed
     * play still means to take it — that is the whole point of a cue — and
     * a TAKE LIVE that was disabled until you had previewed would be a
     * control that refuses in the thirty seconds it exists for.
     */
    case 'take': return state.phase === 'loaded' || state.phase === 'playing';
    case 'eject': return state.phase !== 'empty';
  }
}

export function act(
  state: PlayerState, action: PlayerAct, key?: string,
): PlayerState {
  if (!may(state, action)) return state;
  switch (action) {
    case 'load':
      if (!key) return state;
      /*
       * LOADING THE SAME THING TWICE IS NOT A RELOAD. An operator clicking
       * the row that is already cued means "yes, that one", and resetting
       * the preview to zero would throw away the place they had found.
       */
      return state.key === key ? state : { phase: 'loaded', key, atMs: 0 };
    case 'play': return { ...state, phase: 'playing' };
    case 'pause': return { ...state, phase: 'loaded' };
    /*
     * A TAKE ENDS THE PLAYER'S CLAIM. What is going out is the channel's
     * roll-in from here; a player that went on saying "playing" would be a
     * second thing claiming the air, and C-14 is about what happens when
     * two things claim one bus. [§24's tally, §5]
     */
    case 'take': return { ...state, phase: 'taken' };
    case 'eject': return IDLE;
  }
}

/**
 * What the tile says under "Media Player".
 *
 * IT SAYS WHAT THE PLAYER IS DOING, not what the schedule is doing. That
 * distinction is the bug C-14 found stated as a sentence: `Idle` meant
 * "nothing is scheduled" on a tile whose name promised something else.
 */
export function playerSays(
  state: PlayerState, titleOf: (key: string) => string | undefined,
  scheduled?: string,
): string {
  if (state.phase === 'empty') {
    return scheduled ? `Next: ${scheduled}` : 'Nothing loaded';
  }
  const title = state.key ? titleOf(state.key) ?? 'Loaded' : 'Loaded';
  if (state.phase === 'loaded') return `Cued — ${title}`;
  if (state.phase === 'playing') return `Preview — ${title}`;
  return `On programme — ${title}`;
}
