/**
 * §9's audio modes, read back out of the sound.
 * [Doctrine STUDIO-TWO §9, S-7, INV-11, U-17]
 *
 * "The master vocal stays continuous while the video switches between
 *  environments."
 *
 * THE FIXTURES CARRY THEIR OWN GROUND TRUTH, as everywhere else in this
 * appendix — here as FREQUENCY rather than colour. The song is a 220 Hz tone,
 * one take's microphone is 880 Hz and the other's is 1320 Hz, so a Goertzel
 * over a window of the finished audio says which sources are audible at that
 * moment without anybody listening to anything.
 *
 * That matters more here than it looks. Every one of these modes produces a
 * file that plays; the difference between them is what is IN it, and "the
 * render succeeded" is exactly the assertion that would pass while Mode C
 * quietly switched vocals at every cut.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import type {
  MasterTrack, Performance, PerformanceTake,
} from '../../src/domain/performance.js';
import { newPerformance, setAudioMode, setScene } from '../../src/domain/performanceEdit.js';
import { planPerformanceAudio } from '../../src/domain/performanceAudio.js';
import { buildPerformancePlan } from '../../src/domain/performancePlan.js';
import { HOUSE_FPS, HOUSE_SAMPLE_RATE, secondsToSamples } from '../../src/domain/time.js';
import { compose } from '../../src/render/compose.js';
import { decodeToAnalysis, readAnalysis } from '../../src/render/audio.js';
import { FFMPEG } from '../../src/render/ffmpeg.js';
import { mixGraph } from '../../src/render/mix.js';

const run = promisify(execFile);
const SONG_SECONDS = 8;
const SONG = secondsToSamples(SONG_SECONDS);

const SONG_HZ = 220;
const ONE_HZ = 880;
const TWO_HZ = 1320;

let dir: string;
const asset = (name: string) => join(dir, `${name}.mp4`);

function take(id: string, over: Partial<PerformanceTake> = {}): PerformanceTake {
  return {
    id: id as TakeId,
    assetId: id.replace('take_', '') as AssetId,
    label: id,
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
    durationSamples: SONG,
    hasAudio: true,
    createdAt: '2026-09-24T12:00:00.000Z',
    ...over,
  };
}

function master(): MasterTrack {
  return {
    assetId: 'song' as AssetId, title: 'The Long Way Round',
    class: 'own', durationSamples: SONG,
  };
}

/** Two takes, and a cut at the halfway point. */
function performance(): Performance {
  const p = newPerformance('A Performance', master(), '2026-09-24T12:00:00.000Z');
  p.takes = [take('take_one'), take('take_two')];
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_one'] });
  setScene(p, secondsToSamples(4), {
    layoutId: 'performance_full', takeIds: ['take_two'],
  });
  return p;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-perf-audio-'));

  for (const [name, colour, hz] of [
    ['one', 'red', ONE_HZ], ['two', 'blue', TWO_HZ],
  ] as const) {
    await run(FFMPEG, [
      '-y',
      '-f', 'lavfi', '-i', `color=c=${colour}:s=320x180:r=${HOUSE_FPS}:d=${SONG_SECONDS}`,
      '-f', 'lavfi',
      '-i', `sine=frequency=${hz}:sample_rate=48000:duration=${SONG_SECONDS}`,
      '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', asset(name),
    ]);
  }

  await run(FFMPEG, [
    '-y', '-f', 'lavfi',
    '-i', `sine=frequency=${SONG_HZ}:sample_rate=48000:duration=${SONG_SECONDS}`,
    '-c:a', 'libopus', '-f', 'webm', join(dir, 'song.webm'),
  ]);
}, 240_000);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

/**
 * How much of this frequency is in this second of the finished video.
 *
 * A Goertzel rather than a full transform: one bin is the whole question, and
 * a number that came out of arithmetic on the samples is a fact about the
 * file rather than an impression of it.
 */
function energyAt(samples: Float32Array, hz: number): number {
  const n = samples.length;
  const k = Math.round((n * hz) / HOUSE_SAMPLE_RATE);
  const coefficient = 2 * Math.cos((2 * Math.PI * k) / n);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i += 1) {
    const s0 = samples[i]! + coefficient * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coefficient * s1 * s2)) / n;
}

