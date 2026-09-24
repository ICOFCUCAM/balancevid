/**
 * The render plan.  [Doctrine U-16]
 *
 * "The render plan is data, not code." It is a versioned artefact, persisted
 * with every render, diffable, and content-addressed per shot so that fixing a
 * caption at minute 38 of a 40-minute video re-renders one shot.
 *
 * Rendering is a pure function: render(plan, assets) -> bytes.
 */

import {
  type Annotation, type AssetId, type Conversation, type Evidence,
  type Intervention, type InterventionId, type Point, type TakeId,
  evidenceCapture, orderedInterventions, selectedTake,
} from './document.js';
import { sha256 } from './ids.js';
import { InvariantViolation } from './invariants.js';
import {
  type ExportProfile, type Rect, EXPORT_PROFILES, TYPE_PRESENTATION, type Transition,
  layoutForProfile, layoutForType,
} from './presentation.js';
import { focusRegion } from './focus.js';
import { chainAttribution } from './publish.js';
import { type Timeline, projectTimeline, sourceRatio } from './timeline.js';
import type { Frames } from './time.js';

export const PLAN_VERSION = 1;

/** [Doctrine U-01] COMPOSED requires a Class A source. Asserted, not advised. */
export type RenderMode = 'composed' | 'companion';

export interface ShotBase {
  id: string;
  /** Content address. Identical hash ⇒ identical bytes ⇒ cache hit. [U-16 §3] */
  hash: string;
  outputStartFrame: Frames;
  durationFrames: Frames;
  layoutId: string;
}

export interface SourceShot extends ShotBase {
  kind: 'source';
  assetId: AssetId;
  sourceInFrame: Frames;
  sourceOutFrame: Frames;
}

export interface ResponseShot extends ShotBase {
  kind: 'response';
  interventionId: InterventionId;
  takeId: TakeId;
  assetId: AssetId;
  /** The source frame this interrupts. Freeze-frame layouts render it. [U-13] */
  anchorFrame: Frames;
  /** The mezzanine the still is cut from; absent for Class B. [U-01] */
  sourceAssetId?: AssetId;
  mediaInFrame: Frames;
  mediaOutFrame: Frames;
  padHeadFrames: Frames;
  padTailFrames: Frames;
  lowerThird: string;
  accent: string;
  transition: Transition;
  /** The claim being answered, rendered as typography. [U-10] */
  quote?: string;
  /** Archived evidence to show, in this shot's own frames. [U-33 §2, §3] */
  evidence?: EvidenceCue[];
  /** Marks over the frozen source frame, in this shot's own frames. [U-12] */
  annotations?: AnnotationCue[];
  /**
   * The part of the source this response is about, normalised to the source
   * frame.  [U-22 §3]
   *
   * Set only where the layout asked to follow it — a reframe. The compositor
   * crops the source panel to this before fitting it, so the thing the author
   * pointed at is the thing the viewer sees, at a size worth seeing.
   */
  sourceFocus?: Rect;
}

/**
 * One mark, already placed on the canvas.
 *
 * The compositor works in canvas coordinates and should not have to know which
 * panel the source occupies in which layout, so the points are mapped through
 * the layout here, once. [U-18]
 */
export interface AnnotationCue {
  annotationId: string;
  kind: Annotation['kind'];
  /** Normalised to the CANVAS, not the source frame. */
  points: Point[];
  text?: string;
  style: Annotation['style'];
  z: number;
  startFrame: Frames;
  endFrame: Frames;
  drawFrames: Frames;
}

/**
 * One document on screen, for a while, zooming to the part that matters.
 *
 * Times are SHOT-relative, because the compositor works in shot frames and
 * should not have to know about media clocks or pre-roll. [U-08]
 */
export interface EvidenceCue {
  evidenceId: string;
  captureAssetId: AssetId;
  title: string;
  startFrame: Frames;
  endFrame: Frames;
  /** Normalised region of the capture to zoom into. [U-33 §2] */
  region?: { x: number; y: number; w: number; h: number };
  /** Which page of a paged document this is, for the citation. [U-33 §2] */
  page?: number;
}

export type Shot = SourceShot | ResponseShot;

/** Generated from the source record, never typed by the user. [U-21, INV-07] */
export interface AttributionBlock {
  sourceTitle: string;
  creator?: string;
  url?: string;
  accessedAt: string;
  text: string;
}

