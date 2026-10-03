/**
 * What is being asked of somebody who is not in the studio.
 *   [Doctrine D-25; TAKE-APP T16, T16a, T12, T9]
 *
 * PRODUCTION AND PARTICIPATION ARE SEPARATE, and this object is the whole
 * of the boundary between them. A producer holds a studio; a participant
 * holds one of these. Nothing else about the production crosses over —
 * not the document, not the other takes, not the other people.
 *
 * THE BRIEF'S OWN WORDS FOR IT are "Request ID, Production, Assignment,
 * Participant, Allowed actions, Expiration, Upload destination, Status",
 * and those are the fields, near enough one for one. The two that are not
 * literal are worth saying:
 *
 *   PRODUCTION is `holder` — what kind of thing is asking, and which one.
 *     A performance, a conversation and a channel are three different
 *     documents in three different stores, and a request that named only
 *     an id would be a request nobody could resolve.
 *
 *   UPLOAD DESTINATION is deliberately NOT a URL in the document. The
 *     request is answered against the server that served it; writing an
 *     origin into the record would make a self-hosted installation's
 *     invitations break the moment its address changed, and a forged one
 *     would be somewhere to send a stranger's camera. [T14]
 *
 * WHY IT IS ITS OWN MODULE and not a field on the three documents: every
 * one of the three studios issues these, the inbox lists them across all
 * three, and a request outlives the thing it asks about — a response can
 * arrive after a programme has aired. One object, one lifecycle, one
 * place the rules live. [D-19]
 */

import type { Id } from './ids.js';

export type RequestId = Id<'req'>;

/**
 * What is being asked for.  [TAKE-APP T12]
 *
 * The brief lists five: question, poll, video request, audio request,
 * performance request. They are ROWS, not classes, because the difference
 * between them is what the participant is shown and what they may send —
 * and both of those are data. [U-18]
 *
 * A NAMED ROW RATHER THAN A FREE STRING, because the surface, the inbox
 * and the renderer all have to agree about what a request is, and three
 * places agreeing on free text is three places that eventually do not.
 */
export type AssignmentKind =
  | 'performance' | 'response' | 'question' | 'audio' | 'poll';

export interface Assignment {
  kind: AssignmentKind;
  /** What the producer is asking, in their own words. Shown as given. */
  asks: string;
  /**
   * What the participant may look at before answering.
   *
   * A source to watch, a programme to hear, the song to perform against.
   * An id in the holder's own store — never a URL, for the same reason
   * the destination is not one.
   */
  watch?: string;
  /**
   * The production reference, for a performance.  [TAKE-APP T6]
   *
   * "The phone knows exactly what the performer is supposed to perform
   * against." Carried on the REQUEST rather than fetched by the client,
   * so a phone that has been handed nothing else still knows the clock
   * it is recording against — and so that what the performer heard is
   * recorded, even if the producer later changes the song.
   */
  reference?: {
    /** What the song is called, as the producer named it. */
    title: string;
    /** Measured by decoding, never read from a container header. [U-02] */
    durationSamples: number;
    /** Only when a human has accepted the grid. [INV-06] */
    bpm?: number;
    /** Where the performance begins on the reference, in samples. */
    offsetSamples?: number;
  };
}

/** What a request may result in. The participant can do nothing else. */
export interface AllowedActions {
  /** Record picture and sound. */
  video?: boolean;
  /** Record sound only — a voice-over, or an answer from a bad camera. */
  audio?: boolean;
  /** Write something. A poll answer, or a note with a take. */
  text?: boolean;
  /**
   * How many takes may be submitted.
   *
   * Absent means one. A performance request is the case for more: the
   * brief's Take App keeps several and submits the ones the performer
   * chose. A cap exists because a request is a door, and a door with no
   * limit behind it is a place to put a thousand files.
   */
  takes?: number;
}

/**
 * Where a request has got to.  [TAKE-APP T16a]
 *
 * The brief's nine states, as data rather than as booleans — which is the
 * difference between asking "where is this" and reconstructing it from
 * `opened && !submitted && !rejected`. [U-18]
 *
 * `sent` IS DISTINCT FROM `created` AND CANNOT BE DETECTED. The product
 * does not send the link; a person does, over WhatsApp or SMS or a QR
 * code on a screen. So `sent` is something the producer marks, and its
 * honesty depends on them — which is why nothing downstream depends on
 * it. `opened` is the first state the system observes for itself.
 */
export const REQUEST_STATES = [
  'created', 'sent', 'opened', 'recording', 'submitted',
  'received', 'reviewed', 'accepted', 'rejected', 'attached',
] as const;

export type RequestState = (typeof REQUEST_STATES)[number];

