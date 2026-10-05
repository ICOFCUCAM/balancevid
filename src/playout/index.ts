/**
 * The playout engine, running.  [Doctrine CHANNEL §7, D-18, U-23]
 *
 * "The playout engine continuously reads scheduled assets and produces the
 *  broadcast stream."
 *
 * A PROCESS, NOT A JOB. Everything else that shells out to ffmpeg in this
 * product is a unit of work that finishes — ingest a source, assemble a take,
 * render a master — and the queue exists to run those one at a time without
 * blocking the web tier (U-23). A broadcast does not finish. Putting it in
 * the queue would mean either a job that never completes, holding the single
 * consumer forever so no render ever runs again, or nine hundred jobs an hour
 * whose only purpose is to not be that.
 *
 * So: `npm run playout`, beside `npm run start:worker`. It keeps each
 * channel's stream a few segments ahead of the playhead and sweeps what has
 * fallen out of the window behind it. The web tier still never runs ffmpeg;
 * it serves files this process wrote, exactly as it serves renders the worker
 * wrote.
 *
 * IT HOLDS NO STATE OF ITS OWN. Which segments exist is a fact about the
 * directory, and what should be in them is a fact about the schedule. Restart
 * it and it picks up where the clock is, not where it left off — which is the
 * only correct behaviour for a thing whose job is to agree with the time.
 */

import {
  access, mkdir, readdir, rename, rm, stat, writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Channel } from '../domain/channel.js';
import {
  SEGMENT_MS, WINDOW_SEGMENTS, livePlaylist, segmentIndexAt,
} from '../domain/playout.js';
import { referencedAssets } from '../domain/channel.js';
import {
  auditChannel, listChannels, loadChannel, saveChannel,
} from '../store/channels.js';
import { faultLive, recoverLive } from '../domain/channelEdit.js';
import { paths } from '../store/paths.js';
import { pathFor } from '../store/playoutSources.js';
import { ffprobe } from '../render/ffmpeg.js';
import { beat } from '../store/playoutHealth.js';
import { produceRenditions } from './audioRendition.js';
import { produceSubtitle } from './subtitleRendition.js';
import { produceSegment, type SourceFacts } from './segment.js';
import { streamLadder } from '../domain/quality.js';
import { reconcileSenders, settle, stopAllSenders } from './send.js';
import {
  type Pace, type Pacing, keep, pacing, worstLoad,
} from '../domain/pace.js';
import { measureLoudness } from '../render/ffmpeg.js';
import { gainFor } from '../domain/loudness.js';
import { type Aired, type Ran, fold } from '../domain/asRun.js';
import { recordRan } from '../store/asRun.js';

/**
 * How far ahead of the playhead to keep the stream.
 *
 * Two segments — eight seconds. Enough that a slow encode does not starve the
 * playlist, short enough that an edit to the schedule reaches the wire within
 * ten seconds. A channel that ran a minute ahead would ignore a correction
 * made at 20:59 for a programme at 21:00, which is the one moment corrections
 * are made.
 */
const AHEAD_SEGMENTS = 2;

/** How long to wait between passes when there is nothing to do. */
const IDLE_MS = 1000;

/**
 * What a source file is, measured once.
 *
 * Probing costs a process launch, and a channel asks about the same film
 * every four seconds for an hour. The cache is keyed by path and holds for
 * the life of the process: a render addressed by plan hash is immutable by
 * construction, so a stale answer is not a risk the way it would be for a
 * file somebody can overwrite. [U-16]
 */
const facts = new Map<string, SourceFacts | undefined>();

/* ------------------------------------------------------------------------ *
 *  How loud each item is.  [§5, §10, U-23, C-33]
 * ------------------------------------------------------------------------ */

/**
 * The gain each file plays at, once somebody has measured it.
 *
 * MEASURED OFF THE CRITICAL PATH, which is the whole of the design
 * here. Integrated loudness is a property of a WHOLE item — that is
 * what makes it the right thing to normalise against, and it is also
 * what makes measuring it cost a full decode. A forty-minute film
 * takes a minute to scan, and a segment has four seconds to be
 * ready: measuring inline would take the channel off the air to
 * improve its audio, which is a trade nobody would choose.
 *
 * So the engine asks, carries on at the item's own level, and
 * applies the gain from the pass after the answer lands. The first
 * minutes of the first play of a new item are as they are today,
 * and everything after is at the house loudness. A product that
 * waited to be perfect would be a product that stuttered.
 */
