/**
 * What an anonymous visitor may see.  [Doctrine U-31, §40, D-03]
 *
 * The doctrine is explicit: "A published conversation is a Class A source.
 * Anyone can open it and respond to it." So this is not a wall around the
 * whole application — publishing would mean nothing behind one. It is a wall
 * around everything the author has NOT published.
 *
 *   PUBLIC   a published conversation: its watch page, its manifest, its
 *            article, and exactly the media those need
 *   PRIVATE  everything else, which is every draft, every take, every
 *            unpublished render, and every list that would reveal they exist
 *
 * The "and respond to it" half of U-31 is narrowed here, and the narrowing is
 * deliberate rather than an oversight: responding creates a conversation and
 * uploads a recording, and this instance has no accounts to attribute either
 * to. Anonymous writes to a public instance is the thing being fixed. When
 * accounts exist, "anyone" means "any signed-in person" and the clause is
 * satisfied properly. Recorded in Appendix B as a scope change.
 */

import type { StudioId } from '../domain/account.js';

// (the shapes below are structural: both documents carry a `publication`)

/**
 * Paths that MAY be public, subject to the per-conversation check below.
 *
 * A prefix allowlist and nothing clever: a rule nobody can read is a rule
 * nobody can audit. Anything not matched here needs a session, so a route
 * added tomorrow is private by default rather than accidentally open.
 */
const PUBLIC_EXACT = new Set([
  '/api/health',      // the deployment's health check, which has no session
  '/api/published',   // the list of things whose author asked for an audience
  '/signin',
  '/api/auth/signin',
  '/api/auth/signout',
]);