/** The three tones, at one moment of the finished video. */
async function tonesAt(
  path: string, second: number,
): Promise<{ song: number; one: number; two: number }> {
  const analysis = `${path}.${second}.f32`;
  await decodeToAnalysis(path, analysis);
  const window = await readAnalysis(
    analysis, secondsToSamples(second), HOUSE_SAMPLE_RATE / 2);
  return {
    song: energyAt(window, SONG_HZ),
    one: energyAt(window, ONE_HZ),
    two: energyAt(window, TWO_HZ),
  };
}

async function render(p: Performance, name: string): Promise<string> {
  const out = join(dir, `${name}.mp4`);
  await compose(buildPerformancePlan(p), {
    workDir: join(dir, `work-${name}`),
    outputPath: out,
    resolveAsset: (id) => asset(String(id)),
    masterAudioPath: join(dir, 'song.webm'),
  });
  return out;
}

/** Audible, and audible by a wide margin rather than by a rounding error. */
const LOUD = 10;

describe('the sound timeline is not the picture timeline (S-7)', () => {
  it('Mode C is ONE piece of vocal across every cut, not one per scene', () => {
    const p = performance();
    setAudioMode(p, 'master_vocal', 'take_one');
    const pieces = planPerformanceAudio(p);

    const vocal = pieces.filter((piece) => piece.takeId === 'take_one');
    expect(vocal).toHaveLength(1);
    expect(vocal[0]!.fromSample).toBe(0);
    expect(vocal[0]!.toSample).toBe(SONG);
    /*
     * The whole reason this is one piece: a piece per scene would be trimmed
     * and laid down twice, and the join would be at the picture cut — which
     * is precisely where a seam is most audible.
     */
    expect(vocal[0]!.fadeInSamples).toBe(0);
    expect(vocal[0]!.fadeOutSamples).toBe(0);
  });

  it('and Mode A merges neighbouring scenes that show the same performer', () => {
    const p = performance();
    // Cut from take one to take one: a different arrangement, the same person.
    setScene(p, secondsToSamples(4), {
      layoutId: 'performance_full', takeIds: ['take_one'],
    });
    const mic = planPerformanceAudio(p).filter((piece) => piece.kind === 'take');
    expect(mic).toHaveLength(1);
    expect(mic[0]!.toSample).toBe(SONG);
  });

  it('but cuts the mic where the performer actually changes, with a fade', () => {
    const pieces = planPerformanceAudio(performance())
      .filter((piece) => piece.kind === 'take');
    expect(pieces).toHaveLength(2);
    expect(pieces[0]!.fadeOutSamples).toBeGreaterThan(0);
    expect(pieces[1]!.fadeInSamples).toBeGreaterThan(0);
    // ...and not at the very ends of the song, where a fade nobody asked for
    // would be an audible mistake on a first downbeat.
    expect(pieces[0]!.fadeInSamples).toBe(0);
    expect(pieces[1]!.fadeOutSamples).toBe(0);
  });

  it('leaves out a take that was recorded silent', () => {
    const p = performance();
    p.takes[1]!.hasAudio = false;
    const pieces = planPerformanceAudio(p);
    expect(pieces.some((piece) => piece.takeId === 'take_two')).toBe(false);
    // The song still runs under the second half; only the dead mic is gone.
    expect(pieces.filter((piece) => piece.kind === 'master')).toHaveLength(1);
  });

  /*
   * A vocal shorter than the song. The PICTURE is refused when a take does
   * not cover its scene (INV-03), but a Mode C vocal is not the picture: it
   * may run out, and what follows is the song on its own rather than a
   * renderer asking a file for samples it does not have.
   */
  it('clips a vocal to the part of the song it actually covers', () => {
    const p = performance();
    setAudioMode(p, 'master_vocal', 'take_one');
    p.takes[0]!.useToSample = secondsToSamples(2);
    const vocal = planPerformanceAudio(p).filter((piece) => piece.takeId === 'take_one');
    expect(vocal).toHaveLength(1);
    expect(vocal[0]!.toSample).toBe(secondsToSamples(2));
    // And it fades out there, because that end is inside the song.
    expect(vocal[0]!.fadeOutSamples).toBeGreaterThan(0);
  });

  it('refuses Mode C with no vocal named, at the plan (INV-03)', () => {
    const p = performance();
    p.audio = { mode: 'master_vocal' };
    // INV-03 reaches it first, which is the right order: a document that
    // cannot be rendered is refused before anything asks what it sounds like.
    expect(() => buildPerformancePlan(p))
      .toThrow(/no take has been named as the vocal/);
  });

  /*
   * The property that makes changing your mind cheap: the audio timeline is
   * part of the plan, so the plan hash changes — and the SHOTS do not, so a
   * re-render re-mixes and re-renders nothing. [U-16]
   */
  it('changing the mode re-mixes without re-rendering a frame (U-16)', () => {
    // The SAME document, before and after — scene ids are generated, so two
    // documents built the same way are not the same document.
    const p = performance();
    const before = buildPerformancePlan(p);
    setAudioMode(p, 'take_audio');
    const after = buildPerformancePlan(p);

    expect(after.planHash).not.toBe(before.planHash);
    expect(after.shots.map((shot) => shot.hash))
      .toEqual(before.shots.map((shot) => shot.hash));
  });
});