const gains = new Map<string, number>();

/** One at a time, because a scan is a full decode. */
let measuring: Promise<void> = Promise.resolve();
const asked = new Set<string>();

/**
 * Ask for an item's loudness, at most once, and never wait for it.
 *
 * QUEUED RATHER THAN PARALLEL. Six assets in a rotation would be six
 * concurrent decodes on the box that also has to keep the channel on
 * the air, and the engine would miss segments to measure the things
 * it was late for.
 */
function wantLoudness(path: string): void {
  if (asked.has(path)) return;
  asked.add(path);
  measuring = measuring.then(async () => {
    const measured = await measureLoudness(path).catch(() => undefined);
    if (!measured) return;
    const gain = gainFor(measured);
    gains.set(path, gain);
    process.stdout.write(
      `playout: ${path.split('/').pop()} is ${measured.lufs.toFixed(1)} LUFS, `
      + `playing at ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} dB\n`);
  }).catch(() => undefined);
}

/** What this file should play at, or nothing if nobody has measured it. */
export function gainOf(path: string): number | undefined {
  return gains.get(path);
}

async function factsFor(path: string): Promise<SourceFacts | undefined> {
  if (facts.has(path)) return facts.get(path);
  let measured: SourceFacts | undefined;
  try {
    /*
     * The CHEAP probe, not `render/probe.ts`. That one counts frames, because
     * everything downstream of it has to be frame-exact (INV-02); this one
     * needs to know how long a film is to the nearest millisecond so a loop
     * comes round in the right place, and counting seventy thousand frames of
     * a forty-minute film to learn that would put a minute of work in front
     * of a segment that has four seconds to be ready.
     */
    const raw = await ffprobe([
      '-v', 'error', '-print_format', 'json',
      '-show_entries', 'format=duration:stream=codec_type',
      path,
    ]);
    const json = JSON.parse(raw) as {
      format?: { duration?: string };
      streams?: { codec_type?: string }[];
    };
    const durationMs = Math.round(Number(json.format?.duration ?? 0) * 1000);
    measured = durationMs > 0
      ? {
        durationMs,
        /*
         * COUNTED, NOT TESTED FOR. The same walk either way,
         * and the count is the question an alternate rendition
         * asks: a channel carrying three languages must know
         * whether this file has a third stream before it maps
         * one. [audioRendition.ts]
         */
        audioStreams: (json.streams ?? [])
          .filter((s) => s.codec_type === 'audio').length,
      }
      : undefined;
  } catch {
    measured = undefined;
  }
  facts.set(path, measured);
  return measured;
}

/**
 * Bring one channel's stream up to the clock.
 *
 * Produces any segment in [now, now + ahead] that is not already there, then
 * sweeps everything older than the playlist's window. Returns how many it
 * made, so a caller can tell a busy pass from an idle one.
 */