const PUBLIC_PATTERNS: RegExp[] = [
  /*
   * The room.  [Doctrine ROOM §6, §12]
   *
   * These are not "public" in the sense the rest of this list means — they
   * are reachable WITHOUT THE OWNER'S SESSION, which is a different claim.
   * Each one then does its own check: the join page renders nothing until a
   * token is presented, and every room API verifies a guest session against
   * that room's own invite token before it answers.
   *
   * Two checks in different layers, as everywhere else here. Middleware
   * decides which routes are allowed to decide; the route decides.
   */
  /^\/r\/[A-Za-z0-9_-]+\/?$/,
  /*
   * The Take App's page and its own API.  [Doctrine D-25; TAKE-APP T2a]
   *
   * The same claim the room's paths make, and no more: reachable WITHOUT
   * THE OWNER'S SESSION, because the whole point is a link sent over
   * WhatsApp to somebody with no account. The route then checks the link
   * itself — `requestForLink` compares the secret in constant time and
   * answers `null` for a link that is wrong, expired or rotated.
   *
   * Two checks in different layers, as everywhere else here: middleware
   * decides which routes are allowed to decide, and the route decides.
   *
   * THE LINK IS IN THE PATH, which is a real cost worth stating: it will
   * appear in the server's access log and in the browser's history, the
   * way a room's `/r/<token>` already does. It is bounded the same way —
   * the request expires, the secret is rotatable, and what it opens is
   * one assignment rather than an account.
   */
  /^\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/?$/,
  /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
  /* The song they were asked to perform against, and nothing else about
     the performance it belongs to. [T6] */
  /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/reference$/,
  // The picture a link preview fetches, with none of the sender's cookies.
  // The route serves it only for a published conversation. [U-31, D-03]
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/card$/,
  // And a card per exchange, which is the same thing one scale down: made to
  // be posted, so made to be fetched by whatever it was posted into. The
  // route still checks that the conversation IS published.
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/cards\/[0-9]+$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/room$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/presence$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/signal$/,
  /*
   * AND THE SAME THREE FOR A CHANNEL'S OWN ROOM.  [CHANNEL §6]
   *
   * A broadcast takes its guests from a room, and a channel can now open
   * one instead of borrowing a conversation's — so a guest arriving at a
   * broadcast is a guest arriving at a room, and reaches it by exactly the
   * rules above. The handlers behind these paths ARE the ones above,
   * re-exported; what differs is only which document holds the record.
   *
   * WRITTEN OUT RATHER THAN MERGED INTO ONE PATTERN. A regex that matched
   * `conversations|channels` in one alternation would be shorter and would
   * also quietly admit any third collection somebody adds later. This list
   * is the security boundary, and a boundary should have to be widened on
   * purpose.
   */
  /^\/api\/channels\/[A-Za-z0-9_-]+\/room$/,
  /^\/api\/channels\/[A-Za-z0-9_-]+\/room\/presence$/,
  /^\/api\/channels\/[A-Za-z0-9_-]+\/room\/signal$/,
  // A published conversation's own pages. The route still checks that it IS
  // published — this only decides which routes are allowed to make that call.
  /^\/c\/[A-Za-z0-9_-]+\/watch\/?$/,
  /^\/c\/[A-Za-z0-9_-]+\/article\/?$/,
  /^\/c\/[A-Za-z0-9_-]+\/explore\/?$/,
  /*
   * Presenting a published conversation is an ordinary thing to do with one:
   * a lecturer, a seminar, a newsroom. The route still checks that it IS
   * published, and the page is `noindex` — it is a lectern, not a link.
   */
  /^\/c\/[A-Za-z0-9_-]+\/present\/?$/,
  // Exactly the media the companion player needs, and nothing else.
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/representations$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/source$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/takes\/[A-Za-z0-9_-]+\/media$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/renders\/[A-Za-z0-9_-]+\/file$/,
  /*
   * A published performance.  [STUDIO-TWO §14, U-31]
   *
   * The same shape as the conversation's: the page, the picture a link
   * preview fetches, and exactly the media that page plays. Each route still
   * checks that the performance IS published — this only decides which
   * routes are allowed to make that call.
   *
   * What is NOT here is the raw material: the song, the takes' own media and
   * the document. A published performance is a finished video and its clips,
   * and handing out the master track somebody performed over would be
   * publishing the record rather than the performance. [INV-15]
   */
  /^\/p\/[A-Za-z0-9_-]+\/watch\/?$/,
  /^\/api\/performances\/[A-Za-z0-9_-]+\/card$/,
  /^\/api\/performances\/[A-Za-z0-9_-]+\/renders\/[A-Za-z0-9_-]+\/file$/,
  /^\/api\/performances\/[A-Za-z0-9_-]+\/clips\/[A-Za-z0-9_-]+\/file$/,
  /*
   * A published channel.  [CHANNEL §17, U-31]
   *
   * Four paths, and they are the whole of what watching a channel needs: the
   * page, the playlist, the segments it names, and what is on. Each route
   * still checks that the channel IS published — this only decides which
   * routes are allowed to make that call.
   *
   * WHAT IS NOT HERE is everything a broadcaster works with: the channel
   * document (the schedule, the ingests, the destinations, every reference
   * on disk), the library of things that could be scheduled, the list of
   * channels, and the live ingest. A viewer gets the transmission, which is
   * a stream of four-second segments and two sentences about what is in
   * them — the same line the other two studios draw between the published
   * artefact and the material it was made from.
   *
   * THE SEGMENT INDEX IS DIGITS, not a name. The route validates it again,
   * but a path pattern that accepted a word would be a pattern somebody
   * could walk out of, and this one is the outer wall.
   */
  /^\/t\/[A-Za-z0-9_-]+\/watch\/?$/,
  /^\/api\/channels\/[A-Za-z0-9_-]+\/playlist$/,
  /^\/api\/channels\/[A-Za-z0-9_-]+\/stream\/[0-9]{1,15}$/,
  /^\/api\/channels\/[A-Za-z0-9_-]+\/now$/,
];

/** Next's own assets, and the favicon. Never application data. */
const ASSET_PATTERNS: RegExp[] = [
  /^\/_next\//,
  /^\/favicon\.ico$/,
  /^\/static\//,
];

export function isAssetPath(pathname: string): boolean {
  return ASSET_PATTERNS.some((pattern) => pattern.test(pathname));
}

/**
 * Whether this path is allowed to be reached without a session AT ALL.
 *
 * True does not mean "serve it". For a conversation route it means "this route
 * is permitted to decide", and the route then requires the conversation to be
 * published. Two checks, in different places, both of which must say yes.
 */
/**
 * Routes a caller without the owner's session may POST to.
 *
 * Deliberately tiny, and deliberately separate from the readable list: every
 * other write on this instance is the owner's. Joining is the exception the
 * brief requires — an invitation is a link a stranger follows — and once
 * inside, a guest may change their own presence and nothing else.
 */