export interface AudioMaster {
  loudnessLufs: number;
  truePeakDb: number;
  declickMs: number;
  duckDb: number;
  /** Per-speaker normalisation before any ducking decision. [U-17 §3] */
  matchSpeakers: boolean;
}

export interface RenderPlan {
  planVersion: number;
  planHash: string;
  mode: RenderMode;
  conversationId: string;
  schemaVersion: number;
  exportProfile: ExportProfile;
  shots: Shot[];
  totalOutputFrames: Frames;
  sourceRatio: number;
  attribution: AttributionBlock;
  /** INV-07: every export carries captions. Not a user preference. [U-19] */
  captions: { burnIn: boolean; sidecars: ReadonlyArray<'srt' | 'vtt'> };
  /**
   * A claim shown as typography over the opening seconds.
   *
   * A vertical clip has to work with the sound off, which is how these formats
   * are actually consumed, so it opens on the statement being answered rather
   * than on someone mid-sentence. [U-22 §2]
   */
  openingClaim?: { text: string; seconds: number };
  audio: AudioMaster;
}

export interface PlanOptions {
  mode?: RenderMode;
  exportProfileId?: string;
  burnInCaptions?: boolean;
  accessedAt?: string;
  /** Overrides, used by vertical clips where the canvas is a different shape. */
  sourceLayoutId?: string;
  responseLayoutId?: string;
  openingClaim?: { text: string; seconds: number };
}

export function buildRenderPlan(conversation: Conversation, options: PlanOptions = {}): RenderPlan {
  return planFromTimeline(conversation, projectTimeline(conversation), options);
}

/**
 * Build a plan from any timeline.
 *
 * The whole conversation is one timeline; a single claim-and-response clip is
 * another (U-22). Both produce the same kind of plan and are rendered by the
 * same compositor, which is why a clip needs no second renderer to drift from
 * the first.
 */
