/**
 * A clip is the master render with a window on it.
 * [Doctrine STUDIO-TWO §14, §15, U-22, U-30, INV-03, INV-15]
 *
 * The claim under test is the architectural one: there is ONE projection of a
 * performance, and a clip is that projection with a span. If the clip pipeline
 * were a second renderer, the vertical chorus and the sixteen-by-nine master
 * would drift — and the one people see is the vertical one.
 *
 * Read back out of the artefact as everywhere else here: the picture by its
 * colour, the sound by its frequency, the length by its frame count.
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
import { labelScene, newPerformance, setScene } from '../../src/domain/performanceEdit.js';
import {
  CLIP_MAX_SAMPLES, PerformanceClipError, clipCandidates, clipWindow,
} from '../../src/domain/performanceClips.js';
import {
  PerformancePlanError, buildPerformancePlan,
} from '../../src/domain/performancePlan.js';
import {
  PerformanceCardError, buildPerformanceCard,
} from '../../src/publish/performanceCard.js';
import { HOUSE_FPS, secondsToSamples } from '../../src/domain/time.js';
import { compose } from '../../src/render/compose.js';
import { decodeToAnalysis, readAnalysis } from '../../src/render/audio.js';
import { FFMPEG, FFPROBE } from '../../src/render/ffmpeg.js';

const run = promisify(execFile);
const SONG_SECONDS = 20;
const SONG = secondsToSamples(SONG_SECONDS);
const SONG_HZ = 220;
const MIC_HZ = 880;

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

function master(over: Partial<MasterTrack> = {}): MasterTrack {
  return {
    assetId: 'song' as AssetId, title: 'The Long Way Round',
    artist: 'The Author', class: 'own', durationSamples: SONG, ...over,
  };
}

/** Red for the first half, blue for the second, with the second half named. */
function performance(over: Partial<MasterTrack> = {}): Performance {
  const p = newPerformance('A Performance', master(over), '2026-09-24T12:00:00.000Z');
  p.takes = [take('take_red'), take('take_blue')];
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_red'] });
  const chorus = setScene(p, secondsToSamples(10), {
    layoutId: 'performance_full', takeIds: ['take_blue'],
  });
  labelScene(p, chorus.id, 'Chorus');
  return p;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-perf-clips-'));
  for (const [name, colour] of [['red', 'red'], ['blue', 'blue']] as const) {
    await run(FFMPEG, [
      '-y',
      '-f', 'lavfi', '-i', `color=c=${colour}:s=320x180:r=${HOUSE_FPS}:d=${SONG_SECONDS}`,
      '-f', 'lavfi',
      '-i', `sine=frequency=${MIC_HZ}:sample_rate=48000:duration=${SONG_SECONDS}`,
      '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', asset(name),
    ]);
  }
  await run(FFMPEG, [
    '-y', '-f', 'lavfi',
    '-i', `sine=frequency=${SONG_HZ}:sample_rate=48000:duration=${SONG_SECONDS}`,
    '-c:a', 'libopus', '-f', 'webm', join(dir, 'song.webm'),
  ]);
}, 300_000);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

async function frames(path: string): Promise<number> {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0', '-count_frames',
    '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0', path,
  ]);
  return Number(String(stdout).trim());
}

async function shape(path: string): Promise<string> {
  const { stdout } = await run(FFPROBE, [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path,
  ]);
  return String(stdout).trim();
}

async function colourAt(path: string, seconds: number): Promise<[number, number, number]> {
  const png = join(dir, `probe-${seconds}-${Math.random()}.png`);
  await run(FFMPEG, ['-y', '-ss', String(seconds), '-i', path, '-frames:v', '1', png]);
  const { stdout } = await run(FFMPEG, [
    '-i', png, '-vf', 'crop=1:1:540:960,format=rgb24', '-f', 'rawvideo', '-',
  ], { encoding: 'buffer' as never, maxBuffer: 1024 * 1024 } as never);
  const bytes = stdout as unknown as Buffer;
  return [bytes[0] ?? 0, bytes[1] ?? 0, bytes[2] ?? 0];
}

