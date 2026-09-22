/**
 * Editing operations on the Conversation.  [Doctrine §17, §26, U-06, D-13]
 *
 * Studio Mode is where a user returns days later and refines what they
 * recorded. Every operation here mutates a draft document and nothing else --
 * no I/O, no rendering, no derived state -- because the Conversation is the
 * canonical artifact and everything downstream is recomputed from it (INV-00).
 *
 * Two rules shape all of them:
 *
 *   Destructive actions are reversible (D-13). Re-recording appends a take
 *   rather than replacing one; trimming moves markers rather than cutting
 *   media; deleting a take never touches the bytes on disk.
 *
 *   The user's recorded speech is irreplaceable (D-01 §2). Nothing here can
 *   leave an intervention with no way back to what was said.
 */

import {
  INTERVENTION_TYPES, type Annotation, type Conversation, type Evidence,
  type EvidenceLocator, type Intervention, type InterventionType, type Point, type Take,
} from './document.js';
import { LAYOUTS } from './presentation.js';
import { normaliseQuote, quoteHash } from './ids.js';
import {
  assertAcceptedOrigin, type AiOrigin, type Provenance, type SuggestionDecision,
} from './suggestions.js';
import { assertFrames, type Frames } from './time.js';

/** Shortest response worth keeping. Below this it is a slip, not a point. */
export const MIN_TAKE_FRAMES: Frames = 3;

export class EditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditError';
  }
}

function intervention(conversation: Conversation, interventionId: string): Intervention {
  const found = conversation.interventions.find((i) => i.id === interventionId);
  if (!found) throw new EditError(`no such intervention: ${interventionId}`);
  return found;
}

function take(target: Intervention, takeId: string): Take {
  const found = target.takes.find((t) => t.id === takeId);
  if (!found) throw new EditError(`no such take: ${takeId}`);
  return found;
}

/** [§17] Change what kind of move this is. Type drives layout and look (U-11). */
export function setType(
  conversation: Conversation, interventionId: string, type: InterventionType,
): void {
  if (!INTERVENTION_TYPES.includes(type)) throw new EditError(`unknown type: ${type}`);
  intervention(conversation, interventionId).type = type;
}

/** [§17] Override the layout the type would have chosen. null restores it. */
export function setLayout(
  conversation: Conversation, interventionId: string, layoutId: string | null,
): void {
  if (layoutId !== null && !LAYOUTS[layoutId]) throw new EditError(`unknown layout: ${layoutId}`);
  const target = intervention(conversation, interventionId);
  if (layoutId === null) delete target.layoutId;
  else target.layoutId = layoutId;
}

/**
 * [§18] Move where the interruption sits in the source.
 *
 * The anchor's other fields are NOT silently re-derived: a moved anchor may no
 * longer sit on the sentence whose claim it quotes, and the system may lose a
 * binding but must never fabricate one (INV-12). The quote is dropped, which
 * is visible, rather than left pointing somewhere it no longer belongs.
 */
export function moveAnchor(
  conversation: Conversation, interventionId: string, tSourceFrame: Frames,
): void {
  assertFrames(tSourceFrame);
  const target = intervention(conversation, interventionId);
  const clamped = Math.min(Math.max(tSourceFrame, 0), conversation.source.durationFrames);
  if (clamped === target.anchor.tSourceFrame) return;

  target.anchor.tSourceFrame = clamped;
  delete target.anchor.sentenceId;
  delete target.anchor.wordSpan;
  delete target.anchor.quote;
  delete target.anchor.quoteHash;
}

/**
 * [§17] Trim a take. Non-destructive and reversible: the media is untouched
 * and the pre-roll stays recoverable, however far in the markers are moved.
 * [U-04 §3, U-06]
 */
