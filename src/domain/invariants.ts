/**
 * Invariants asserted in code.  [Doctrine D-09]
 *
 * "Rules that exist only in documentation are rules that will be broken."
 * Each function here fails loudly rather than degrading quietly.
 */

import { type Conversation, orderedInterventions, selectedTake } from './document.js';
import { quoteHash } from './ids.js';
import type { SourceItem, Timeline } from './timeline.js';
import {
  type Performance, type PerformanceTake, type PerformanceWindow,
  mayPublish, needsLicenceNote, plateFor, projectPerformance,
} from './performance.js';
import { needsMatte } from './environment.js';
import type { Channel, ProgrammeSource } from './channel.js';
// One definition of "too far to be drift", shared by the invariant that
// refuses it and the measurement that produces it. Two copies of a threshold
// are two thresholds.
import { MAX_PLAUSIBLE_DRIFT } from './drift.js';
import { formatMasterPosition } from './time.js';

export class InvariantViolation extends Error {
  constructor(readonly invariant: string, message: string) {
    super(`${invariant}: ${message}`);
    this.name = 'InvariantViolation';
  }
}

const fail = (inv: string, msg: string): never => {
  throw new InvariantViolation(inv, msg);
};

/**
 * INV-02 — cut_out_frame == resume_in_frame.
 * INV-03 — Σ(shot durations) == render duration, to the frame.
 *
 * Together these say: the output is exactly the source plus the responses,
 * with every source frame appearing exactly once, in order.
 */
export function assertTimelineInvariants(
  conversation: Conversation,
  timeline: Timeline,
): void {
  const duration = conversation.source.durationFrames;
  const sourceItems = timeline.items.filter((i): i is SourceItem => i.kind === 'source');

  // --- INV-02 ---------------------------------------------------------------
  // Source spans, in order, must tile [0, duration) exactly: no gap (a dropped
  // frame) and no overlap (a duplicated frame).
  let expected = 0;
  for (const item of sourceItems) {
    if (item.sourceInFrame !== expected) {
      fail('INV-02', item.sourceInFrame > expected
        ? `${item.sourceInFrame - expected} source frame(s) dropped at frame ${expected}`
        : `${expected - item.sourceInFrame} source frame(s) duplicated at frame ${item.sourceInFrame}`);
    }
    if (item.sourceOutFrame <= item.sourceInFrame) {
      fail('INV-02', `empty or inverted source span [${item.sourceInFrame}, ${item.sourceOutFrame})`);
    }
    expected = item.sourceOutFrame;
  }
  if (expected !== duration) {
    fail('INV-02', `source coverage ends at ${expected}, expected ${duration}`);
  }

  // Each response resumes on exactly the frame it interrupted.
  for (let i = 0; i < timeline.items.length; i++) {
    const item = timeline.items[i];
    if (item?.kind !== 'response') continue;
    const before = timeline.items[i - 1];
    const after = timeline.items[i + 1];
    if (before?.kind === 'source' && before.sourceOutFrame !== item.anchorFrame) {
      fail('INV-02', `cut_out_frame ${before.sourceOutFrame} != anchor ${item.anchorFrame}`);
    }
    if (after?.kind === 'source' && after.sourceInFrame !== item.anchorFrame) {
      fail('INV-02', `resume_in_frame ${after.sourceInFrame} != anchor ${item.anchorFrame}`);
    }
  }

  // --- INV-03 ---------------------------------------------------------------
  let cursor = 0;
  for (const item of timeline.items) {
    if (item.outputStartFrame !== cursor) {
      fail('INV-03', `output gap at ${cursor}: item starts at ${item.outputStartFrame}`);
    }
    cursor += item.durationFrames;
  }
  if (cursor !== timeline.totalOutputFrames) {
    fail('INV-03', `Σ(durations)=${cursor} != totalOutputFrames=${timeline.totalOutputFrames}`);
  }
}