export async function advance(channel: Channel, nowMs = Date.now()): Promise<number> {
  const current = segmentIndexAt(nowMs);
  /*
   * Everything the schedule can possibly ask for in this pass, measured
   * before the first encode. Doing it inside the encode would put a probe on
   * the critical path of a segment that has four seconds to be ready.
   */
  for (const source of referencedAssets(channel)) {
    /*
     * A still has no duration to measure and probing one would cache an
     * `undefined` that then reads as "unplayable" and puts black on air where
     * a caption card should be. Its slot says how long it is held. [§3]
     */
    if (source.kind === 'media' && source.form === 'image') continue;
    const path = pathFor(channel, source);
    if (!path) continue;
    const measured = await factsFor(path);
    /* A still and a silent file have no loudness to correct. */
    if ((measured?.audioStreams ?? 0) > 0) wantLoudness(path);
  }

  let made = 0;
  for (let index = current; index <= current + AHEAD_SEGMENTS; index += 1) {
    const target = paths.channelSegment(channel.id, index);
    try {
      await access(target);
      continue;
    } catch { /* not there yet, which is why we are here. */ }
    const aired = await produceSegment(
      channel, index, (path) => facts.get(path), gainOf);
    await logAired(channel.id, aired);
    /*
     * AND THE ALTERNATE LANGUAGES, AFTER THE PICTURE AND NEVER
     * BEFORE.  [N-10, §17]
     *
     * The picture is what a channel IS. An engine that spent
     * its four seconds on a French audio track and missed the
     * frame would have the priority exactly backwards — so
     * this runs once the segment is on the disk, and a channel
     * that declares no second language does nothing at all
     * here.
     *
     * NOT IN THE AS-RUN. The as-run records what went out on
     * the wire, and the wire is one broadcast: a rendition is
     * the same programme in another language, not a second
     * thing that was transmitted.
     */
    /*
     * AND THE LOWER RUNGS, BETWEEN THE PICTURE AND THE
     * LANGUAGES.  [§7, §23]
     *
     * After the house rendition, because that is the one a
     * set-top box is already reading and the one the as-run
     * records; before the audio and the captions, because a
     * viewer whose line cannot carry 720p has no picture at
     * all until this runs, and a viewer choosing a language
     * has one.
     *
     * ONE RUNG'S FAILURE DOES NOT TAKE THE OTHERS, and none of
     * them takes the house rendition: a rung with a missing
     * segment is a player stepping back up to the one above
     * it, which is what a ladder is for. [U-19]
     *
     * NOT IN THE AS-RUN. The as-run records what the channel
     * transmitted, and a rung is the same programme at another
     * size rather than a second thing that went out.
     */
    for (const rung of LADDER) {
      await produceSegment(
        channel, index, (path) => facts.get(path), gainOf, {}, rung)
        .catch(() => undefined);
    }
    await produceRenditions(channel, index, (path) => facts.get(path), gainOf);
    /*
     * AND THE WORDS, LAST OF THE THREE.  [§17, N-10]
     *
     * The same order and the same reason: the picture, then
     * the languages somebody paid for, then the captions —
     * which cost no encode at all, because they are text being
     * cut on a grid rather than bytes being made. A channel
     * that has not switched them on does nothing here.
     *
     * NOT IN THE AS-RUN EITHER. A caption track is the same
     * programme with its own words written down, not a second
     * thing that was transmitted.
     */
    await produceSubtitle(channel, index, (path) => facts.get(path));
    made += 1;
  }

  /*
   * THE RENDITIONS ARE SWEPT WITH THE PICTURE, by the same
   * arithmetic. A language directory that kept its segments
   * after the video's had gone would be the archive D-18
   * forbids, one track at a time.
   */
  await sweep(channel.id, current - WINDOW_SEGMENTS - AHEAD_SEGMENTS);
  return made;
}

/**
 * Delete what has fallen out of the window.
 *
 * THIS IS WHAT MAKES THE SEGMENTS NOT A COPY. A file that is written, served
 * for half a minute and deleted is transport; a file that accumulates is an
 * archive, and an archive of the broadcast is exactly the duplication D-18
 * forbids — the whole schedule, re-encoded, forever, with nobody having asked
 * for it. Somebody who wants that asks for a recording (§6).
 */
/* ------------------------------------------------------------------------ *
 *  The as-run.  [§5, §18, D-18, C-32]
 * ------------------------------------------------------------------------ */

/**
 * The stretch each channel is in the middle of.
 *
 * HELD IN MEMORY AND WRITTEN ONCE. A stretch grows four seconds at
 * a time for as long as a programme lasts, and appending a line per
 * segment would turn a half-hour programme into 450 lines of a file
 * somebody is meant to read. Only the finished shape is written.
 *
 * The cost is that an engine killed mid-programme loses the open
 * stretch, which is why `main` closes them on the way out — and why
 * losing one is survivable: the segments it describes are gone too,
 * swept within the minute, so there is nothing it could be checked
 * against anyway.
 */
const openRun = new Map<string, Ran>();

