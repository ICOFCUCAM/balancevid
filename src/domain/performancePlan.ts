/**
 * A Performance, as something a renderer can execute.
 * [Doctrine STUDIO-TWO §2, §7, §14, S-2, S-4, INV-00, INV-15]
 *
 * The Performance is canonical; this is a projection of it, rebuilt on demand
 * and stored nowhere. "Never merge the individual takes into one irreversible
 * video until the final master render" — and this is the description of that
 * final render, which is a different thing from having performed it.
 *
 * WHY IT SHARES `RenderPlan`. The compositor already knows how to render a
 * shot, cache it by content hash (U-16), concatenate the results and master
 * the audio. None of that is about Conversations; it is about shots. So a
 * Performance produces the same plan shape with a third kind of shot in it,
 * and inherits the export profiles, the layouts, the reframing (§14's four
 * output shapes) and the loudness discipline without a second renderer to
 * drift from the first.
 *
 * WHAT IT DOES NOT SHARE is the audio. A Conversation's shots each carry their
 * own sound, because the sound IS the cut: the source speaks, then the author
 * does. A Performance's shots carry none, because the song runs underneath
 * them unbroken and slicing it at video-frame boundaries is how you get a
 * click at every cut. The music is laid over the finished picture in one pass.
 */

import type { AssetId, TakeId } from './document.js';
import { assertPerformanceRenderable } from './invariants.js';
import { sha256 } from './ids.js';
import {
  type Performance, type PerformanceSpan, type PerformanceTake,
  coversSpan, mayPublish, plateFor, projectPerformance,
} from './performance.js';
import { overlapSplit, transitionFor } from './transitions.js';
import { matteFeather, matteThreshold, needsMatte } from './environment.js';
import { planPerformanceAudio } from './performanceAudio.js';
import {
  type ExportProfile, EXPORT_PROFILES, LAYOUTS, captionStyleFor,
  reframeFor, takeSlots,
} from './presentation.js';
import type {
  AttributionBlock, PerformanceBackdrop, PerformanceShot, RenderPlan, TransitionShot,
} from './plan.js';
import { PLAN_VERSION, canonicalJson } from './plan.js';
import {
  HOUSE_FPS, type Frames, formatMasterPosition, framesToSamples, samplesToFrames,
} from './time.js';

export interface PerformancePlanOptions {
  exportProfileId?: string;
  /**
   * A private export of a track the author has not said they may publish.
   *
   * INV-15 stops a THIRD_PARTY master from being published; it does not stop
   * somebody rehearsing, or keeping a copy of their own performance. The
   * distinction is the same one U-01 draws for sources, and it has to be
   * passed in explicitly so that no code path reaches a publishable export by
   * forgetting to ask. [S-9]
   */
  allowUnpublishable?: boolean;
  accessedAt?: string;
}

export class PerformancePlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PerformancePlanError';
  }
}

/**
 * The credit.  [U-21, INV-07, S-9]
 *
 * Generated from the record, never typed. For an openly licensed track the
 * attribution IS the licence condition, and for the author's own work it is
 * them crediting themselves, which they want.
 */
export function performanceAttribution(
  performance: Performance, accessedAt: string,
): AttributionBlock {
  const { master } = performance;
  const parts = [`Music: "${master.title}"`];
  if (master.artist) parts.push(`by ${master.artist}`);
  if (master.writer && master.writer !== master.artist) {
    parts.push(`written by ${master.writer}`);
  }
  if (master.licence) parts.push(`(${master.licence})`);
  return {
    sourceTitle: master.title,
    ...(master.artist ? { creator: master.artist } : {}),
    accessedAt,
    text: parts.join(' '),
  };
}

