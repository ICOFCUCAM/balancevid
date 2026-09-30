/**
 * "Effects."  [TIMELINE B6j, B8, B9; INV-11, D-19]
 *
 * The last row of the brief's list of things the song should accept,
 * and it arrives with a warning two items later: "don't turn Studio
 * Two into Premiere Pro". So what is defended here is as much what is
 * NOT there — a chain, parameters, a plugin format — as what is.
 *
 * AND IT IS RENDERED, not asserted. An effect that is stored, planned,
 * drawn in a menu and silently dropped by ffmpeg passes every test a
 * plan can carry. The only proof that "make it sound like a radio"
 * does anything is a measurement of the file that comes out.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  AUDIO_EFFECTS, AUDIO_EFFECT_IDS, audioEffect,
} from '../../src/domain/audioEffect.js';
import { readFileSync } from 'node:fs';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import type { Performance, PerformanceTake } from '../../src/domain/performance.js';
import {
  PerformanceEditError, addSound, addTake, newPerformance, setScene, setSongSound,
} from '../../src/domain/performanceEdit.js';
import { buildPerformancePlan } from '../../src/domain/performancePlan.js';
import { HOUSE_SAMPLE_RATE, secondsToSamples } from '../../src/domain/time.js';
import { mixGraph, mixPerformanceAudio } from '../../src/render/mix.js';
import { FFMPEG, run, runCapture } from '../../src/render/ffmpeg.js';

const SECONDS = 4;
const SONG = secondsToSamples(SECONDS);
const AT = '2026-09-30T00:00:00.000Z';

let dir: string;
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

/*
 * WHITE NOISE, so every band is equally present to begin with. A tone
 * would make "is the top gone" a question about one frequency; noise
 * makes it a question about the filter.
 */
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-effect-'));
  await run(FFMPEG, [
    '-y', '-f', 'lavfi',
    '-i', `anoisesrc=r=48000:d=${SECONDS}:c=white:a=0.5`,
    '-ac', '2', '-c:a', 'libopus', '-f', 'webm', join(dir, 'song.webm'),
  ]);
}, 180_000);

function take(): PerformanceTake {
  return {
    id: 'take_one' as TakeId, assetId: 'take' as AssetId, label: 'take_one',
    environment: { kind: 'original' },
    alignment: { offsetSamples: 0, rateRatio: 1, method: 'measured' },
    durationSamples: SONG, hasAudio: false, createdAt: AT,
  };
}

function performance(effect?: string): Performance {
  const p = newPerformance('A Performance', {
    assetId: 'asset_song' as AssetId, title: 'Noise',
    class: 'own', durationSamples: SONG,
  }, AT);
  addTake(p, take());
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_one'] });
  if (effect) setSongSound(p, { effect });
  return p;
}

/** How much energy the output has above a given frequency, in dB. */
async function bandDb(path: string, filter: string): Promise<number> {
  const { stderr } = await runCapture(FFMPEG, [
    '-hide_banner', '-nostdin', '-i', path,
    '-af', `${filter},astats=metadata=1:reset=0`,
    '-f', 'null', '-',
  ]);
  const found = [...stderr.matchAll(/RMS level dB:\s*(-?[\d.]+|-?inf)/g)].pop();
  const value = Number(found?.[1]);
  return Number.isFinite(value) ? value : -120;
}

async function mixed(effect: string | undefined, name: string): Promise<string> {
  const plan = buildPerformancePlan(performance(effect));
  const workDir = join(dir, `work-${name}`);
  await mkdir(workDir, { recursive: true });
  return mixPerformanceAudio({
    pieces: plan.performanceAudio ?? [],
    masterAudioPath: join(dir, 'song.webm'),
    resolveAsset: (assetId) => join(dir, `${assetId}.webm`),
    totalSamples: SONG,
    workDir,
    planHash: name,
  });
}

/**
 * The same mix, with the noise as a LAYER instead of as the song.
 *
 * The song is silent here so anything measured is the layer, which is
 * the only way "did the layer's own effect reach the mix" is a
 * question the output can answer.
 */
async function mixedLayer(
  effect: string | undefined, name: string,
): Promise<string> {
  const p = performance();
  setSongSound(p, { muted: true });
  addSound(p, {
    id: 'snd_one', assetId: 'song' as AssetId, label: 'Noise',
    track: 'ambience', fromSample: 0, durationSamples: SONG,
    ...(effect ? { effect: effect as never } : {}),
    createdAt: AT,
  });
  const plan = buildPerformancePlan(p);
  const workDir = join(dir, `work-${name}`);
  await mkdir(workDir, { recursive: true });
  return mixPerformanceAudio({
    pieces: plan.performanceAudio ?? [],
    masterAudioPath: join(dir, 'song.webm'),
    resolveAsset: (assetId) => join(dir, `${assetId}.webm`),
    totalSamples: SONG,
    workDir,
    planHash: name,
  });
}