/**
 * The states a request may move to from each one.
 *
 * WRITTEN DOWN AS A TABLE, so the rule is readable rather than spread
 * across the routes that enforce it — and so a state added later has one
 * place to be added.
 *
 * TWO OF THESE ARE NOT IN THE BRIEF'S LIST and both are the same
 * admission: a person can record, not like it, and record again, so
 * `recording` returns to itself; and a producer can hold a submission,
 * come back and accept it, so `reviewed` is not terminal.
 *
 * `rejected` IS NOT AN END EITHER. The brief has the host reject a
 * response; a producer who changes their mind about somebody's
 * performance should not have to ask them to send it again.
 */
export const REQUEST_NEXT: Record<RequestState, readonly RequestState[]> = {
  created: ['sent', 'opened'],
  sent: ['opened'],
  opened: ['recording', 'submitted'],
  recording: ['recording', 'submitted', 'opened'],
  submitted: ['received'],
  received: ['reviewed', 'accepted', 'rejected'],
  reviewed: ['accepted', 'rejected'],
  accepted: ['attached', 'rejected'],
  rejected: ['reviewed', 'accepted'],
  attached: [],
};

/** Whether a request may move from one state to another. */
export function mayMove(from: RequestState, to: RequestState): boolean {
  return REQUEST_NEXT[from].includes(to);
}

/**
 * Which document is asking.  [D-25]
 *
 * The kind travels with the id because the three stores are separate and
 * a bare id cannot be resolved. It is also what lets one inbox list
 * requests from all three studios without asking each of them.
 */
export interface RequestHolder {
  kind: 'performance' | 'conversation' | 'channel';
  id: string;
}

export interface ParticipationRequest {
  id: RequestId;
  holder: RequestHolder;
  assignment: Assignment;
  allowed: AllowedActions;
  /**
   * The secret in the link. This IS the credential. [ROOM §6]
   *
   * Long and random, exactly like a room's invite token and for the same
   * reason: it is sent over WhatsApp to somebody with no account. It is
   * revocable by rotation, and rotating it cannot be undone by anyone
   * still holding the old one.
   *
   * ONE TOKEN PER PARTICIPANT, which is the difference from a room. A
   * room has one door and many people; a request is addressed to
   * somebody, so revoking one person's link must not revoke anybody
   * else's — and a submission has to be attributable to the link it came
   * through.
   */
  token: string;
  /**
   * Who it was sent to, as the producer wrote it.
   *
   * A NAME, NOT AN ACCOUNT. The whole point is that a participant needs
   * no account; the producer types "James" so the inbox can say who a
   * submission is from. Absent is allowed — the brief's own inbox has an
   * "Anonymous" row.
   */
  participant?: string;
  /**
   * Whether a stranger claimed this rather than a producer issuing it.
   *   [TAKE-PLATFORM P39, P41; D-25]
   *
   * TWO WAYS A REQUEST COMES TO EXIST, and only one of them is a public
   * write. A producer inviting forty people is deliberate; a stranger
   * pressing "Take this song" is not somebody the producer chose, and
   * the ceiling that bounds the second must not be spent by the first.
   * Without this mark, inviting a choir would close the door on the
   * public the song was opened to.
   *
   * IT IS A FIELD AND NOT A SECOND OBJECT. A claimed request must be
   * indistinguishable from an invited one everywhere downstream — the
   * recorder, the queue, the inbox, acceptance — so this says how it
   * ARRIVED and nothing about what it is. [D-19]
   */
  claimed?: boolean;
  /**
   * The call this request is one answer to.  [GO-VIRAL V-2]
   *
   * ONE OPTIONAL FIELD, AND ABSENT IS WHAT EVERY EXISTING REQUEST
   * IS. A producer inviting four people to sing on a song has made
   * four requests and no call; a hundred strangers answering a
   * campaign have made a hundred requests and one. The difference
   * is worth recording and is not worth a second kind of request.
   *
   * IT CHANGES NOTHING ABOUT THE LIFECYCLE. `REQUEST_NEXT`,
   * `mayMove`, `advance`, `submit`, `accept` and `viewFor` are
   * untouched — a campaign READS requests and never advances one,
   * which is D-25 applied to a container: the participant still
   * holds only a request, and `viewFor` stays the one gate on what
   * they are told. [GO-VIRAL §4]
   */
  campaign?: Id<'camp'>;
  state: RequestState;
  createdAt: string;
  /** When the state last changed, and to what it was changed by whom. */
  history: { state: RequestState; at: string; by?: string }[];
  /**
   * After this moment the link is refused.  [D-25]
   *
   * A link that admits somebody forever is not an invitation, it is an
   * account nobody administers. Absent means no clock, which is what a
   * request issued before this field existed would have.
   */
  expiresAt?: string;
  /** What came back. Empty until they submit. */
  submissions?: Submission[];
}

/**
 * What a participant sent.
 *
 * NOT A TAKE, AND NOT A RESPONSE, until somebody accepts it. That is the
 * load-bearing decision of the whole design and it is INV-06 applied to
 * people: "I would not immediately store it as Evening Conversation →
 * Episode 4 → James's response, because the producer may not actually use
 * it." A document that records what ARRIVED rather than what was CHOSEN
 * is not an edit, it is a log. [D-25, T9]
 */
