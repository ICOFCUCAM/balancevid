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
import type { ConsentRecord } from './consent.js';

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
  /**
   * When the state last changed, to what, by whom — and why.
   *
   * `says` IS THE REASON, AND IT IS THE DECLINE THAT NEEDS ONE.
   *   [GO-VIRAL G8, V-5]
   *
   * A history line with a state, a time and a name is enough for
   * a producer passing on a take: *"a producer who changes their
   * mind should not have to ask them to send it again"* is the
   * posture, and the state is the whole of what happened. For a
   * competition declining an ENTRY it is not: a decline with no
   * reason is one nobody can review and nobody can reverse on
   * grounds.
   *
   * OPTIONAL, BECAUSE THE PRODUCER'S OWN INBOX DOES NOT OWE
   * ANYBODY ONE. Every history line written before this field
   * existed has none, and a take passed over in a studio is not
   * a decision that needs minuting.
   */
  history: { state: RequestState; at: string; by?: string; says?: string }[];
  /**
   * After this moment the link is refused.  [D-25]
   *
   * A link that admits somebody forever is not an invitation, it is an
   * account nobody administers. Absent means no clock, which is what a
   * request issued before this field existed would have.
   */
  expiresAt?: string;
  /**
   * What this participant was told, and what they agreed to.
   *   [GO-VIRAL V-3]
   *
   * ONE RECORD PER REQUEST AND NOT ONE PER SUBMISSION, because
   * the thing agreed to is taking part — a performer who sang
   * three takes under one set of terms agreed once, and three
   * records would be three chances for them to disagree with
   * each other.
   *
   * ABSENT IS EVERY REQUEST THIS PRODUCT HAS EVER ISSUED, and a
   * request under no campaign stays that way forever: a producer
   * inviting four people by name is not running a competition
   * and this field is not a thing to make them fill in. It is
   * REQUIRED exactly where the call has terms, which is
   * `entryProblem`'s question and nothing this type decides.
   *
   * IT IS NOT THE PUBLISHER'S CONSENT. `publish.ts` records an
   * AUTHOR agreeing to be answered; this records a PARTICIPANT
   * agreeing to be used. Two people, two decisions, and one
   * field for both would make a producer's publish look like a
   * performer's release. [D-25]
   */
  consent?: ConsentRecord;
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

/**
 * What `rotate` writes in the `by` of its history line.
 *
 * A NAME AND NOT A LITERAL IN TWO FILES. The line records a new
 * secret rather than a decision, and anything reading the
 * history for decisions has to be able to tell the two apart.
 * `participationEdit.rotate` writes it; `rejectedBecause` skips
 * it. [D-19]
 */
export const ROTATED = 'rotated';

/**
 * What recorded it, said shortly.  [T5; GO-VIRAL V-7; D-03]
 *
 * THE FIELD WAS STORING A WHOLE USER AGENT, and a browser run
 * found it while checking V-7's own claim. `Submission.device`
 * exists for one sentence of reasoning — *"a producer with twenty
 * submissions and one that is out of sync needs to know which
 * device"* — and the Take App filled it with
 * `navigator.userAgent`, which on the run that found this was
 * eighty characters of build numbers written into a document that
 * is kept forever and may be exported.
 *
 * V-7 IS THE STAGE THAT CANNOT LEAVE IT THERE. Its own criterion
 * is that a participant is told the result *"without the
 * installation ever holding anything that identifies its owner"*,
 * and a full user agent is the oldest fingerprinting surface
 * there is. It is not an address and nothing can be sent to it;
 * it is also not what the field is for.
 *
 * SO IT IS REDUCED TO WHAT THE SENTENCE NEEDS: the browser and
 * the platform. *"Chrome on Android"* answers *which one is out*
 * exactly as well as the build string does, and answers nothing
 * else.
 *
 * AND ANYTHING THAT IS NOT A USER AGENT IS LEFT ALONE. A capture
 * station sends a CAMERA'S NAME here, per angle — *"the camera is
 * the answer to which one is out"* — and reducing *Camera 2* to
 * a browser would be this function deciding it knew better than
 * the thing that measured. Only a string shaped like a user agent
 * is touched. [B-2]
 */
