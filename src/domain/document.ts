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
import type { Participant, ParticipantId } from './participants.js';
import type { AiOrigin, SuggestionDecision } from './suggestions.js';
import type { ProviderId } from './providers.js';

/** Forward-only. Migrations are tested against archived real documents. [U-25] */
export const SCHEMA_VERSION = 1;

export type ConversationId = Id<'conv'>;
export type SourceId = Id<'src'>;
export type InterventionId = Id<'ivn'>;
export type TakeId = Id<'take'>;
export type AssetId = Id<'asset'>;
export type EvidenceId = Id<'ev'>;
export type AnnotationId = Id<'ann'>;

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
  /** Set when this source IS another conversation's published render. [U-31] */
  sourceConversationId?: string;
  /** Class B only: whose player we honour, and which video. [U-01] */
  provider?: ProviderId;
  providerVideoId?: string;
  embedUrl?: string;
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
  /**
   * Set only when this quote reached the document through a suggestion.
   *
   * Absent on everything the author found themselves, which is most of them.
   * When present it names the model, its version, the prompt hash and the
   * person who accepted it — the four fields INV-06 requires. [U-15]
   */
  origin?: AiOrigin;
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
  /**
   * One capture per page, in order, for a paged document.  [U-33 §2]
   *
   * Index 0 is page 1, because `locator.page` is 1-based — people number
   * pages from one, and the conversion happens at the point of use rather
   * than being carried around in everyone's head.
   *
   * A deck is ONE piece of evidence with many pages, not many pieces of
   * evidence: it was retrieved once, hashed once and cited once, and
   * splitting it would give a lecture forty citations of the same document.
   * Which page is on screen is a property of the moment being spoken, which
   * is exactly what the locator is for.
   */
  pageAssetIds?: AssetId[];
  /** How many pages it has, including any beyond the ones prepared. */
  pageCount?: number;
  /** The original bytes as retrieved, when we hold them. */
  originalAssetId?: AssetId;
  /** Content hash of the capture, so a citation is verifiable. [U-33 §1] */
  contentHash?: string;
  retrievedAt: string;
  locator: EvidenceLocator;
  /** On screen from here to here, as offsets into what the author kept. */
  appearOffset?: Frames;
  dismissOffset?: Frames;
  /** Set once the archive job has run. */
  archived: boolean;
  archiveError?: string;
  /**
   * A stated limit, so nothing pretends to have archived more than it did.
   *
   * Not an error: a deck stored and hashed but not rasterised IS a valid
   * citation. Saying so in the error field would mark a working attachment
   * as broken, which is a different claim and a wrong one.
   */
  archiveNote?: string;
}

/**
 * Annotations.  [Doctrine §14, U-12]
 *
 * Vector primitives in normalised coordinates, with their own timing. Three
 * properties, all of which are lost if annotations are captured as pixels
 * from the editing canvas:
 *
 *   RESOLUTION-INDEPENDENT. Rasterised at editor size they blur at 1080p,
 *   break at 4K, and cannot reflow for a vertical export (§29).
 *
 *   TIMED. A circle drawn AS the author says the word is the difference
 *   between a broadcast explainer and a webcam recording. One that sits there
 *   for the whole take is neither.
 *
 *   EDITABLE FOREVER. They are never baked into a media asset — only into a
 *   render (§30).
 */
export type AnnotationKind =
  | 'box' | 'ellipse' | 'arrow' | 'underline' | 'freehand' | 'text' | 'blur' | 'point';

export interface Point { x: number; y: number }

export interface AnnotationStyle {
  /** #rrggbb. The type's accent when the author does not choose. */
  color?: string;
  /** Stroke width as a fraction of the canvas height, so it scales. */
  width?: number;
  opacity?: number;
  filled?: boolean;
}

export interface Annotation {
  id: AnnotationId;
  kind: AnnotationKind;
  /**
   * Normalised to the frame, 0–1.
   *   box · ellipse · blur   two corners
   *   arrow · underline      from, to
   *   freehand               the path as drawn
   *   text · point           one anchor point
   */
  points: Point[];
  text?: string;
  style: AnnotationStyle;
  z: number;
  /**
   * When the mark is on screen, as an offset into WHAT THE AUTHOR KEPT.
   *
   * Not a position in the recording. A take is one attempt at a response; the
   * response is what the author means. Storing media frames ties a mark to one
   * recording, so re-recording or trimming silently orphans every mark on the
   * point — the marks are still in the document and simply stop appearing,
   * which is the worst way for work to go missing (D-07).
   *
   * Absent means the whole response.
   */
  appearOffset?: Frames;
  dismissOffset?: Frames;
  /**
   * How long the stroke takes to appear, recorded from how fast it was drawn.
   * A hand-drawn circle that animates on at hand speed reads as production
   * value, and it costs nothing. [U-12 §3]
   */
  drawFrames?: Frames;
}

