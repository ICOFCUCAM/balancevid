/**
 * The Conversation document.
 *
 * INV-00 — The Conversation is the canonical artifact. Every video, article,
 * manifest, caption track and export is a representation of it.
 *
 * Nothing in this file describes how anything is rendered. It describes what
 * the user meant.  [Doctrine §33, U-25]
 */

import type { Frames } from './time.js';
import type { Id } from './ids.js';

/** Forward-only. Migrations are tested against archived real documents. [U-25] */
export const SCHEMA_VERSION = 1;

export type ConversationId = Id<'conv'>;
export type SourceId = Id<'src'>;
export type InterventionId = Id<'ivn'>;
export type TakeId = Id<'take'>;
export type AssetId = Id<'asset'>;
export type EvidenceId = Id<'ev'>;

/**
 * Source class decides which exports exist. Enforced at plan time (INV-01).
 * [Doctrine U-01]
 *
 *   A — governed: we hold the frames; COMPOSED and COMPANION available
 *   B — embedded: playback only; COMPANION only, never COMPOSED
 */
export type SourceClass = 'A' | 'B';

/** [Doctrine §13, U-11] A closed vocabulary, because it drives presentation. */
export const INTERVENTION_TYPES = [
  'explain', 'critique', 'correct', 'context', 'question', 'agree',
  'expand', 'fact_check', 'counterargument', 'personal_experience', 'teaching',
] as const;
export type InterventionType = (typeof INTERVENTION_TYPES)[number];

export interface Source {
  id: SourceId;
  class: SourceClass;
  title: string;
  /** Shown in the generated, non-removable attribution block. [U-21] */
  creator?: string;
  url?: string;
  /** Class A only: the normalised mezzanine we are permitted to render. [U-02] */
  mezzanineAssetId?: AssetId;
  originalAssetId?: AssetId;
  durationFrames: Frames;
  rightsAttestationId?: string;
  /** Which transcript version the source currently has. Versioned, never
   *  overwritten, because anchors are bound to it (U-05). */
  transcriptVersion?: number;
}

/**
 * The composite anchor.  [Doctrine U-05]
 *
 * Every field is independently sufficient for recovery. The system may lose a
 * binding; it may never fabricate one (INV-12).
 */
export interface Anchor {
  /** Authoritative for cutting. Everything else is for re-locating. [U-07] */
  tSourceFrame: Frames;
  sentenceId?: string;
  wordSpan?: [number, number];
  /** The claim being answered, verbatim from the transcript. [U-10] */
  quote?: string;
  /** Integrity binding. A quote whose text does not hash to this is a defect. */
  quoteHash?: string;
  transcriptVersion?: number;
}

/**
 * One recording attempt. An intervention holds many; one is selected.
 * Re-recording never destroys a previous try.  [Doctrine U-06]
 */
export interface Take {
  id: TakeId;
  assetId: AssetId;
  createdAt: string;
  /** Total normalised length including pre-roll. */
  durationFrames: Frames;
  /**
   * How much of the head is pre-roll — captured before the key was pressed.
   * The user can always recover speech from before the press. [U-04]
   */
  prerollFrames: Frames;
  /** Non-destructive trim. Defaults to [prerollFrames, durationFrames). */
  mediaInFrame: Frames;
  mediaOutFrame: Frames;
  /** What MediaRecorder actually produced, so ingest knows what it reads. [U-26] */
  captureMimeType?: string;
  recoveredFromCrash?: boolean;
}

/**
 * Attached evidence.  [Doctrine U-33, §44]
 *
 * Three properties are what separate a citation from a decoration, and all
 * three are worthless if added later:
 *
 *   ARCHIVED at attach time. A linked page changes or disappears, and cited
 *   evidence that 404s a year later actively damages the author's credibility
 *   -- the opposite of what the feature is for.
 *
 *   LOCATED precisely. A full-page screenshot proves nothing; the viewer
 *   cannot find the relevant line. The locator is what the render zooms to.
 *
 *   TIMED within the response, so it appears when it is referenced rather
 *   than hanging there for the whole take.
 */
export type EvidenceKind = 'web' | 'image' | 'document';

/** Where in the evidence the claim actually is. Normalised, 0–1. [U-33 §2] */
export interface EvidenceLocator {
  /** The region to zoom to while the author speaks. */
  region?: { x: number; y: number; w: number; h: number };
  /** The cited line, for the citation and for the reader. */
  quote?: string;
  /** 1-based, for paged documents. */
  page?: number;
}

export interface Evidence {
  id: EvidenceId;
  kind: EvidenceKind;
  title: string;
  /** Original location, kept for the citation even though we hold a copy. */
  url?: string;
  /** The archived capture: what the render shows and the citation points at. */
  captureAssetId?: AssetId;
  /** The original bytes as retrieved, when we hold them. */
  originalAssetId?: AssetId;
  /** Content hash of the capture, so a citation is verifiable. [U-33 §1] */
  contentHash?: string;
  retrievedAt: string;
  locator: EvidenceLocator;
  /** Window within the response's media clock. Absent means the whole take. */
  appearFrame?: Frames;
  dismissFrame?: Frames;
  /** Set once the archive job has run. */
  archived: boolean;
  archiveError?: string;
}

export interface Intervention {
  id: InterventionId;
  anchor: Anchor;
  type: InterventionType;
  takes: Take[];
  selectedTakeId: TakeId | null;
  /** Overrides the type's default layout. [U-11, U-18] */
  layoutId?: string;
  note?: string;
  /** [§44] Attached evidence, in the order the author added it. */
  evidence?: Evidence[];
  createdAt: string;
}

export interface Conversation {
  schemaVersion: number;
  id: ConversationId;
  title: string;
  source: Source;
  /** Order is derived from anchors, never stored. [U-08] */
  interventions: Intervention[];
  layoutProfileId: string;
  createdAt: string;
  updatedAt: string;
}

export function selectedTake(intervention: Intervention): Take | null {
  if (!intervention.selectedTakeId) return null;
  return intervention.takes.find((t) => t.id === intervention.selectedTakeId) ?? null;
}

/** The trimmed, usable length of a take — what actually reaches the render. */
export function takeUsableFrames(take: Take): Frames {
  return Math.max(0, take.mediaOutFrame - take.mediaInFrame);
}

/**
 * Interventions in source order. Derived, never stored.  [Doctrine U-08]
 * Ties break by creation time so ordering is total and stable.
 */
export function orderedInterventions(conversation: Conversation): Intervention[] {
  return [...conversation.interventions].sort((a, b) => {
    const d = a.anchor.tSourceFrame - b.anchor.tSourceFrame;
    return d !== 0 ? d : a.createdAt.localeCompare(b.createdAt);
  });
}

/** Only interventions with a usable selected take reach a render. */
export function renderableInterventions(conversation: Conversation): Intervention[] {
  return orderedInterventions(conversation).filter((ivn) => {
    const take = selectedTake(ivn);
    return take !== null && takeUsableFrames(take) > 0;
  });
}