/**
 * INV-05 — A quote's text hashes to its quote_hash.
 *
 * The product exists to hold people to what they said. It cannot let a quote
 * drift from what was actually spoken.  [Doctrine U-10]
 */
export function assertQuoteIntegrity(conversation: Conversation): void {
  for (const ivn of orderedInterventions(conversation)) {
    const { quote, quoteHash: stored } = ivn.anchor;
    if (quote === undefined || stored === undefined) continue;
    const actual = quoteHash(quote);
    if (actual !== stored) {
      fail('INV-05', `intervention ${ivn.id} quote does not match its hash — the claim has been altered`);
    }
  }
}

/** INV-12 — No intervention is silently re-anchored: every take is accounted for. */
export function assertDocumentIntegrity(conversation: Conversation): void {
  for (const ivn of conversation.interventions) {
    if (ivn.selectedTakeId && !selectedTake(ivn)) {
      fail('INV-12', `intervention ${ivn.id} selects take ${ivn.selectedTakeId}, which does not exist`);
    }
    for (const take of ivn.takes) {
      if (take.mediaInFrame < 0 || take.mediaOutFrame > take.durationFrames) {
        fail('INV-12', `take ${take.id} trim [${take.mediaInFrame}, ${take.mediaOutFrame}) exceeds its ${take.durationFrames}-frame media`);
      }
      if (take.prerollFrames > take.durationFrames) {
        fail('INV-12', `take ${take.id} claims more pre-roll than it has media`);
      }
    }
  }
}

/* ------------------------------------------------------------------------ *
 *  The Performance.  [STUDIO-TWO S-2, S-4, S-9]
 * ------------------------------------------------------------------------ */

/**
 * INV-14 — every take's alignment to the master is in samples, measured, and
 *          never silently resampled.
 *
 * The music clock is finer than the picture clock, and deliberately: one frame
 * at 30fps is 33 milliseconds, and 33 milliseconds on a snare is the
 * difference between a performance and an amateur one. So the alignment is not
 * allowed to be a rounded frame count wearing a sample's name, and a rate
 * ratio far from 1 is a measurement that went wrong rather than a clock that
 * drifted — real drift is parts per million, not parts per hundred.
 */
export function assertAlignmentInvariants(performance: Performance): void {
  for (const take of performance.takes) {
    const { alignment } = take;
    if (!Number.isInteger(alignment.offsetSamples)) {
      fail('INV-14', `take ${take.id} has a fractional offset (${alignment.offsetSamples})`);
    }
    if (alignment.nudgeSamples !== undefined && !Number.isInteger(alignment.nudgeSamples)) {
      fail('INV-14', `take ${take.id} has a fractional nudge (${alignment.nudgeSamples})`);
    }
    if (!Number.isInteger(take.durationSamples) || take.durationSamples <= 0) {
      fail('INV-14', `take ${take.id} has no measured duration (${take.durationSamples})`);
    }
    if (!Number.isFinite(alignment.rateRatio) || alignment.rateRatio <= 0) {
      fail('INV-14', `take ${take.id} has an impossible rate ratio (${alignment.rateRatio})`);
    }
    /*
     * A clock that differs from the master by more than a thousandth is not
     * drifting, it is a different sample rate that ingest failed to
     * normalise. Catching it here turns a video that slides out of sync over
     * four minutes into an error at the moment the take is added.
     */
    if (Math.abs(alignment.rateRatio - 1) > MAX_PLAUSIBLE_DRIFT) {
      fail('INV-14',
        `take ${take.id} claims a rate ratio of ${alignment.rateRatio}, which is a `
        + 'resampling error rather than clock drift');
    }
  }
}


/**
 * INV-15 — no published export contains a master track the author has not
 *          declared they may publish.
 *
 * INV-01's shape, applied to music. A `third_party` master performs,
 * rehearses, previews and exports privately; it does not leave the building.
 * Asserted at the point of export rather than trusted to an interface,
 * because an interface is one refactor away from not being in the path.
 */