export function trimTake(
  conversation: Conversation, interventionId: string, takeId: string,
  range: { mediaInFrame?: Frames; mediaOutFrame?: Frames },
): void {
  const target = intervention(conversation, interventionId);
  const subject = take(target, takeId);

  const nextIn = range.mediaInFrame ?? subject.mediaInFrame;
  const nextOut = range.mediaOutFrame ?? subject.mediaOutFrame;
  assertFrames(nextIn);
  assertFrames(nextOut);

  if (nextIn < 0 || nextOut > subject.durationFrames) {
    throw new EditError(
      `trim [${nextIn}, ${nextOut}) is outside the take's ${subject.durationFrames} frames`,
    );
  }
  if (nextOut - nextIn < MIN_TAKE_FRAMES) {
    throw new EditError(`a take must keep at least ${MIN_TAKE_FRAMES} frames`);
  }

  subject.mediaInFrame = nextIn;
  subject.mediaOutFrame = nextOut;
}

/** [§17] Restore a take to its full extent, pre-roll included. */
export function resetTrim(
  conversation: Conversation, interventionId: string, takeId: string,
): void {
  const subject = take(intervention(conversation, interventionId), takeId);
  subject.mediaInFrame = 0;
  subject.mediaOutFrame = subject.durationFrames;
}

/** [U-06 §1] Audition another attempt. Takes are never deleted implicitly. */
export function selectTake(
  conversation: Conversation, interventionId: string, takeId: string,
): void {
  const target = intervention(conversation, interventionId);
  // Assign the take's own id, not the caller's string: the document's type
  // says what a take id is, and the API boundary is where strings stop.
  target.selectedTakeId = take(target, takeId).id;
}

/**
 * [§17] Delete a take.
 *
 * The last take of an intervention cannot be deleted -- deleting the
 * intervention is the way to discard a point, and it is an explicit act. The
 * media itself is never removed here; only the document forgets it.
 */
export function deleteTake(
  conversation: Conversation, interventionId: string, takeId: string,
): void {
  const target = intervention(conversation, interventionId);
  take(target, takeId);
  if (target.takes.length <= 1) {
    throw new EditError(
      'an intervention must keep at least one take — delete the intervention instead',
    );
  }
  target.takes = target.takes.filter((t) => t.id !== takeId);
  if (target.selectedTakeId === takeId) {
    target.selectedTakeId = target.takes.at(-1)?.id ?? null;
  }
}

/** [§17] Remove a point entirely. The recordings stay on disk. */
export function deleteIntervention(conversation: Conversation, interventionId: string): void {
  intervention(conversation, interventionId);
  conversation.interventions = conversation.interventions.filter((i) => i.id !== interventionId);
}

/** [§26] A note to yourself, kept with the point. */
export function setNote(
  conversation: Conversation, interventionId: string, note: string | null,
): void {
  const target = intervention(conversation, interventionId);
  if (note === null || note.trim() === '') delete target.note;
  else target.note = note.trim();
}

// --- evidence ---------------------------------------------------------------

/**
 * Evidence operations.  [Doctrine U-33, §44]
 *
 * Attaching is cheap and reversible; archiving is what makes the citation
 * durable and happens in the worker. The document records both states, so a
 * citation whose archive failed is visibly unarchived rather than quietly
 * presented as verified.
 */

/** Shortest window worth showing a document for. Below this it is a flash. */
export const MIN_EVIDENCE_FRAMES: Frames = 15;

function evidenceList(target: Intervention): Evidence[] {
  target.evidence ??= [];
  return target.evidence;
}

function findEvidence(target: Intervention, evidenceId: string): Evidence {
  const found = (target.evidence ?? []).find((e) => e.id === evidenceId);
  if (!found) throw new EditError(`no such evidence: ${evidenceId}`);
  return found;
}

export function attachEvidence(
  conversation: Conversation, interventionId: string, evidence: Evidence,
): void {
  const target = intervention(conversation, interventionId);
  if (!evidence.title.trim()) throw new EditError('evidence needs a title');
  evidenceList(target).push(evidence);
}

