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
  // The picture a link preview fetches, with none of the sender's cookies.
  // The route serves it only for a published conversation. [U-31, D-03]
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/card$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/room$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/presence$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/signal$/,
  // A published conversation's own pages. The route still checks that it IS
  // published — this only decides which routes are allowed to make that call.
  /^\/c\/[A-Za-z0-9_-]+\/watch\/?$/,
  /^\/c\/[A-Za-z0-9_-]+\/article\/?$/,
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
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/join$/ },
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/presence$/ },
  // A reading about the sender's own microphone. [ROOM §2]
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/voice$/ },
  // Introducing two browsers to each other. [ROOM §12]
  { method: 'POST', path: /^\/api\/conversations\/[A-Za-z0-9_-]+\/room\/signal$/ },
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
