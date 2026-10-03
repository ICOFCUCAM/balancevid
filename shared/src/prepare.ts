/**
 * Whether this machine can actually record what is plugged into it.
 *   [Doctrine U-19, D-21; TAKE-DESKTOP T-3]
 *
 * > *"Refuses to arm with a reason rather than failing mid-record."*
 *
 * THE WHOLE POINT IS THE WORD *BEFORE*. A capture station that
 * discovers at minute forty that the disk cannot keep up has
 * destroyed the thing it was there to make, and nobody in the room
 * gets that performance again. Everything here is asked while
 * nothing is at stake.
 *
 * A REFUSAL IS A SENTENCE AND A NUMBER. *"Not enough disk"* is a
 * message somebody stares at; *"four streams at 1080p30 need about
 * 24 MB/s and this disk sustained 11 MB/s"* is a message somebody
 * acts on — they unplug a camera, they drop to 720p, or they
 * record to the other drive. Every check below answers with what
 * it measured and what it needed.
 *
 * AND IT IS ADVICE, NOT A LOCK, EXCEPT WHERE IT IS NOT. Some of
 * these are judgements with margins in them and some are
 * arithmetic — a disk with four gigabytes free cannot hold an hour
 * of four streams, and no amount of operator confidence changes
 * that. `blocking` says which is which, and the application
 * refuses to arm only on the second kind.
 *
 * THE BITRATES ARE ESTIMATES AND SAY SO. What a VP8 or H.264
 * encoder actually emits depends on the scene — a static lectern
 * and a confetti cannon at the same settings differ by a factor of
 * three — so these are the figure to PLAN with, deliberately on
 * the generous side, and `RECORD` measures what is really being
 * written. A check that under-estimated would be a check that
 * passed and then failed mid-record, which is the one outcome this
 * file exists to prevent.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

/**
 * Bits per pixel per frame, for planning.
 *
 * DELIBERATELY AT THE TOP OF THE REALISTIC RANGE, and the first
 * value written here was not. `0.12` gives 7.5 Mbps for 1080p30,
 * which is what a static lectern encodes to; a camera pointed at
 * a room with people moving in it is 10 to 12. Four streams came
 * out at 3.6 MB/s, and the consequence was worse than an
 * inaccurate figure — almost no disk could fail the check, so the
 * refusal this stage is judged on would never have fired.
 *
 * `0.2` puts 1080p30 at 12.6 Mbps. An estimate that is high
 * refuses a recording that would have worked, which costs an
 * argument; an estimate that is low passes a recording that fails
 * at minute forty, which costs the recording.
 */
const BITS_PER_PIXEL_FRAME = 0.2;

/** What a microphone track costs, whatever the picture is doing. */
export const AUDIO_BITS_PER_SECOND = 128_000;

/**
 * The least disk a recording may start with, beyond what it needs.
 *
 * An operating system that reaches zero free bytes does not
 * politely stop the one process filling it: it fails writes
 * everywhere, including the ones this application makes to the
 * session it is recording INTO. Two gigabytes is room for the
 * machine to stay a machine.
 */
export const HEADROOM_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * How much faster than the recording the disk must be.
 *
 * A disk that sustains exactly what four cameras produce has no
 * margin for the operating system, the encoder's bursts, or the
 * other application somebody opens. One and a half is the usual
 * engineering answer and it is a judgement, which is why the
 * refusal it produces says what it measured.
 */
export const WRITE_MARGIN = 1.5;

/**
 * The least time on the disk that counts as being able to record.
 *
 * NOT ONE MINUTE, WHICH IS WHAT THIS SAID FIRST. Three gigabytes
 * free armed happily and reported two minutes — a check that
 * announces two minutes and calls it ready is not protecting
 * anybody. Nobody sets up four cameras for ten minutes, so below
 * this the honest reading is "this is the wrong disk" rather than
 * "that is fine".
 *
 * The operator knows how long they need and this does not, so the
 * MINUTES are always shown and only the floor is enforced.
 */
export const LEAST_MINUTES = 10;

