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
import type { Pacing, Reach } from './pace.js';

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
 * How often the engine says it is alive.  [§18, D-19, U-02]
 *
 * A PASS IS NOT A TICK, AND THAT COST THIS PRODUCT ITS OWN
 * DIAGNOSIS. The heartbeat was written at the END of each pass,
 * for a reason that reads well:
 *
 *   *"At the start it would say 'alive' and then spend thirty
 *   seconds wedged on a broken encode, which is the failure a
 *   heartbeat exists to catch."*
 *
 * The hole in it is that a pass LEGITIMATELY takes thirty seconds.
 * Measured on seventeen channels, a healthy engine beat every 31
 * to 34 seconds — so against a fifteen-second threshold it read
 * as dead for most of every cycle, and the control room alternated
 * between a clean board, *"The playout engine stopped
 * responding"* and *"No playout engine has run since this instance
 * started"* while the engine was encoding perfectly throughout.
 *
 * A liveness signal cannot be gated on the work finishing, because
 * then it measures the work and not the life. The pulse is a timer
 * now, and the thing it was protecting against is caught better
 * elsewhere: a wedged engine keeps beating and its channels'
 * streams go stale, which `streamState` already notices per channel
 * and `healthSentence` already has the sentence for — *"The engine
 * is running but this channel's stream has stopped"* — which is
 * more use to an operator than being told it crashed when it has
 * not.
 *
 * FIVE SECONDS, SO THREE MAY BE LOST before the engine is called
 * dead. `engine-pulse.test.ts` fails if the two ever drift into
 * agreeing that a healthy engine is a stopped one.
 */
export const ENGINE_PULSE_MS = 5_000;

/**
 * The least patience worth having, when nothing has been timed.
 *
 * THREE SEGMENTS WAS THE WHOLE RULE AND IT ASSUMED A CADENCE THE
 * LOOP DOES NOT GUARANTEE. The reasoning read well — the engine
 * keeps two segments ahead, so a newest file three segments old
 * means nothing has been written for that long — and it is true of
 * an engine with ONE channel to visit.
 *
 * A pass visits every channel in turn. Measured on a live
 * seventeen-channel installation the engine came back to each
 * channel every 20.1 seconds, against twelve seconds of patience,
 * so a PERFECTLY HEALTHY channel read `stalled` for most of every
 * cycle:
 *
 *     with the engine running and every channel on air —
 *     17 of 17 channels read "stalled" at least once in 70s,
 *     the worst for 33 of those 70 seconds.
 *
 * That is the fault this module exists to prevent, committed by
 * this module: a lamp that answers the question wrongly rather than
 * declining to answer it. An operator who sees `stalled` on a third
 * of their channels at any moment learns to ignore the word, and
 * then it is worth nothing on the day it is true.
 *
 * SO THE PATIENCE FOLLOWS THE ROUND TRIP, which only the engine
 * knows and which it now puts in its heartbeat. This is the floor
 * for a reader that has not been told one. [streamPatience]
 */
export const STREAM_STALE_MS = 3 * SEGMENT_MS;

/**
 * How long to wait before calling a stream stopped.
 *
 * THE ROUND TRIP PLUS TWO SEGMENTS. A channel is written once per
 * round trip by construction, so patience shorter than the round
 * trip is a guaranteed false alarm; the two segments on top are the
 * slack for a pass that ran long, which is the same headroom
 * argument `CROWDED` makes one module over.
 *
 * A reader with no round trip — an old heartbeat from before the
 * engine recorded one, or none at all — gets the floor, which is
 * what this product did everywhere until it was measured.
 */
export function streamPatience(
  roundTripMs: number | null | undefined,
): number {
  if (roundTripMs === null || roundTripMs === undefined) return STREAM_STALE_MS;
  if (!Number.isFinite(roundTripMs) || roundTripMs <= 0) return STREAM_STALE_MS;
  return Math.max(STREAM_STALE_MS, roundTripMs + 2 * SEGMENT_MS);
}

