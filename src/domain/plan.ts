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
  type AssetId, type Conversation, type Evidence, type InterventionId, type TakeId,
  orderedInterventions, selectedTake,
} from './document.js';
import { sha256 } from './ids.js';
import { InvariantViolation } from './invariants.js';
import {
  type ExportProfile, EXPORT_PROFILES, TYPE_PRESENTATION, type Transition, layoutForType,
} from './presentation.js';
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
  audio: AudioMaster;
}

export interface PlanOptions {
  mode?: RenderMode;
  exportProfileId?: string;
  burnInCaptions?: boolean;
  accessedAt?: string;
}

export function buildRenderPlan(conversation: Conversation, options: PlanOptions = {}): RenderPlan {
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

  const timeline = projectTimeline(conversation);
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
        layoutId: 'full_source',
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
    const layout = layoutForType(ivn.type, ivn.layoutId ?? (cues.length > 0 ? 'evidence_split' : undefined));

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
      lowerThird: presentation.lowerThird,
      accent: presentation.accent,
      transition: presentation.transition,
      ...(ivn.anchor.quote ? { quote: ivn.anchor.quote } : {}),
      ...(cues.length > 0 ? { evidence: cues } : {}),
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
  const cues: EvidenceCue[] = [];
  for (const item of evidence) {
    // An unarchived citation is not yet verifiable, so it is not yet shown.
    if (!item.archived || !item.captureAssetId) continue;
    const appear = Math.max(item.appearFrame ?? mediaInFrame, mediaInFrame);
    const dismiss = Math.min(item.dismissFrame ?? mediaOutFrame, mediaOutFrame);
    if (dismiss <= appear) continue;
    cues.push({
      evidenceId: item.id,
      captureAssetId: item.captureAssetId,
      title: item.title,
      startFrame: padHeadFrames + (appear - mediaInFrame),
      endFrame: padHeadFrames + (dismiss - mediaInFrame),
      ...(item.locator.region ? { region: item.locator.region } : {}),
    });
  }
  return cues;
}

function buildAttribution(conversation: Conversation, accessedAt?: string): AttributionBlock {
  const { title, creator, url } = conversation.source;
  const when = accessedAt ?? conversation.createdAt;
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