export interface Submission {
  id: Id<'sub'>;
  /** The media, in the request's own store until it is accepted. */
  assetId: string;
  kind: 'video' | 'audio' | 'text';
  /** Measured on arrival, by decoding. [U-02] */
  durationSamples?: number;
  /** For a performance: where it sits against the reference. [S-3] */
  offsetSamples?: number;
  /** What the participant typed, where they were allowed to. */
  said?: string;
  /**
   * What recorded it.  [T5]
   *
   * "device metadata". Kept because a performance that turns out to be
   * out of sync is nearly always one device, and a producer with twenty
   * submissions needs to know which. Free text as the client reports it
   * — nothing decides anything from it.
   */
  device?: string;
  /**
   * WHICH CAPTURE THIS IS ONE ANGLE OF.  [TAKE-DESKTOP B-1, B-2]
   *
   * A phone sends one camera and this is absent, which is what no
   * field meant before it existed. A capture station sends four, and
   * they arrive as four submissions carrying the same `id` — because
   * `assetId` is one file and a second camera is a second file, and
   * giving a submission N assets would be a second shape for the one
   * thing `anglesOf` already answers about takes. [D-19]
   *
   * `offsetSamples` HERE IS NOT THE ONE ABOVE. That one is where the
   * recording sits against the reference the request named; this one
   * is where it sits against the OTHER ANGLES, which is a number no
   * reference is involved in and which exists even when there is no
   * song to be against.
   */
  capturedIn?: { id: string; offsetSamples: number; spreadSamples?: number };
  at: string;
  /** Set when a producer accepts THIS submission, not the request. */
  acceptedAt?: string;
}

/** Is this link still good. A pure predicate, so every caller agrees. */
export function isOpen(
  request: ParticipationRequest, now: string,
): boolean {
  if (request.state === 'attached') return false;
  const expires = request.expiresAt;
  if (!expires) return true;
  const until = Date.parse(expires);
  /*
   * AN UNREADABLE DATE IS AN OPEN REQUEST, the same direction `roomEdit`
   * takes and for the same reason: a corrupt expiry that locked somebody
   * out mid-recording is a worse failure than a link that outlives its
   * terms, and rotating the token is the revocation that always works.
   */
  if (Number.isNaN(until)) return true;
  return Date.parse(now) < until;
}

/** Everything a participant may be told about their own request. */
export interface RequestView {
  id: RequestId;
  assignment: Assignment;
  allowed: AllowedActions;
  state: RequestState;
  participant?: string;
  /**
   * How many they have already sent, so the client can count takes.
   *
   * TAKES, AND A CAPTURE IS ONE. [B-2] This counted submissions, and
   * the two were the same number until a station could send four
   * angles of one performance — at which point a performer who had
   * sung once was told they had sent four while the same document
   * said three of four remained. Two numbers from one function
   * disagreeing is worse than either of them being wrong.
   */
  submitted: number;
}

/**
 * What the holder of a link may see.  [D-25]
 *
 * EVERYTHING ELSE IS WITHHELD, and this function is the only place that
 * decides it. A participant does not learn which performance this is, who
 * else was invited, what anyone else sent, or what the producer thought of
 * it — because the audience does not enter the studio, and a client that
 * is handed the document is a client that can be read for it.
 *
 * The token is not returned either. They already have it; echoing a
 * credential into a response body is how credentials end up in logs.
 */
export function viewFor(request: ParticipationRequest): RequestView {
  return {
    id: request.id,
    assignment: request.assignment,
    allowed: request.allowed,
    state: request.state,
    ...(request.participant ? { participant: request.participant } : {}),
    submitted: takesMade(request),
  };
}

/**
 * How many more takes this request will accept.
 *
 * A CAPTURE IS ONE TAKE, HOWEVER MANY CAMERAS SAW IT. [B-2]
 *
 * This counted submissions, and a submission was a recording, so the
 * two were the same number. They stop being the same number the
 * moment a capture station sends four angles of one performance: a
 * request that allows three takes would be full after the first, and
 * the performer would be told they had used three when they had sung
 * once. What the producer allowed was three GOES, not three files.
 */
export function takesLeft(request: ParticipationRequest): number {
  const allowed = request.allowed.takes ?? 1;
  return Math.max(0, allowed - takesMade(request));
}

/**
 * How many distinct performances have been sent.
 *
 * Angles of one capture count once; everything else counts itself,
 * which for a submission with no capture is exactly the old
 * behaviour.
 */
export function takesMade(request: ParticipationRequest): number {
  const captures = new Set<string>();
  let loose = 0;
  for (const one of request.submissions ?? []) {
    if (one.capturedIn?.id) captures.add(one.capturedIn.id);
    else loose += 1;
  }
  return captures.size + loose;
}