const GUEST_WRITABLE: { method: string; path: RegExp }[] = [
  /*
   * What the holder of a Take link may write.  [D-25; TAKE-APP T3, T4, T5]
   *
   * THREE VERBS, EACH ON ITS OWN PATH, for the reason the room's four are
   * written this way: a path-only allowance once answered DELETE as well,
   * and that was a real hole. A participant may say they have started
   * recording, begin a submission, and send its bytes. They may not
   * delete, accept, or touch anything a producer owns.
   */
  { method: 'POST', path: /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/ },
  { method: 'POST', path: /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/submissions$/ },
  { method: 'PUT', path: /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/submissions\/[A-Za-z0-9_-]+$/ },
  { method: 'POST', path: /^\/api\/take\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/submissions\/[A-Za-z0-9_-]+$/ },
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/join$/ },
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/presence$/ },
  // A reading about the sender's own microphone. [ROOM §2]
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/voice$/ },
  // Introducing two browsers to each other. [ROOM §12]
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/signal$/ },
  /*
   * The same four for a channel's own room, and the same method rule: each
   * of these paths is named with the ONE verb a guest may use on it. The
   * hole that taught this product to write it that way was a path-only
   * allowance on interventions, which also answered DELETE. [ROOM §6]
   */
  { method: 'POST', path: /^\/api\/channels\/[A-Za-z0-9_-]+\/room\/join$/ },
  { method: 'POST', path: /^\/api\/channels\/[A-Za-z0-9_-]+\/room\/presence$/ },
  { method: 'POST', path: /^\/api\/channels\/[A-Za-z0-9_-]+\/room\/voice$/ },
  { method: 'POST', path: /^\/api\/channels\/[A-Za-z0-9_-]+\/room\/signal$/ },
  /*
   * Recording, for a guest the host has put on stage. The route checks that
   * for itself — this only says the request is allowed to reach a route that
   * can decide. [ROOM §10]
   *
   * THE METHOD IS PART OF THE RULE, and learning that cost a real hole: the
   * interventions path also answers DELETE, and a path-only allowance handed
   * guests the ability to delete the author's responses. A rule that names a
   * route without naming what may be done to it is not a rule about
   * anything.
   */
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/interventions$/ },
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/takes\/[A-Za-z0-9_-]+\/chunks$/ },
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/takes\/[A-Za-z0-9_-]+\/finalize$/ },
];

export function mayBePublic(pathname: string, method: string): boolean {
  const write = pathname.replace(/\/+$/, '') || '/';
  // A published artefact is readable. It is never writable by a stranger.
  if (method !== 'GET' && method !== 'HEAD') {
    if (GUEST_WRITABLE.some((rule) => rule.method === method && rule.path.test(write))) {
      return true;
    }
    return pathname === '/api/auth/signin' || pathname === '/api/auth/signout';
  }
  const path = pathname.replace(/\/+$/, '') || '/';
  if (PUBLIC_EXACT.has(path)) return true;
  return PUBLIC_PATTERNS.some((pattern) => pattern.test(path));
}

/**
 * Published, and not withdrawn.  [U-31]
 *
 * Distinct from `isRespondable`: an author may publish something and still
 * refuse responses to it, and that is a published conversation anyone may
 * watch. Withdrawing it removes it from view again.
 */
export function isPubliclyVisible(
  document: { publication?: { unpublishedAt?: string } | undefined },
): boolean {
  const publication = document.publication;
  return Boolean(publication && !publication.unpublishedAt);
}

/**
 * Which representations a stranger may generate for a published conversation.
 *
 * The render plan and the timeline describe how the thing was made, which is
 * the author's working material rather than the published artefact. The
 * bundle is the author's unpublished admin. What a viewer needs is the
 * companion player's manifest, the article, and the captions.
 */
const PUBLIC_REPRESENTATIONS = new Set([
  'manifest.json', 'article.json', 'article.md', 'article.html',
  'captions.srt', 'captions.vtt',
  // What a link to this conversation says about itself. Public by
  // definition: it exists to be read by whatever the link was pasted into.
  'share-card.json',
  // A card per exchange, and the page that plays them. Both exist to be read
  // by somebody who was sent a link.
  'claim-cards.json', 'interactive.html',
]);

export function isPublicRepresentation(id: string | null): boolean {
  return id !== null && PUBLIC_REPRESENTATIONS.has(id);
}

