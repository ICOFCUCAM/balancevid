/**
 * Undo, as versions of the document.  [MASTER-EDIT §12 P1]
 *
 * WHAT MAKES UNDO HONEST is not that it restores a document — it is that the
 * document it restores still points at files that exist. Edits in this
 * product never delete media: `removeTake` unlinks a take and leaves its
 * asset on disk, and no route removes one. That property is the load-bearing
 * one, so it is asserted here rather than trusted, because the day somebody
 * adds a tidy-up on delete is the day undo starts lying.
 *
 * AND THE FUTURE IS TRUNCATED, which is the behaviour people can predict. An
 * edit made after undoing abandons the branch you undid past; a redo that
 * resurrected it would be a history nobody can hold in their head.
 */

import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let root: string;
let store: typeof import('../../src/store/performances.js');
let history: typeof import('../../src/store/history.js');
let paths: typeof import('../../src/store/paths.js').paths;
let edit: typeof import('../../src/domain/performanceEdit.js');

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'bv-history-'));
  process.env['BALANCEVID_VAR'] = root;
  ({ paths } = await import('../../src/store/paths.js'));
  store = await import('../../src/store/performances.js');
  history = await import('../../src/store/history.js');
  edit = await import('../../src/domain/performanceEdit.js');
});

afterAll(async () => { await rm(root, { recursive: true, force: true }); });

const AT = '2026-09-29T12:00:00.000Z';
let id: string;

beforeEach(async () => {
  for (const entry of await readdir(root).catch(() => [])) {
    await rm(join(root, entry), { recursive: true, force: true });
  }
  const performance = edit.newPerformance('A song', {
    assetId: 'asset_song' as never, title: 'A song', class: 'own',
    durationSamples: 48000 * 60, sourceSampleRate: 48000,
  } as never, AT);
  id = performance.id;
  await store.savePerformance(performance);
});

const titleNow = async () =>
  (await store.loadPerformance(id)).title;

describe('undo', () => {
  it('has nowhere to go before anything has been edited', async () => {
    expect(await history.historyState(id)).toMatchObject({
      canUndo: false, canRedo: false,
    });
    expect(await store.stepPerformance(id, -1)).toBeNull();
  });

  it('walks back to what was there before, and forward again', async () => {
    await store.mutatePerformance(id, (draft) => { edit.renamePerformance(draft, 'Second'); });
    await store.mutatePerformance(id, (draft) => { edit.renamePerformance(draft, 'Third'); });
    expect(await titleNow()).toBe('Third');

    expect(await history.historyState(id)).toMatchObject({ canUndo: true, canRedo: false });
    await store.stepPerformance(id, -1);
    expect(await titleNow()).toBe('Second');
    await store.stepPerformance(id, -1);
    expect(await titleNow()).toBe('A song');

    expect(await history.historyState(id)).toMatchObject({ canUndo: false, canRedo: true });
    await store.stepPerformance(id, 1);
    expect(await titleNow()).toBe('Second');
    await store.stepPerformance(id, 1);
    expect(await titleNow()).toBe('Third');
    expect(await history.historyState(id)).toMatchObject({ canRedo: false });
  });

  /*
   * THE BRANCH YOU ABANDONED DOES NOT COME BACK. Undo twice, edit, and the
   * two versions you undid past are gone — which is what every editor does
   * and the only rule a person can predict.
   */
  it('and an edit after undoing truncates the future', async () => {
    await store.mutatePerformance(id, (draft) => { edit.renamePerformance(draft, 'Second'); });
    await store.mutatePerformance(id, (draft) => { edit.renamePerformance(draft, 'Third'); });
    await store.stepPerformance(id, -1);
    expect(await history.historyState(id)).toMatchObject({ canRedo: true });

    await store.mutatePerformance(id, (draft) => { edit.renamePerformance(draft, 'Other'); });
    expect(await history.historyState(id)).toMatchObject({ canRedo: false });
    expect(await store.stepPerformance(id, 1)).toBeNull();
    expect(await titleNow()).toBe('Other');
    /* And back is still the version before the branch. */
    await store.stepPerformance(id, -1);
    expect(await titleNow()).toBe('Second');
  });

  /*
   * AND THE FILES GO WITH IT. Truncation is `count` no longer counting
   * them; this is the sweep that stops unreachable versions piling up. The
   * two are separate and the first mutation aimed at the wrong one.
   */
  it('and leaves no version file the history cannot reach', async () => {
    for (const title of ['Second', 'Third', 'Fourth']) {
      // eslint-disable-next-line no-await-in-loop
      await store.mutatePerformance(id, (draft) => {
        edit.renamePerformance(draft, title);
      });
    }
    await store.stepPerformance(id, -1);
    await store.stepPerformance(id, -1);
    await store.mutatePerformance(id, (draft) => {
      edit.renamePerformance(draft, 'Other');
    });
    const { count } = await history.historyState(id);
    const files = (await readdir(paths.performanceHistory(id)))
      .filter((name) => /^v\d{6}\.json$/.test(name));
    expect(files.length, 'a version nothing can reach is still on disk')
      .toBe(count);
  });

  /*
   * IT DOES NOT GROW FOR EVER. Fifty steps of a document with a hundred
   * takes is still small, and unbounded is not a size.
   */
  it('and keeps a bounded number of versions', async () => {
    for (let n = 0; n < history.HISTORY_DEPTH + 8; n += 1) {
      // eslint-disable-next-line no-await-in-loop
      await store.mutatePerformance(id, (draft) => {
        edit.renamePerformance(draft, `Take ${n}`);
      });
    }
    const files = (await readdir(paths.performanceHistory(id)))
      .filter((name) => name.endsWith('.json') && name !== 'index.json');
    expect(files.length).toBeLessThanOrEqual(history.HISTORY_DEPTH);
    /* And the newest is still reachable. */
    expect(await history.historyState(id)).toMatchObject({ canUndo: true });
  });

  /*
   * THE PROPERTY UNDO RESTS ON. A restored document may name a take that was
   * removed; that is only safe because removing a take leaves its media
   * alone. If this ever fails, undo is restoring a reference to a file that
   * is not there.
   */
  it('and an edit never removes media, which is why any of this is safe', async () => {
    const asset = paths.performanceAsset(id, 'asset_take', 'mp4');
    await writeFile(asset, 'not really a video', 'utf8').catch(async () => {
      const { mkdir } = await import('node:fs/promises');
      await mkdir(paths.performanceAssets(id), { recursive: true });
      await writeFile(asset, 'not really a video', 'utf8');
    });

    await store.mutatePerformance(id, (draft) => {
      edit.addTake(draft, {
        id: 'take_one' as never, assetId: 'asset_take' as never, label: 'One',
        environment: { kind: 'original' }, alignment: { offsetSamples: 0 },
        durationSamples: 48000 * 60, createdAt: AT,
      } as never);
    });
    await store.mutatePerformance(id, (draft) => { edit.removeTake(draft, 'take_one'); });
    expect((await store.loadPerformance(id)).takes).toHaveLength(0);

    /* The document forgot it; the disk did not. */
    expect(await readFile(asset, 'utf8')).toBe('not really a video');

    /* So undo brings back a take whose media is still there. */
    await store.stepPerformance(id, -1);
    const back = await store.loadPerformance(id);
    expect(back.takes.map((take) => take.id)).toEqual(['take_one']);
    expect(await readFile(
      paths.performanceAsset(id, back.takes[0]!.assetId, 'mp4'), 'utf8'))
      .toBe('not really a video');
  });
});