describe('the list itself', () => {
  /*
   * SHORT, AND THAT IS THE FEATURE.  [B9]
   *
   * "Don't turn Studio Two into Premiere Pro." A list that grows one
   * entry per request is how an editor becomes one, so the count is
   * asserted: adding a fifth is a decision somebody has to make here,
   * in front of this comment.
   */
  it('is four things, not a chain', () => {
    expect(AUDIO_EFFECT_IDS).toEqual(['distant', 'radio', 'echo', 'room']);
  });

  /*
   * NAMED BY WHAT THEY SOUND LIKE. "Low-pass at 900 hertz" is a true
   * description of the first one and tells a musician nothing they
   * can act on.
   */
  it('is named in words a musician can act on', () => {
    for (const id of AUDIO_EFFECT_IDS) {
      const effect = AUDIO_EFFECTS[id];
      expect(effect.label, id).not.toMatch(/pass|hz|hertz|filter|dB/i);
      expect(effect.hint.length, id).toBeGreaterThan(20);
    }
  });

  /*
   * EVERY STAGE IS ONE LINEAR FILTER. A stage carrying its own graph
   * labels — a split and a join, say — cannot be comma-joined into
   * the mixer's chain, and the first draft of this file had one: a
   * stereo widener written as `asplit ... ; ... join`, which would
   * have produced a filtergraph ffmpeg refuses.
   */
  it('is stages that can be joined into one chain', () => {
    for (const id of AUDIO_EFFECT_IDS) {
      for (const stage of AUDIO_EFFECTS[id].stages()) {
        expect(stage, `${id}: ${stage}`).not.toMatch(/[;[\]]/);
      }
    }
  });

  it('answers nothing for an id it does not have', () => {
    expect(audioEffect(undefined)).toBeUndefined();
    expect(audioEffect(null)).toBeUndefined();
    expect(audioEffect('reverb')).toBeUndefined();
  });
});

describe('what the document accepts', () => {
  /*
   * AN ID OFF THE LIST IS REFUSED, not stored and ignored. A document
   * carrying `effect: "reverb"` would draw a control saying nothing
   * is selected while claiming something is, and the render would
   * quietly leave it out. [U-04]
   */
  it('refuses an effect that does not exist', () => {
    expect(() => setSongSound(performance(), { effect: 'reverb' }))
      .toThrow(PerformanceEditError);
    expect(() => setSongSound(performance(), { effect: 'reverb' }))
      .toThrow(/no sound called reverb/);
  });

  it('takes it off again', () => {
    const p = performance('radio');
    expect(p.master.sound?.effect).toBe('radio');
    setSongSound(p, { effect: null });
    expect(p.master.sound).toBeUndefined();
  });

  /* A song that has become a radio must produce a different plan, or
     the cache serves the version without it. [U-16] */
  it('changes the plan and its hash', () => {
    const plain = buildPerformancePlan(performance());
    const radio = buildPerformancePlan(performance('radio'));
    expect(radio.planHash).not.toBe(plain.planHash);
    expect((radio.performanceAudio ?? [])[0]?.effect).toBe('radio');
    expect((plain.performanceAudio ?? [])[0]?.effect).toBeUndefined();
  });

  /*
   * BEFORE THE FADER AND BEFORE THE FADES. An effect is what the
   * sound IS; the fader is how loud that is and a fade is what
   * happens at the edges. After the fader, a radio treatment's own
   * 2 dB lift would quietly undo a cut the author made; after a
   * fade-out, an echo would ring on into the silence the fade just
   * arrived at.
   */
  it('is applied before the fader and the fades', () => {
    const graph = mixGraph([{
      kind: 'master', fromSample: 0, toSample: SONG, mediaFromSample: 0,
      fadeInSamples: 0, fadeOutSamples: secondsToSamples(1),
      gainDb: -6, effect: 'radio',
    }], () => 0, SONG);
    expect(graph.indexOf('highpass=f=400'))
      .toBeLessThan(graph.indexOf('volume=-6.000dB'));
    expect(graph.indexOf('volume=-6.000dB'))
      .toBeLessThan(graph.indexOf('afade=t=out'));
  });
});