export function buildPerformancePlan(
  performance: Performance, options: PerformancePlanOptions = {},
): RenderPlan {
  /*
   * The rights gate, at the point where an exportable artefact is described
   * rather than at the point where a button is drawn. A check in an interface
   * is one refactor away from not being in the path. [INV-15]
   */
  if (!options.allowUnpublishable && !mayPublish(performance.master)) {
    throw new PerformancePlanError(
      `"${performance.master.title}" is not marked as something you may publish. `
      + 'You can still export a private copy.');
  }

  const exportProfileId = options.exportProfileId ?? 'youtube_16x9';
  const exportProfile: ExportProfile = EXPORT_PROFILES[exportProfileId]
    ?? (() => { throw new PerformancePlanError(`unknown export profile: ${exportProfileId}`); })();

  /*
   * Whether this performance can be a video at all is INV-03's question, not
   * this function's, and it is asked through the invariant so that the author
   * gets the diagnostic that names what to do — which scene, which take, and
   * whether to move the boundary or extend the recording. A planner with its
   * own private copy of the same rules is two rules that drift.
   */
  assertPerformanceRenderable(performance);
  const timeline = projectPerformance(performance);

  let audio;
  try {
    audio = planPerformanceAudio(performance);
  } catch (error) {
    // The audio's own refusals are the author's problem, not a crash: a mode
    // naming a vocal that is not there is a thing they can fix in one click.
    throw new PerformancePlanError(
      error instanceof Error ? error.message : 'the sound could not be planned');
  }

  const straight: PerformanceShot[] = [];
  for (const span of timeline.spans) {
    const shot = performanceShot(performance, span, exportProfile);
    straight.push({ ...shot, hash: hashShot(shot, exportProfile) });
  }
  const shots = withTransitions(performance, timeline, straight, exportProfile);

  const accessedAt = options.accessedAt ?? performance.createdAt;
  const plan: Omit<RenderPlan, 'planHash'> = {
    planVersion: PLAN_VERSION,
    mode: 'composed',
    // The field is named for the other document; the debt is recorded on the
    // Job type and is a migration rather than a rename. [S-1]
    conversationId: performance.id,
    schemaVersion: performance.schemaVersion,
    exportProfile,
    shots,
    totalOutputFrames: timeline.totalOutputFrames,
    /*
     * Meaningless here, and zero rather than absent so the shape stays one
     * shape. A Performance has no source to be in proportion to: U-35's ratio
     * is a claim about quoting somebody, and nobody is being quoted.
     */
    sourceRatio: 0,
    attribution: performanceAttribution(performance, accessedAt),
    /*
     * §9's modes, resolved into a sound timeline of their own. In the plan
     * rather than worked out by the renderer, and hashed with everything else
     * — so changing the audio mode changes the PLAN without changing a single
     * shot hash, and a re-render re-mixes rather than re-renders. [U-16, S-7]
     */
    performanceAudio: audio,
    captions: {
      // Lyrics are authored rather than transcribed (S-10), and until they
      // are there is nothing honest to burn in.
      burnIn: false,
      sidecars: [],
      style: captionStyleFor(exportProfile, performance.captionStyleId),
    },
    audio: {
      loudnessLufs: exportProfile.loudnessLufs,
      truePeakDb: exportProfile.truePeakDb,
      /*
       * No declick and no ducking, and both absences are deliberate. A
       * Conversation crossfades at its cuts because two people's rooms meet
       * there; a Performance's picture cuts over sound that never stops, so
       * there is no seam to hide. Ducking is for a source under a response —
       * here the music is not under anything, it IS the thing. [S-7, U-17]
       */
      declickMs: 0,
      duckDb: 0,
      /*
       * Per-speaker matching is for speech at different levels. A song is
       * already mastered, and normalising its parts against each other would
       * undo the mix. [S-2]
       */
      matchSpeakers: false,
    },
  };

  /*
   * The plan checks its own arithmetic before anybody renders it. Transitions
   * move two shots' boundaries for every one they add, and a tiling that is
   * one frame out is a video one frame longer than its song — found, without
   * this, forty minutes later. [INV-02, INV-03]
   */
  let frame = 0;
  for (const shot of plan.shots) {
    if (shot.outputStartFrame !== frame) {
      throw new PerformancePlanError(
        `shot ${shot.id} starts at frame ${shot.outputStartFrame}, but the one `
        + `before it ends at ${frame}`);
    }
    if (shot.durationFrames <= 0) {
      throw new PerformancePlanError(`shot ${shot.id} has no length`);
    }
    frame += shot.durationFrames;
  }
  if (frame !== plan.totalOutputFrames) {
    throw new PerformancePlanError(
      `the shots run ${frame} frames and the song is ${plan.totalOutputFrames}`);
  }

  return { ...plan, planHash: sha256(canonicalJson(plan)) };
}

