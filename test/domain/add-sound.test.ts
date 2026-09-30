/**
 * "Add audio."  [TIMELINE B6h, B8; U-02, U-23]
 *
 * The one thing the brief asked for that the document could not hold
 * at all until a sound layer existed, and the one thing about a sound
 * layer that cannot be decided in the browser: how long it is.
 *
 * WHAT THIS FILE IS ACTUALLY DEFENDING is the division of labour. The
 * web tier writes the bytes down and stops; the worker normalises and
 * COUNTS; the document learns about the layer last. Every step of that
 * is easy to collapse into one and each collapse is a bug with no
 * symptom until an export is wrong.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { Ask } from '../../app/Confirm.js';
import type { MenuItem } from '../../app/Menu.js';
import { songMenuItems, type SongMenuHost } from '../../app/p/[id]/songMenu.js';
import {
  SOUND_ACCEPT, sendSound, soundLabel, soundUploadUrl,
} from '../../app/p/[id]/soundUpload.js';
import type { AssetId } from '../../src/domain/document.js';
import type { Performance } from '../../src/domain/performance.js';
import { newPerformance } from '../../src/domain/performanceEdit.js';
import { secondsToSamples } from '../../src/domain/time.js';

const ROOT = join(import.meta.dirname, '..', '..');
const code = (file: string) => readFileSync(join(ROOT, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

describe('what a file is called once it is on the timeline', () => {
  /* Nobody wants a lane labelled "applause-crowd-01.wav". */
  it('is the name without the extension, read as words', () => {
    expect(soundLabel('applause-crowd-01.wav')).toBe('applause crowd 01');
    expect(soundLabel('Room_Tone.mp3')).toBe('Room Tone');
    expect(soundLabel('rain.ogg')).toBe('rain');
  });

  /* A file called ".wav" is a file with no name, and an unnamed lane is
     worse than a generic one. */
  it('is never empty', () => {
    expect(soundLabel('.wav')).toBe('Sound');
    expect(soundLabel('   ')).toBe('Sound');
  });

  it('fits a lane', () => {
    expect(soundLabel(`${'a'.repeat(200)}.wav`)).toHaveLength(60);
  });
});

describe('where the bytes go', () => {
  /*
   * EVERYTHING THE FILE CANNOT SAY ITSELF travels with it: a file knows
   * nothing about the song, so where it lands has to come from the
   * playhead and which lane from the caller.
   */
  it('carries the label, the track and the playhead', () => {
    const url = new URL(soundUploadUrl('perf_1', {
      label: 'Applause', track: 'effect', fromSample: secondsToSamples(60),
    }), 'http://x');
    expect(url.pathname).toBe('/api/performances/perf_1/sounds');
    expect(url.searchParams.get('label')).toBe('Applause');
    expect(url.searchParams.get('track')).toBe('effect');
    expect(url.searchParams.get('fromSample')).toBe(String(secondsToSamples(60)));
    expect(url.searchParams.get('loop')).toBeNull();
  });

  it('asks for a loop only when one is wanted', () => {
    expect(soundUploadUrl('perf_1', {
      label: 'Rain', track: 'ambience', fromSample: 0, loop: true,
    })).toContain('loop=true');
  });

  /* Every position in this product is a whole number of samples. */
  it('sends a whole number of samples, never a fraction', () => {
    expect(soundUploadUrl('perf_1', {
      label: 'x', track: 'effect', fromSample: 4800.7,
    })).toContain('fromSample=4801');
    expect(soundUploadUrl('perf_1', {
      label: 'x', track: 'effect', fromSample: -5,
    })).toContain('fromSample=0');
  });

  it('escapes a performance id rather than pasting it into a path', () => {
    expect(soundUploadUrl('a/b', { label: 'x', track: 'effect', fromSample: 0 }))
      .toContain('/api/performances/a%2Fb/sounds');
  });

  /* "The audio of this clip" is a real thing to want, and the ingest
     throws the picture away anyway. */
  it('accepts video as well as audio', () => {
    expect(SOUND_ACCEPT).toBe('audio/*,video/*');
  });
});

describe('sending one', () => {
  const asked = { label: 'Applause', track: 'effect' as const, fromSample: 0 };

  it('hands back the job to watch, and never a layer', async () => {
    const seen: [string, RequestInit | undefined][] = [];
    let finished: string | null = null;
    await sendSound('perf_1', new Blob(['x']), asked, {
      onFinished: (jobId) => { finished = jobId; },
      onError: () => { throw new Error('should not fail'); },
    }, (async (url: string, init: RequestInit) => {
      seen.push([String(url), init]);
      return new Response(JSON.stringify({ job: { id: 'job_1' } }),
        { status: 202 });
    }) as unknown as typeof fetch);
    expect(finished).toBe('job_1');
    expect(seen[0]![1]?.method).toBe('POST');
  });

  /* The refusal the server wrote, not one this file invented. */
  it('says what the server said when it refuses', async () => {
    let said: string | null = null;
    await sendSound('perf_1', new Blob(['x']), asked, {
      onFinished: () => { throw new Error('should not finish'); },
      onError: (message) => { said = message; },
    }, (async () => new Response(
      JSON.stringify({ error: 'that file arrived empty' }), { status: 400 },
    )) as unknown as typeof fetch);
    expect(said).toBe('that file arrived empty');
  });

  /* A 202 with no job is a success nobody can watch, which is a failure. */
  it('treats an accepted upload with no job as a failure', async () => {
    let said: string | null = null;
    await sendSound('perf_1', new Blob(['x']), asked, {
      onFinished: () => { throw new Error('should not finish'); },
      onError: (message) => { said = message; },
    }, (async () => new Response('{}', { status: 202 })) as unknown as typeof fetch);
    expect(said).toBe('that sound could not be added');
  });

  it('does not throw when the network does', async () => {
    let said: string | null = null;
    await sendSound('perf_1', new Blob(['x']), asked, {
      onFinished: () => { throw new Error('should not finish'); },
      onError: (message) => { said = message; },
    }, (async () => { throw new Error('offline'); }) as unknown as typeof fetch);
    expect(said).toBe('offline');
  });
});