function energyAt(samples: Float32Array, hz: number): number {
  const n = samples.length;
  const k = Math.round((n * hz) / 48000);
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

describe('what is worth clipping', () => {
  it('offers the sections the author named, and says why', () => {
    const candidates = clipCandidates(performance());
    const chorus = candidates.find((c) => c.label === 'Chorus')!;
    expect(chorus).toBeTruthy();
    expect(chorus.suggested).toBe(false);
    expect(chorus.reasons.join(' ')).toMatch(/you named/);
    expect(chorus.fromSample).toBe(secondsToSamples(10));
  });

  /*
   * And one it chose itself, labelled as such. S-8's rule about detected
   * beats is the same rule: a machine's idea of the best bit is a guess about
   * music, and presenting it as a reading of the music is the dishonest part.
   */
  it('and one of its own, marked as the product’s choice, not the author’s', () => {
    const suggested = clipCandidates(performance()).filter((c) => c.suggested);
    expect(suggested).toHaveLength(1);
    expect(suggested[0]!.reasons.join(' ')).toMatch(/we chose/);
  });

  it('does not offer an unnamed cut as a section', () => {
    const p = performance();
    setScene(p, secondsToSamples(5), {
      layoutId: 'performance_full', takeIds: ['take_blue'],
    });
    // Three scenes, one name: one section plus the product's own suggestion.
    expect(clipCandidates(p).filter((c) => !c.suggested)).toHaveLength(1);
  });

  it('refuses a window too short to be a performance', () => {
    expect(() => clipWindow(performance(), 0, secondsToSamples(2)))
      .toThrow(PerformanceClipError);
  });

  it('and one long enough to be the video rather than a clip of it', () => {
    // A four-minute song: the fixture's twenty seconds cannot reach the
    // ceiling, because the window is clamped to the song first.
    const long = performance();
    long.master.durationSamples = secondsToSamples(240);
    expect(() => clipWindow(long, 0, CLIP_MAX_SAMPLES + secondsToSamples(30)))
      .toThrow(/it is the video/);
  });
});

describe('a clip is the same projection, windowed', () => {
  it('runs for the window and not for the song (INV-03)', () => {
    const plan = buildPerformancePlan(performance(), {
      exportProfileId: 'vertical_9x16',
      span: { fromSample: secondsToSamples(10), toSample: secondsToSamples(20) },
    });
    expect(plan.totalOutputFrames).toBe(10 * HOUSE_FPS);
    let frame = 0;
    for (const shot of plan.shots) {
      expect(shot.outputStartFrame).toBe(frame);
      frame += shot.durationFrames;
    }
    expect(frame).toBe(plan.totalOutputFrames);
  });

  /*
   * The window opens in the middle of a scene, which is the normal case for a
   * clip and the one an earlier version of the projection got wrong: it asked
   * "does a scene START here" and reported a gap in the middle of a
   * four-minute performance.
   */
  it('and a window inside a scene is covered by it, not a hole', () => {
    expect(() => buildPerformancePlan(performance(), {
      span: { fromSample: secondsToSamples(2), toSample: secondsToSamples(12) },
    })).not.toThrow();
  });

  it('reads its sound from the song at that moment, not from the start', () => {
    const plan = buildPerformancePlan(performance(), {
      span: { fromSample: secondsToSamples(10), toSample: secondsToSamples(20) },
    });
    const song = plan.performanceAudio!.find((piece) => piece.kind === 'master')!;
    // Lands at the clip's own zero...
    expect(song.fromSample).toBe(0);
    // ...and is read from ten seconds into the song.
    expect(song.mediaFromSample).toBe(secondsToSamples(10));
    // A clip is cut out of the middle of a song, so it fades at both ends.
    expect(song.fadeInSamples).toBeGreaterThan(0);
    expect(song.fadeOutSamples).toBeGreaterThan(0);
  });

  it('still refuses music the author has not said they may publish (INV-15)', () => {
    const p = performance({ class: 'third_party' });
    const span = { fromSample: secondsToSamples(10), toSample: secondsToSamples(20) };
    expect(() => buildPerformancePlan(p, { span })).toThrow(PerformancePlanError);
    expect(() => buildPerformancePlan(p, { span, allowUnpublishable: true })).not.toThrow();
  });
});

describe('the clip itself', () => {
  it('is vertical, the right length, and plays the right part of the song', async () => {
    const p = performance();
    const out = join(dir, 'clip.mp4');
    await compose(buildPerformancePlan(p, {
      exportProfileId: 'vertical_9x16',
      span: { fromSample: secondsToSamples(10), toSample: secondsToSamples(20) },
    }), {
      workDir: join(dir, 'work-clip'),
      outputPath: out,
      resolveAsset: (id) => asset(String(id)),
      masterAudioPath: join(dir, 'song.webm'),
    });

    expect(await shape(out)).toBe('1080,1920');
    expect(await frames(out)).toBe(10 * HOUSE_FPS);

    // The chorus is the blue performance, so the clip is blue throughout.
    const [r, , b] = await colourAt(out, 2);
    expect(b).toBeGreaterThan(150);
    expect(r).toBeLessThan(90);

    // And the song is under it: the backing tone and the microphone both.
    const analysis = join(dir, 'clip.f32');
    await decodeToAnalysis(out, analysis);
    const window = await readAnalysis(analysis, secondsToSamples(4), 24000);
    expect(energyAt(window, SONG_HZ)).toBeGreaterThan(0);
    expect(energyAt(window, MIC_HZ)).toBeGreaterThan(0);
    // 1320 Hz is in neither source, so it is the floor to measure against.
    expect(energyAt(window, SONG_HZ)).toBeGreaterThan(energyAt(window, 1320) * 10);
  }, 300_000);
});

describe('the link preview', () => {
  it('is built from the document and quotes nobody', () => {
    const card = buildPerformanceCard({
      performance: performance(), attribution: 'Music: "The Long Way Round" by The Author',
    });
    expect(card.title).toBe('A Performance');
    expect(card.hero.quoted).toBe(false);
    expect(card.eyebrow).toContain('The Long Way Round');
    expect(card.scale).toContain('2 performances');
    expect(card.attribution).toContain('The Author');
  });

  /* A card is made to be posted, so INV-15 reaches it. */
  it('and is refused entirely for music that is somebody else’s (INV-15)', () => {
    expect(() => buildPerformanceCard({
      performance: performance({ class: 'third_party' }), attribution: 'Music: …',
    })).toThrow(PerformanceCardError);
  });
});
