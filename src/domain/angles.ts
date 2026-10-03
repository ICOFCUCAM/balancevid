/**
 * Which takes are views of one moment.
 *   [Doctrine STUDIO-TWO §2, §7, D-19; TAKE-DESKTOP B-1]
 *
 * > *"Takes sharing a capture are **angles**; takes not sharing
 * > one are **attempts**, exactly as today."*
 *
 * THE DIFFERENCE IS THE WHOLE OF B-1. A singer doing the chorus
 * four times has made four ATTEMPTS at one thing, and the
 * producer's job is to choose between them. A capture station
 * pointing four cameras at one room has made four ANGLES of one
 * thing, and the producer's job is to cut between them. Studio
 * Two has shown both in the same multiview since it was written
 * and has never been able to say which it was looking at.
 *
 * IT ALREADY HOLDS N TAKES ON ONE CLOCK, which is the correction
 * the document records in PART FOUR: the first draft of this
 * plan wanted to give a take N tracks, and reading
 * `SwitchingStage.tsx` showed that four cameras do not need a
 * new model, they need four takes that know they belong
 * together. This is the knowing.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import type { Samples } from './time.js';

/** The least a take must carry for these questions. */
interface Angled {
  id: string;
  capturedIn?: { id: string; offsetSamples: Samples; spreadSamples?: Samples };
}

/** Is this take one view of something, or one go at it? */
export function isAngle(take: Angled): boolean {
  return Boolean(take.capturedIn?.id);
}

/**
 * The takes that are angles of the same capture as this one.
 *
 * INCLUDING ITSELF, because the question a surface asks is *how
 * many angles is this one of* and the answer to that for a
 * capture of four is four. A list that excluded the take asked
 * about would make every caller add one back.
 *
 * NOTHING FOR AN ATTEMPT. A take with no capture is not an angle
 * of anything, and answering with the one take would say it was
 * an angle of itself.
 */
export function anglesOf<T extends Angled>(
  takes: readonly T[], take: Angled,
): T[] {
  const capture = take.capturedIn?.id;
  if (!capture) return [];
  return takes
    .filter((one) => one.capturedIn?.id === capture)
    /*
     * IN THE ORDER THEY STARTED, which is the order the capture
     * station numbered them and the order their files sit in a
     * directory. A multiview that reordered them by when they
     * happened to be uploaded would renumber somebody's cameras.
     */
    .sort((a, b) =>
      (a.capturedIn!.offsetSamples - b.capturedIn!.offsetSamples)
      || a.id.localeCompare(b.id));
}

/**
 * Which angle of its capture this take is, counting from one.
 *
 * Zero for a take that is not an angle, which reads as "not one
 * of anything" rather than as "the first".
 */
export function angleNumber(takes: readonly Angled[], take: Angled): number {
  const found = anglesOf(takes, take).findIndex((one) => one.id === take.id);
  /*
   * `found < 0 ? 0 :` CANNOT BE KILLED BY MUTATION AND IS KEPT.
   * `findIndex` answers -1 for a take that is not an angle, and
   * -1 + 1 is 0, so removing the guard gives the same number —
   * by arithmetic coincidence rather than by anything anybody
   * decided. The rule this function states is *a take that is
   * not an angle is not numbered*; without the guard that rule
   * is true only as long as `findIndex`'s miss value stays -1.
   *
   * A third reason to keep what mutation cannot kill, alongside
   * `registry.ts`'s filter (*"it is what makes the return type
   * true"*) and `check.ts`'s length guard: removing it would
   * make correctness rest on a coincidence instead of on a
   * stated rule.
   */
  return found < 0 ? 0 : found + 1;
}

/**
 * `Angle 2 of 4`, or nothing.
 *
 * NOTHING FOR A CAPTURE OF ONE. A single camera submitted from
 * the capture station is still a capture — it has an id and a
 * manifest — and telling the producer it is "Angle 1 of 1" is
 * furniture explaining an absence. What the producer needs to
 * know is when there is more than one view to cut between.
 */
export function angleSays(takes: readonly Angled[], take: Angled): string {
  const all = anglesOf(takes, take);
  if (all.length < 2) return '';
  return `Angle ${angleNumber(takes, take)} of ${all.length}`;
}

/**
 * Every capture represented among these takes, in the order
 * their first angle appears.
 *
 * FOR A SURFACE THAT GROUPS, which the inbox will be (B-3).
 * Attempts are not a capture and are not in the list.
 */
export function capturesIn(takes: readonly Angled[]): string[] {
  const seen: string[] = [];
  for (const take of takes) {
    const id = take.capturedIn?.id;
    if (id && !seen.includes(id)) seen.push(id);
  }
  return seen;
}

/**
 * Did the capture these takes came from hold together?
 *
 * THE SPREAD TRAVELS ON EVERY ANGLE and any one of them answers.
 * Where they disagree — which should not happen and is a file on
 * disk, so it can — the widest is taken, because a capture is
 * only as synchronised as its worst angle.
 *
 * Nothing for takes that are not angles of one capture: there is
 * no spread between things that were not recorded together.
 */
export function captureSpread(takes: readonly Angled[]): Samples | null {
  const spreads = takes
    .map((one) => one.capturedIn?.spreadSamples)
    .filter((one): one is Samples => typeof one === 'number');
  return spreads.length === 0 ? null : Math.max(...spreads);
}

/**
 * What ARRIVED, rather than what was uploaded.  [B-3]
 *
 * > *"One arrival with four angles, rather than four arrivals
 * > somebody has to recognise as related."*
 *
 * THE INBOX HAS BEEN LISTING FILES. Four cameras on one song is
 * four rows that look exactly like four separate people, and the
 * producer's job in front of that list — decide what to use — is
 * the wrong job to be given four times for one performance.
 *
 * ORDER IS THE ORDER THINGS CAME IN, with a capture taking the
 * place of its FIRST angle. A producer who looked away and looked
 * back must not find the list reshuffled because the fourth
 * camera's segments finished uploading first; and within a
 * capture the angles are in `anglesOf`'s order, which is by
 * offset, which is the order they started.
 *
 * AN ATTEMPT IS AN ARRIVAL OF ONE, not a special case. Every
 * submission this product has ever taken is one of those, which
 * is what makes this safe to put in front of all of them.
 */
export function arrivalsIn<T extends Angled>(takes: readonly T[]): T[][] {
  const out: T[][] = [];
  const done = new Set<string>();
  for (const take of takes) {
    const capture = take.capturedIn?.id;
    if (!capture) { out.push([take]); continue; }
    if (done.has(capture)) continue;
    done.add(capture);
    out.push(anglesOf(takes, take));
  }
  return out;
}

/**
 * How far apart a capture's angles started, for a person.
 *
 * MILLISECONDS, BECAUSE SAMPLES ARE NOT A UNIT ANYBODY FEELS.
 * The producer's question is *did these hold together*, and the
 * answer is a number they can compare to a frame — which at 30fps
 * is 33 ms, and 0.6 ms is comfortably inside one.
 *
 * Nothing where there is nothing to say: an attempt has no
 * spread, and neither does a capture whose angles all started on
 * the same sample.
 */
export function spreadSays(takes: readonly Angled[], sampleRate: number): string {
  const spread = captureSpread(takes);
  if (spread === null || spread <= 0 || !(sampleRate > 0)) return '';
  const ms = (spread / sampleRate) * 1000;
  return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms apart`;
}
