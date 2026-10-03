/**
 * Issuing a request, and what may then be done to it.
 *   [Doctrine D-25; TAKE-APP T2, T9, T10, T16, T16a]
 *
 * THE RULES LIVE HERE AND NOWHERE ELSE, which is the same arrangement the
 * rest of the product uses: the routes decode and authorise, the domain
 * decides, the store writes. A request that could be advanced by a route
 * reaching into its fields would be a lifecycle with two owners. [D-06]
 *
 * NOTHING HERE TOUCHES A PROGRAMME, A PERFORMANCE OR A CONVERSATION. A
 * submission becomes part of a production at exactly one moment — when
 * somebody holding the studio accepts it — and that is `accept` handing
 * back what was accepted, for the studio to do the attaching. The
 * separation is the point. [D-25]
 */

import {
  type AllowedActions, type Assignment, type ParticipationRequest,
  type RequestHolder, type RequestId, type RequestState, type Submission,
  ROTATED, isOpen, mayMove, takesLeft,
} from './participation.js';
import { type Id, newId } from './ids.js';
import { REASON_LONGEST } from './judging.js';

export class ParticipationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParticipationError';
  }
}

const fail = (message: string): never => { throw new ParticipationError(message); };

/**
 * Ask somebody for something.  [T2, T16]
 *
 * The token is passed in rather than minted here for the reason every
 * other secret in this product is: `newId` and the random source live on
 * the server, and a domain function that reached for them could not be
 * called from a test with a known value — nor from the browser, which
 * this module's siblings are imported into.
 */
export function newRequest(spec: {
  holder: RequestHolder;
  assignment: Assignment;
  allowed: AllowedActions;
  token: string;
  participant?: string | undefined;
  expiresAt?: string | undefined;
  /** True where a stranger claimed it rather than a producer issuing it. */
  claimed?: boolean | undefined;
  /**
   * The call this is one answer to, where there is one. [V-2]
   *
   * Stamped at the moment the request is made, because that is
   * the only moment it is known: a request that learned later
   * which call it belonged to would be a call that could gather
   * entries it never opened for.
   */
  campaign?: Id<'camp'> | undefined;
  now: string;
}): ParticipationRequest {
  const {
    holder, assignment, allowed, token, participant, expiresAt, claimed,
    campaign, now,
  } = spec;
  if (!assignment.asks.trim()) {
    fail('a request has to say what is being asked for');
  }
  if (!allowed.video && !allowed.audio && !allowed.text) {
    fail('a request that allows nothing cannot be answered');
  }
  if (allowed.takes !== undefined
    && (!Number.isInteger(allowed.takes) || allowed.takes < 1)) {
    fail(`a request takes at least one submission, not ${allowed.takes}`);
  }
  if (token.length < 16) {
    fail('that token is too short to be a credential');
  }
  /*
   * A PERFORMANCE REQUEST WITHOUT ITS REFERENCE IS A CAMERA, which is
   * the one thing the brief says the Take App must be more than: "the
   * phone knows exactly what the performer is supposed to perform
   * against". Without it there is nothing to play, nothing to sync to,
   * and the submission cannot be placed on anybody's timeline. [T6]
   */
  if (assignment.kind === 'performance' && !assignment.reference) {
    fail('a performance request has to carry what is being performed against');
  }
  if (assignment.reference && !(assignment.reference.durationSamples > 0)) {
    fail('the reference has no measured length');
  }
  return {
    id: newId('req'),
    holder,
    assignment,
    allowed,
    token,
    ...(participant ? { participant } : {}),
    ...(claimed ? { claimed: true } : {}),
    ...(campaign ? { campaign } : {}),
    state: 'created',
    createdAt: now,
    history: [{ state: 'created', at: now }],
    ...(expiresAt ? { expiresAt } : {}),
  };
}

/**
 * Move it along.  [T16a]
 *
 * EVERY CHANGE OF STATE GOES THROUGH HERE, including the ones the
 * participant causes, so the history is complete rather than nearly
 * complete — an inbox that can say a request was opened and never
 * recorded is telling a producer something they can act on.
 *
 * REFUSED RATHER THAN IGNORED when the move is not allowed. A lifecycle
 * that silently drops a transition is one nobody can debug from the
 * record it leaves.
 */