/**
 * How a clip of this pair opens.  [Doctrine U-22 §2, §52, D-16]
 *
 * A vertical clip is watched with the sound off and decided in its first
 * second, so the opening is the most consequential editorial choice in the
 * whole distribution engine — and until now it was the only one the author
 * could not make. The product chose the moment and the words, and the author
 * took what they were given.
 *
 * It lives HERE, on the Conversation, and not in the clip plan. D-16 names
 * "a clip has a title that exists nowhere else" as a forbidden shape, and a
 * hook typed into an export dialogue is exactly that shape: it would survive
 * until the next re-plan and then quietly vanish. Absent fields mean "decide
 * for me", so a conversation nobody has touched is the same object it was.
 */
export interface Opening {
  /**
   * How much source plays before the cut, in frames.
   *
   * Absent means derived — the sentence the author was answering, which
   * begins where the thought begins. A number is their own decision and is
   * clamped to what the source can actually supply.
   */
  leadInFrames?: Frames;
  /** The card held over the first seconds. Absent means the statement. */
  card?: OpeningCard;
}

/**
 * QUOTATION MARKS ARE RESERVED FOR WHAT WAS SAID.
 *
 * `statement` shows the source's own sentence, in quotation marks, and the
 * clip then plays it — the viewer hears whether the quotation was fair, which
 * is what earns the marks.
 *
 * `text` is the AUTHOR speaking, over the source's footage, and it is never
 * quoted. The distinction is not decoration: unquoted, a hook is plainly the
 * person answering; in quotation marks it would be words put into the mouth
 * of somebody who never said them, on top of their own picture.
 */
export type OpeningCard =
  | { kind: 'statement' }
  | { kind: 'none' }
  | { kind: 'text'; text: string; seconds?: number };

/** How long an opening card holds, when nobody has said otherwise. */
export const CARD_SECONDS = 2.5;
/** The range a card may be held for: long enough to read, short enough to keep. */
export const MIN_CARD_SECONDS = 1;
export const MAX_CARD_SECONDS = 6;
/**
 * The most a hook may say.
 *
 * Not a storage limit — a reading one. A hook is read in a moving thumbnail by
 * somebody who has not decided to watch anything yet, and past about this much
 * it stops being a hook and becomes a paragraph they scroll past.
 */
export const MAX_HOOK_LENGTH = 120;

export interface Intervention {
  id: InterventionId;
  anchor: Anchor;
  type: InterventionType;
  takes: Take[];
  selectedTakeId: TakeId | null;
  /** Overrides the type's default layout. [U-11, U-18] */
  layoutId?: string;
  /** How a clip of this pair opens, where the author has decided. [U-22] */
  opening?: Opening;
  /**
   * Whose response this is.  [Doctrine ROOM §4, §9, §10]
   *
   * Absent means the conversation's author, which is every conversation made
   * before rooms existed and every solo one after. Present, it names a
   * participant — and that single field is what lets the composition engine
   * be told `activeParticipant = Sarah` without knowing anything about rooms,
   * microphones, or whether a human chose her or a voice detector did.
   *
   * Recordings stay separate per person (ROOM §10): a participant's takes are
   * their own media, and the composed video is made from them afterwards. So
   * who was on stage can be changed later — automatic to manual, Sarah full
   * screen, a three-person cut — without asking anyone to say it again.
   */
  participantId?: ParticipantId;
  note?: string;
  /** [§44] Attached evidence, in the order the author added it. */
  evidence?: Evidence[];
  /**
   * Marks over the frozen source frame, in draw order.  [Doctrine §14, §15]
   *
   * The frame they sit on is the anchor frame — the one the author was looking
   * at when they pressed the key — extracted from the mezzanine at render time
   * (U-13). There is no separate freeze-frame asset because there is nothing a
   * separate one could say that the anchor does not.
   *
   * An embedded source has no frames, so it has nothing to annotate.
   */
  annotations?: Annotation[];
  createdAt: string;
}

/**
 * Publication.  [Doctrine U-31]
 *
 * "A published conversation is a Class A source. Anyone can open it and
 *  respond to it. That single property turns the product from a tool into a
 *  network."
 *
 * Consent is set here and nowhere else: the publisher decides whether their
 * conversation can be answered. It is recorded at publish time because it
 * cannot be added cheaply afterwards -- by then there are responses that were
 * made under an assumption nobody stated.
 */
export interface Publication {
  publishedAt: string;
  /** Whether anyone may respond to this. The publisher's decision. [U-31] */
  respondable: boolean;
  /** The render that was published; what a responder will be answering. */
  planHash: string;
  /** Shown as the author of the response, where one is given. */
  author?: string;
  unpublishedAt?: string;
}

/**
 * Where this conversation came from.  [Doctrine U-31, §40]
 *
 * "Every conversation records its ancestry, so any exchange can be traced to
 *  its origin and displayed as a thread."
 *
 * The chain is stored, not derived, because the parent may later be edited,
 * re-rendered, unpublished or deleted, and a response must still be able to
 * say what it was answering.
 */