export function planFromTimeline(
  conversation: Conversation, timeline: Timeline, options: PlanOptions = {},
): RenderPlan {
  const mode: RenderMode = options.mode ?? 'composed';
  const profileId = options.exportProfileId ?? 'youtube_16x9';
  const exportProfile = EXPORT_PROFILES[profileId];
  if (!exportProfile) throw new Error(`unknown export profile: ${profileId}`);

  // --- INV-01 ---------------------------------------------------------------
  // The one rule that keeps the product on the right side of both physics and
  // the law. A Class B source has no frames we are permitted to render.
  if (mode === 'composed' && conversation.source.class !== 'A') {
    throw new InvariantViolation(
      'INV-01',
      `cannot build a COMPOSED plan for a Class ${conversation.source.class} source. ` +
      `Embedded sources export as a Conversation Manifest (companion mode). [Doctrine U-01]`,
    );
  }
  const mezzanine = conversation.source.mezzanineAssetId;
  if (mode === 'composed' && !mezzanine) {
    throw new InvariantViolation('INV-04',
      'composed render requires a normalised mezzanine asset — renders never read originals [U-02]');
  }

  const byId = new Map(orderedInterventions(conversation).map((i) => [i.id, i]));
  const shots: Shot[] = [];

  for (const item of timeline.items) {
    if (item.kind === 'source') {
      const shot: Omit<SourceShot, 'hash'> = {
        id: `shot_src_${item.sourceInFrame}_${item.sourceOutFrame}`,
        kind: 'source',
        assetId: mezzanine as AssetId,
        sourceInFrame: item.sourceInFrame,
        sourceOutFrame: item.sourceOutFrame,
        outputStartFrame: item.outputStartFrame,
        durationFrames: item.durationFrames,
        layoutId: options.sourceLayoutId ?? 'full_source',
      };
      shots.push({ ...shot, hash: hashShot(shot, exportProfile) });
      continue;
    }

    const ivn = byId.get(item.interventionId);
    if (!ivn) throw new Error(`timeline references unknown intervention ${item.interventionId}`);
    const take = selectedTake(ivn);
    if (!take) throw new Error(`intervention ${ivn.id} has no selected take`);
    const presentation = TYPE_PRESENTATION[ivn.type];
    const cues = evidenceCues(
      ivn.evidence ?? [], item.mediaInFrame, item.mediaOutFrame, item.padHeadFrames);
    // Evidence changes the composition: a document needs a panel, not a corner
    // of a frozen frame. An explicit override still wins. [U-11, U-33]
    // Evidence needs a panel; a mark needs the frame it points at. Either
    // changes the composition, and an explicit override still wins. [U-11]
    const implied = cues.length > 0
      ? 'evidence_split'
      : (ivn.annotations?.length ?? 0) > 0 ? 'freeze_pip' : undefined;
    /*
     * The layout, reframed for the canvas this export is being drawn on.
     * The author composed once; this is the same composition in another
     * shape, not a second composition. [U-18, U-22 §3]
     */
    const layout = layoutForProfile(
      ivn.type, options.responseLayoutId ?? ivn.layoutId ?? implied, exportProfile,
    );
    /*
     * And which part of the source it is about, so a reframed panel shows the
     * thing rather than the whole wide frame shrunk to a strip. Derived from
     * the marks the author placed: they already said where to look.
     */
    const focus = layout.layers.some((l) => l.followFocus)
      ? focusRegion(ivn) : undefined;

    const shot: Omit<ResponseShot, 'hash'> = {
      id: `shot_res_${ivn.id}_${take.id}`,
      kind: 'response',
      interventionId: ivn.id,
      takeId: take.id,
      assetId: take.assetId,
      anchorFrame: item.anchorFrame,
      ...(mezzanine ? { sourceAssetId: mezzanine } : {}),
      mediaInFrame: item.mediaInFrame,
      mediaOutFrame: item.mediaOutFrame,
      padHeadFrames: item.padHeadFrames,
      padTailFrames: item.padTailFrames,
      outputStartFrame: item.outputStartFrame,
      durationFrames: item.durationFrames,
      layoutId: layout.id,
      ...(focus ? { sourceFocus: focus } : {}),
      lowerThird: presentation.lowerThird,
      accent: presentation.accent,
      transition: presentation.transition,
      ...(ivn.anchor.quote ? { quote: ivn.anchor.quote } : {}),
      ...(cues.length > 0 ? { evidence: cues } : {}),
      ...(() => {
        const marks = annotationCues(
          ivn.annotations ?? [], layout, item.mediaInFrame, item.mediaOutFrame,
          item.padHeadFrames, presentation.accent);
        return marks.length > 0 ? { annotations: marks } : {};
      })(),
    };
    shots.push({ ...shot, hash: hashShot(shot, exportProfile) });
  }

  const attribution = buildAttribution(conversation, options.accessedAt);

  const plan: Omit<RenderPlan, 'planHash'> = {
    planVersion: PLAN_VERSION,
    mode,
    conversationId: conversation.id,
    schemaVersion: conversation.schemaVersion,
    exportProfile,
    shots,
    totalOutputFrames: timeline.totalOutputFrames,
    sourceRatio: sourceRatio(timeline),
    attribution,
    captions: { burnIn: options.burnInCaptions ?? true, sidecars: ['srt', 'vtt'] },
    ...(options.openingClaim ? { openingClaim: options.openingClaim } : {}),
    audio: {
      loudnessLufs: exportProfile.loudnessLufs,
      truePeakDb: exportProfile.truePeakDb,
      declickMs: 2,
      duckDb: -18,
      matchSpeakers: true,
    },
  };

  const planHash = sha256(canonicalJson(plan));
  const finished: RenderPlan = { ...plan, planHash };
  assertExportInvariants(finished);
  return finished;
}

/**
 * INV-07 — Every export carries captions and an attribution block.
 * A user cannot forget to attribute, because a user was never asked to. [U-21]
 */
export function assertExportInvariants(plan: RenderPlan): void {
  if (plan.captions.sidecars.length === 0) {
    throw new InvariantViolation('INV-07', 'every export must ship caption sidecars [U-19]');
  }
  if (!plan.attribution.text.trim()) {
    throw new InvariantViolation('INV-07', 'every export must carry an attribution block [U-21]');
  }
}

/**
 * Evidence windows, clipped to what the take actually keeps and shifted onto
 * the shot's clock.
 *
 * Evidence attached to speech the author later trimmed away does not appear:
 * it was cited in something that is no longer in the video.
 */