export function advance(
  request: ParticipationRequest, to: RequestState, now: string, by?: string,
  /*
   * AND WHY, WHERE THERE IS A WHY.  [GO-VIRAL G8]
   *
   * ON `advance` AND NOT ON `reject` ALONE, because the line it
   * is written to is this function's and a second writer of
   * history would be a second shape of history. What makes it
   * the decline's field in practice is that `reject` is the only
   * caller that passes one — and the alternative, a `says` on
   * the request itself, would be one reason for a request that
   * can be held, passed and reconsidered.
   */
  says?: string,
): void {
  if (request.state === to && to !== 'recording') {
    /* Re-announcing where you already are is not an error, it is a
       refresh; only `recording` means something a second time. */
    return;
  }
  if (!mayMove(request.state, to)) {
    fail(`a ${request.state} request cannot become ${to}`);
  }
  request.state = to;
  request.history.push({
    state: to, at: now, ...(by ? { by } : {}),
    ...(says?.trim() ? { says: says.trim().slice(0, REASON_LONGEST) } : {}),
  });
}

/** Mark that the producer has sent the link. Their word for it. [T16a] */
export function markSent(request: ParticipationRequest, now: string, by: string): void {
  advance(request, 'sent', now, by);
}

/**
 * Somebody has opened the link.  [T16a]
 *
 * REFUSED WHEN THE REQUEST IS SHUT, and that refusal is the whole value
 * of an expiry: a link that has run out has to fail at the door, not
 * after somebody has recorded four minutes of singing.
 */
export function open(request: ParticipationRequest, now: string): void {
  if (!isOpen(request, now)) fail('this request is closed');
  if (request.state === 'created' || request.state === 'sent') {
    advance(request, 'opened', now);
  }
}

/**
 * What came back.  [T4, T5]
 *
 * ONLY THE ONES THEY CHOSE ARRIVE HERE. The Take App keeps takes on the
 * phone and uploads the saved ones — "Take 3 doesn't have to reach the
 * server at all if they delete it locally" — so a deleted take is not a
 * submission that gets removed, it is a submission that never existed.
 * Nothing in this module needs to know about it.
 */
export function submit(
  request: ParticipationRequest, submission: Omit<Submission, 'id'>, now: string,
): Submission {
  if (!isOpen(request, now)) fail('this request is closed');
  /*
   * AN ANGLE JOINING A CAPTURE IS NOT A NEW TAKE.  [B-2, T-5]
   *
   * FOUND BY A CAPTURE STATION, AFTER IT HAD UPLOADED 42 MB. A
   * request allowing three takes, with two already made, accepted
   * the first angle of the third capture — which made it the
   * third take — and then refused the second angle with *"this
   * request accepts 3 submission(s) and has them"*. The limit had
   * been reached by the thing that was in the middle of being
   * added.
   *
   * B-2 taught `takesLeft` to count captures rather than files,
   * which was right and is why the number was three and not six.
   * What it did not do is teach this guard that the four `submit`
   * calls of one capture are one arrival: the count is correct
   * after each of them and the GUARD is about to start a take,
   * which only the first of the four does.
   *
   * THE FIXTURE THAT MISSED IT allowed four takes and sent one
   * capture — so the count went from nothing to one and never
   * came near the boundary. A limit is only tested at the limit.
   */
  const capture = submission.capturedIn?.id;
  const sameCapture = capture
    ? (request.submissions ?? []).filter((one) => one.capturedIn?.id === capture)
    : [];
  if (sameCapture.length === 0 && takesLeft(request) <= 0) {
    const allowed = request.allowed.takes ?? 1;
    fail(`this request accepts ${allowed} submission(s) and has them`);
  }
  /*
   * AND THE SAME FILE IS NOT SENT TWICE.  [T-5]
   *
   * THIS IS WHAT ACTUALLY SHUTS THE DOOR the exemption above
   * would otherwise open. "An angle joining a capture is free"
   * plus a client that sends the same capture twice is a way
   * past the take limit — and a `MOST_ANGLES` bound written
   * here to stop it could not fire, because the route numbers a
   * capture's angles 0 to `MOST_ANGLES - 1` and names each asset
   * after its track, so a capture cannot have more distinct
   * files than that. A guard nobody can reach is a guard nobody
   * can check; this one can. [C-49]
   *
   * IT WAS ALSO ALREADY WRONG WITHOUT CAPTURES. Sending the same
   * recording twice has always produced two submissions of one
   * file — two rows in a producer's inbox, the same performance
   * in both, and a take limit spent twice on one take. Nothing
   * had noticed because no client does it.
   */
  if ((request.submissions ?? []).some((one) => one.assetId === submission.assetId)) {
    fail('that recording has already been sent');
  }
  const allowed = request.allowed;
  if (submission.kind === 'video' && !allowed.video) fail('this request does not ask for video');
  if (submission.kind === 'audio' && !allowed.audio) fail('this request does not ask for sound');
  if (submission.kind === 'text' && !allowed.text) fail('this request does not ask for writing');

  const entry: Submission = { id: newId('sub'), ...submission };
  request.submissions = [...(request.submissions ?? []), entry];
  /*
   * `submitted` IS ABOUT THE REQUEST, NOT THE FILE. A request that
   * allows three takes is submitted when the first arrives and stays
   * submitted; the count is in `submissions`, where it can be read.
   */
  if (request.state !== 'submitted') {
    advance(request, request.state === 'received' ? 'received' : 'submitted', now);
  }
  return entry;
}