/** What one source is expected to cost, in bits per second. */
export function bitrateOf(source: {
  width?: number; height?: number; frameRate?: number; hasAudio?: boolean;
}): number {
  const pixels = (source.width ?? 0) * (source.height ?? 0);
  const fps = source.frameRate ?? 0;
  const video = pixels > 0 && fps > 0
    ? pixels * fps * BITS_PER_PIXEL_FRAME : 0;
  return video + (source.hasAudio ? AUDIO_BITS_PER_SECOND : 0);
}

/** Bytes per second for a whole set of sources. */
export function bytesPerSecond(sources: readonly {
  width?: number; height?: number; frameRate?: number; hasAudio?: boolean;
}[]): number {
  return sources.reduce((sum, one) => sum + bitrateOf(one), 0) / 8;
}

/** A readable size, so a refusal can carry the number it measured. */
export function sizeSays(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let at = 0;
  let value = bytes;
  while (value >= 1024 && at < units.length - 1) { value /= 1024; at += 1; }
  /* One decimal below ten, none above: `1.4 GB` and `240 MB`. */
  return `${value < 10 && at > 0 ? value.toFixed(1) : Math.round(value)} ${units[at]}`;
}

export function rateSays(bytesPerSec: number): string {
  return `${sizeSays(bytesPerSec)}/s`;
}

export function minutesSays(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return 'no time at all';
  if (minutes < 1) return 'under a minute';
  if (minutes < 90) return `${Math.floor(minutes)} minutes`;
  const hours = minutes / 60;
  return hours < 10 ? `${hours.toFixed(1)} hours` : `${Math.round(hours)} hours`;
}

/** One thing checked before arming. */
export interface Check {
  id: 'sources' | 'picture' | 'disk' | 'write' | 'format';
  /** Did it pass? */
  ok: boolean;
  /** Does failing it stop the recording, or merely warn? */
  blocking: boolean;
  /** What it measured and what it needed, in one sentence. */
  says: string;
}

export interface Machine {
  /** What the filesystem the recording goes to has left. */
  freeBytes: number;
  /** What that filesystem actually sustained, measured. */
  writeBytesPerSecond: number;
}

export interface Planned {
  width?: number;
  height?: number;
  frameRate?: number;
  hasAudio?: boolean;
  /** Is a picture actually arriving from it right now? */
  live?: boolean;
}

export interface Prepared {
  checks: Check[];
  /** May the operator start? */
  armable: boolean;
  /** Bytes a second the whole set is expected to produce. */
  bytesPerSecond: number;
  /** How long the free space lasts at that rate, in minutes. */
  minutes: number;
}

/**
 * Everything asked before arming, answered at once.
 *
 * THE ORDER IS THE ORDER SOMEBODY FIXES THEM IN. No sources comes
 * before no picture, which comes before the disk — telling
 * somebody their disk is slow when they have not plugged a camera
 * in is a check list read out backwards.
 */
