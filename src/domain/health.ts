/**
 * Is anything actually transmitting?  [Doctrine CHANNEL §18, §11, D-20]
 *
 *     ENGINE            STREAM
 *     running           transmitting     the channel is on the air
 *     running           stalled          the engine is up, this channel is not
 *     stopped           —                nobody is writing anything
 *
 * TWO QUESTIONS, NOT ONE, and conflating them is the fault this module
 * exists to prevent. `npm run start:playout` is a separate process by design
 * (§11, D-20): the web tier never runs ffmpeg, so the web tier cannot know
 * whether the encoder is alive except by looking at what it left behind.
 *
 * A control room whose lamps were all green while nothing went out is worse
 * than one with no lamps, because it answers the question wrongly rather
 * than declining to answer it. The schedule resolving is not the channel
 * transmitting: a perfect schedule with no engine behind it is a listing.
 *
 * BOTH ANSWERS COME FROM THE FILESYSTEM, which is the only thing both
 * processes share. The engine touches a heartbeat each pass; the segments
 * carry their own mtimes. Nothing is asked of the engine and nothing is
 * stored in the channel document — a health flag written into a document
 * would be a fact about the past pretending to be a fact about now.
 */

import { SEGMENT_MS } from './playout.js';

/**
 * How long a heartbeat may go unrefreshed before the engine is presumed gone.
 *
 * The loop wakes at least once a second when idle and a pass rarely takes
 * more than a few seconds, so fifteen is generous — which is deliberate. A
 * threshold tight enough to catch a slow pass is a threshold that cries wolf
 * during a busy one, and an alarm nobody believes is an alarm nobody reads.
 */
export const ENGINE_STALE_MS = 15_000;

/**
 * How long a channel's newest segment may age before it has stopped.
 *
 * Three segments. The engine keeps two ahead of the playhead (AHEAD_SEGMENTS)
 * so the newest file is normally in the future; by the time it is three
 * segments old, nothing has been written for at least that long and the
 * viewer's player has run out of playlist.
 */
export const STREAM_STALE_MS = 3 * SEGMENT_MS;

export type EngineState =
  /** A heartbeat, recently. */
  | 'running'
  /** A heartbeat, but an old one: the process died without saying so. */
  | 'stale'
  /** No heartbeat at all. It has never run, or the var directory is new. */
  | 'stopped';

export type StreamState =
  /** Segments are arriving. */
  | 'transmitting'
  /** Segments exist but stopped. Something was on air and no longer is. */
  | 'stalled'
  /** Nothing has ever been written for this channel. */
  | 'silent';

export interface Heartbeat {
  /** When the engine last finished a pass, as an instant. */
  at: string;
  /** Which process, so two engines on one directory are visible. [D-20] */
  pid: number;
  /** How many channels that pass looked at. */
  channels: number;
  /** How many segments it produced. Zero is normal and not a fault. */
  made: number;
}

export function engineState(
  beatAtMs: number | null | undefined, now: number,
): EngineState {
  if (beatAtMs === null || beatAtMs === undefined) return 'stopped';
  /*
   * A heartbeat from the future is a clock disagreement, not a dead engine —
   * two machines a few seconds apart, which D-20 explicitly leaves room for.
   * Treating it as stale would take a healthy channel off the board.
   */
  return now - beatAtMs <= ENGINE_STALE_MS ? 'running' : 'stale';
}

export function streamState(
  newestSegmentMs: number | null | undefined, now: number,
): StreamState {
  if (newestSegmentMs === null || newestSegmentMs === undefined) return 'silent';
  return now - newestSegmentMs <= STREAM_STALE_MS ? 'transmitting' : 'stalled';
}

/**
 * What to tell somebody, in one sentence.
 *
 * Written here rather than in a component because the control room and the
 * viewer must not describe the same condition two different ways, and
 * because a sentence is the part of this that gets tested for being true.
 *
 * The viewer's version says less: a stranger is owed an honest "this channel
 * is not transmitting", not a diagnosis of the broadcaster's server.
 */
export function healthSentence(
  engine: EngineState, stream: StreamState, audience: 'operator' | 'viewer',
): string | null {
  if (engine === 'running' && stream === 'transmitting') return null;

  if (audience === 'viewer') {
    return stream === 'transmitting'
      ? null
      : 'This channel is not transmitting right now.';
  }

  if (engine === 'stopped') {
    return 'The playout engine is not running — nothing is being written. '
      + 'Start it with: npm run start:playout';
  }
  if (engine === 'stale') {
    return 'The playout engine stopped responding. It may have crashed; '
      + 'check its output and restart it.';
  }
  /* The engine is up, so this is about this channel rather than the process. */
  return stream === 'silent'
    ? 'The engine is running but has not written a segment for this channel yet.'
    : 'The engine is running but this channel’s stream has stopped. '
      + 'A reference with no file behind it will do that.';
}