export type EngineState =
  /** A heartbeat, recently. */
  | 'running'
  /** A heartbeat since this web tier booted, but not lately: it died beside us. */
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
  /**
   * When the engine last said it was alive, as an instant.
   *
   * NOT "when it last finished a pass", which is what this meant
   * until a pass was measured at thirty-four seconds against a
   * fifteen-second patience. The counts below are still the last
   * pass's; this is the pulse. [ENGINE_PULSE_MS]
   */
  at: string;
  /** Which process, so two engines on one directory are visible. [D-20] */
  pid: number;
  /** How many channels that pass looked at. */
  channels: number;
  /** How many segments it produced. Zero is normal and not a fault. */
  made: number;
  /**
   * WHETHER IT IS KEEPING UP.  [§18, §7, C-41]
   *
   * The engine has measured how long each pass took since it was
   * written, and used the number only to decide how long to sleep.
   * A channel that takes longer to make four seconds of television
   * than four seconds is a channel falling behind — and nothing
   * fails, nothing throws, and the picture simply arrives later and
   * later until a player gives up.
   *
   * Absent on a heartbeat from a pass that produced nothing, which
   * is the healthy idle state and not a measurement.
   */
  pacing?: Pacing;
  /** The worst recent pass, as a fraction of real time. */
  load?: number;
  /**
   * HOW LONG UNTIL THE ENGINE COMES BACK TO A CHANNEL.  [§15, C-41]
   *
   * The fact the web tier could not have and had to assume. Every
   * patience in this file was a guess at it, and the guess was
   * three segments — right for one channel and wrong for
   * seventeen, where it was measured at 20.1 seconds.
   *
   * Absent on a heartbeat from an engine that has not completed a
   * pass yet, and on every heartbeat written before this existed:
   * readers fall back to the floor rather than to a number they
   * made up.
   */
  roundTripMs?: number;
  /**
   * WHETHER THE LEAD OUTLASTS THAT ROUND TRIP.  [pace.ts `reach`]
   *
   * The question `load` and `pacing` are structurally unable to
   * answer, because they divide by the SUM of every channel's
   * output: a seventeen-channel engine reported 0.18 and `easy`
   * while all seventeen ran out of playlist. Computed by the
   * engine, which is the only process holding both numbers.
   */
  reach?: Reach;
  /**
   * How much television it wrote ahead on the last pass.
   *
   * The other half of `reach`: without it the sentence can say a
   * channel is starving and not by how much, and a measurement
   * with one number missing reads as an opinion. [pace.ts]
   */
  leadMs?: number;
  /**
   * WHICH ENGINE THIS IS, AND HOW MANY THERE ARE.  [shard.ts, §11]
   *
   * Self-describing, so the web tier needs no configuration of its
   * own to know how many engines to expect. An installation that
   * scales out by adding a service and two environment variables
   * would otherwise need the same two set a third time, on a tier
   * that has no other reason to know them — and the day they
   * disagreed, the control room would report engines that were
   * never meant to exist. [D-19]
   *
   * Absent on a heartbeat from before this existed, which reads as
   * one engine serving everything: exactly what such an
   * installation had.
   */
  shard?: number;
  shards?: number;
}

/**
 * Is the engine alive, judged ONLY by its pulse.  [§18, §11, D-20]
 *
 * THERE WAS A THIRD ANSWER HERE AND IT WAS WRONG. `engineState` took
 * when THIS process booted, and called a heartbeat older than that
 * boot `earlier` — *"the engine has not been started in this
 * instance"*. The reasoning read well: the heartbeat lives on the
 * data volume, the volume outlives the container, so a stale file
 * can be inherited from a deployment that did run one.
 *
 * It is wrong because the engine is a SEPARATE SERVICE (§11, D-20),
 * and separate means it has its own lifetime. On the deployment this
 * product actually runs — web containers one service, a worker and a
 * playout service beside them, all on the same volume — the engine
 * is normally OLDER than the web container reading its beat: a web
 * redeploy restarts the web tier and leaves the engine running. So
 * the one state meant to catch a dead installation fired hardest on
 * a healthy one, and told the operator to go and check a `ROLE` that
 * was already correct.
 *
 * A FRESH PULSE IS A LIVE ENGINE, whoever wrote it and whenever this
 * reader booted. That is the whole of what the shared volume can
 * honestly say, so it is the whole of what this asks.
 */
export function engineState(
  beatAtMs: number | null | undefined, now: number,
): EngineState {
  if (beatAtMs === null || beatAtMs === undefined) return 'stopped';
  /*
   * A HEARTBEAT FROM THE FUTURE IS A CLOCK DISAGREEMENT, not a dead
   * engine, and on a split deployment the engine and this reader are
   * two machines — which is exactly the case D-20 leaves room for.
   * Treating it as stale would take a healthy channel off the board
   * because somebody's NTP drifted.
   *
   * TOLERATED WITHOUT LIMIT, deliberately, which is why this is
   * `now - beatAtMs` and not `Math.abs(...)`. There is no honest
   * bound to pick: a skew is as large as it is, and the alternative
   * reading — "the engine is dead" — is the one thing we know is
   * false, because something wrote that file.
   */
  return now - beatAtMs <= ENGINE_STALE_MS ? 'running' : 'stale';
}

