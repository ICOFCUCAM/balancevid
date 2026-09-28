/**
 * The document store.  [Doctrine U-25, INV-00, D-07]
 *
 * The Conversation is the canonical artifact, so this is the only module that
 * writes it. Everything else in the system reads a projection.
 *
 * Writes are atomic (write-temp-then-rename) because the document is second
 * only to an in-progress take on the irreplaceability ranking in D-07: a
 * half-written document is hours of someone's reasoning destroyed.
 */

import {
  appendFile, mkdir, readFile, readdir, rename, rm, writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { SCHEMA_VERSION, type Conversation } from '../domain/document.js';
import { paths, safe } from './paths.js';

export interface AuditEntry {
  at: string;
  action: string;
  detail?: Record<string, unknown>;
  /** Every AI-derived change records who accepted it. [U-15, INV-06] */
  acceptedBy?: string;
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  const dir = paths.conversation(conversation.id);
  await mkdir(join(dir, 'assets'), { recursive: true });
  const target = paths.document(conversation.id);
  const temp = `${target}.${process.pid}.tmp`;
  const body = JSON.stringify({ ...conversation, updatedAt: new Date().toISOString() }, null, 2);
  await writeFile(temp, body, 'utf8');
  await rename(temp, target);
}

export async function loadConversation(id: string): Promise<Conversation> {
  const raw = await readFile(paths.document(safe(id)), 'utf8');
  const parsed = JSON.parse(raw) as Conversation;
  if (parsed.schemaVersion > SCHEMA_VERSION) {
    // Forward-only migrations (U-25 §1). Refusing is correct: silently reading
    // a newer document with older code is how user work gets corrupted.
    throw new Error(
      `conversation ${id} is schema v${parsed.schemaVersion}; this build understands v${SCHEMA_VERSION}`,
    );
  }
  return parsed;
}

export async function listConversations(): Promise<Conversation[]> {
  let entries: string[];
  try {
    entries = await readdir(paths.conversations());
  } catch {
    return [];
  }
  const out: Conversation[] = [];
  for (const id of entries) {
    try { out.push(await loadConversation(id)); } catch { /* not a conversation */ }
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Append-only. The product's claim is accountability; it applies to itself. */
export async function audit(id: string, entry: Omit<AuditEntry, 'at'>): Promise<void> {
  await mkdir(paths.conversation(id), { recursive: true });
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  await appendFile(paths.audit(id), `${line}\n`, 'utf8');
}

export async function readAudit(id: string): Promise<AuditEntry[]> {
  try {
    const raw = await readFile(paths.audit(safe(id)), 'utf8');
    return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l) as AuditEntry);
  } catch {
    return [];
  }
}

/**
 * A per-conversation write lock.
 *
 * The worker and the web tier both mutate the document -- the worker when a
 * take finishes assembling, the web tier when the user records another one. A
 * lost update here would destroy a take, which is first on the
 * irreplaceability ranking (D-07), so the read-modify-write is serialised.
 *
 * mkdir is atomic on every filesystem we care about, which is all the mutual
 * exclusion a single-machine deployment needs.
 */
export async function withConversationLock<T>(
  id: string, fn: () => Promise<T>, timeoutMs = 15_000,
): Promise<T> {
  const lock = join(paths.conversation(safe(id)), '.lock');
  const deadline = Date.now() + timeoutMs;
  await mkdir(paths.conversation(id), { recursive: true });

  for (;;) {
    try {
      await mkdir(lock);
      break;
    } catch {
      if (Date.now() > deadline) throw new Error(`timed out waiting for lock on ${id}`);
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  try {
    return await fn();
  } finally {
    const { rm } = await import('node:fs/promises');
    await rm(lock, { recursive: true, force: true });
  }
}

/** Load, mutate, save -- under the lock. The only safe way to edit a document. */
export async function mutateConversation(
  id: string, mutate: (conversation: Conversation) => void | Promise<void>,
): Promise<Conversation> {
  return withConversationLock(id, async () => {
    const conversation = await loadConversation(id);
    await mutate(conversation);
    await saveConversation(conversation);
    return conversation;
  });
}

/**
 * Throw a conversation away, with everything under it. [§19, D-13, U-25]
 *
 * The directory IS the conversation — document, takes, renders, evidence,
 * thumbnails and audit log (U-25: a conversation directory is a portable
 * archive). So deleting it is deleting the directory, and there is nothing
 * else to remember to clean up. That is the payoff of having kept
 * everything in one place for the last two studios.
 *
 * IRREVERSIBLE, AND THE CALLER HAS ALREADY BEEN WARNED. There is no trash:
 * a trash folder is a second place for media to live, which is a second
 * thing to reason about on every disk-space question, and the product has
 * no quota to make it worth it.
 */
export async function deleteConversation(id: string): Promise<void> {
  await rm(paths.conversation(safe(id)), { recursive: true, force: true });
}