export function detachEvidence(
  conversation: Conversation, interventionId: string, evidenceId: string,
): void {
  const target = intervention(conversation, interventionId);
  findEvidence(target, evidenceId);
  target.evidence = (target.evidence ?? []).filter((e) => e.id !== evidenceId);
}

/**
 * Point at the part that matters.
 *
 * A region outside the capture would zoom to nothing, so it is clamped rather
 * than rejected: the author is dragging a box, not typing coordinates.
 */
export function setEvidenceLocator(
  conversation: Conversation, interventionId: string, evidenceId: string,
  locator: EvidenceLocator,
): void {
  const found = findEvidence(intervention(conversation, interventionId), evidenceId);
  const next: EvidenceLocator = {};

  if (locator.region) {
    const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);
    const x = clamp01(locator.region.x);
    const y = clamp01(locator.region.y);
    const w = Math.min(Math.max(locator.region.w, 0.02), 1 - x);
    const h = Math.min(Math.max(locator.region.h, 0.02), 1 - y);
    next.region = { x, y, w, h };
  }
  if (locator.quote?.trim()) next.quote = locator.quote.trim();
  if (locator.page !== undefined) {
    if (!Number.isInteger(locator.page) || locator.page < 1) {
      throw new EditError('page must be a positive whole number');
    }
    next.page = locator.page;
  }
  found.locator = next;
}

/**
 * When the document is on screen, within the response's own media clock.
 *
 * Clearing both ends means "for the whole response", which is the right
 * default for a single piece of evidence and wrong for three.
 */
export function setEvidenceWindow(
  conversation: Conversation, interventionId: string, evidenceId: string,
  window: { appearOffset?: Frames | null; dismissOffset?: Frames | null },
): void {
  const target = intervention(conversation, interventionId);
  const found = findEvidence(target, evidenceId);

  if (window.appearOffset === null && window.dismissOffset === null) {
    delete found.appearOffset;
    delete found.dismissOffset;
    return;
  }

  const appear = window.appearOffset ?? found.appearOffset ?? 0;
  const dismiss = window.dismissOffset ?? found.dismissOffset ?? appear + MIN_EVIDENCE_FRAMES;
  assertFrames(appear);
  assertFrames(dismiss);
  if (dismiss - appear < MIN_EVIDENCE_FRAMES) {
    throw new EditError(`evidence must stay on screen for at least ${MIN_EVIDENCE_FRAMES} frames`);
  }
  found.appearOffset = appear;
  found.dismissOffset = dismiss;
}

/**
 * Evidence showing at a given point in a take's media clock.
 *
 * Later attachments win where windows overlap: one document on screen at a
 * time, and the most recently placed one is the one the author meant.
 */
export function evidenceAt(intervention: Intervention, offset: Frames): Evidence | null {
  let showing: Evidence | null = null;
  for (const evidence of intervention.evidence ?? []) {
    if (!evidence.archived) continue;
    const appear = evidence.appearOffset ?? Number.NEGATIVE_INFINITY;
    const dismiss = evidence.dismissOffset ?? Number.POSITIVE_INFINITY;
    if (offset >= appear && offset < dismiss) showing = evidence;
  }
  return showing;
}

// --- annotations ------------------------------------------------------------

/**
 * Annotation operations.  [Doctrine §14, U-12]
 *
 * Everything here moves numbers in the document. Nothing is ever drawn into a
 * media file, so an annotation can be moved, retimed, restyled or removed
 * years later and the render simply comes out different.
 */

/** Shorter than this and a mark flashes rather than points at anything. */
export const MIN_ANNOTATION_FRAMES: Frames = 9;

function annotationList(target: Intervention): Annotation[] {
  target.annotations ??= [];
  return target.annotations;
}

function findAnnotation(target: Intervention, annotationId: string): Annotation {
  const found = (target.annotations ?? []).find((a) => a.id === annotationId);
  if (!found) throw new EditError(`no such annotation: ${annotationId}`);
  return found;
}

