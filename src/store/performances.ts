/**
 * The Performance store.  [Doctrine STUDIO-TWO S-1, INV-00, D-07, U-25]
 *
 * The same module `repository.ts` is, for the other document. Written as its
 * own file rather than generalised into one store with a type parameter,
 * because the two documents have different schema versions and will migrate
 * on different days — and a shared migration gate is a shared reason to be
 * unable to ship either of them.
 *
 * Writes are atomic for the reason they are there: a half-written document is
 * somebody's performance destroyed, and they cannot sing it again exactly.
 */

import { appendFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PERFORMANCE_SCHEMA_VERSION, type Performance,
} from '../domain/performance.js';
import type { AuditEntry } from './repository.js';
import { paths, safe } from './paths.js';

export async function savePerformance(performance: Performance): Promise<void> {
  const dir = paths.performance(performance.id);
  await mkdir(join(dir, 'assets'), { recursive: true });
  const target = paths.performanceDocument(performance.id);
  const temp = `${target}.${process.pid}.tmp`;
  const body = JSON.stringify(
    { ...performance, updatedAt: new Date().toISOString() }, null, 2);
  await writeFile(temp, body, 'utf8');
  await rename(temp, target);
}

export async function loadPerformance(id: string): Promise<Performance> {
  const raw = await readFile(paths.performanceDocument(safe(id)), 'utf8');
  const parsed = JSON.parse(raw) as Performance;
  if (parsed.schemaVersion > PERFORMANCE_SCHEMA_VERSION) {
    // Forward-only (U-25 §1). Reading a newer document with older code is how
    // user work gets corrupted, so this refuses rather than tries.
    throw new Error(
      `performance ${id} is schema v${parsed.schemaVersion}; `
      + `this build understands v${PERFORMANCE_SCHEMA_VERSION}`);
  }
  return migrate(parsed);
}

/**
 * Old documents, read by new code.  [U-25 §1]
 *
 * In memory only — the document on disk is rewritten the next time something
 * changes it, and never merely because it was looked at. A read that writes
 * turns opening a performance into an edit, and the audit log into a lie.
 */
function migrate(performance: Performance): Performance {
  // v1 → v2: the room plates §4's matte is measured from. A performance made
  // before there were plates has none, which is exactly right: its takes can
  // only be shown in the room they were recorded in.
  performance.plates ??= [];
  performance.schemaVersion = PERFORMANCE_SCHEMA_VERSION;
  return performance;
}

export async function listPerformances(): Promise<Performance[]> {
  let entries: string[];
  try {
    entries = await readdir(paths.performances());
  } catch {
    return [];
  }
  const loaded = await Promise.all(entries.map(
    (id) => loadPerformance(id).catch(() => null)));
  return loaded
    .filter((p): p is Performance => p !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Read, change, write — under the same discipline `mutateConversation` keeps.
 *
 * The mutation is given a draft and returns nothing: an edit that has to
 * remember to return the document is an edit somebody eventually forgets to.
 */
export async function mutatePerformance(
  id: string, change: (draft: Performance) => void | Promise<void>,
): Promise<Performance> {
  const performance = await loadPerformance(id);
  await change(performance);
  await savePerformance(performance);
  return performance;
}

export async function auditPerformance(
  id: string, entry: Omit<AuditEntry, 'at'>,
): Promise<void> {
  await mkdir(paths.performance(id), { recursive: true });
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry });
  await appendFile(paths.performanceAudit(id), `${line}\n`, 'utf8');
}

export async function readPerformanceAudit(id: string): Promise<AuditEntry[]> {
  try {
    const raw = await readFile(paths.performanceAudit(safe(id)), 'utf8');
    return raw.split('\n').filter(Boolean).map((line) => JSON.parse(line) as AuditEntry);
  } catch {
    return [];
  }
}