/** The producer has it. Separate from `submitted`, which is the client's word. */
export function receive(request: ParticipationRequest, now: string): void {
  advance(request, 'received', now);
}

/**
 * DECIDING ABOUT SOMETHING IS RECEIVING IT.  [T10, T16a]
 *
 * `submitted` is the CLIENT's word — the phone says it sent one —
 * and `received` is the producer's. The table allows `submitted →
 * received` and nothing else, which is right: a producer who has not
 * got it cannot have an opinion about it.
 *
 * What it should not do is make the producer press a button called
 * "I have it" before the buttons that matter. Opening the inbox
 * cannot do it either — a read that writes turns looking at a studio
 * into an edit and the audit log into a lie — so the three verbs
 * below take it on the way past, which is what they mean anyway.
 *
 * Found in a browser: the first accept from a real submission came
 * back "a submitted request cannot become accepted", which is the
 * table being right and the caller being wrong.
 */
function deciding(request: ParticipationRequest, now: string, by: string): void {
  if (request.state === 'submitted') advance(request, 'received', now, by);
}

/** Looked at, and not yet decided. The brief's "Hold". [T10] */
export function hold(request: ParticipationRequest, now: string, by: string): void {
  deciding(request, now, by);
  advance(request, 'reviewed', now, by);
}

/**
 * Use it.  [T9, T10]
 *
 * THIS IS THE MOMENT THE SEPARATION ENDS, and it is deliberately the
 * only one. Before it, a submission is something somebody sent; after
 * it, the studio may put it in a production. This function does not do
 * that attaching — it returns what was accepted and lets the studio that
 * owns the document decide — because a domain module that wrote into a
 * performance would be participation reaching into production, which is
 * the thing D-25 exists to prevent.
 */
export function accept(
  request: ParticipationRequest, submissionId: string, now: string, by: string,
): Submission {
  const found = (request.submissions ?? []).find((s) => s.id === submissionId);
  if (!found) fail(`no submission ${submissionId} on this request`);
  found!.acceptedAt = now;
  deciding(request, now, by);
  if (request.state !== 'accepted') advance(request, 'accepted', now, by);
  return found!;
}

/**
 * Do not use it. Not an end: a producer may change their mind. [T10]
 *
 * AND IT MAY SAY WHY.  [GO-VIRAL G8]
 *
 * Optional, because a producer passing on a take in their own
 * studio owes nobody minutes. Written down when it is given,
 * because a competition declining somebody's entry with no
 * reason is a decision nobody can review or reverse on grounds —
 * which is the one thing `takeRanking`'s own posture insists on,
 * one actor over: *"a ranked list with no reasons is an
 * oracle."*
 */
export function reject(
  request: ParticipationRequest, now: string, by: string, says?: string,
): void {
  deciding(request, now, by);
  advance(request, 'rejected', now, by, says);
}


/**
 * It is in the programme now.  [T16a]
 *
 * The last state, and the only terminal one: what a production has used
 * cannot be un-asked. Revoking the link after this is rotation, not a
 * state change.
 */
export function attach(request: ParticipationRequest, now: string, by: string): void {
  advance(request, 'attached', now, by);
}

/**
 * Withdraw it.  [ROOM §6, D-25]
 *
 * A new secret, exactly as a room's invitation is withdrawn: the old
 * link stops working for whoever holds it, including somebody who has
 * already opened it. An invitation you cannot take back from the person
 * who used it is not one you can withdraw.
 */
export function rotate(
  request: ParticipationRequest, token: string, now: string,
): void {
  if (token.length < 16) fail('that token is too short to be a credential');
  request.token = token;
  request.history.push({ state: request.state, at: now, by: ROTATED });
}

/** A submission's id type, for callers that hold one. */
export type SubmissionId = Id<'sub'>;
/** Re-exported so a caller needs one import to work with requests. */
export type { ParticipationRequest, RequestId, RequestState };
