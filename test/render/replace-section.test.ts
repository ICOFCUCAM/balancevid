/**
 * Playing something else over one stretch of the song.
 *   [TIMELINE B6g, B6b; D-19, U-04]
 *
 * "Replace section." The last of the eleven things the brief asks of
 * the song, and the one that needed the other ten first: a stretch
 * cannot be replaced until the song is a list of stretches.
 *
 * WHAT IS DEFENDED HERE is that nothing moves. The stretch keeps its
 * place and its length on the master clock, so every scene, take,
 * lyric and sound over it stays where it is — a replacement shorter
 * than the stretch leaves silence at the end of it and one longer is
 * cut, rather than the rest of the song shifting under the author.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import type {
  MasterTrack, Performance, PerformanceTake,
} from '../../src/domain/performance.js';
import {
  songReplaced, songSectionAt, songSections,
} from '../../src/domain/performance.js';
import {
  PerformanceEditError, addTake, newPerformance, removeSection, replaceSection,
  setScene, splitSong, trimSong,
} from '../../src/domain/performanceEdit.js';
import { buildPerformancePlan } from '../../src/domain/performancePlan.js';
import { secondsToSamples } from '../../src/domain/time.js';
import { FFMPEG, run, runCapture } from '../../src/render/ffmpeg.js';
import { mixPerformanceAudio } from '../../src/render/mix.js';

const SECONDS = 8;
const SONG = secondsToSamples(SECONDS);
const HALF = secondsToSamples(4);
const AT = '2026-09-30T00:00:00.000Z';

let dir: string;
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

/*
 * A SONG AT ONE PITCH AND A REPLACEMENT AT ANOTHER.
 *
 * Levels cannot answer "which one is playing" — every export is
 * mastered to a loudness target, and both files are the same
 * loudness anyway. Pitch can: 220 Hz for the song, 1500 Hz for the
 * replacement, and the question becomes which band the output has
 * energy in over which second. [INV-11]
 */
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-replace-'));
  await run(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', `sine=frequency=220:r=48000:d=${SECONDS}`,
    '-ac', '2', '-c:a', 'libopus', '-f', 'webm', join(dir, 'song.webm'),
  ]);
  await run(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', 'sine=frequency=1500:r=48000:d=4',
    '-ac', '2', '-c:a', 'libopus', '-f', 'webm',
    join(dir, 'asset_bridgesnd.webm'),
  ]);
}, 180_000);

function master(): MasterTrack {
  return {
    assetId: 'song' as AssetId, title: 'One Note',
    class: 'own', durationSamples: SONG,
  };
}

function take(): PerformanceTake {
  return {
    id: 'take_one' as TakeId, assetId: 'take' as AssetId, label: 'take_one',
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
    durationSamples: SONG, hasAudio: false, createdAt: AT,
  };
}

function performance(): Performance {
  const p = newPerformance('A Performance', master(), AT);
  addTake(p, take());
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_one'] });
  return p;
}

/** Divided at the halfway mark, with the second half replaced. */
function replaced(): Performance {
  const p = performance();
  splitSong(p, HALF);
  replaceSection(p, HALF, SONG, 'asset_bridge');
  return p;
}

async function mixed(p: Performance, name: string): Promise<string> {
  const workDir = join(dir, `work-${name}`);
  await mkdir(workDir, { recursive: true });
  return mixPerformanceAudio({
    pieces: buildPerformancePlan(p).performanceAudio ?? [],
    masterAudioPath: join(dir, 'song.webm'),
    resolveAsset: (assetId) => join(dir, `${assetId}snd.webm`),
    totalSamples: SONG,
    workDir,
    planHash: name,
  });
}

/** How much energy one second of the output has in a band, in dB. */
async function bandDb(
  path: string, second: number, filter: string,
): Promise<number> {
  const { stderr } = await runCapture(FFMPEG, [
    '-hide_banner', '-nostdin', '-ss', String(second), '-t', '1', '-i', path,
    '-af', `${filter},astats=metadata=1:reset=0`, '-f', 'null', '-',
  ]);
  const found = [...stderr.matchAll(/RMS level dB:\s*(-?[\d.]+|-?inf)/g)].pop();
  const value = Number(found?.[1]);
  return Number.isFinite(value) ? value : -120;
}