/**
 * @param roundTripMs how long the engine takes to come back to this
 *   channel, from its heartbeat. Required rather than optional: a
 *   caller that cannot say would silently get the three-segment
 *   floor, and the floor is the answer that was wrong on every
 *   installation with more than a handful of channels. Pass `null`
 *   to mean "not known", which is a different thing from forgetting
 *   to pass it. [D-19]
 */
export function streamState(
  newestSegmentMs: number | null | undefined, now: number,
  roundTripMs: number | null | undefined,
): StreamState {
  if (newestSegmentMs === null || newestSegmentMs === undefined) return 'silent';
  return now - newestSegmentMs <= streamPatience(roundTripMs)
    ? 'transmitting' : 'stalled';
}

/* ------------------------------------------------------------------------ *
 *  Are all the engines there?  [shard.ts, §11, §15, D-20, D-21, U-19]
 * ------------------------------------------------------------------------ */

/**
 * HOW MANY ENGINES ARE MISSING, AND THEREFORE HOW MANY CHANNELS
 * ARE DARK WITH EVERYTHING ELSE GREEN.
 *
 * THE ONE FAULT SCALING OUT INTRODUCES. An installation runs
 * several playout engines, each serving its own share of the
 * channels and none of them aware of the others — no leases, no
 * coordinator, nothing to go wrong between them. The price of that
 * is this: an engine that dies takes its channels off the air and
 * no other engine picks them up.
 *
 * AND EVERY EXISTING SIGNAL WOULD STAY GREEN. `engineState` reads
 * the freshest beat and finds one, because the other engines are
 * perfectly healthy; `pacing` and `reach` come from engines with
 * nothing wrong. A viewer on an orphaned channel sees the picture
 * stop and the control room, asked the questions it knew how to
 * ask, would answer that everything is fine. A fault that no
 * instrument on the desk can see is the shape this product keeps
 * finding in itself, and the answer is always the same: measure
 * the thing nobody is measuring. [C-24, C-28, U-02]
 *
 * COUNTED FROM THE HEARTBEATS THEMSELVES and not from a setting,
 * because each engine records how many there are supposed to be.
 * The web tier needs no configuration it could disagree with.
 */
export function enginesMissing(
  beats: readonly Heartbeat[], now: number,
): { expected: number; running: number; missing: number } {
  const alive = beats.filter(
    (one) => engineState(Date.parse(one.at), now) === 'running');
  /*
   * THE LARGEST ANY LIVE ENGINE CLAIMS. A dead engine's file is
   * still on disk saying `shards: 3`, and counting it would hold
   * the expectation at three for ever after a deliberate scale
   * DOWN to two — a permanent alarm about an engine nobody wants.
   * Taken from the living, which is what the deployment currently
   * is. [D-21]
   */
  const expected = Math.max(1, ...alive.map((one) => one.shards ?? 1));
  /* By index, so two files from one engine cannot look like two. */
  const running = new Set(alive.map((one) => one.shard ?? 0)).size;
  return { expected, running, missing: Math.max(0, expected - running) };
}

/**
 * What to tell the operator when an engine has gone.
 *
 * NAMING THE CONSEQUENCE, which here is the only thing that
 * matters: not "an engine is missing" but "a share of your
 * channels is off the air, and it is not the ones you are looking
 * at". An operator checking a healthy channel would otherwise find
 * nothing wrong and conclude the report was mistaken. [D-21, D-04]
 */
export function enginesSay(
  { expected, running, missing }: { expected: number; running: number; missing: number },
): string | null {
  if (missing <= 0) return null;
  const share = `about ${Math.round((missing / expected) * 100)}% of your channels`;
  /* One engine or several, said in the same sentence without
     reading as though it were written for the other case. */
  const one = missing === 1;
  return `${missing} of ${expected} playout engines ${one ? 'is' : 'are'} not `
    + `reporting. The channels ${one ? 'it serves' : 'they serve'} — ${share} — `
    + `are off the air, and the ${running} still running cannot take them over: `
    + 'each engine serves its own share and does not watch the others. Start '
    + `the missing ${one ? 'service' : 'services'}, or lower PLAYOUT_SHARDS on `
    + 'the rest so the channels are shared out again.';
}

/* ------------------------------------------------------------------------ *
 *  Is anything draining the queue?  [D-13, D-21, U-19, U-23]
 * ------------------------------------------------------------------------ */

