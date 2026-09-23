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

import type { Conversation } from '../domain/document.js';

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
  // A published conversation's own pages. The route still checks that it IS
  // published — this only decides which routes are allowed to make that call.
  /^\/c\/[A-Za-z0-9_-]+\/watch\/?$/,
  /^\/c\/[A-Za-z0-9_-]+\/article\/?$/,
  // Exactly the media the companion player needs, and nothing else.
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/representations$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/source$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/takes\/[A-Za-z0-9_-]+\/media$/,
  /^\/api\/conversations\/[A-Za-z0-9_-]+\/renders\/[A-Za-z0-9_-]+\/file$/,
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
export function mayBePublic(pathname: string, method: string): boolean {
  // A published artefact is readable. It is never writable by a stranger.
  if (method !== 'GET' && method !== 'HEAD') {
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
export function isPubliclyVisible(conversation: Conversation): boolean {
  const publication = conversation.publication;
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
]);

export function isPublicRepresentation(id: string | null): boolean {
  return id !== null && PUBLIC_REPRESENTATIONS.has(id);
}