describe('the document', () => {
  it('needs the song divided there first', () => {
    const p = performance();
    expect(() => replaceSection(p, HALF, SONG, 'asset_bridge'))
      .toThrow(PerformanceEditError);
    expect(() => replaceSection(p, HALF, SONG, 'asset_bridge'))
      .toThrow(/divide it first/);
  });

  it('puts the sound on the stretch, and says so', () => {
    const p = replaced();
    expect(songReplaced(p.master)).toBe(true);
    expect(songSections(p.master)).toEqual([
      { fromSample: 0, toSample: HALF },
      { fromSample: HALF, toSample: SONG, assetId: 'asset_bridge' },
    ]);
    expect(songSectionAt(p.master, 0)?.assetId).toBeUndefined();
    expect(songSectionAt(p.master, HALF)?.assetId).toBe('asset_bridge');
  });

  it('puts the song’s own sound back', () => {
    const p = replaced();
    replaceSection(p, HALF, SONG, null);
    expect(songReplaced(p.master)).toBe(false);
    expect(songSections(p.master)[1]).toEqual({
      fromSample: HALF, toSample: SONG,
    });
  });

  /* An id out of a request becomes a filename, so it is checked
     against a shape before it is stored. [INV-15] */
  it('refuses an id that is not one of ours', () => {
    const p = performance();
    splitSong(p, HALF);
    expect(() => replaceSection(p, HALF, SONG, '../../etc/passwd'))
      .toThrow(/not a sound this performance has/);
  });

  /*
   * A WHOLE SONG WHOSE SOUND COMES FROM SOMEWHERE ELSE IS AN EDIT.
   * The list is normally dropped when it covers everything, because
   * a document that looks edited when it is not is one nobody can
   * read — but dropping it here would drop the replacement.
   */
  it('keeps the list when the whole song is replaced', () => {
    const p = performance();
    replaceSection(p, 0, SONG, 'asset_bridge');
    expect(p.master.sections)
      .toEqual([{ fromSample: 0, toSample: SONG, assetId: 'asset_bridge' }]);
  });

  /*
   * TRIMMING A REPLACED STRETCH READS FURTHER INTO IT. A
   * re-recorded bridge trimmed at the start should start later in
   * the recording, not at the same place for less time.
   */
  it('reads further into a replacement that is trimmed at the front', () => {
    const p = replaced();
    trimSong(p, secondsToSamples(5), SONG);
    expect(songSections(p.master)).toEqual([{
      fromSample: secondsToSamples(5), toSample: SONG,
      assetId: 'asset_bridge', sourceFromSample: secondsToSamples(1),
    }]);
  });

  it('keeps the replacement on both halves when it is divided again', () => {
    const p = replaced();
    splitSong(p, secondsToSamples(6));
    expect(songSections(p.master).slice(1)).toEqual([
      { fromSample: HALF, toSample: secondsToSamples(6), assetId: 'asset_bridge' },
      {
        fromSample: secondsToSamples(6), toSample: SONG,
        assetId: 'asset_bridge', sourceFromSample: secondsToSamples(2),
      },
    ]);
  });

  it('keeps it on what is left when part is removed', () => {
    const p = replaced();
    removeSection(p, secondsToSamples(5), secondsToSamples(6));
    expect(songSections(p.master).slice(1)).toEqual([
      { fromSample: HALF, toSample: secondsToSamples(5), assetId: 'asset_bridge' },
      {
        fromSample: secondsToSamples(6), toSample: SONG,
        assetId: 'asset_bridge', sourceFromSample: secondsToSamples(2),
      },
    ]);
  });
});

describe('the plan', () => {
  it('reads the replaced stretch from its own file, at its own place', () => {
    const pieces = (buildPerformancePlan(replaced()).performanceAudio ?? [])
      .filter((one) => one.kind === 'master')
      .sort((a, b) => a.fromSample - b.fromSample);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]).toMatchObject({ mediaFromSample: 0 });
    expect(pieces[0]!.assetId).toBeUndefined();
    /* Still the song's own place on the clock, and its own file. */
    expect(pieces[1]).toMatchObject({
      fromSample: HALF, toSample: SONG,
      assetId: 'asset_bridge', mediaFromSample: 0,
    });
  });

  /* Sound from elsewhere is a different export, or the cache serves
     the one with the original bridge in it. [U-16] */
  it('changes the plan hash', () => {
    const divided = performance();
    splitSong(divided, HALF);
    expect(buildPerformancePlan(replaced()).planHash)
      .not.toBe(buildPerformancePlan(divided).planHash);
  });

  /* NOTHING MOVES: the export is exactly as long as it was. */
  it('does not change how long the export is', () => {
    expect(buildPerformancePlan(replaced()).totalOutputFrames)
      .toBe(buildPerformancePlan(performance()).totalOutputFrames);
  });
});

