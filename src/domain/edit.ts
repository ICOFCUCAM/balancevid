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
  INTERVENTION_TYPES, type Conversation, type Evidence, type EvidenceLocator,
  type Intervention, type InterventionType, type Take,
} from './document.js';
import { LAYOUTS } from './presentation.js';
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
  window: { appearFrame?: Frames | null; dismissFrame?: Frames | null },
): void {
  const target = intervention(conversation, interventionId);
  const found = findEvidence(target, evidenceId);

  if (window.appearFrame === null && window.dismissFrame === null) {
    delete found.appearFrame;
    delete found.dismissFrame;
    return;
  }

  const appear = window.appearFrame ?? found.appearFrame ?? 0;
  const dismiss = window.dismissFrame ?? found.dismissFrame ?? appear + MIN_EVIDENCE_FRAMES;
  assertFrames(appear);
  assertFrames(dismiss);
  if (dismiss - appear < MIN_EVIDENCE_FRAMES) {
    throw new EditError(`evidence must stay on screen for at least ${MIN_EVIDENCE_FRAMES} frames`);
  }
  found.appearFrame = appear;
  found.dismissFrame = dismiss;
}

/**
 * Evidence showing at a given point in a take's media clock.
 *
 * Later attachments win where windows overlap: one document on screen at a
 * time, and the most recently placed one is the one the author meant.
 */
export function evidenceAt(intervention: Intervention, mediaFrame: Frames): Evidence | null {
  let showing: Evidence | null = null;
  for (const evidence of intervention.evidence ?? []) {
    if (!evidence.archived) continue;
    const appear = evidence.appearFrame ?? Number.NEGATIVE_INFINITY;
    const dismiss = evidence.dismissFrame ?? Number.POSITIVE_INFINITY;
    if (mediaFrame >= appear && mediaFrame < dismiss) showing = evidence;
  }
  return showing;
}