async function logAired(channelId: string, aired: Aired): Promise<void> {
  const open = openRun.get(channelId);
  const folded = fold(open ? [open] : [], aired);
  /* Two entries means the one that was open has ended. */
  if (folded.length > 1) {
    await recordRan(channelId, folded[0]!).catch(() => undefined);
  }
  openRun.set(channelId, folded[folded.length - 1]!);
}

/** Write down whatever was still running. Called on the way out. */
async function closeRuns(): Promise<void> {
  for (const [channelId, ran] of openRun) {
    await recordRan(channelId, ran).catch(() => undefined);
  }
  openRun.clear();
}

/**
 * The playlist a sender reads.  [§15, D-21, C-29]
 *
 * THE SAME `livePlaylist` THE VIEWER'S ROUTE CALLS, rendering
 * absolute file paths instead of URLs. One generator, two
 * renderings, so a sender and a viewer cannot be watching different
 * windows of the same channel — which is the whole of D-21's *"one
 * master broadcast output, and destinations receive that output"*.
 *
 * Written every pass because the window moves every pass, and
 * through a temp file like every other write here, so a sender
 * reading it never catches it half-written.
 */
async function writeSenderPlaylist(
  channelId: string, nowMs: number,
): Promise<void> {
  const path = paths.senderPlaylist(channelId);
  await mkdir(dirname(path), { recursive: true });
  const body = livePlaylist(
    nowMs, (index) => paths.channelSegment(channelId, index));
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, body, 'utf8');
  await rename(temp, path);
}

async function sweep(channelId: string, before: number): Promise<void> {
  if (before <= 0) return;
  await sweepDir(paths.channelStream(channelId), before);
  /*
   * AND EVERY ALTERNATE LANGUAGE, ON THE SAME ARITHMETIC.
   *   [N-10, D-18]
   *
   * A language directory that kept its segments after the
   * picture's had gone would be exactly the archive D-18
   * forbids — the whole schedule, re-encoded, for ever, one
   * audio track at a time. Read off the DISK rather than off
   * the document, so a language a broadcaster REMOVED is still
   * swept: the list in `station.audio` is what should be
   * written from now on, and the files already there are
   * nobody's but this function's.
   */
  /*
   * AND THE CAPTIONS, WHICH ARE LAID OUT THE SAME WAY AND ARE
   * THE SAME KIND OF THING. A caption segment is a few hundred
   * bytes, which is the argument for forgetting to sweep it and
   * is not a good one: a channel captioning twenty hours a day
   * writes eighteen thousand files a day, and a directory that
   * large is slow to read long before it is large on disk. [§17]
   */
  await Promise.all([
    sweepUnder(paths.channelRungRoot(channelId),
      (one) => paths.channelRung(channelId, one), before),
    sweepUnder(paths.channelAudioRoot(channelId),
      (one) => paths.channelAudio(channelId, one), before),
    sweepUnder(paths.channelSubtitleRoot(channelId),
      (one) => paths.channelSubtitle(channelId, one), before),
  ]);
}

/** Every language directory under one root, on the same arithmetic. */
async function sweepUnder(
  root: string, dirOf: (language: string) => string, before: number,
): Promise<void> {
  let languages: string[];
  try {
    languages = (await readdir(root, { withFileTypes: true }))
      .filter((one) => one.isDirectory()).map((one) => one.name);
  } catch {
    return;
  }
  await Promise.all(languages.map((one) => sweepDir(dirOf(one), before)));
}

/**
 * THE RUNGS THIS DEPLOYMENT TRANSMITS, read once at import.
 *
 * For the reason `STREAM` is: a ladder that could change
 * between segment 4,102 and 4,103 is a player discovering that
 * the rung it chose has stopped existing. Restarting the engine
 * is the honest way to change it. [segment.ts]
 */
const LADDER = streamLadder();

/** Everything in one directory whose index is behind the window. */
async function sweepDir(dir: string, before: number): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return;
  }
  await Promise.all(entries.map(async (name) => {
    const index = Number.parseInt(name, 10);
    /*
     * A half-written `.tmp.ts` or `.part.ts` from a process that died mid
     * segment is swept on the same rule: it is named for its index, and if
     * that index is behind the window it is never going to be served.
     */
    if (!Number.isFinite(index) || index >= before) return;
    await rm(join(dir, name), { force: true });
  }));
}