describe('a render with a stretch replaced', () => {
  /*
   * THE ASSERTION THAT CANNOT BE FAKED. The song is 220 Hz and the
   * replacement is 1500 Hz, so "which one is playing at six seconds"
   * is a question the output answers by itself — and no loudness
   * target can change the answer.
   */
  it('plays the other file over that stretch, and the song over the rest', async () => {
    const out = await mixed(replaced(), 'replaced');
    const low = 'lowpass=f=400';
    const high = 'highpass=f=1000';

    /* Second 1 is the song: energy low, little high. */
    expect(await bandDb(out, 1, low))
      .toBeGreaterThan(await bandDb(out, 1, high) + 20);
    /* Second 6 is the replacement: the other way round. */
    expect(await bandDb(out, 6, high))
      .toBeGreaterThan(await bandDb(out, 6, low) + 20);
  }, 300_000);

  /* And with nothing replaced it is the song throughout, which is
     what makes the assertion above a statement about the feature
     rather than about the fixture. */
  it('is the song throughout when nothing is replaced', async () => {
    const out = await mixed(performance(), 'plain');
    for (const second of [1, 6]) {
      expect(await bandDb(out, second, 'lowpass=f=400'),
        `at ${second}s`).toBeGreaterThan(
        await bandDb(out, second, 'highpass=f=1000') + 20);
    }
  }, 300_000);
});

describe('where the replacement comes from', () => {
  const code = (file: string) => readFileSync(
    join(import.meta.dirname, '..', '..', file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  /*
   * ONE UPLOAD PATH AND ONE INGEST. A re-recorded bridge is measured
   * by exactly the code a sound layer is measured by; what differs
   * is where it lands. A second route would be a second place the
   * measurement could be got wrong. [D-19, U-02]
   */
  it('is the same upload and the same worker as a sound layer', () => {
    const route = code('app/api/performances/[id]/sounds/route.ts');
    expect(route).toMatch(/replaceFrom/);
    expect(route).toMatch(/kind: 'ingest_sound'/);
    const worker = code('src/worker/index.ts');
    const body = worker.slice(
      worker.indexOf('async function ingestSound'),
      worker.indexOf('async function ingestPlate'));
    expect(body.match(/decodeToAnalysis\(/g)).toHaveLength(1);
    expect(body).toMatch(/replaceSection\(draft, from, to, assetId\)/);
  });

  /*
   * AND THE STRETCH IS NAMED AT UPLOAD, NOT FOUND LATER. By the time
   * the worker runs the author may have divided the song again, and
   * replacing "whatever is there now" is not what they asked for.
   */
  it('refuses when the division it names has gone', () => {
    const route = code('app/api/performances/[id]/sounds/route.ts');
    expect(route).toMatch(/return fail\(409, 'the song is not divided there any more'\)/);
  });

  /*
   * AND IT IS VISIBLE. A stretch whose sound comes from somewhere
   * else looks exactly like the song unless the lane says so —
   * marked rather than shaded out, because it IS in the export, it
   * is just not the song. [U-04, U-19]
   */
  it('is marked on the song’s lane', () => {
    const stage = code('app/p/[id]/SwitchingStage.tsx');
    expect(stage).toMatch(/data-testid="song-replaced"/);
    expect(stage).toMatch(/songParts\.filter\(\(part\) => part\.assetId\)/);
    /* Drawn from the same sections the planner reads, so the lane
       cannot mark a replacement the render does not make. */
    expect(stage).toMatch(/const songParts = songSections\(performance\.master\);/);
  });

  /* The mixer picks an input by whether the piece names a FILE, not
     by what kind of piece it is — asking the kind sent a
     re-recorded bridge to the song's own input. [B6g] */
  it('sends a master piece with an asset to that asset’s input', () => {
    const mix = code('src/render/mix.ts');
    expect(mix).toMatch(/if \(!piece\.assetId\) continue;/);
    expect(mix).toMatch(
      /\(piece\) => \(piece\.assetId \? inputOfAsset\.get\(piece\.assetId\)! : 0\)/);
    expect(mix).not.toMatch(/piece\.kind === 'master' \? 0/);
  });
});
