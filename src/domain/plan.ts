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
  evidenceCapture, hasSeveralVoices, orderedInterventions, participantFor, selectedTake,
} from './document.js';
import { sha256 } from './ids.js';
import { InvariantViolation } from './invariants.js';
import {
  type CaptionStyle, type ExportProfile, type Rect, EXPORT_PROFILES, TYPE_PRESENTATION,
  type Transition, captionStyleFor, layoutForProfile, layoutForType,
} from './presentation.js';
import { focusRegion } from './focus.js';
import {
  type Placement, type Point as MarkPoint,
  markScale, projectPoint, projectRect,
} from './marks.js';
import { chainAttribution } from './publish.js';
import { type Timeline, projectTimeline, sourceRatio } from './timeline.js';
import type { AudioPiece } from './performanceAudio.js';
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
  /**
   * Whose response this is.  [Doctrine ROOM §9]
   *
   * "The composition engine should not care whether the speaker was selected
   *  manually or automatically. It receives `activeParticipant = Sarah` and
   *  renders Sarah according to the selected layout."
   *
   * This is that boundary. By the time a plan exists the question of WHO is
   * settled — by a host clicking a name, by a voice detector, or by there
   * being only one person — and the renderer is told the answer and nothing
   * about how it was reached. Absent on a solo conversation, where the
   * author is implied.
   */
  participantId?: string;
  /** Their name, for the lower third, when a room has more than one. */
  speakerName?: string;
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

/**
 * A stretch of a song, with performances on it.  [Doctrine STUDIO-TWO §2, §7]
 *
 * A third kind beside `source` and `response`, and it is a third kind rather
 * than a variation because it is the only one that carries SEVERAL pieces of
 * media at once. A source shot shows the source; a response shot shows the
 * responder, possibly beside a still. A performance shot shows however many
 * takes the arrangement has panels for, and they are all playing.
 *
 * NO AUDIO. The video timeline and the audio timeline are independent in
 * Studio Two (S-7): scenes cut the picture, and the song runs underneath them
 * unbroken. So these shots are rendered as picture only and the master is laid
 * over the finished concatenation in one pass — which is also the only way to
 * keep the music sample-continuous, since slicing audio at video-frame
 * boundaries is how you get a click at every cut.
 */
export interface PerformanceShot extends ShotBase {
  kind: 'performance';
  /** Where this stretch begins on the music clock. [S-2] */
  fromSample: number;
  /** The takes, in the order the layout's slots expect them. */
  takes: {
    takeId: TakeId;
    assetId: AssetId;
    /** Where in this take's own media the stretch begins, in FRAMES. */
    mediaInFrame: Frames;
    label: string;
    /**
     * This take's clock against the song's, where it was measured. [§10, S-3]
     *
     * Absent means one, which is both the normal case and the honest one: a
     * ratio is only present when something measured it. Present, the renderer
     * plays the take at this speed for the whole shot — correcting the IN
     * point alone would leave a four-minute scene sliding apart inside itself.
     */
    rateRatio?: number;
    /**
     * What to put behind this performer, and how to cut them out. [§4, S-6]
     *
     * Complete: the plate to difference against, the threshold measured from
     * that plate's own noise, and the feather. The renderer does no
     * measurement and makes no choice — a plan is a description of an export,
     * and a renderer that decides anything is a second place for the export
     * to be decided.
     */
    backdrop?: PerformanceBackdrop;
  }[];
  /** The author's name for this stretch — "Chorus". [§15] */
  label?: string;
}

/** Where the performer is put, once they are cut out of their room. [§4] */
export interface PerformanceBackdrop {
  /** `blur` is their own room softened; `space` is a drawn look; `custom` theirs. */
  kind: 'blur' | 'space' | 'custom';
  /** For `space`: which drawn look, from SPACE_LOOKS. */
  spaceId?: string;
  /** For `custom`: the author's own picture. */
  assetId?: AssetId;
  /** The still of the empty room this take is differenced against. */
  plateAssetId: AssetId;
  /** 0..255 on the difference, measured from the plate's own noise. */
  threshold: number;
  /** Pixels of softening on the matte's edge. */
  feather: number;
}

/**
 * One arrangement of performances, for one moment.  [STUDIO-TWO §5, §11]
 *
 * The part of a performance shot that says what is on screen, without saying
 * for how long — so a transition can hold two of them at once.
 */