export function deviceSays(said: string): string {
  const text = said.trim();
  if (!/^Mozilla\/\d/.test(text)) return text.slice(0, 120);

  /* Order matters: every one of these also claims to be Safari or
     Chrome somewhere in the string, so the specific come first. */
  const browser = /\bEdg\//.test(text) ? 'Edge'
    : /\bOPR\/|\bOpera\b/.test(text) ? 'Opera'
      : /\bSamsungBrowser\//.test(text) ? 'Samsung Internet'
        : /\bFirefox\/|\bFxiOS\//.test(text) ? 'Firefox'
          : /\bCriOS\/|\bChrome\//.test(text) ? 'Chrome'
            : /\bSafari\//.test(text) ? 'Safari' : 'a browser';

  const platform = /\bAndroid\b/.test(text) ? 'Android'
    : /\b(iPhone|iPad|iPod)\b/.test(text) ? 'iOS'
      : /\bMac OS X\b|\bMacintosh\b/.test(text) ? 'a Mac'
        : /\bWindows\b/.test(text) ? 'Windows'
          : /\bCrOS\b/.test(text) ? 'ChromeOS'
            : /\bLinux\b/.test(text) ? 'Linux' : null;

  return platform ? `${browser} on ${platform}` : browser;
}

/* ------------------------------------------------------------------ *
 *  What happened to it, in one line.  [GO-VIRAL V-7]
 * ------------------------------------------------------------------ */

/**
 * What the holder of a link is waiting to hear.
 *
 * FOUR ANSWERS AND A SENTENCE. The word is what a device COMPARES —
 * it holds the last one it saw and says nothing until that changes
 * — and the sentence is what a person READS. A notification built
 * by diffing prose would fire every time a reason was reworded.
 *
 * NOTHING ABOUT ANYBODY ELSE. A participant learns what happened to
 * their own entry and, where a call has announced, where they came
 * in a standing that is already public. They do not learn who else
 * entered or what the panel said about them — `viewFor` is still
 * the one gate, and this is still inside it. [D-25]
 */
export type OutcomeState = 'waiting' | 'result' | 'accepted' | 'passed';

export interface RequestOutcome {
  state: OutcomeState;
  /** One line, in words, for a notification and for the page. */
  says: string;
  /** Where they came, when a call has announced one. */
  place?: number;
  of?: number;
}

/**
 * What happened to this request, as its holder may be told.
 *
 * THE RESULT OUTRANKS THE ACCEPTANCE, and the order is the claim.
 * Somebody who entered a competition and whose take was also used
 * in the production has had two pieces of news; the one they
 * entered for is where they came. A device holds one word and a
 * notification carries one line, so there is an order and it is
 * written here rather than decided by whichever branch came first.
 *
 * `standing` IS PASSED IN, so this module reads no campaign and no
 * judgement. The route that already loaded the call works out
 * whether it has announced and where this entry came; what arrives
 * here is two numbers. A participation module that went looking
 * for a competition would be the participant's view depending on
 * the organiser's object. [D-19, D-25]
 *
 * AND `waiting` IS NOT SILENCE. *"Nothing yet"* is the honest
 * answer for a request that has been sent and not decided, and it
 * is what every request this product has ever issued answers —
 * which is why no device is ever notified about one.
 */
export function outcomeFor(
  request: ParticipationRequest,
  standing?: { place: number; of: number } | null,
): RequestOutcome {
  if (standing) {
    return {
      state: 'result',
      says: `The results are in — you came ${ordinal(standing.place)}`
        + ` of ${standing.of}.`,
      place: standing.place,
      of: standing.of,
    };
  }
  if (request.state === 'accepted' || request.state === 'attached') {
    return { state: 'accepted', says: 'Your take was used.' };
  }
  if (request.state === 'rejected') {
    const why = rejectedBecause(request);
    return {
      state: 'passed',
      says: why ? `Not this time — ${why}` : 'Not this time.',
    };
  }
  return { state: 'waiting', says: 'Nothing yet.' };
}

