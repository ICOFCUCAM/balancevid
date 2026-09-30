/**
 * Old documents, read by new code.  [U-25 §1; TIMELINE B6a, B6k]
 *
 * The song's one used window became a LIST of them when removing a
 * stretch from the middle needed two. `use` and `sections` both
 * present would be two answers to one question, so the old field is
 * converted and dropped as the document is read.
 *
 * WHY THIS IS A STORE TEST AND NOT A DOMAIN ONE. `songSections` reads
 * `use` itself, so every domain test passes whether or not the
 * migration runs — which is how a mutation deleting the migration
 * survived a battery of twenty-two. The thing to assert is that the
 * document on disk stops carrying the old field once it is next
 * written, and that is a fact about the store.
 */

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let root: string;
let store: typeof import('../../src/store/performances.js');
let paths: typeof import('../../src/store/paths.js').paths;
let edit: typeof import('../../src/domain/performanceEdit.js');
let model: typeof import('../../src/domain/performance.js');

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-migrate-'));
  process.env['BALANCEVID_VAR'] = root;
  ({ paths } = await import('../../src/store/paths.js'));
  store = await import('../../src/store/performances.js');
  edit = await import('../../src/domain/performanceEdit.js');
  model = await import('../../src/domain/performance.js');
});

afterAll(async () => { await rm(root, { recursive: true, force: true }); });

const AT = '2026-09-29T12:00:00.000Z';
const SONG = 48000 * 60;
let id: string;

beforeEach(async () => {
  for (const entry of await readdir(root).catch(() => [])) {
    await rm(join(root, entry), { recursive: true, force: true });
  }
  const performance = edit.newPerformance('A song', {
    assetId: 'asset_song' as never, title: 'A song', class: 'own',
    durationSamples: SONG, sourceSampleRate: 48000,
  } as never, AT);
  id = performance.id;
  await store.savePerformance(performance);
});

/** Put a v2 document on disk, with the field v2 had. */
async function writeOld(use: { fromSample: number; toSample: number } | null) {
  const path = paths.performanceDocument(id);
  const document = JSON.parse(await readFile(path, 'utf8'));
  document.schemaVersion = 2;
  if (use) document.master.use = use;
  delete document.master.sections;
  await writeFile(path, JSON.stringify(document, null, 2), 'utf8');
}

const onDisk = async () =>
  JSON.parse(await readFile(paths.performanceDocument(id), 'utf8'));

describe('a song trimmed before there were sections', () => {
  it('is read as one stretch, and the old field goes', async () => {
    await writeOld({ fromSample: 48000 * 10, toSample: 48000 * 40 });
    const read = await store.loadPerformance(id);
    expect(read.master.sections)
      .toEqual([{ fromSample: 48000 * 10, toSample: 48000 * 40 }]);
    expect(read.master.use).toBeUndefined();
    expect(read.schemaVersion).toBe(model.PERFORMANCE_SCHEMA_VERSION);
    /* And it means the same thing it meant. */
    expect(model.songLength(read.master)).toBe(48000 * 30);
  });

  /*
   * NOTHING IS RENUMBERED, and nothing needs to be: a list of one
   * stretch says exactly what the single window said, on the same
   * clock. That property is what made the list the right
   * generalisation rather than a rewrite of every document.
   */
  it('leaves every scene where it was', async () => {
    await store.mutatePerformance(id, (draft) => {
      edit.addTake(draft, {
        id: 'take_one' as never, assetId: 'asset_take' as never,
        label: 'take_one', environment: { kind: 'original' },
        alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
        durationSamples: SONG, hasAudio: true, createdAt: AT,
      } as never);
      edit.setScene(draft, 48000 * 20, {
        layoutId: 'performance_full', takeIds: ['take_one'],
      } as never);
    });
    await writeOld({ fromSample: 48000 * 10, toSample: 48000 * 40 });
    const read = await store.loadPerformance(id);
    expect(read.scenes.map((one) => one.fromSample)).toEqual([48000 * 20]);
  });

  /*
   * A READ DOES NOT WRITE. Opening a performance is not an edit, and
   * a migration that rewrote the file on read would turn every look
   * into a version in the undo history and every audit line into a
   * lie. The conversion shows up on disk the next time something
   * actually changes.
   */
  it('is converted in memory, and on disk only when something changes', async () => {
    await writeOld({ fromSample: 48000 * 10, toSample: 48000 * 40 });
    await store.loadPerformance(id);
    expect((await onDisk()).master.use)
      .toEqual({ fromSample: 48000 * 10, toSample: 48000 * 40 });
    expect((await onDisk()).master.sections).toBeUndefined();

    await store.mutatePerformance(id, (draft) => {
      edit.renamePerformance(draft, 'Renamed');
    });
    const after = await onDisk();
    expect(after.master.use).toBeUndefined();
    expect(after.master.sections)
      .toEqual([{ fromSample: 48000 * 10, toSample: 48000 * 40 }]);
  });

  it('leaves an untrimmed document with neither field', async () => {
    await writeOld(null);
    const read = await store.loadPerformance(id);
    expect(read.master.use).toBeUndefined();
    expect(read.master.sections).toBeUndefined();
    expect(model.songLength(read.master)).toBe(SONG);
  });

  /* A document from the future is refused rather than guessed at:
     reading a newer document with older code is how work gets
     corrupted. [U-25 §1] */
  it('refuses a document written by a newer build', async () => {
    const path = paths.performanceDocument(id);
    const document = JSON.parse(await readFile(path, 'utf8'));
    document.schemaVersion = model.PERFORMANCE_SCHEMA_VERSION + 1;
    await writeFile(path, JSON.stringify(document), 'utf8');
    await expect(store.loadPerformance(id)).rejects.toThrow(/schema v/);
  });
});