export function assertPublishable(performance: Performance): void {
  if (!mayPublish(performance.master)) {
    fail('INV-15',
      `"${performance.master.title}" is not marked as something you may publish. `
      + 'You can perform and export privately against it; publishing needs a '
      + 'track you own, hold a licence for, or that is openly licensed.');
  }
  if (needsLicenceNote(performance.master) && !performance.master.licence?.trim()) {
    fail('INV-15',
      `"${performance.master.title}" is marked ${performance.master.class} but does `
      + 'not say what permits it. Name the licence.');
  }
}

/**
 * A scene list a renderer can actually execute.
 *
 * Not one invariant but the set of things that make a Performance renderable,
 * checked together because an author is better served by being told all of
 * what is wrong than the first thing.
 */
export function assertPerformanceRenderable(
  performance: Performance, window?: PerformanceWindow,
): void {
  const timeline = projectPerformance(performance, window);

  if (timeline.spans.length === 0) {
    fail('INV-03', 'this performance has no scenes, so there is nothing to render');
  }

  /*
   * A gap is a stretch of song with no picture. Legal while composing — the
   * timeline exists to be looked at while it is incomplete — and not
   * renderable, because the alternative is exporting black and calling it
   * finished.
   */
  if (timeline.gaps.length > 0) {
    const first = timeline.gaps[0]!;
    fail('INV-03',
      `${timeline.gaps.length} stretch(es) of the song have no performance on them — `
      + `the first from ${formatMasterPosition(first.fromSample)} to `
      + `${formatMasterPosition(first.toSample)}`);
  }

  for (const span of timeline.spans) {
    /*
     * Named but absent, checked BEFORE the empty case, because when a scene
     * names one take that does not reach it both are true and this is the one
     * that says something the author can act on. "Names no take" would be
     * accurate and unhelpful: they did name one.
     */
    if (span.missing.length > 0) {
      const where = formatMasterPosition(span.fromSample);
      const to = formatMasterPosition(span.toSample);
      fail('INV-03',
        `the scene from ${where} to ${to} expects ${span.scene.takeIds.length} `
        + `performance(s), but ${span.missing.join(', ')} do not reach all of it — `
        + 'either move the scene boundary or extend the take');
    }
    /*
     * An empty scene. `setScene` refuses to make one, so reaching this means
     * a document that was edited by something else — which is exactly when an
     * invariant earns its place.
     */
    if (span.takes.length === 0) {
      fail('INV-03',
        `the scene at ${formatMasterPosition(span.fromSample)} shows nobody`);
    }
  }

  // INV-02, on the output clock: the spans must tile it with no gap or overlap.
  let expected = 0;
  for (const span of timeline.spans) {
    if (span.outputStartFrame !== expected) {
      fail('INV-02',
        `the scene at ${formatMasterPosition(span.fromSample)} starts at output frame `
        + `${span.outputStartFrame}, but the one before it ends at ${expected}`);
    }
    expected += span.durationFrames;
  }
  if (expected !== timeline.totalOutputFrames) {
    fail('INV-03',
      `the scenes run ${expected} frames but the song is ${timeline.totalOutputFrames}`);
  }

  if (performance.audio.mode === 'master_vocal' && !performance.audio.vocalTakeId) {
    fail('INV-03', 'the master vocal mode is chosen but no take has been named as the vocal');
  }

  /*
   * INV-16, checked over the takes that will actually be on screen. A take
   * sitting unused in the rail with an environment it can no longer support is
   * not a reason to refuse somebody's export.
   */
  for (const span of timeline.spans) {
    for (const take of span.takes) assertMattable(performance, take);
  }
}

/**
 * INV-16 — no composited environment without a measured matte.  [§4, S-6]
 *
 * "A bad matte on a music video is markedly worse than no background at all."
 * The product's answer to a matte it cannot measure is to say so, not to
 * approximate somebody's silhouette and let them find out at full resolution.
 */