function evidenceCues(
  evidence: Evidence[], mediaInFrame: Frames, mediaOutFrame: Frames, padHeadFrames: Frames,
): EvidenceCue[] {
  const kept = Math.max(0, mediaOutFrame - mediaInFrame);
  const cues: EvidenceCue[] = [];
  for (const item of evidence) {
    // An unarchived citation is not yet verifiable, so it is not yet shown.
    if (!item.archived) continue;
    // The page being cited, for a paged document; the whole thing otherwise.
    const capture = evidenceCapture(item);
    if (!capture) continue;
    // Offsets into what the author kept, so a re-record or a trim does not
    // orphan the citation.
    const appear = clampOffset(item.appearOffset ?? 0, kept);
    const dismiss = clampOffset(item.dismissOffset ?? kept, kept);
    if (dismiss <= appear) continue;
    cues.push({
      evidenceId: item.id,
      captureAssetId: capture,
      title: item.title,
      ...(item.pageAssetIds?.length ? { page: item.locator.page ?? 1 } : {}),
      startFrame: padHeadFrames + appear,
      endFrame: padHeadFrames + dismiss,
      ...(item.locator.region ? { region: item.locator.region } : {}),
    });
  }
  return cues;
}

/**
 * Place the marks on the canvas and clip them to what the take keeps.
 *
 * A mark made over speech the author later trimmed away does not appear: it
 * pointed at something that is no longer in the video.
 */
function annotationCues(
  annotations: Annotation[], layout: { layers: Array<{ source: string; rect: { x: number; y: number; w: number; h: number } }> },
  mediaInFrame: Frames, mediaOutFrame: Frames, padHeadFrames: Frames, accent: string,
): AnnotationCue[] {
  if (annotations.length === 0) return [];
  /**
   * A mark is a statement about the source frame, so it can only be drawn
   * where that frame is. A layout that shows no frame -- an evidence panel
   * filling the picture, a full-screen response -- has nothing for a mark to
   * point at, and drawing it over the canvas anyway would land it on something
   * the author never marked. [U-12 §1]
   */
  const panel = layout.layers.find((l) => l.source === 'source' || l.source === 'still')?.rect;
  if (!panel) return [];

  const kept = Math.max(0, mediaOutFrame - mediaInFrame);
  const cues: AnnotationCue[] = [];
  for (const annotation of [...annotations].sort((a, b) => a.z - b.z)) {
    const appear = clampOffset(annotation.appearOffset ?? 0, kept);
    const dismiss = clampOffset(annotation.dismissOffset ?? kept, kept);
    if (dismiss <= appear) continue;
    cues.push({
      annotationId: annotation.id,
      kind: annotation.kind,
      points: annotation.points.map((point) => ({
        x: panel.x + point.x * panel.w,
        y: panel.y + point.y * panel.h,
      })),
      ...(annotation.text ? { text: annotation.text } : {}),
      style: { color: accent, ...annotation.style },
      z: annotation.z,
      startFrame: padHeadFrames + appear,
      endFrame: padHeadFrames + dismiss,
      drawFrames: annotation.drawFrames ?? 0,
    });
  }
  return cues;
}

/** An offset can only point inside what was kept. */
function clampOffset(offset: Frames, kept: Frames): Frames {
  return Math.min(Math.max(offset, 0), kept);
}

/**
 * Exported because a render plan is not the only export that must carry
 * attribution. A Class B conversation never reaches buildRenderPlan (INV-01)
 * and still publishes — as a manifest, an article, a description — and INV-07
 * does not soften for it.
 */
export function buildAttribution(
  conversation: Conversation, accessedAt?: string,
): AttributionBlock {
  const { title, creator, url } = conversation.source;
  const when = accessedAt ?? conversation.createdAt;

  // A response to a response is still using the original creator's work, so
  // the attribution credits the whole chain rather than only the last link.
  if (conversation.lineage) {
    const root = conversation.lineage.chain[0];
    return {
      sourceTitle: root?.sourceTitle ?? title,
      ...(creator ? { creator } : {}),
      ...(root?.sourceUrl ? { url: root.sourceUrl } : url ? { url } : {}),
      accessedAt: when,
      text: chainAttribution(conversation, when),
    };
  }

  const parts = [`Source: "${title}"`];
  if (creator) parts.push(`by ${creator}`);
  if (url) parts.push(url);
  parts.push(`Accessed ${when.slice(0, 10)}`);
  return {
    sourceTitle: title,
    ...(creator ? { creator } : {}),
    ...(url ? { url } : {}),
    accessedAt: when,
    text: parts.join(' · '),
  };
}

function hashShot(shot: object, profile: ExportProfile): string {
  // The export profile participates: the same cut at a different canvas size is
  // a different shot and must not share a cache entry.
  return sha256(canonicalJson({ shot, profile, planVersion: PLAN_VERSION }));
}

/** Deterministic serialisation — key order must never affect a hash. [U-16 §2] */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>).sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}