/* ------------------------------------------------------------------------ */

/**
 * The overlaps, paid for out of the shots either side.  [§11, S-8, INV-03]
 *
 * A transition is a length of time and the song does not get longer to make
 * room for it, so a dissolve at a boundary shortens the shot before it and the
 * shot after it by exactly what it takes. The frames still tile the song, and
 * INV-02's check over the output clock is what proves it rather than this
 * comment.
 *
 * THE PRECONDITION IS THE INTERESTING PART. During the overlap both
 * performances are on screen at once — including the outgoing one after its
 * scene has ended and the incoming one before its scene has begun. A take that
 * stops at its scene boundary cannot dissolve out of it, and the answer is to
 * say which take and offer the cut, not to render half a dissolve into black.
 */
function withTransitions(
  performance: Performance,
  timeline: ReturnType<typeof projectPerformance>,
  straight: PerformanceShot[],
  profile: ExportProfile,
): (PerformanceShot | TransitionShot)[] {
  const out: (PerformanceShot | TransitionShot)[] = straight.map((shot) => ({ ...shot }));
  const inserted: (PerformanceShot | TransitionShot)[] = [];

  for (let i = 0; i < out.length; i += 1) {
    const shot = out[i] as PerformanceShot;
    inserted.push(shot);

    const next = out[i + 1] as PerformanceShot | undefined;
    if (!next) continue;
    const span = timeline.spans[i + 1]!;
    const style = transitionFor(span.scene.transition);
    if (style.frames <= 0) continue;

    const { before, after } = overlapSplit(style);
    const where = formatMasterPosition(span.fromSample);
    if (shot.durationFrames <= before || next.durationFrames <= after) {
      throw new PerformancePlanError(
        `the ${style.label.toLowerCase()} at ${where} is longer than the sections `
        + 'it joins — shorten it to a cut, or move the boundary');
    }

    /*
     * Both sides must have picture across the whole overlap. Checked on the
     * MUSIC clock, because that is where a take's coverage is stated, and
     * converted once rather than per take.
     */
    const fromSample = framesToSamples(shot.outputStartFrame + shot.durationFrames - before);
    const toSample = framesToSamples(next.outputStartFrame + after);
    for (const [side, takes] of [['leaving', shot.takes], ['arriving', next.takes]] as const) {
      for (const entry of takes) {
        const take = performance.takes.find((t) => t.id === entry.takeId);
        if (!take || !coversSpan(take, fromSample, toSample)) {
          throw new PerformancePlanError(
            `the ${style.label.toLowerCase()} at ${where} needs "${entry.label}" on `
            + `screen either side of it, and the ${side} performance does not reach `
            + 'that far — use a cut here, or extend the take');
        }
      }
    }

    shot.durationFrames -= before;
    const startFrame = shot.outputStartFrame + shot.durationFrames;

    const transition: Omit<TransitionShot, 'hash'> = {
      id: `${shot.id}__${next.id}`,
      kind: 'transition',
      style: style.id,
      outputStartFrame: startFrame,
      durationFrames: style.frames,
      layoutId: next.layoutId,
      fromSample,
      from: { layoutId: shot.layoutId, takes: reframed(performance, shot.takes, fromSample) },
      to: { layoutId: next.layoutId, takes: reframed(performance, next.takes, fromSample) },
    };
    inserted.push({ ...transition, hash: hashShot(transition, profile) });

    next.outputStartFrame = startFrame + style.frames;
    next.durationFrames -= after;
  }

  /*
   * Re-hashed AFTER the overlaps were paid for. A shot's hash is the address
   * of its bytes on disk (U-16), and a shot that is now twelve frames shorter
   * is not the same bytes — the first version of this hashed before the
   * adjustment, which would have served a cached file of the old length and
   * produced a video longer than its own song.
   */
  return inserted.map((shot) => (shot.kind === 'performance'
    ? { ...shot, hash: hashShot(stripHash(shot), profile) }
    : shot));
}

function stripHash<T extends { hash: string }>(shot: T): Omit<T, 'hash'> {
  const { hash: _hash, ...rest } = shot;
  return rest;
}