export function assertMattable(
  performance: Performance, take: PerformanceTake,
): void {
  if (!needsMatte(take.environment)) return;
  const plate = plateFor(performance, take);
  if (!plate) {
    fail('INV-16',
      `"${take.label}" is set to a background that needs the performer separated `
      + 'from the room, but no plate was measured for it — record three seconds '
      + 'of the empty room, or put the take back in the room it was shot in');
  }
  if (take.environment.kind === 'space' && !take.environment.spaceId) {
    fail('INV-16', `"${take.label}" names a virtual space without saying which one`);
  }
  if (take.environment.kind === 'custom' && !take.environment.assetId) {
    fail('INV-16', `"${take.label}" names a custom background with no picture behind it`);
  }
}

/* ------------------------------------------------------------------------ *
 *  Studio Three: the channel.  [CHANNEL §2–§7, D-18]
 * ------------------------------------------------------------------------ */

/**
 * INV-17 — a schedule references; it never duplicates.  [D-18, CHANNEL §3]
 *
 * "Online TV must never duplicate media merely because it is scheduled for
 *  broadcast. A scheduled programme references an existing media asset. Only
 *  live ingest and explicitly requested recordings create new media assets."
 *
 * ASSERTED AGAINST WHAT IS ON DISK, not against the document. The document
 * cannot express a copy — a `ProgrammeSource` has no field for one — so
 * checking the document would prove only that TypeScript works. What can go
 * wrong is a *writer*: some future job that "prepares" a programme by putting
 * a file somewhere the schedule owns. So the check is handed the set of
 * assets the channel's own directory holds, and it insists that every one of
 * them belongs to a live ingest or to a recording somebody asked for.
 *
 * `ownedAssetIds` is passed rather than read, for the reason the rest of this
 * module takes its facts as arguments: an invariant that reads the filesystem
 * is an invariant that cannot run in a test.
 */
export function assertChannelOwnsNoScheduledMedia(
  channel: Channel, ownedAssetIds: readonly string[],
): void {
  const allowed = new Map<string, string>();
  for (const ingest of channel.ingests) {
    /*
     * ONLY A KEPT SESSION. A live buffer is not an asset — it lives under
     * `live/`, it is swept when the broadcast ends, and it appears here only
     * once somebody chose to save it, at which point it was promoted into
     * `assets/` and is an archived recording like any other. A channel
     * holding the buffer of a session nobody kept is exactly the fault this
     * invariant is for. [§8, D-18]
     */
    if (ingest.assetId) {
      allowed.set(ingest.assetId, `the saved live session "${ingest.label}"`);
    }
  }
  for (const recording of channel.recordings) {
    allowed.set(recording.assetId,
      `the recording "${recording.label}" that ${recording.requestedBy} asked for`);
  }
  for (const assetId of ownedAssetIds) {
    if (!allowed.has(assetId)) {
      fail('INV-17',
        `channel "${channel.name}" is holding media (${assetId}) that no live feed `
        + 'and no requested recording accounts for — a schedule references what '
        + 'already exists and never makes a copy of it');
    }
  }
}

/**
 * INV-17, the other half — nothing is scheduled that does not exist.
 *
 * The complement of the rule, and the fault it actually produces. A programme
 * whose render has been deleted is not a copy; it is a slot that will go out
 * as black, and it will do so at whatever hour it was scheduled for with
 * nobody watching. `missing` is resolved by the caller, which is the layer
 * that may look at disk.
 */
export function assertScheduleResolves(
  channel: Channel, missing: readonly ProgrammeSource[],
): void {
  if (missing.length === 0) return;
  const named = missing.map((source) => {
    if (source.kind === 'live') return `a live feed (${source.ingestId})`;
    if (source.kind === 'media') return `a library file (${source.assetId})`;
    return `${source.document} ${source.documentId} render ${source.planHash.slice(0, 8)}`;
  });
  fail('INV-17',
    `${named.join(', ')} ${missing.length === 1 ? 'is' : 'are'} scheduled on `
    + `"${channel.name}" but no longer on disk — a programme references media, so `
    + 'media that has gone takes its programmes with it');
}