export interface PerformanceFrame {
  layoutId: string;
  takes: PerformanceShot['takes'];
}

/** One arrangement becoming another, over a length of time. [§11, S-8] */
export interface TransitionShot extends ShotBase {
  kind: 'transition';
  /** `dissolve`, `fade` — from the transitions table, never free text. */
  style: string;
  /** Where the overlap begins on the music clock. */
  fromSample: number;
  /** What is being left, and what is being arrived at. */
  from: PerformanceFrame;
  to: PerformanceFrame;
}

export type Shot = SourceShot | ResponseShot | PerformanceShot | TransitionShot;

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
  /**
   * INV-07: every export carries captions. Not a user preference. [U-19]
   *
   * THAT they are there is not a choice. How they LOOK is, within a floor —
   * and the choice is resolved here rather than at the point of drawing, so
   * that the plan is a complete description of the export and the renderer
   * has nothing left to decide. [U-18]
   */
  captions: {
    burnIn: boolean;
    sidecars: ReadonlyArray<'srt' | 'vtt'>;
    style: CaptionStyle;
  };
  /**
   * What is shown as typography over the opening seconds.
   *
   * A vertical clip has to work with the sound off, which is how these formats
   * are actually consumed, so it opens on something readable rather than on
   * someone mid-sentence. [U-22 §2]
   *
   * `quoted` decides whether it is set in quotation marks, and it is not a
   * styling choice. True means the source's own sentence, which the clip then
   * plays; false means the author's own hook, over the source's picture.
   * Quoting the second would be putting words in somebody's mouth on top of
   * their own footage. [INV-05]
   */
  openingClaim?: { text: string; seconds: number; quoted: boolean };
  audio: AudioMaster;
  /**
   * Where the finished sound comes from, for a Performance. [STUDIO-TWO §9, S-7]
   *
   * A list of contiguous runs on the music clock rather than one source per
   * shot, because the audio timeline and the video timeline are independent:
   * scenes cut the picture and they do not cut the sound. Absent for a
   * Conversation, whose shots each carry their own audio because there the
   * sound IS the cut.
   */
  performanceAudio?: AudioPiece[];
}

export interface PlanOptions {
  mode?: RenderMode;
  exportProfileId?: string;
  burnInCaptions?: boolean;
  accessedAt?: string;
  /** Overrides, used by vertical clips where the canvas is a different shape. */
  sourceLayoutId?: string;
  responseLayoutId?: string;
  openingClaim?: { text: string; seconds: number; quoted: boolean };
  /** Overrides the conversation's own choice, for a preview of another look. */
  captionStyleId?: string;
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

