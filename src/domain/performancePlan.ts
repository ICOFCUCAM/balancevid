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
  type Performance, type PerformanceSpan,
  mayPublish, projectPerformance,
} from './performance.js';
import {
  type ExportProfile, EXPORT_PROFILES, LAYOUTS, captionStyleFor,
  reframeFor, takeSlots,
} from './presentation.js';
import type { AttributionBlock, PerformanceShot, RenderPlan } from './plan.js';
import { PLAN_VERSION, canonicalJson } from './plan.js';
import { HOUSE_FPS, type Frames, samplesToFrames } from './time.js';

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

  const shots: PerformanceShot[] = [];
  for (const span of timeline.spans) {
    const shot = performanceShot(performance, span, exportProfile);
    shots.push({ ...shot, hash: hashShot(shot, exportProfile) });
  }

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

  return { ...plan, planHash: sha256(canonicalJson(plan)) };
}

/* ------------------------------------------------------------------------ */

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
    })),
    ...(span.scene.label ? { label: span.scene.label } : {}),
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
  shot: Omit<PerformanceShot, 'hash'>, profile: ExportProfile,
): string {
  return sha256(canonicalJson({
    ...shot,
    canvas: `${profile.width}x${profile.height}@${profile.fps}`,
  }));
}