/**
 * Every channel, once. Exported so a test can drive one pass.
 *
 * `announce` is off by default so a test driving a pass does not overwrite
 * the heartbeat of an engine that is genuinely running beside it.
 */
export async function pass(
  nowMs = Date.now(), announce = false,
  /** What the LAST few passes said about keeping up. [C-41] */
  how: { pacing?: Pacing; load?: number } = {},
): Promise<number> {
  const channels = await listChannels();
  let made = 0;
  for (const channel of channels) {
    /*
     * Re-read rather than trusting the listing: a pass takes seconds and the
     * schedule may have been edited during the previous one. A playout engine
     * working from a stale document is a channel broadcasting what somebody
     * has just cancelled.
     */
    const fresh = await loadChannel(channel.id).catch(() => channel);
    /*
     * BEFORE THE SEGMENTS, because a faulted feed changes what they contain.
     * Checked every pass rather than on a timer: the pass IS the timer, and a
     * second one would be a second thing that can stop.
     */
    await watchTheFeed(fresh, nowMs);
    made += await advance(fresh, nowMs).catch(() => 0);
    /*
     * AND THEN THE SENDERS, AFTER the segments, because a sender
     * started before there is anything to read spends its first
     * seconds failing on an empty playlist and earns a backoff it
     * did not deserve.
     *
     * CAUGHT, ALWAYS. A push to somebody else's ingest must never be
     * able to stop the television channel: the worst an unreachable
     * platform may do is leave its own destination blocked with a
     * reason. [D-21, §5]
     */
    await writeSenderPlaylist(fresh.id, nowMs).catch(() => undefined);
    await reconcileSenders(fresh, nowMs).catch((error: unknown) => {
      process.stderr.write(`playout: senders ${String(error).slice(0, 200)}\n`);
    });
  }
  settle(nowMs);
  /*
   * THE PULSE, AT THE END OF THE PASS rather than the start.  [§18]
   *
   * At the start it would say "alive" and then spend thirty seconds wedged
   * on a broken encode, which is the failure a heartbeat exists to catch.
   * Written after the work means the timestamp is the last moment the engine
   * demonstrably completed something.
   */
  if (announce) {
    await beat({ channels: channels.length, made, ...how })
      .catch(() => undefined);
  }
  return made;
}

/* ------------------------------------------------------------------------ *
 *  The process.
 * ------------------------------------------------------------------------ */