describe('a render with an effect on it', () => {
  /*
   * THE PROOF THAT CANNOT BE FAKED. White noise has equal energy
   * everywhere; a treatment that claims to take the top off has to
   * take the top off the file.
   */
  it('takes the top off, for the one that says it is muffled', async () => {
    const plain = await mixed(undefined, 'plain');
    const distant = await mixed('distant', 'distant');
    const top = 'highpass=f=6000';
    const before = await bandDb(plain, top);
    const after = await bandDb(distant, top);
    expect(after, `plain ${before}, distant ${after}`).toBeLessThan(before - 12);
  }, 300_000);

  /*
   * AND THE RADIO TAKES OFF BOTH ENDS, which is what makes a sound
   * read as "reproduced" rather than "present" — and is why it is a
   * different entry rather than a stronger version of the first.
   */
  it('takes off both ends, for the one that says it is a radio', async () => {
    const plain = await mixed(undefined, 'plain2');
    const radio = await mixed('radio', 'radio');
    for (const [band, filter] of [
      ['bottom', 'lowpass=f=150'], ['top', 'highpass=f=6000'],
    ] as const) {
      const before = await bandDb(plain, filter);
      const after = await bandDb(radio, filter);
      expect(after, `${band}: plain ${before}, radio ${after}`)
        .toBeLessThan(before - 10);
    }
    /*
     * AND THE MIDDLE SURVIVES, or it is not a radio, it is a gate.
     *
     * Measured over 700–1500 Hz and not over the whole passband: a
     * band that reaches up to the filter's own corner is mostly
     * rolloff, and a first version measuring 800–2500 let a mutation
     * moving the high-pass to 2600 Hz — which would gut the speech
     * range — pass unnoticed.
     */
    const middle = 'highpass=f=700,lowpass=f=1500';
    expect(await bandDb(radio, middle))
      .toBeGreaterThan(await bandDb(plain, middle) - 4);
  }, 300_000);

  /*
   * THE EXPORT IS STILL EXACTLY AS LONG AS THE SONG. An echo rings on
   * past the sound that made it, and a mix that grew by a third of a
   * second would be a video whose sound outlasts its picture. [INV-03]
   */
  it('does not change how long the export is', async () => {
    const echoed = await mixed('echo', 'echo');
    const { stderr } = await runCapture(FFMPEG, [
      '-hide_banner', '-i', echoed, '-f', 'null', '-',
    ]);
    const found = /time=(\d+):(\d+):([\d.]+)/.exec(stderr);
    const seconds = found
      ? Number(found[1]) * 3600 + Number(found[2]) * 60 + Number(found[3]!)
      : -1;
    expect(Math.abs(seconds - SECONDS)).toBeLessThan(0.1);
  }, 300_000);

  /*
   * AND IT IS NOT A LOUDNESS TRICK. Every export is mastered to a
   * target (INV-11), so an "effect" that only changed the level would
   * produce an identical file — the first version of the song fader
   * was caught by exactly that. The band measurements above are
   * relative to the same mastered whole, which is why they are
   * measurements of a SHAPE and not of a volume.
   */
  it('changes the shape of the sound and not merely its level', async () => {
    const plain = await mixed(undefined, 'plain3');
    const distant = await mixed('distant', 'distant2');
    const whole = 'anull';
    const low = 'lowpass=f=400';
    /* The bottom survives while the top goes: a level change would
       move both by the same amount. */
    const topDrop = await bandDb(plain, 'highpass=f=6000')
      - await bandDb(distant, 'highpass=f=6000');
    const lowDrop = await bandDb(plain, low) - await bandDb(distant, low);
    const wholeDrop = await bandDb(plain, whole) - await bandDb(distant, whole);
    expect(topDrop, `top ${topDrop}, low ${lowDrop}, whole ${wholeDrop}`)
      .toBeGreaterThan(lowDrop + 10);
  }, 300_000);
});

describe('the same effects on a sound layer', () => {
  /*
   * THE LAYER PATH IS ITS OWN PATH. The song's effect is read off
   * `master.sound` and a layer's off the layer, in two places, and a
   * mutation dropping the second survived a battery that only
   * rendered the song. One list, two readers, two assertions.
   */
  it('reaches the mix from a layer, not only from the song', async () => {
    const plainLayer = await mixedLayer(undefined, 'layer-plain');
    const distantLayer = await mixedLayer('distant', 'layer-distant');
    const top = 'highpass=f=6000';
    const before = await bandDb(plainLayer, top);
    const after = await bandDb(distantLayer, top);
    expect(after, `plain ${before}, distant ${after}`).toBeLessThan(before - 12);
  }, 300_000);
});

describe('one list, both menus', () => {
  /* "Make this sound like a radio" is one idea, and a studio with two
     of them is one where the author has to remember which is which. */
  it('is offered on the song and on a sound from the same table', () => {
    for (const file of ['app/p/[id]/songMenu.ts', 'app/p/[id]/soundMenu.ts']) {
      const source = readFileSync(
        join(import.meta.dirname, '..', '..', file), 'utf8');
      expect(source, file).toContain('AUDIO_EFFECT_IDS.map((id) =>');
      expect(source, file).not.toContain("'Like a radio'");
    }
  });

  it('runs at the house rate, whatever that becomes', () => {
    expect(HOUSE_SAMPLE_RATE).toBe(48000);
  });
});