/* ------------------------------------------------------------------------ *
 *  Why a channel is dark.  [§6, §9, CHANNEL C-19]
 * ------------------------------------------------------------------------ */

/**
 * The operator armed, and nothing is going out.
 *
 * *"Why is this channel not showing when I am live?"*
 *
 * THE PRODUCT COULD SAY SIX THINGS AND SAID ONE. `healthSentence` covers
 * the transmitter — the engine stopped, the engine is stale, the stream
 * went silent — and every one of those is about a PROCESS. It has no
 * word for the two states where every process is healthy and the channel
 * is still dark:
 *
 *   the operator pressed GO LIVE and not TAKE LIVE, so the camera is in
 *     PREVIEW and `whatIsOn` is off. `phase === 'armed'` is the whole
 *     difference and it is one press wide; and
 *   the channel has nothing to play. No programme is due, the loop is
 *     empty, and a channel with nothing in it is off air by design.
 *
 * Both are correct behaviour and neither is a fault, which is exactly why
 * they need saying: a fault announces itself and a correct state that
 * looks like a fault does not. The viewer's page says *"This channel is
 * not transmitting right now"* for all six, which is right for a viewer
 * — they cannot act on any of it — and useless to the one person who
 * can.
 *
 * SO THIS IS THE OPERATOR'S SENTENCE, and it names the press. It is
 * separate from `healthSentence` rather than folded into it because the
 * two answer different questions: that one is *is the machinery
 * working*, and this one is *have you asked it for anything*.
 */
export function whyDark(
  { offAir, armed, hasSchedule }: {
    /** `whatIsOn(...).kind === 'off'`. */
    offAir: boolean;
    /** A live session exists and has not been taken to air. */
    armed: boolean;
    /** Anything at all to play: a programme, a block, or the loop. */
    hasSchedule: boolean;
  },
): string | null {
  if (!offAir) return null;
  if (armed) {
    return 'Your camera is up in PREVIEW and nothing is on the wire yet. '
      + 'TAKE LIVE is what puts it out.';
  }
  if (!hasSchedule) {
    return 'Nothing is scheduled and the loop is empty, so there is nothing '
      + 'to transmit. Put something in the loop, or go live.';
  }
  /*
   * OFF AIR WITH A SCHEDULE AND NOBODY ARMED is a gap between
   * programmes, which is a thing a channel is allowed to be. Saying
   * anything here would be a warning about the clock. [§5]
   */
  return null;
}

/** What kind of thing the control room is about to say. */
export type Tone =
  /** Something is broken and somebody has to go and fix it. */
  | 'fault'
  /** Something is true, correct, and worth knowing. */
  | 'note';

/**
 * The ONE line the control room shows, chosen from the two that can apply.
 * [§6, §9, §18]
 *
 * WRITTEN HERE BECAUSE THE ORDER IS THE HARD PART, and an order decided in
 * a component is an order nobody can test. Both sentences are often true at
 * once — an engine that stopped AND an operator who never pressed TAKE LIVE
 * — and showing both would be a control room talking over itself.
 *
 * A PROCESS FAULT OUTRANKS EVERYTHING. While nothing is being written, what
 * the operator did or did not press cannot matter: fix the transmitter
 * first. So a stopped or stale engine gets `healthSentence` and nothing
 * else.
 *
 * ONCE THE ENGINE IS UP, THE OPERATOR'S REASON WINS. This is the part that
 * was wrong before it was measured: `healthSentence` answers a running
 * engine with a silent channel by saying *"the engine is running but has
 * not written a segment for this channel yet"*, which is true, sounds like
 * a fault, and is useless — it has not written one because nothing was
 * ever asked for. `whyDark` knows which of the two reasons that is and
 * says it in a sentence the operator can act on.
 *
 * AND THE TONE TRAVELS WITH THE SENTENCE. Red for a thing that is broken
 * teaches an operator to read red; red for a thing that is merely true
 * teaches them to ignore it. [D-04]
 */