describe('the row that starts it', () => {
  const SONG = secondsToSamples(240);
  function host(addAudio?: (at: number) => void): {
    host: SongMenuHost; at: number[];
  } {
    const at: number[] = [];
    return {
      at,
      host: {
        performance: newPerformance('A Performance', {
          assetId: 'asset_song' as AssetId, title: 'The Ancient of Days',
          class: 'own', durationSamples: SONG,
        }, '2026-09-30T00:00:00.000Z') as Performance,
        patch: () => undefined,
        confirm: (_ask: Ask) => undefined,
        at: () => secondsToSamples(60),
        ...(addAudio ? { addAudio: (where: number) => { at.push(where); addAudio(where); } } : {}),
      },
    };
  }
  const row = (built: { host: SongMenuHost }) => songMenuItems(built.host)
    .find((item) => item && item.label === 'Add a sound here…') as MenuItem;

  it('is on the song’s own menu, and lands at the playhead', () => {
    let where: number | null = null;
    const built = host((at) => { where = at; });
    const item = row(built);
    expect(item).toBeTruthy();
    expect(item.disabled).toBeUndefined();
    item.onSelect?.();
    expect(where).toBe(secondsToSamples(60));
  });

  /*
   * GREYED, NOT GONE, where the surface cannot upload. A menu whose
   * rows come and go is a menu nobody learns, and "the feature exists
   * and is unavailable here" is worth more than silence. [U-04]
   */
  it('is present and greyed where it cannot be done', () => {
    expect(row(host()).disabled).toBe('not from here');
  });

  it('is wired to the picker from the stage, not to a second upload path', () => {
    const stage = code('app/p/[id]/SwitchingStage.tsx');
    expect(stage).toMatch(/pickSound\(performance\.id, \{ track: 'effect', fromSample: at \}/);
    expect(stage).toMatch(/addAudio,/);
    expect(stage).not.toMatch(/\/sounds\?/);
  });
});

describe('who measures the sound', () => {
  const route = code('app/api/performances/[id]/sounds/route.ts');
  const worker = code('src/worker/index.ts');

  /*
   * THE WEB TIER NEVER INVOKES FFMPEG. [U-23]
   *
   * It writes the bytes down and queues a job, which is why the
   * document does not learn the layer's length here — there is nothing
   * in this process that could count it.
   */
  it('is not the route', () => {
    expect(route).not.toMatch(/ffmpeg|ffprobe|decodeToAnalysis/);
    expect(route).toContain("kind: 'ingest_sound'");
    expect(route).not.toContain('addSound');
  });

  /*
   * AND THE WORKER COUNTS RATHER THAN READING. A container's header is
   * what an encoder claimed; the sample count is what is there. [U-02]
   */
  it('is the worker, by decoding', () => {
    const body = worker.slice(
      worker.indexOf('async function ingestSound'),
      worker.indexOf('async function ingestPlate'));
    expect(body).toContain('normaliseMaster(originalPath, normalised)');
    expect(body).toContain('decodeToAnalysis(normalised, scratch)');
    expect(body).toContain('durationSamples,');
    expect(body).toMatch(/addSound\(draft, layer\)/);
    /* And the scratch decode is not left behind: nothing reads a
       layer's samples the way alignment reads the song's. */
    expect(body).toMatch(/rm\(scratch, \{ force: true \}\)/);
  });

  /* A take's mezzanine is video and a layer's is audio, so one guess
     cannot serve both — the render would fail on a missing file. */
  it('gives the renderer the right file for each kind of asset', () => {
    expect(worker).toMatch(
      /sounds\.has\(assetId\)\s*\?\s*paths\.performanceAsset\(id, `\$\{assetId\}snd`, 'webm'\)/);
    /* And a stretch of the song replaced by sound from elsewhere is
       the same kind of file, looked for the same way. [B6g] */
    expect(worker).toMatch(/songSections\(performance\.master\)\s*\n\s*\.map\(\(one\) => one\.assetId\)/);
    expect(worker.match(/resolveAsset: performanceAssets\(id, performance\),/g))
      .toHaveLength(2);
    expect(worker).not.toMatch(
      /resolveAsset: \(assetId\) => paths\.performanceAsset\(id, `\$\{assetId\}mezz`, 'mp4'\)/);
  });

  /* The upload is clamped where the domain would refuse: a layer past
     the end of the song has no stretch to be heard over. [B10] */
  it('puts an out-of-range upload inside the song rather than refusing it', () => {
    expect(route).toMatch(/Math\.max\(0, Math\.min\(\s*performance\.master\.durationSamples/);
  });

  /* A track the caller made up is an effect, not a 400: the lane is
     cosmetic and refusing an upload over it would be absurd. */
  it('falls back to a real track rather than refusing an unknown one', () => {
    expect(route).toMatch(/TRACKS\.has\(asked\) \? asked : 'effect'/);
  });
});