describe('the mix graph', () => {
  it('never lets amix rebalance the song when a vocal comes and goes', () => {
    const graph = mixGraph(planPerformanceAudio(performance()), () => 0, SONG);
    expect(graph).toContain('normalize=0');
    expect(graph).toContain('dropout_transition=0');
  });

  it('delays both channels, not one', () => {
    const graph = mixGraph(planPerformanceAudio(performance()), () => 0, SONG);
    for (const delay of graph.match(/adelay=[^,\]]*/g) ?? []) {
      expect(delay).toContain(':all=1');
    }
  });

  it('and renders a performance nobody can hear as silence, not as an error', () => {
    const p = performance();
    setAudioMode(p, 'take_audio');
    p.takes.forEach((t) => { t.hasAudio = false; });
    const graph = mixGraph(planPerformanceAudio(p), () => 0, SONG);
    expect(graph).toContain('anullsrc');
  });
});

describe('what comes out of the speakers', () => {
  it('Mode A: the song, under whichever microphone is on screen', async () => {
    const out = await render(performance(), 'mode-a');

    const first = await tonesAt(out, 1);
    expect(first.song).toBeGreaterThan(first.two * LOUD);
    expect(first.one).toBeGreaterThan(first.two * LOUD);

    const second = await tonesAt(out, 6);
    expect(second.song).toBeGreaterThan(second.one * LOUD);
    expect(second.two).toBeGreaterThan(second.one * LOUD);
  }, 240_000);

  it('Mode B: what that take recorded, and no song at all', async () => {
    const p = performance();
    setAudioMode(p, 'take_audio');
    const out = await render(p, 'mode-b');

    const first = await tonesAt(out, 1);
    expect(first.one).toBeGreaterThan(first.song * LOUD);
    expect(first.one).toBeGreaterThan(first.two * LOUD);

    const second = await tonesAt(out, 6);
    expect(second.two).toBeGreaterThan(second.song * LOUD);
  }, 240_000);

  it('Mode C: one vocal, continuous, while the picture switches (§9)', async () => {
    /*
     * "You could sing the song once perfectly, then record five visual
     *  performances afterward." The second half of this video shows take two
     *  and must still be take one singing.
     */
    const p = performance();
    setAudioMode(p, 'master_vocal', 'take_one');
    const out = await render(p, 'mode-c');

    for (const second of [1, 6]) {
      const tones = await tonesAt(out, second);
      expect(tones.song).toBeGreaterThan(tones.two * LOUD);
      expect(tones.one).toBeGreaterThan(tones.two * LOUD);
    }
  }, 240_000);

  it('and one scene may answer differently from the rest (S-7)', async () => {
    // The fourth mode S-7 said came free: a per-scene source, for the author
    // who wants the crowd from the concert-stage take under the chorus.
    const p = performance();
    const chorus = p.scenes.find((scene) => scene.fromSample > 0)!;
    chorus.audioMode = 'take_audio';
    const out = await render(p, 'mode-mixed');

    const first = await tonesAt(out, 1);
    expect(first.song).toBeGreaterThan(first.two * LOUD);

    const second = await tonesAt(out, 6);
    expect(second.two).toBeGreaterThan(second.song * LOUD);
  }, 240_000);
});