/**
 * 1st, 2nd, 3rd, 4th.
 *
 * WRITTEN OUT BECAUSE IT IS READ BY A PERSON ON A PHONE. *"You came
 * 2 of 11"* is a score; *"you came 2nd of 11"* is a result. The
 * teens are the exception every implementation of this gets wrong,
 * so they are the first branch.
 */
function ordinal(place: number): string {
  const tens = place % 100;
  if (tens >= 11 && tens <= 13) return `${place}th`;
  const last = place % 10;
  if (last === 1) return `${place}st`;
  if (last === 2) return `${place}nd`;
  if (last === 3) return `${place}rd`;
  return `${place}th`;
}

/**
 * The reason the last decline gave, where it gave one.
 *   [GO-VIRAL G8, V-5]
 *
 * A READ AND NOT AN EDIT, so it lives beside `takesMade` rather
 * than in `participationEdit` — which matters for one concrete
 * reason: the inbox is a browser component, and
 * `participationEdit` reaches `node:crypto` through `newId`. A
 * projection the producer's surface needs has to be on this side
 * of that line. [the import-graph guard]
 *
 * THE LAST ONE, because `REQUEST_NEXT` admits `rejected →
 * reviewed → rejected`: a producer may pass, look again, and
 * pass for a different reason. What is current is the most
 * recent decline; the earlier ones stay in the history, which is
 * where the audit is.
 *
 * NOT A ROTATION NOTE, WHICH IS WHAT THE SEARCH IS FOR. `rotate`
 * also pushes a history line, carrying the state the request is
 * ALREADY in and `by: ROTATED` — an audit of the new secret, not
 * a decision. A producer who passed on a take with a reason and
 * then withdrew the link would otherwise find the reason gone,
 * because the newest `rejected` line would be the rotation's and
 * it carries no words. One name, read by the writer and by this.
 * [D-19]
 *
 * AND ONLY WHILE IT IS STILL PASSED OVER, which a mutation run
 * found. `rejected → accepted` is also in the table — a producer
 * changing their mind is the whole reason passing is not an end
 * — and a surface drawing *"Passed: recorded indoors"* over a
 * take that is now in the rail would be reporting a decision
 * that was reversed. The reason belongs to the state, not to the
 * history alone.
 */
export function rejectedBecause(request: {
  state: RequestState;
  history: { state: RequestState; by?: string; says?: string }[];
}): string {
  if (request.state !== 'rejected') return '';
  const last = [...request.history].reverse()
    .find((one) => one.state === 'rejected' && one.by !== ROTATED);
  return last?.says ?? '';
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
  /**
   * The words this participant must agree to before recording.
   *   [GO-VIRAL V-3]
   *
   * SENT BECAUSE THEY HAVE TO BE READ, which is the one thing
   * that makes a consent record worth having. A hash the client
   * echoes back without ever having shown anybody the text would
   * be a signature on a sealed envelope.
   *
   * ABSENT MEANS NOTHING IS ASKED. A request under no call, or
   * under a call with no terms, carries no terms and the surface
   * is byte for byte the surface it was.
   *
   * AND IT NAMES NO CAMPAIGN. A participant learns what they are
   * agreeing to; they do not learn which call it is, who else
   * entered, or what the prize is — that is V-4's public page,
   * which somebody arrives at on purpose. [D-25]
   */
  terms?: { hash: string; text: string };
  /** What they have already agreed, if they have. */
  consent?: ConsentRecord;
  /**
   * What happened to it, where anything has.  [GO-VIRAL V-7]
   *
   * THE ONE THING THE DEVICE COMES BACK FOR. A phone that entered
   * a call and went home has no account here by construction, so
   * there is nowhere to send news TO — what it has is the link,
   * and this is what the link answers with. Nothing is stored
   * about the device anywhere on this installation.
   *
   * ABSENT IS A REQUEST NOBODY HAS DECIDED ABOUT, which is what
   * every open request is, so a surface that draws this draws
   * nothing until there is something to say.
   */
  outcome?: RequestOutcome;
  /**
   * THE FINISHED WORK THEIR TAKE IS IN.  [TAKE-APP T16; D-25, D-03]
   *
   * > *"My collection are already produced TAKE of the person
   * > that was produced by the balancevid studio and generated.
   * > The owner of take can download it or share it through
   * > their phones."*
   *
   * `outcome` SAYS *your take was used* AND STOPPED THERE, which
   * is the half of the sentence that is about the producer's
   * decision. The other half is about the person: the thing they
   * sang into exists now, it is published, and it has their work
   * in it. A phone that was told *used* and given nowhere to go
   * was being told the least interesting true thing.
   *
   * PRESENT ONLY WHEN BOTH ARE TRUE — the take was used, AND the
   * holder published the result and has not withdrawn it. A
   * producer who accepted a take and never published is a
   * producer whose unpublished work is nobody else's to know
   * about, and `publication` is the field that says otherwise.
   * [D-03]
   *
   * IT NAMES THE WORK AND NOT THE DOCUMENT'S KIND OR ANYBODY
   * ELSE. No list of who else is in it, no studio, no plan
   * hash beyond the one the public file is already addressed
   * by — which is the same rule the rest of this view keeps.
   * The two addresses are the ones a stranger could already
   * reach: the public watch page, and the file it plays. [D-25]
   */
  collection?: CollectionEntry;
}