async function main(): Promise<void> {
  let running = true;
  const stop = () => { running = false; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  /* A sender outliving the engine is a push to somebody's ingest that
     nothing is supervising any more. */
  process.on('exit', stopAllSenders);

  process.stdout.write('playout: on air\n');
  /* The last few passes, so one slow segment is not a verdict. [C-41] */
  let paces: Pace[] = [];
  while (running) {
    const started = Date.now();
    let made = 0;
    try {
      made = await pass(Date.now(), true, {
        ...(pacing(paces) === 'unknown' ? {} : { pacing: pacing(paces) }),
        ...(worstLoad(paces) === null ? {} : { load: worstLoad(paces)! }),
      });
    } catch (error) {
      /*
       * A pass that threw is a pass, not the end of the channel. The most
       * likely causes — a document being rewritten as it was read, a render
       * deleted mid-encode — are transient, and a broadcast that stopped for
       * them would be off air until somebody noticed.
       *
       * IT STILL BEATS. The process is alive and trying, and a heartbeat
       * skipped here would report it dead while it was recovering — sending
       * somebody to restart a thing that did not need restarting. What a
       * failing pass produces is zero segments, and the per-channel stream
       * check is what notices that. [§18]
       */
      process.stderr.write(`playout: ${String(error).slice(0, 300)}\n`);
      await beat({ channels: 0, made: 0 }).catch(() => undefined);
    }
    const spent = Date.now() - started;
    /*
     * AND THE NUMBER IS WRITTEN DOWN AT LAST.  [§18, §7, C-41]
     *
     * `spent` has been computed here since this loop was written and
     * used only to decide how long to sleep. It is the number that
     * says whether this product is a television station or a
     * slideshow: four seconds of broadcast made in more than four
     * seconds is a channel that falls further behind every pass,
     * and nothing fails while it happens.
     *
     * Measured against what the pass PRODUCED rather than against
     * the segment length, because a pass that made three segments
     * had twelve seconds of television to make and twelve seconds
     * of grace to make it in.
     */
    if (made > 0) {
      paces = keep(paces, { spentMs: spent, coveredMs: made * SEGMENT_MS });
    }
    if (made === 0) {
      await new Promise((resolve) => { setTimeout(resolve, IDLE_MS); });
    } else if (spent < SEGMENT_MS / 4) {
      await new Promise((resolve) => { setTimeout(resolve, 200); });
    }
  }
  /*
   * THE OPEN STRETCHES GO DOWN BEFORE THE PROCESS DOES. An as-run
   * missing the programme that was on when the engine was stopped is
   * an as-run missing the thing somebody is most likely to ask about.
   */
  await closeRuns();
  process.stdout.write('playout: off air\n');
}

/* Run only when started directly, so the module can be imported by a test. */
if (process.argv[1]?.endsWith('playout/index.ts')
  || process.argv[1]?.endsWith('playout/index.js')) {
  void main();
}

/* ------------------------------------------------------------------------ *
 *  Watching the feed.  [Doctrine CHANNEL §9]
 * ------------------------------------------------------------------------ */

/**
 * How long a live buffer may stop growing before the channel gives up on it.
 *
 * Ten seconds: five chunks. Shorter and a presenter on a slow connection
 * would be cut off for a hiccup; longer and the viewer watches a frozen
 * frame for a quarter of a minute, which is the thing this exists to prevent.
 *
 * It is comfortably inside the twelve-second broadcast delay, which matters:
 * the failover happens before the last of the good buffer has gone out, so
 * the cut to backup lands on a picture rather than after one has frozen.
 */
const STALE_MS = 10_000;

/** The last size we saw each live buffer at, and when. */
const watched = new Map<string, { size: number; at: number }>();

/**
 * Is the feed still arriving?
 *
 * By watching the FILE, not the network. The encoder is in somebody's
 * browser on the other side of the world and cannot be asked; what can be
 * observed is whether bytes are landing, which is the only thing that
 * actually matters — a connection that is up and delivering nothing is a
 * failure with a green light on it.
 */
async function watchTheFeed(channel: Channel, nowMs: number): Promise<void> {
  const live = channel.live;
  if (!live || live.phase !== 'on_air') { watched.delete(channel.id); return; }
  const ingest = channel.ingests.find((entry) => entry.id === live.ingestId);
  if (!ingest) return;

  const path = paths.channelLiveBuffer(channel.id, ingest.bufferId);
  let size = 0;
  try {
    size = (await stat(path)).size;
  } catch {
    /* Not created yet is not a fault — the first chunk is still in flight. */
    if (!watched.has(channel.id)) {
      watched.set(channel.id, { size: 0, at: nowMs });
      return;
    }
  }

  const seen = watched.get(channel.id);
  if (!seen || size > seen.size) {
    watched.set(channel.id, { size, at: nowMs });
    if (live.faultedAt && recoverLive(channel)) {
      /*
       * IT CAME BACK. Saved at once, because the studio and the playlist both
       * read this and a presenter who has reconnected should see themselves
       * on air rather than a caption card.
       */
      await saveChannel(channel);
      await auditChannel(channel.id, {
        action: 'channel.feed-recovered',
        detail: { ingestId: ingest.id, bytes: size },
      });
    }
    return;
  }

  if (nowMs - seen.at >= STALE_MS && faultLive(channel, new Date(nowMs).toISOString())) {
    await saveChannel(channel);
    await auditChannel(channel.id, {
      action: 'channel.feed-lost',
      detail: { ingestId: ingest.id, silentMs: nowMs - seen.at, bytes: size },
    });
  }
}