/** How many points each kind means. Anything else is a malformed mark. */
const REQUIRED_POINTS: Record<Annotation['kind'], number> = {
  box: 2, ellipse: 2, blur: 2, arrow: 2, underline: 2, text: 1, freehand: 2,
};

export function addAnnotation(
  conversation: Conversation, interventionId: string, annotation: Annotation,
): void {
  const target = intervention(conversation, interventionId);
  const required = REQUIRED_POINTS[annotation.kind];
  if (required === undefined) throw new EditError(`unknown annotation: ${annotation.kind}`);
  if (annotation.points.length < required) {
    throw new EditError(`a ${annotation.kind} needs at least ${required} point(s)`);
  }
  if (annotation.kind === 'text' && !annotation.text?.trim()) {
    throw new EditError('a text annotation needs some text');
  }
  annotation.points = annotation.points.map(clampPoint);
  annotationList(target).push(annotation);
}

export function removeAnnotation(
  conversation: Conversation, interventionId: string, annotationId: string,
): void {
  const target = intervention(conversation, interventionId);
  findAnnotation(target, annotationId);
  target.annotations = (target.annotations ?? []).filter((a) => a.id !== annotationId);
}

export function updateAnnotation(
  conversation: Conversation, interventionId: string, annotationId: string,
  patch: Partial<Pick<Annotation, 'points' | 'text' | 'style' | 'z' | 'drawFrames'>>,
): void {
  const found = findAnnotation(intervention(conversation, interventionId), annotationId);
  if (patch.points) {
    if (patch.points.length < REQUIRED_POINTS[found.kind]) {
      throw new EditError(`a ${found.kind} needs at least ${REQUIRED_POINTS[found.kind]} point(s)`);
    }
    found.points = patch.points.map(clampPoint);
  }
  if (patch.text !== undefined) {
    if (found.kind === 'text' && !patch.text.trim()) {
      throw new EditError('a text annotation needs some text');
    }
    found.text = patch.text;
  }
  if (patch.style) found.style = { ...found.style, ...patch.style };
  if (patch.z !== undefined) found.z = patch.z;
  if (patch.drawFrames !== undefined) {
    if (patch.drawFrames < 0) throw new EditError('a stroke cannot take negative time to draw');
    found.drawFrames = patch.drawFrames;
  }
}

/** When the mark is on screen, in the response's own media clock. [U-12 §2] */
export function setAnnotationWindow(
  conversation: Conversation, interventionId: string, annotationId: string,
  window: { appearOffset?: Frames | null; dismissOffset?: Frames | null },
): void {
  const found = findAnnotation(intervention(conversation, interventionId), annotationId);

  if (window.appearOffset === null && window.dismissOffset === null) {
    delete found.appearOffset;
    delete found.dismissOffset;
    return;
  }
  const appear = window.appearOffset ?? found.appearOffset ?? 0;
  const dismiss = window.dismissOffset ?? found.dismissOffset ?? appear + MIN_ANNOTATION_FRAMES;
  assertFrames(appear);
  assertFrames(dismiss);
  if (dismiss - appear < MIN_ANNOTATION_FRAMES) {
    throw new EditError(`a mark must stay up for at least ${MIN_ANNOTATION_FRAMES} frames`);
  }
  found.appearOffset = appear;
  found.dismissOffset = dismiss;
}

/** Marks showing at a point in a take's media clock, in draw order. */
export function annotationsAt(intervention: Intervention, offset: Frames): Annotation[] {
  return (intervention.annotations ?? [])
    .filter((annotation) => {
      const appear = annotation.appearOffset ?? Number.NEGATIVE_INFINITY;
      const dismiss = annotation.dismissOffset ?? Number.POSITIVE_INFINITY;
      return offset >= appear && offset < dismiss;
    })
    .sort((a, b) => a.z - b.z);
}

function clampPoint(point: Point): Point {
  const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1);
  return { x: clamp01(point.x), y: clamp01(point.y) };
}

