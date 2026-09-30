/**
 * The Participation Request store.  [Doctrine D-25, D-06; TAKE-APP T16, T2a]
 *
 * A fourth store beside the three studios, for the reason D-25 gives: a
 * request is not part of a production. It is what a producer sent out and
 * what came back, held where neither can be mistaken for the other until
 * somebody accepts it.
 *
 * THE TOKEN IS THE HARD PART, and this module is where it is got right.
 *
 * A LINK CARRIES THE REQUEST'S ID AND ITS SECRET, in that order, joined
 * by a dot: `req_3f2a….<secret>`. Not because it is prettier, but because
 * the alternative is an index of every live token — a second file that
 * has to be written in the same breath as the request, that can disagree
 * with it, and that is a list of every credential in the installation in
 * one place. With the id in the link there is nothing to index: the id
 * says which file to open, and the secret is checked against what is in
 * it.
 *
 * COMPARED IN CONSTANT TIME, with `timingSafeEqual`. A token is a
 * credential handed to somebody with no account; comparing it with `===`
 * leaks its length and its matching prefix to anybody willing to time a
 * few thousand requests. The lengths are equalised by hashing first,
 * because `timingSafeEqual` throws on a length mismatch — which would
 * itself be the leak.
 *
 * AND A FAILED LOOKUP IS ALWAYS THE SAME ANSWER. Whether the request does
 * not exist, the secret is wrong, or the link has expired, the caller
 * gets `null`. A participant who is told "that request exists but your
 * secret is wrong" has been told there is something there to guess at.
 */

import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { join } from 'node:path';

import {
  type ParticipationRequest, type RequestId, isOpen,
} from '../domain/participation.js';
import { sha256 } from '../domain/ids.js';
import { paths } from './paths.js';

/**
 * How much secret is in a link.
 *
 * 32 bytes, base64url, which is 43 characters and 256 bits. A room's
 * invite token is minted the same way. Long enough that guessing is not
 * a thing anybody attempts, short enough to survive being pasted into
 * WhatsApp by somebody's aunt.
 */
export function newSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** The whole of what goes in a link, after `/take/`. */
export function linkFor(request: ParticipationRequest): string {
  return `${request.id}.${request.token}`;
}

export async function saveRequest(request: ParticipationRequest): Promise<void> {
  const dir = paths.request(request.id);
  await mkdir(join(dir, 'assets'), { recursive: true });
  const target = paths.requestDocument(request.id);
  const temp = `${target}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(request, null, 2), 'utf8');
  await rename(temp, target);
}

export async function loadRequest(id: string): Promise<ParticipationRequest> {
  const body = await readFile(paths.requestDocument(id), 'utf8');
  return JSON.parse(body) as ParticipationRequest;
}

/** Every request this account has issued, newest first. */
export async function listRequests(): Promise<ParticipationRequest[]> {
  let names: string[];
  try {
    names = await readdir(paths.requests());
  } catch {
    return [];
  }
  const found: ParticipationRequest[] = [];
  for (const name of names) {
    try {
      found.push(await loadRequest(name));
    } catch {
      /* A directory that is not a request, or a half-written one. The
         inbox showing nine of ten is better than the inbox failing. */
    }
  }
  return found.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Load, change, save.
 *
 * NO LOCK, AND THAT IS A DECISION. A request is answered by one person
 * on one phone; the two writers that can race are that phone and the
 * producer's browser, and they touch different fields. What a lock here
 * would actually protect is a producer accepting two submissions at
 * once, which is not a thing one producer does. When a request can have
 * several participants, this takes the directory lock the conversation
 * store uses. [D-19]
 */
export async function mutateRequest(
  id: string, change: (draft: ParticipationRequest) => void | Promise<void>,
): Promise<ParticipationRequest> {
  const request = await loadRequest(id);
  await change(request);
  await saveRequest(request);
  return request;
}

/**
 * Who this link belongs to, or nothing.  [D-25]
 *
 * THE ONLY WAY IN FROM A LINK. Every participant-facing route goes
 * through this one function, so there is one place that decides what a
 * valid link is — and one place to change when a request can be held by
 * an account that is not the owner.
 */
export async function requestForLink(
  link: string, now: string,
): Promise<ParticipationRequest | null> {
  /*
   * ONE PATTERN, MATCHED BEFORE ANYTHING TOUCHES THE DISK.
   *
   * THE SHAPE IS CHECKED HERE AND NOT BY `safe()`, which THROWS on
   * anything it dislikes — so handing it a stranger's URL would turn a
   * mistyped link into a 500 and a path traversal into a stack trace.
   * A bad link is an ordinary event on a public endpoint, not an error.
   *
   * AND IT IS ONE REGEX RATHER THAN THREE CHECKS, because the three it
   * replaced were each individually unkillable: a traversal is refused
   * anyway when `safe()` throws inside the try below, and a two-letter
   * secret is refused anyway when it fails to match. Both were true
   * and neither could be observed from outside, which is how a guard
   * becomes decoration. What IS worth holding is the ORDER — nothing
   * reaches the filesystem until the link is the right shape — and
   * that is asserted against this source.
   */
  const shape = /^(req_[A-Za-z0-9_-]{1,120})\.([A-Za-z0-9_-]{16,512})$/.exec(link);
  if (!shape) return null;
  const id = shape[1]!;
  const secret = shape[2]!;

  let request: ParticipationRequest;
  try {
    request = await loadRequest(id);
  } catch {
    return null;
  }
  if (!sameSecret(secret, request.token)) return null;
  if (!isOpen(request, now)) return null;
  return request;
}

/**
 * Constant-time comparison of two secrets.
 *
 * Hashed first so both sides are 32 bytes whatever was sent:
 * `timingSafeEqual` throws on a length mismatch, and catching that would
 * make the length itself observable — which is the leak the function
 * exists to prevent.
 */
export function sameSecret(sent: string, held: string): boolean {
  const a = Buffer.from(sha256(sent), 'hex');
  const b = Buffer.from(sha256(held), 'hex');
  return timingSafeEqual(a, b);
}

/** Throw away a request and everything sent to it. [U-25, D-23] */
export async function deleteRequest(id: string): Promise<void> {
  await rm(paths.request(id), { recursive: true, force: true });
}

export type { ParticipationRequest, RequestId };
