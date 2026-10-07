/**
 * What is in each copy, before anybody moves anything.
 *   [Doctrine U-25, D-06, D-18, D-21, U-02]
 *
 * THE SITUATION THIS IS FOR. `moveOwnedUnderAccount` renames four
 * roots under the owner's account on first boot, and refuses when
 * BOTH addresses hold something — because picking one would
 * destroy the other, and no automatic rule can know which an
 * operator meant. That refusal is right. What it left behind was a
 * person standing in front of two directories on a volume holding
 * hours of recorded speech, with no way to see what was in either.
 *
 * SO THIS LOOKS, AND ONLY LOOKS. It opens nothing for writing,
 * creates nothing, renames nothing and deletes nothing. It can be
 * run against production while the station is on air, as many
 * times as anybody likes. The decision stays with the person;
 * what they were missing was the evidence. [D-18]
 *
 * WHICH COPY IS LIVE IS NOT A JUDGEMENT CALL. Every path in
 * `paths.ts` is built on `owned()`, so the account copy is what
 * the product reads and writes, and the bare `var/<root>` copy is
 * invisible to it. This says so rather than implying it.
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { OWNER_ACCOUNT_ID } from '../src/domain/account.js';
import { VAR_ROOT, owned } from '../src/store/paths.js';

const ROOTS = ['conversations', 'performances', 'channels', 'library'] as const;

interface Side {
  path: string;
  entries: number;
  newest: string | null;
  bytes: number;
}

/**
 * HOW BIG, HOW MANY, AND HOW RECENT — walked, not estimated.
 *
 * Bounded so a report never becomes a job: an operator wants to
 * know which side is the real one, and the newest modification
 * plus a count answers that. Depth is capped because `library/`
 * can hold tens of thousands of segments and nobody is reading a
 * number that took four minutes to produce. [U-16]
 */
async function look(path: string, depth = 3): Promise<Side> {
  let entries = 0;
  let bytes = 0;
  let newest: number | null = null;

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
      if (!facts) continue;
      bytes += facts.size;
      const at_ = facts.mtimeMs;
      if (newest === null || at_ > newest) newest = at_;
    }
  };

  try {
    entries = (await readdir(path)).length;
  } catch {
    return { path, entries: 0, newest: null, bytes: 0 };
  }
  await walk(path, depth);
  return {
    path, entries, bytes,
    newest: newest === null ? null : new Date(newest).toISOString(),
  };
}

const size = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB`
  : bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB`
    : `${(bytes / 1e3).toFixed(0)} kB`);

console.log('');
console.log('BalanceVid storage — read-only. Nothing here changes anything.');
console.log('');
console.log(`  the product reads and writes:  ${owned()}`);
console.log(`  the pre-accounts address:      ${VAR_ROOT}/<root>`);
console.log('');

let anyDouble = false;
for (const root of ROOTS) {
  const legacy = await look(join(VAR_ROOT, root));
  const live = await look(join(owned(), root));
  const doubled = legacy.entries > 0 && live.entries > 0;
  if (doubled) anyDouble = true;

  console.log(`${root}`);
  console.log(`  LIVE    var/accounts/${OWNER_ACCOUNT_ID}/${root}`.padEnd(58)
    + `${String(live.entries).padStart(5)} entries  `
    + `${size(live.bytes).padStart(9)}  ${live.newest ?? 'nothing in it'}`);
  console.log(`  ignored var/${root}`.padEnd(58)
    + `${String(legacy.entries).padStart(5)} entries  `
    + `${size(legacy.bytes).padStart(9)}  ${legacy.newest ?? 'nothing in it'}`);
  if (doubled) {
    console.log('          ^ both hold something, so the startup migration '
      + 'left them alone. Nothing is lost;');
    console.log('            the ignored copy is simply not being served.');
  }
  console.log('');
}

if (anyDouble) {
  console.log('What to do with a doubled root, in order:');
  console.log('');
  console.log('  1. Back the volume up. Everything below is reversible only '
    + 'because of this step.');
  console.log('  2. Compare the two newest timestamps above. The one the '
    + 'product has been writing');
  console.log('     is the LIVE copy, and on an instance that has been in '
    + 'use it will be the newer.');
  console.log('  3. Anything in the ignored copy that is NOT in the live one '
    + 'is work from before');
  console.log('     the accounts layout. Move those directories across '
    + 'individually — a rename on');
  console.log('     one filesystem is atomic and instant whatever they weigh.');
  console.log('  4. Leave the empty shell behind or remove it by hand. The '
    + 'product never reads it.');
  console.log('');
  console.log('  This script will not do any of that. Moving somebody’s '
    + 'recordings is not a');
  console.log('  decision a startup script gets to make. [D-18, U-25]');
  console.log('');
}