/** The same takes, read at the moment the overlap begins. */
function reframed(
  performance: Performance, takes: PerformanceShot['takes'], atSample: number,
): PerformanceShot['takes'] {
  return takes.map((take) => ({
    ...take,
    mediaInFrame: takeFrameAt(performance, take.takeId, atSample),
  }));
}

function performanceShot(
  performance: Performance, span: PerformanceSpan, profile: ExportProfile,
): Omit<PerformanceShot, 'hash'> {
  const base = LAYOUTS[span.scene.layoutId];
  if (!base) throw new PerformancePlanError(`unknown arrangement: ${span.scene.layoutId}`);
  // §14's four shapes, for free: a layout names what it becomes on a canvas
  // of another proportion, and the planner reads it. [U-18, U-22]
  const layout = reframeFor(base, profile);

  const slots = takeSlots(layout);
  if (span.takes.length !== slots) {
    throw new PerformancePlanError(
      `the scene at ${span.fromSample} has ${span.takes.length} performance(s) `
      + `but "${layout.label}" has ${slots} panel(s)`);
  }

  return {
    id: span.scene.id,
    kind: 'performance',
    outputStartFrame: span.outputStartFrame,
    durationFrames: span.durationFrames,
    layoutId: layout.id,
    fromSample: span.fromSample,
    takes: span.takes.map((take) => ({
      takeId: take.id as TakeId,
      assetId: take.assetId as AssetId,
      /*
       * Where this stretch of song sits inside this take's own media.
       * Converted to frames here, once, so the renderer never does clock
       * arithmetic — the plan is a complete description of the export.
       */
      mediaInFrame: takeFrameAt(performance, take.id, span.fromSample),
      label: take.label,
      ...(backdropFor(performance, take) ?? {}),
    })),
    ...(span.scene.label ? { label: span.scene.label } : {}),
  };
}

/**
 * The backdrop, resolved and measured.  [§4, S-6, INV-16]
 *
 * Absent when the take stays in its own room, which is the reliable case and
 * the default. Present, it carries everything the renderer needs and nothing
 * it has to work out: the plate, the threshold derived from that plate's
 * measured noise, and the feather. INV-16 has already refused the case where
 * a matte is wanted and none was measured, so a missing plate here is a bug
 * rather than a state to handle twice.
 */
function backdropFor(
  performance: Performance, take: PerformanceTake,
): { backdrop: PerformanceBackdrop } | undefined {
  if (!needsMatte(take.environment)) return undefined;
  const plate = plateFor(performance, take);
  if (!plate) {
    throw new PerformancePlanError(
      `"${take.label}" needs a matte and has no plate — this should have been `
      + 'refused by INV-16 before the plan was built');
  }
  return {
    backdrop: {
      kind: take.environment.kind as 'blur' | 'space' | 'custom',
      ...(take.environment.spaceId ? { spaceId: take.environment.spaceId } : {}),
      ...(take.environment.assetId ? { assetId: take.environment.assetId } : {}),
      plateAssetId: plate.assetId,
      threshold: matteThreshold(plate),
      feather: matteFeather(plate),
    },
  };
}

function takeFrameAt(
  performance: Performance, takeId: string, masterSample: number,
): Frames {
  const take = performance.takes.find((t) => t.id === takeId);
  if (!take) throw new PerformancePlanError(`no such take: ${takeId}`);
  const { alignment } = take;
  const offset = alignment.offsetSamples + (alignment.nudgeSamples ?? 0);
  const into = Math.max(0, Math.round((masterSample - offset) * alignment.rateRatio));
  return samplesToFrames(into, HOUSE_FPS);
}

/**
 * A shot's content address.  [U-16 §3]
 *
 * The same rule the Conversation's shots follow: identical hash means
 * identical bytes, so a re-render after moving one boundary re-renders one
 * shot. The canvas is in it because the same scene on a vertical canvas is a
 * different picture.
 */
function hashShot(
  shot: Omit<PerformanceShot, 'hash'> | Omit<TransitionShot, 'hash'>,
  profile: ExportProfile,
): string {
  return sha256(canonicalJson({
    ...shot,
    canvas: `${profile.width}x${profile.height}@${profile.fps}`,
  }));
}
