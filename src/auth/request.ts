/**
 * Is this request the owner's?  [Doctrine D-06]
 *
 * Middleware already turned away anything that needs a session. This is the
 * second check, for the routes middleware lets through because they MIGHT be
 * public: they still have to know whether they are talking to the owner or to
 * a stranger, because the answer decides what they will serve.
 *
 * Two checks in different layers, both of which must say yes. A single gate is
 * one refactor away from being bypassed.
 */

import { AUTH, isLocked } from './config.js';
import { SESSION_COOKIE, verifySession } from './session.js';

export async function isOwner(request: Request): Promise<boolean> {
  if (isLocked()) return false;
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE);
  return verifySession(token, AUTH.passwordHash!);
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return undefined;
}

/**
 * What a caller may do with one conversation.
 *
 * `notFound` rather than `forbidden` for an unpublished conversation a
 * stranger asked for: 403 confirms it exists, and the existence of a draft is
 * itself private (D-03). A stranger and a wrong id get the same answer.
 */
export type Access = 'owner' | 'public' | 'denied';

export async function accessTo(
  request: Request,
  conversation: { publication?: { unpublishedAt?: string } | undefined },
): Promise<Access> {
  if (await isOwner(request)) return 'owner';
  const publication = conversation.publication;
  return publication && !publication.unpublishedAt ? 'public' : 'denied';
}