    /*
     * Whose voice this is, named only when naming distinguishes.  [ROOM §4]
     *
     * A conversation with one speaker needs no name on screen; one with
     * three needs one on every response, or the viewer cannot follow who is
     * answering whom. The plan decides this once, from the document, rather
     * than each surface deciding for itself.
     */
    /*
     * Asked of who has actually SPOKEN, not of who is on the invitation list.
     * A colleague invited last week and still silent does not put a name on
     * every one of the author's responses; the moment they answer once, every
     * response needs one. `hasSeveralVoices` is that question, asked in one
     * place so the render, the article and the cards cannot disagree.
     */
    const speaking = participantFor(conversation, ivn);
    const speakerName = hasSeveralVoices(conversation)
      ? speaking.displayName : undefined;

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
      /*
       * Who, carried through. The name is only set where it distinguishes
       * someone: a lower third reading the author's own name on every
       * response of a conversation they are alone in is noise.
       */
      ...(ivn.participantId ? { participantId: ivn.participantId } : {}),
      ...(speakerName ? { speakerName } : {}),
      accent: speaking?.accent ?? presentation.accent,
      transition: presentation.transition,
      ...(ivn.anchor.quote ? { quote: ivn.anchor.quote } : {}),
      ...(cues.length > 0 ? { evidence: cues } : {}),
      ...(() => {
        const marks = annotationCues(
          ivn.annotations ?? [], layout, item.mediaInFrame, item.mediaOutFrame,
          item.padHeadFrames, presentation.accent,
          {
            focus,
            /*
             * The source's own shape, so a mark can be put back where it
             * belongs. Missing on conversations ingested before it was
             * recorded, and the canvas's shape is then assumed — which is the
             * behaviour those marks were authored against. [U-12, U-22 §3]
             */
            sourceAspect: conversation.source.width && conversation.source.height
              ? conversation.source.width / conversation.source.height
              : exportProfile.width / exportProfile.height,
            canvasAspect: exportProfile.width / exportProfile.height,
          });
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
    captions: {
      burnIn: options.burnInCaptions ?? true,
      sidecars: ['srt', 'vtt'],
      style: captionStyleFor(exportProfile, options.captionStyleId ?? conversation.captionStyleId),
    },
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
  annotations: Annotation[],
  layout: {
    layers: Array<{
      source: string; fit?: 'cover' | 'contain';
      rect: { x: number; y: number; w: number; h: number };
    }>;
  },
  mediaInFrame: Frames, mediaOutFrame: Frames, padHeadFrames: Frames, accent: string,
  frame: { focus?: Rect | undefined; sourceAspect: number; canvasAspect: number },
): AnnotationCue[] {
  if (annotations.length === 0) return [];
  /**
   * A mark is a statement about the source frame, so it can only be drawn
   * where that frame is. A layout that shows no frame -- an evidence panel
   * filling the picture, a full-screen response -- has nothing for a mark to
   * point at, and drawing it over the canvas anyway would land it on something
   * the author never marked. [U-12 §1]
   */
  const layer = layout.layers.find((l) => l.source === 'source' || l.source === 'still');
  if (!layer) return [];

  /*
   * THE MARK FOLLOWS THE PICTURE, through everything done to it. [U-22 §3]
   *
   * Mapping into the panel is not enough, and was all this did: a vertical
   * export crops the source to the region the author marked, and a mark that
   * is not cropped with it ends up pointing at whatever the crop happened to
   * leave in that part of the frame. The fit matters for the same reason — a
   * picture letterboxed inside a panel does not fill it, and a mark stretched
   * to the panel's edges is a mark somewhere else.
   *
   * "The user selected this region of the source as the subject of the
   *  response. The meaning survives the format change" — this is the line of
   * code that makes the second sentence true.
   */
  const placement: Placement = {
    panel: layer.rect,
    fit: layer.fit === 'contain' ? 'contain' : 'cover',
    // The compositor crops to the focus and then CONTAINS it, because the
    // region is already the shape the author's marks made. `renderResponseShot`
    // does exactly this; the two must agree or the mark is off by the letterbox.
    ...(frame.focus ? { focus: frame.focus, fit: 'contain' as const } : {}),
    sourceAspect: frame.sourceAspect,
    canvasAspect: frame.canvasAspect,
  };
  const stroke = markScale(placement);

  const kept = Math.max(0, mediaOutFrame - mediaInFrame);
  const cues: AnnotationCue[] = [];
  for (const annotation of [...annotations].sort((a, b) => a.z - b.z)) {
    const appear = clampOffset(annotation.appearOffset ?? 0, kept);
    const dismiss = clampOffset(annotation.dismissOffset ?? kept, kept);
    if (dismiss <= appear) continue;
    /*
     * A rectangle keeps its corners — which for a blur is the behaviour that
     * matters, because a box half off screen must keep covering the half that
     * is on it. Everything else is projected point by point, and a mark with
     * nothing left on screen is dropped rather than pinned to the edge: a
     * circle at the edge of the picture is a circle around the wrong thing.
     */
    const rectangular = annotation.kind === 'box' || annotation.kind === 'blur';
    const projected = rectangular && annotation.points.length >= 2
      ? projectRect(annotation.points[0]!, annotation.points[1]!, placement)
      : annotation.points.map((point) => projectPoint(point, placement));
    if (!projected) continue;
    const points = (projected as (Point | null)[]).filter((p): p is Point => p !== null);
    if (points.length === 0 || points.length !== annotation.points.length) continue;

    cues.push({
      annotationId: annotation.id,
      kind: annotation.kind,
      points,
      ...(annotation.text ? { text: annotation.text } : {}),
      style: {
        color: accent,
        ...annotation.style,
        // A stroke is a fraction of the canvas, and a picture in a panel is
        // smaller than the canvas. Keeping the fraction would swallow what the
        // mark points at.
        ...(annotation.style?.width !== undefined
          ? { width: annotation.style.width * stroke } : {}),
      },
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
