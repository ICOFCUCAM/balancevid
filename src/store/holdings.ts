/**
 * Gathering the ledger.  [Doctrine §19, D-14, D-18, U-16]
 *
 * THE ONE PLACE THAT READS ALL THREE STUDIOS. Every other page
 * here is about one kind of thing, which is right for making
 * television and wrong for running the installation that makes
 * it: an operator deciding what to remove needs them on one
 * sheet, with what each weighs.
 *
 * IT READS AND NEVER WRITES. Opening the operations desk must not
 * change anything, not a timestamp and not a lock — this runs
 * over a volume with a live broadcast on it.
 *
 * SIZES ARE WALKED, AND THE WALK IS BOUNDED. A channel's
 * directory holds its segment window, which is thousands of small
 * files; a performance holds renders. The depth cap keeps opening
 * the page from costing what a backup costs, and the number is
 * honest about what it counts because it is the same walk for
 * every row. [U-16]
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { type Holding, doingNow } from '../domain/operations.js';
import { listChannels, readChannelAudit } from './channels.js';
import { listConversations, readAudit } from './repository.js';
import { listPerformances } from './performances.js';
import { paths } from './paths.js';

/** What a directory weighs, walked no deeper than it needs. */
async function weigh(path: string, depth = 4): Promise<number> {
  let bytes = 0;
  const walk = async (at: string, left: number): Promise<void> => {
    let found;
    try {
      found = await readdir(at, { withFileTypes: true });
    } catch {
      return;
    }
    for (const one of found) {
      const full = join(at, one.name);
      if (one.isDirectory()) {
        if (left > 0) await walk(full, left - 1);
        continue;
      }
      const facts = await stat(full).catch(() => null);
      if (facts) bytes += facts.size;
    }
  };
  await walk(path, depth);
  return bytes;
}

/**
 * Everything the installation holds.
 *
 * ONE KIND FAILING DOES NOT TAKE THE SHEET. A studio whose
 * directory is unreadable contributes no rows and the other two
 * still answer — an operations desk that 500s because one record
 * is half-written is a desk nobody can use at the moment they
 * most need it. [D-21]
 */
export async function allHoldings(): Promise<Holding[]> {
  const [channels, conversations, performances] = await Promise.all([
    listChannels().catch(() => []),
    listConversations().catch(() => []),
    listPerformances().catch(() => []),
  ]);

  const rows: Holding[] = [];

  await Promise.all(channels.map(async (one) => {
    rows.push({
      kind: 'channel',
      id: one.id,
      name: one.name,
      doing: doingNow(one as Parameters<typeof doingNow>[0]),
      bytes: await weigh(paths.channel(one.id)),
      at: one.updatedAt,
      changes: (await readChannelAudit(one.id).catch(() => [])).length,
    });
  }));

  await Promise.all(conversations.map(async (one) => {
    rows.push({
      kind: 'conversation',
      id: one.id,
      name: one.title || 'Untitled',
      doing: doingNow(one as Parameters<typeof doingNow>[0]),
      bytes: await weigh(paths.conversation(one.id)),
      at: one.updatedAt,
      changes: (await readAudit(one.id).catch(() => [])).length,
    });
  }));

  await Promise.all(performances.map(async (one) => {
    rows.push({
      kind: 'performance',
      id: one.id,
      name: one.title || 'Untitled',
      doing: doingNow(one as Parameters<typeof doingNow>[0]),
      bytes: await weigh(paths.performance(one.id)),
      at: one.updatedAt,
      /* Studio Two keeps no audit trail of its own yet, and a
         zero here says that rather than implying nothing
         happened. */
      changes: 0,
    });
  }));

  return rows;
}
