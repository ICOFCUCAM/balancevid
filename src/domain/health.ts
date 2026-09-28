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