/**
 * How long a job may sit untouched before nothing is consuming them.
 *
 * The worker polls every 400ms (`POLL_MS`), so a job that has not been
 * CLAIMED after half a minute has not been seen by anybody — seventy-five
 * polls late. Generous on purpose: this sentence says an installation is
 * misconfigured and must never say it about a worker that was briefly
 * busy.
 */
export const UNATTENDED_MS = 30_000;

/**
 * Nothing has picked the work up.  [D-13, D-21]
 *
 * THE FAULT THIS ANSWERS, reported from a running installation:
 *
 * > *"music get stuck in studio 2 and show preparing and never
 * > complete preparing"*
 *
 * Studio Two shows *"Preparing the song…"* until the master has been
 * normalised and measured, which is a job, and a job is run by the
 * WORKER — a separate process, like the playout engine. On an
 * installation where nothing is draining the queue the song is never
 * prepared, and the one word the room says about it is "Preparing",
 * for ever. A spinner with nothing behind it is the thing D-13 is
 * about.
 *
 * `serve.sh` says it in its own header — *"a container running a web
 * tier with no worker looks healthy and quietly accepts recordings it
 * will never render"* — and that is exactly what it looked like.
 *
 * NEVER CLAIMED IS THE SIGNAL, not "waiting a long time". A worker
 * chewing through a long render leaves everything behind it pending
 * for minutes, and that is a queue working. What cannot happen while
 * anything is consuming is a job that has never been STARTED going
 * stale: claiming takes one poll.
 *
 * AND THE WHOLE QUEUE IS ASKED, not this document's. A worker busy
 * with somebody else's render has this document's job pending and
 * nothing of this document's running — which, judged on one
 * document, looks exactly like no worker at all. [U-02]
 */
export function unattended(
  jobs: readonly {
    state: string; createdAt: string; startedAt?: string | undefined;
  }[],
  now: number,
): boolean {
  /* Something is being worked on, so something is working. */
  if (jobs.some((job) => job.state === 'running')) return false;
  return jobs.some((job) => {
    if (job.state !== 'pending' || job.startedAt) return false;
    const made = Date.parse(job.createdAt);
    return Number.isFinite(made) && now - made > UNATTENDED_MS;
  });
}

/** What to tell the operator of an installation with no worker. */
export const NO_WORKER =
  'Nothing is preparing this. Work is queued and no worker has claimed it '
  + 'for half a minute, which means no worker process is running on this '
  + 'installation — it is a separate process from the web tier. Start one '
  + 'with ROLE=all or ROLE=worker.';

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

  /*
   * THE HEARTBEAT IS THE ONLY THING THAT KNOWS.  [§18, U-23, D-21]
   *
   * THE SENTENCE THAT WAS HERE READ THE WEB CONTAINER'S OWN `ROLE`
   * and told the operator, when it found `web`, that *"nothing here
   * was ever going to transmit"*. On a SPLIT deployment — web
   * containers at `ROLE=web`, the worker and the engine their own
   * services, all sharing `/data` — that is the correct
   * configuration, and the sentence called it a misconfiguration
   * with complete confidence. Exactly the failure it was written to
   * replace, pointed the other way.
   *
   * THE WEB TIER CANNOT TELL THE TWO APART AND MUST NOT TRY.
   * `ROLE=web` means "this container is not the engine"; it says
   * nothing whatever about whether an engine exists beside it. The
   * only thing that does is the pulse the engine leaves on the
   * shared volume, which is the one fact both topologies agree on
   * — and the reason `playout.json` is on `/data` rather than in
   * the channel document. The engine is judged by its heartbeat and
   * by nothing else.
   */
  if (engine === 'stopped') {
    return 'No playout engine has ever written to this storage, so nothing '
      + 'is being made for any channel. The engine is a separate process '
      + 'from this web tier: start a service with ROLE=playout against the '
      + 'same volume, run one container with ROLE=all, or '
      + 'npm run start:playout beside it.';
  }
  if (engine === 'stale') {
    return 'The playout engine has stopped responding. It last reported a '
      + 'while ago and nothing has been written since. It is a separate '
      + 'process, so its own log is where the reason is — the service '
      + 'running ROLE=playout, or the container running ROLE=all.';
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
  /**
   * AND WHETHER IT IS KEEPING UP.  [§18, §7, C-41]
   *
   * Below a render failure and above everything else, which is
   * where it belongs on the evidence: a channel that has started
   * falling behind is still transmitting, still green, and still
   * producing segments — it is simply producing them slower than
   * the clock, and every one after this is further behind. Nothing
   * else in this file can reveal it, which is the same argument
   * that puts a black render first.
   */
  behind?: { says: string } | null,
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
  if (behind) return { says: behind.says, tone: 'fault' };
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