/** A published work this request's take is in. */
export interface CollectionEntry {
  /** What the producer called it. */
  title: string;
  /** The public page, for sharing. */
  watch: string;
  /** The file itself, for keeping. */
  file: string;
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
export function viewFor(
  request: ParticipationRequest,
  /*
   * THE CALL'S TERMS, WHERE THE CALLER HAS THEM.  [GO-VIRAL V-3]
   *
   * PASSED IN RATHER THAN LOOKED UP, because this module decides
   * what a participant may be told and does not read campaigns,
   * requests or anything else off a disk. The route that already
   * loaded the call hands over the two fields a participant
   * needs; everything else about the call stays where it was.
   *
   * OPTIONAL, SO EVERY EXISTING CALLER IS UNCHANGED — and a
   * caller that forgets is not a caller that leaks, it is a
   * caller that shows nothing, which is this function's own
   * direction of failure everywhere else.
   */
  terms?: { hash: string; text: string } | null,
  /*
   * AND WHAT HAPPENED TO IT.  [GO-VIRAL V-7]
   *
   * Passed in for `terms`' own reason: this module decides what a
   * participant may be told and reads nothing off a disk. The
   * route that loaded the call hands over the one line.
   */
  outcome?: RequestOutcome | null,
  /*
   * AND WHAT IT ENDED UP IN.  [T16]
   *
   * Passed in for `terms`' and `outcome`'s own reason: this
   * module decides what a participant may be told and reads
   * nothing off a disk. Whether the holder is published, and
   * where its public file is, are two reads the route has
   * already done.
   */
  collection?: CollectionEntry | null,
): RequestView {
  return {
    id: request.id,
    assignment: request.assignment,
    allowed: request.allowed,
    state: request.state,
    ...(request.participant ? { participant: request.participant } : {}),
    submitted: takesMade(request),
    ...(terms ? { terms: { hash: terms.hash, text: terms.text } } : {}),
    ...(request.consent ? { consent: request.consent } : {}),
    ...(outcome && outcome.state !== 'waiting' ? { outcome } : {}),
    /*
     * AND ONLY WHERE THE TAKE WAS USED. A request that was
     * passed over, or is still waiting, has nothing in the
     * finished work — and handing its holder the address of a
     * published piece they are not in would be telling them
     * about somebody else's. The caller establishes the
     * publication; this establishes the entitlement, because
     * that is the half of it this module can see. [D-03]
     */
    ...(collection && usedIt(request) ? { collection } : {}),
  };
}

/** Whether this request's work is actually in the finished thing. */
export function usedIt(request: ParticipationRequest): boolean {
  return request.state === 'accepted' || request.state === 'attached';
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