export interface LineageEntry {
  conversationId: string;
  title: string;
  author?: string;
  publishedAt?: string;
  /** The original media at the root of the chain. */
  sourceTitle: string;
  sourceUrl?: string;
}

export interface Lineage {
  /** The conversation this one answers, if any. */
  parentConversationId: string;
  /** Oldest first. The root's own source is the first entry's sourceTitle. */
  chain: LineageEntry[];
}

export interface Conversation {
  schemaVersion: number;
  id: ConversationId;
  title: string;
  source: Source;
  /** Order is derived from anchors, never stored. [U-08] */
  interventions: Intervention[];
  layoutProfileId: string;
  /**
   * How captions look on this conversation's exports.  [U-19 §2, D-04]
   *
   * Absent means the shape of the canvas decides — a tall clip wants its
   * captions clear of where apps put their own buttons, a wide one does not.
   * Here rather than on each export because it is one decision about one
   * conversation, not a different answer per format.
   */
  captionStyleId?: string;
  /** Set once the author publishes. [U-31] */
  publication?: Publication;
  /** Set when this conversation answers another one. [U-31, §40] */
  lineage?: Lineage;
  /**
   * What the author decided about each suggested claim.  [U-15, §20]
   *
   * Only the DECISIONS live here. The suggestions themselves are derived from
   * the transcript and recomputed on demand (INV-00), so an unreviewed
   * suggestion is not part of the document and cannot reach anything the
   * document produces.
   */
  claimDecisions?: SuggestionDecision[];
  /**
   * Everyone in this conversation.  [Doctrine ROOM §4, §12]
   *
   *   Conversation → Participants → Interventions
   *
   * Absent on a conversation made before rooms existed, and on the ordinary
   * single-author one: the author is implied, exactly as they were, and
   * nothing about a solo conversation changes. What this field buys is that
   * a response can say WHOSE it is, so a three-way discussion is the same
   * object as a one-person answer with more people in it — not a second kind
   * of conversation with its own renderer.
   */
  participants?: Participant[];
  /** The room, when one has been opened on this conversation. [ROOM §6] */
  room?: Room;
  createdAt: string;
  updatedAt: string;
}

/**
 * A room opened on a conversation.  [Doctrine ROOM §6, §7]
 *
 * "Generate invitation URL → Share URL through WhatsApp." The first
 * implementation owns no messaging platform and needs none: what it owns is
 * a link that is safe to paste anywhere, and a record of who it let in.
 */
export interface Room {
  /**
   * The secret in the invitation link.
   *
   * Long and random, because this IS the credential — anyone holding it can
   * enter, which is the point of being able to send it over WhatsApp to
   * somebody with no account. It is therefore revocable, and revoking it
   * cannot be undone by anyone still holding the old one.
   */
  inviteToken: string;
  /** Rotating this is how an invitation is withdrawn. */
  issuedAt: string;
  /** Closed rooms accept nobody, whatever link they hold. */
  open: boolean;
  /**
   * How the stage is driven, and by whom.  [ROOM §3]
   *
   * Stored, because it is a decision about the finished video and not a
   * property of the live session: the brief's §10 requires that automatic
   * switching can be changed to manual AFTER the discussion without
   * re-recording, and a setting that lived only in a browser could not be.
   */
  speakerMode: 'automatic' | 'manual' | 'host' | 'conversation';
  /** Set by hand; overrides the microphones until cleared. [ROOM §3] */
  pinnedParticipantId?: ParticipantId;
  /**
   * Who is in the composition right now.  [ROOM §4]
   *
   * On the ROOM and not on each participant, because "who is on stage" is one
   * decision about the picture. A flag per person is a way for two records to
   * disagree about whether one of them is on screen, and there is no correct
   * answer when they do.
   *
   * A list rather than a single id: a layout may hold two or three people at
   * once, and the brief's §11 asks for a three-person cut.
   */
  stagedParticipantIds?: ParticipantId[];
}

/** How deep in a response chain this sits. The root is 0. */
export function lineageDepth(conversation: Conversation): number {
  return conversation.lineage?.chain.length ?? 0;
}

/** Whether anyone may answer this conversation right now. [U-31 consent] */
export function isRespondable(conversation: Conversation): boolean {
  const publication = conversation.publication;
  return Boolean(publication && !publication.unpublishedAt && publication.respondable);
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

/**
 * The capture to show for a piece of evidence, at the page being cited.
 *
 * One function, used by the planner and the editor alike, so a page number
 * means the same thing in the preview and in the export. Out-of-range falls
 * back to the first page rather than showing nothing: a citation pointing at
 * page 40 of a document whose first 30 were prepared is still a citation, and
 * a blank panel tells the viewer nothing about why.
 */
export function evidenceCapture(evidence: Evidence): AssetId | undefined {
  const pages = evidence.pageAssetIds;
  if (!pages || pages.length === 0) return evidence.captureAssetId;
  const page = evidence.locator.page ?? 1;
  return pages[Math.min(Math.max(1, page), pages.length) - 1] ?? evidence.captureAssetId;
}