export function controlRoomNote(
  engine: EngineState, stream: StreamState, dark: string | null,
  /**
   * The newest segment the encoder could not render, if it is recent.
   *
   * ABOVE EVERYTHING INCLUDING A STOPPED ENGINE, which is the one
   * place the ordering above was wrong. A stopped engine is a channel
   * with nothing on the wire, and the operator finds out because the
   * channel is off. A RUNNING engine writing black is a channel that
   * looks perfect from every angle an operator has: segments are
   * arriving, health is green, the control room's own monitor shows
   * the camera. It is the only fault in this file that nothing else
   * can reveal, so it is the only one that gets to speak first. [C-24]
   */
  failing?: { says: string } | null,
): { says: string; tone: Tone } | null {
  if (failing) {
    return {
      says: `The encoder cannot render this channel and is putting black on `
        + `the wire: ${failing.says}`,
      tone: 'fault',
    };
  }
  if (engine !== 'running') {
    const says = healthSentence(engine, stream, 'operator');
    return says ? { says, tone: 'fault' } : null;
  }
  if (dark) return { says: dark, tone: 'note' };
  const says = healthSentence(engine, stream, 'operator');
  return says ? { says, tone: 'fault' } : null;
}

/**
 * How recent a render failure has to be to still be worth saying.
 *
 * Two segments' worth of slack past the stream's own staleness window:
 * a fault that stopped happening is a fault that was fixed, and a
 * control room still shouting about it is a control room nobody reads.
 */
export const FAILURE_FRESH_MS = 30_000;

/** Is this failure recent enough to still be true? */
export function stillFailing(
  failure: { at: string } | null | undefined, now: number,
): boolean {
  if (!failure) return false;
  const at = Date.parse(failure.at);
  return Number.isFinite(at) && now - at <= FAILURE_FRESH_MS;
}

/* ------------------------------------------------------------------------ *
 *  What the badge says.  [§18, §5, D-04, C-31]
 * ------------------------------------------------------------------------ */

/**
 * ON AIR, and what it has to mean.
 *
 * THE FAULT, which the author saw on a card before anybody measured
 * it: *"'ON AIR' and 'Nothing currently on air' in the same card."*
 *
 * Both halves were true. `transmitting` asks THE TRANSMITTER whether
 * segments are arriving; `showing` asks THE SCHEDULE what is on. An
 * off-air channel with the engine running satisfies the first and not
 * the second, because `segment.ts` keeps writing — *"A channel with a
 * hole in its schedule must still put four seconds on the wire, or
 * every player treats the gap as the end of the stream and stops.
 * Black and silence, generated."*
 *
 * So the card put a badge answering one question beside a line
 * answering another, with nothing saying they were different
 * questions. That is the same shape `controlRoomNote` exists to
 * prevent one level down, and the answer is the same: decide it in
 * one place, where it can be tested.
 *
 * FOUR STATES AND NOT THREE. The missing one is the interesting one —
 * a transmitter that is up and a schedule with nothing in it, which
 * is a real and correct condition that neither ON AIR nor OFF AIR
 * describes. A channel putting black out is not off the air; it is on
 * the air with nothing on it, and an operator who cannot tell those
 * apart from across a room cannot tell a quiet afternoon from a dead
 * encoder. [D-04]
 */
export type AirState =
  /** Segments arriving, and something on. */
  | 'on'
  /** Segments arriving, and nothing scheduled: black, correctly. */
  | 'blank'
  /** Something is due and nothing is arriving. The fault. */
  | 'due'
  /** Nothing due and nothing arriving. */
  | 'off';

export function airState(stream: StreamState, hasSomethingOn: boolean): AirState {
  if (stream === 'transmitting') return hasSomethingOn ? 'on' : 'blank';
  return hasSomethingOn ? 'due' : 'off';
}

/**
 * The badge, in the fewest words that are still true.
 *
 * `ON AIR · BLANK` rather than a fourth colour: an operator reads
 * three lamp colours and a word faster than four colours, and BLANK
 * is the word a gallery already uses for a bus with nothing on it.
 */
export function airSays(state: AirState): string {
  switch (state) {
    case 'on': return 'ON AIR';
    case 'blank': return 'ON AIR · BLANK';
    case 'due': return 'DUE ON AIR';
    default: return 'OFF AIR';
  }
}

/**
 * The same four, where there is room for a sentence — the lamp's
 * title, and the row in the channel list.
 */
export function airMeans(state: AirState): string {
  switch (state) {
    case 'on': return 'ON AIR';
    case 'blank': return 'ON AIR, NOTHING SCHEDULED';
    case 'due': return 'DUE, NOT TRANSMITTING';
    default: return 'OFF AIR';
  }
}