export function prepare(
  sources: readonly Planned[], machine: Machine,
): Prepared {
  const checks: Check[] = [];
  const needed = bytesPerSecond(sources);
  const spare = Math.max(0, machine.freeBytes - HEADROOM_BYTES);
  const minutes = needed > 0 ? spare / needed / 60 : 0;

  checks.push({
    id: 'sources',
    ok: sources.length > 0,
    blocking: true,
    says: sources.length === 0
      ? 'No cameras chosen. Pick at least one to record.'
      : `${sources.length} ${sources.length === 1 ? 'source' : 'sources'}.`,
  });

  /*
   * A SOURCE THAT IS NOT DELIVERING IS THE FAULT THIS WHOLE
   * SCREEN EXISTS FOR. A capture card with no cable opens
   * perfectly and records forty minutes of black, and the
   * operator finds out when somebody asks for the wide shot.
   */
  const dark = sources.filter((one) => one.live === false).length;
  checks.push({
    id: 'picture',
    ok: dark === 0,
    blocking: true,
    says: dark === 0
      ? 'Every source is delivering a picture.'
      : `${dark} of ${sources.length} ${dark === 1 ? 'source is' : 'sources are'} `
        + 'open but delivering nothing. A capture card with no cable in it '
        + 'looks exactly like this.',
  });

  /*
   * A FORMAT NOBODY ASKED FOR IS A WARNING, NOT A REFUSAL. A
   * camera that gave 640×480 when it was asked for 1080p will
   * record perfectly well; it will simply not match the others,
   * and that is the operator's decision to make rather than this
   * screen's.
   */
  const sizes = new Set(sources
    .filter((one) => one.width && one.height)
    .map((one) => `${one.width}×${one.height}`));
  checks.push({
    id: 'format',
    ok: sizes.size <= 1,
    blocking: false,
    says: sizes.size <= 1
      ? (sizes.size === 1 ? `All sources at ${[...sizes][0]}.` : 'No picture yet.')
      : `Sources differ: ${[...sizes].join(', ')}. They will record as they `
        + 'are, which is usually fine and occasionally not what was wanted.',
  });

  /*
   * THE DISK, AS TIME RATHER THAN AS BYTES. "41 GB free" needs
   * arithmetic nobody does in a room with people waiting; "about
   * 28 minutes at this setting" is the same fact as a decision.
   */
  /*
   * NOTHING TO RECORD IS NOT A DISK PROBLEM. This read
   * `needed > 0 && …`, so with no cameras chosen the disk check
   * FAILED, blocking, saying "Nothing to record yet" — a refusal
   * that is not one, in a list where the real refusal was two
   * lines above it. `write` already got this right; the two
   * disagreed. Found by a mutation that could not be killed
   * because another check was failing anyway.
   */
  const nothingYet = needed <= 0;
  const enoughDisk = nothingYet
    || (spare > 0 && minutes >= LEAST_MINUTES);
  checks.push({
    id: 'disk',
    ok: enoughDisk,
    blocking: true,
    says: nothingYet
      ? 'Nothing to record yet.'
      : enoughDisk
        ? `${sizeSays(machine.freeBytes)} free — about ${minutesSays(minutes)} `
          + `at ${rateSays(needed)}.`
        : `Only ${sizeSays(machine.freeBytes)} free, which is `
          + `${minutesSays(minutes)} at ${rateSays(needed)} — less than the `
          + `${LEAST_MINUTES} minutes this will arm for. `
          + `${sizeSays(HEADROOM_BYTES)} of it is kept back so the machine `
          + 'does not stop as well.',
  });

  /*
   * AND WHETHER THE DISK CAN KEEP UP, which is the check the
   * brief's own acceptance criterion names: *"a refusal with a
   * sentence when a disk cannot sustain four streams."* Free
   * space and write speed are different questions and a slow disk
   * with a terabyte on it fails this one.
   */
  const wanted = needed * WRITE_MARGIN;
  const fastEnough = nothingYet || machine.writeBytesPerSecond >= wanted;
  checks.push({
    id: 'write',
    ok: fastEnough,
    blocking: true,
    says: nothingYet
      ? 'Nothing to write yet.'
      : fastEnough
        ? `Disk sustained ${rateSays(machine.writeBytesPerSecond)}, and `
          + `${sources.length} ${sources.length === 1 ? 'source needs' : 'sources need'} `
          + `about ${rateSays(needed)}.`
        /*
         * THE SENTENCE QUOTES THE NUMBER IT COMPARED, which it
         * did not at first: it said "need about 6.0 MB/s … disk
         * sustained 6.7 MB/s" and then refused, because the
         * comparison was against 6.0 × the margin and the message
         * was against 6.0. A refusal whose own numbers say it
         * should have passed is worse than no numbers at all.
         */
        : `${sources.length} ${sources.length === 1 ? 'source needs' : 'sources need'} `
          + `about ${rateSays(needed)}, which is ${rateSays(wanted)} with `
          + `headroom — and this disk sustained `
          + `${rateSays(machine.writeBytesPerSecond)}. Record fewer sources, `
          + 'drop the resolution, or choose a faster disk.',
  });

  return {
    checks,
    armable: checks.every((one) => one.ok || !one.blocking),
    bytesPerSecond: needed,
    minutes,
  };
}
