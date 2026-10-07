/**
 * Which engine serves which channel.  [CHANNEL §11, §15, §18;
 *   Doctrine D-19, D-20, D-21, U-02, U-23]
 *
 * THE SEAM D-20 KEPT OPEN, NOW USABLE. `serve.sh` has had
 * `ROLE=playout` since the day the engine was separated, and the
 * header says what it is for: *"scaling them apart later is a ROLE
 * change, not a code change"*. That was true of MOVING the engine
 * off the web box. It was not true of running TWO of them.
 *
 * TWO ENGINES WOULD HAVE DONE EVERYTHING TWICE. `listChannels()`
 * returns every channel to whoever asks, so a second playout
 * service encodes the same seventeen channels the first one is
 * already encoding: twice the work, twice the electricity, and not
 * one channel served sooner. Segments are written to a temp name
 * and renamed, so nothing corrupts — it is simply wasted, which is
 * the kind of fault that looks like it is working.
 *
 * WHY THIS MATTERS NOW AND NOT BEFORE. The channels on the
 * measured installation are fixtures; the real ones arrive when
 * people subscribe, and capacity is bought per subscriber. So the
 * question was never "can one box run seventeen" — it is whether
 * there is anywhere to PUT the eighteenth. Until an engine can be
 * told which channels are its own, the answer is one box for ever,
 * and the ceiling is whatever that box encodes.
 *
 * STATIC, AND DELIBERATELY NOT A REGISTRY. Each engine is told its
 * own index and how many there are, and derives the rest. No
 * leases, no claims, no coordinator, no shared mutable state —
 * which matters because the alternative is a second thing that can
 * fail, in a tier whose entire job is to keep running while nobody
 * is looking. Two engines never argue about a channel, because
 * neither is asking the other.
 *
 * WHAT IT COSTS, SAID PLAINLY: an engine that dies takes its own
 * channels off the air and no other engine picks them up. That is
 * the honest trade for having no coordinator, and it is not
 * allowed to be silent — each engine beats to its own file and the
 * control room says which shard stopped. A fault that announces
 * itself is worth more here than a mechanism that hides it. [D-21]
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

/** Which engine this is, and how many there are. */
export interface Shard {
  /** This engine's own index, from zero. */
  index: number;
  /** How many engines are serving the installation. */
  of: number;
}

/** One engine serving everything, which is what every deployment was. */
export const ALONE: Shard = { index: 0, of: 1 };

/**
 * A stable number for a channel id.
 *
 * FNV-1a, WRITTEN OUT, because this module must stay importable by
 * both tiers and `sha256` would drag `node:crypto` behind it —
 * `libraryUpload.ts` records what happens when a domain table
 * pulls `node:fs` into a browser bundle. Nothing here is a
 * security decision: the only property needed is that every
 * process computes the same number for the same id, for ever.
 *
 * IT MUST NEVER CHANGE. The hash decides which engine owns a
 * channel, so altering it moves live channels between engines
 * mid-broadcast — both would skip it for one pass, which is a hole
 * in the picture for every viewer. If a better spread is ever
 * wanted, it is a deployment-wide restart, not a patch.
 */
function numberFor(id: string): number {
  let hash = 0x811c9dc5;
  for (let at = 0; at < id.length; at += 1) {
    hash ^= id.charCodeAt(at);
    /* The FNV prime, by shifts, so this stays in 32 bits without
       `Math.imul` rounding through a double. */
    hash += (hash << 1) + (hash << 4) + (hash << 7)
      + (hash << 8) + (hash << 24);
    hash >>>= 0;
  }
  return hash >>> 0;
}

/** Which engine a channel belongs to. */
export function shardOf(channelId: string, of: number): number {
  if (!Number.isInteger(of) || of < 1) return 0;
  return numberFor(channelId) % of;
}

/**
 * Is this channel mine?
 *
 * EXACTLY ONE ENGINE SAYS YES, for every channel and every
 * configuration — which is the whole correctness condition and the
 * one a test can actually hold. A channel claimed by two is
 * duplicated work; a channel claimed by none is a channel off the
 * air with nothing reporting it.
 */
export function ownsChannel(channelId: string, shard: Shard): boolean {
  return shardOf(channelId, shard.of) === shard.index;
}

/**
 * What the deployment said this engine is.
 *
 * THE DEFAULT IS ONE ENGINE SERVING EVERYTHING, so an installation
 * that sets nothing behaves exactly as every installation did
 * before this existed. Scaling out is adding a service and two
 * environment variables, which is the `ROLE` argument again: a
 * deployment change, not a code change. [D-20]
 *
 * A BAD CONFIGURATION THROWS RATHER THAN GUESSING, because both
 * ways of guessing are catastrophic and silent. Read as "serve
 * nothing", a typo takes channels off the air with every process
 * healthy; read as "serve everything", two engines duplicate the
 * installation and the operator sees only a mysteriously slow
 * one. The container not coming up is the loud failure, and the
 * loud failure is the right one. [D-21, U-19]
 */
export function readShard(
  env: { PLAYOUT_SHARD?: string | undefined; PLAYOUT_SHARDS?: string | undefined },
): Shard {
  const saidIndex = (env.PLAYOUT_SHARD ?? '').trim();
  const saidOf = (env.PLAYOUT_SHARDS ?? '').trim();
  /*
   * NO SHORTCUT FOR "NOTHING SET", because the ordinary path
   * already answers it: blank means one engine and index zero,
   * which is `ALONE`. An `if (both blank) return ALONE` stood
   * here and a mutation deleting it passed every test — rightly,
   * since no input could tell the two apart. Deleted rather than
   * defended; the behaviour it promised is asserted instead. [U-02]
   */
  const of = saidOf === '' ? 1 : Number(saidOf);
  const index = saidIndex === '' ? 0 : Number(saidIndex);
  if (!Number.isInteger(of) || of < 1) {
    throw new Error(
      `PLAYOUT_SHARDS must be a whole number of one or more, not '${saidOf}'`);
  }
  if (!Number.isInteger(index) || index < 0 || index >= of) {
    throw new Error(
      `PLAYOUT_SHARD must be between 0 and ${of - 1} for `
      + `PLAYOUT_SHARDS=${of}, not '${saidIndex}'`);
  }
  return { index, of };
}

/** How an engine names itself in a log and in its heartbeat. */
export function shardSays(shard: Shard): string {
  return shard.of === 1 ? 'the only engine' : `engine ${shard.index + 1} of ${shard.of}`;
}