/* -------------------------------------------------------------------------
 * Deciding about a suggested claim.  [Doctrine U-15, §20, INV-06]
 *
 * These are the ONLY functions in the product that move a machine-produced
 * proposal towards the document, and none of them does it silently: each one
 * records who decided, when, and what produced the suggestion. The caller
 * writes an audit entry as well, so the trail survives even a document
 * rollback.
 * ---------------------------------------------------------------------- */

/**
 * Accept, edit or reject one suggestion.
 *
 * Recording a rejection matters as much as recording an acceptance. Without
 * it, "the author considered this and said no" and "the author has not seen
 * this yet" are the same state, so a dismissed suggestion returns on the next
 * detection run and the author dismisses it forever.
 */
export function decideClaim(
  conversation: Conversation,
  input: {
    suggestionKey: string;
    status: SuggestionDecision['status'];
    by: string;
    at: string;
    provenance: Provenance;
    /** Required for 'edited': the narrowed span, still the source's words. */
    editedQuote?: string;
  },
): SuggestionDecision {
  if (!input.by.trim()) {
    // INV-06 is "every AI-derived field has an accepted_by". An anonymous
    // acceptance is the shape that rule fails in first.
    throw new EditError('a claim decision must record who made it [INV-06, U-15]');
  }
  if (input.status === 'edited' && !input.editedQuote?.trim()) {
    throw new EditError('an edited claim must carry the edited text');
  }

  const decision: SuggestionDecision = {
    suggestionKey: input.suggestionKey,
    status: input.status,
    by: input.by,
    at: input.at,
    provenance: input.provenance,
    ...(input.status === 'edited' && input.editedQuote
      ? { editedQuote: input.editedQuote.trim(), editedQuoteHash: quoteHash(input.editedQuote) }
      : {}),
  };

  const decisions = conversation.claimDecisions ?? [];
  // One decision per suggestion: the latest replaces the earlier, and the
  // audit log keeps the history. A list that accumulated every change would
  // make "what does the author currently think" a question with no answer.
  conversation.claimDecisions = [
    ...decisions.filter((d) => d.suggestionKey !== input.suggestionKey),
    decision,
  ];
  return decision;
}

/**
 * Bind an accepted claim to an intervention.  [U-10, U-15, INV-05, INV-06]
 *
 * This is the one door between the knowledge layer and the document, and the
 * checks at it are the boundary:
 *
 *   The text must be verbatim from the source. An author narrowing a claim is
 *   tightening a quote; an author typing a paraphrase is writing their own
 *   sentence, and a paraphrase presented as a quote misquotes a real person.
 *   Their own words are welcome — as a note, not as the source's speech.
 *
 *   The origin travels with it. Once bound, the quote carries the model, the
 *   version, the prompt hash and the accepting human, for as long as it exists.
 */
export function bindAcceptedClaim(
  conversation: Conversation,
  interventionId: string,
  input: {
    quote: string;
    sourceText: string;
    startFrame: Frames;
    origin: AiOrigin;
    sentenceId?: string;
    transcriptVersion?: number;
  },
): Intervention {
  const target = intervention(conversation, interventionId);
  const quote = input.quote.trim();
  if (!quote) throw new EditError('a bound claim cannot be empty');

  if (!normaliseQuote(input.sourceText).includes(normaliseQuote(quote))) {
    throw new EditError(
      'a bound claim must be words the source actually said — this text is not in the '
      + 'transcript. Your own wording belongs in a note, not in a quote [U-15, INV-05]');
  }

  assertAcceptedOrigin(input.origin, `the claim bound to ${interventionId}`);

  target.anchor = {
    ...target.anchor,
    quote,
    quoteHash: quoteHash(quote),
    origin: input.origin,
    ...(input.sentenceId ? { sentenceId: input.sentenceId } : {}),
    ...(input.transcriptVersion ? { transcriptVersion: input.transcriptVersion } : {}),
  };
  return target;
}