/**
 * What a guest in the room may do.  [Doctrine ROOM §4, §6, §12, D-03]
 *
 * An allowlist of ACTS, not of paths, because the question "may Sarah do
 * this?" should have one answer written in one place that a person can read
 * and audit. A guest was let in by a link somebody forwarded; the reasonable
 * assumption is that they are who they say and nothing more.
 *
 * What they may do is bounded by two ideas:
 *
 *   THEIR OWN VOICE      they can be present, raise a hand, and record
 *                        themselves. Their takes are theirs.
 *   NOT THE AUTHOR'S WORK they cannot edit the conversation, move anyone's
 *                        anchors, attach evidence, publish, export, or learn
 *                        that any other conversation exists.
 *
 * The asymmetry is deliberate and it is the product's position, not a
 * limitation: the conversation belongs to whoever opened it, and a guest
 * contributes to it rather than co-owning it. When that should change it
 * will be an explicit role, not a widened default.
 */
export type RoomAct =
  | 'room.read'          // see who is here and what is on screen
  | 'room.presence'      // say I am here, or that I have left
  | 'room.raise-hand'    // ask for the floor [ROOM §8]
  | 'take.own.create'    // record myself
  | 'take.own.upload'    // send my own chunks
  | 'source.watch';      // see the video everyone is discussing

const GUEST_MAY: ReadonlySet<RoomAct> = new Set<RoomAct>([
  'room.read', 'room.presence', 'room.raise-hand',
  'take.own.create', 'take.own.upload', 'source.watch',
]);

export function guestMay(act: RoomAct): boolean {
  return GUEST_MAY.has(act);
}

/**
 * Acts a guest must never reach, named so the test can assert on them.
 *
 * Kept as a list rather than "everything not in GUEST_MAY" because the point
 * of writing them down is that somebody adding a route tomorrow sees the
 * shape of what is being protected.
 */
export const OWNER_ONLY = [
  'conversation.edit', 'conversation.delete', 'intervention.move',
  'evidence.attach', 'annotation.draw', 'layout.set', 'publish',
  'render', 'clips.make', 'bundle.read', 'conversations.list',
  'room.open', 'room.close', 'room.stage', 'room.remove-participant',
] as const;

/* ------------------------------------------------------------------------ *
 *  Which studio a request is for.  [MASTER-EDIT §11, D-06, D-19]
 * ------------------------------------------------------------------------ */

/**
 * The studio a path belongs to, or null for the parts of the building that
 * belong to none of them.
 *
 * A PREFIX TABLE AND NOTHING CLEVER, for the same reason the public
 * allowlist above is one: a rule nobody can read is a rule nobody can audit.
 * The difference from that list is the default. Public access is deny-by-
 * default because a route added tomorrow must not be accidentally open;
 * studio ownership is null-by-default because a route added tomorrow must
 * not be accidentally UNREACHABLE — an entitlement bug that hides the sign-in
 * page or the health check is an outage, and one that leaves a new route
 * open to an owner who has every studio is nothing at all.
 *
 * So the two defaults point in opposite directions on purpose, and each one
 * points at the failure that costs less.
 */
const STUDIO_PATHS: [RegExp, StudioId][] = [
  /* Studio One: a conversation, and everything hung off one. */
  [/^\/c\//, 'studio-one'],
  [/^\/api\/conversations(\/|$)/, 'studio-one'],
  /* Studio Two: a performance. */
  [/^\/p\//, 'studio-two'],
  [/^\/api\/performances(\/|$)/, 'studio-two'],
  /* Online TV: a channel. */
  [/^\/t\//, 'online-tv'],
  [/^\/api\/channels(\/|$)/, 'online-tv'],
];

export function studioForPath(pathname: string): StudioId | null {
  for (const [pattern, studio] of STUDIO_PATHS) {
    if (pattern.test(pathname)) return studio;
  }
  return null;
}

/**
 * THE ROOM IS NOT A STUDIO, and that is the one exception worth writing out.
 *
 * `/r/<token>` is a guest arriving at an invitation. It is reachable without
 * the owner's session at all (see the public patterns above), it is answered
 * by `callerFor` against that room's own invite token, and the guest has no
 * account and therefore no plan. Running it through this table would ask
 * "does the guest own Studio One?" of somebody who owns nothing — and the
 * answer would be no, so every guest link in the product would stop working.
 *
 * It is absent from the table rather than special-cased in the check,
 * because a rule with an exception inside it is a rule two people read two
 * ways.
 */
