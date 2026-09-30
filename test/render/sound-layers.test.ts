/**
 * Sound that is neither the song nor a take.
 *   [TIMELINE B8, B10, B10a, B10b; S-29, U-18]
 *
 * "Effects and sounds should also be timeline objects... applause,
 * transition sound, intro, outro, voice-over, background ambience,
 * musical layer, effects."
 *
 * The document had exactly two kinds of sound and neither of them is an
 * impact at 02:41. What this file proves is the part that cannot be
 * proved from a plan: that a layer placed at a moment is AUDIBLE at
 * that moment in the finished file, and silent where it is not.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AssetId, TakeId } from '../../src/domain/document.js';
import type {
  MasterTrack, Performance, PerformanceTake, SoundLayer,
} from '../../src/domain/performance.js';
import { soundOnSong, soundSpan } from '../../src/domain/performance.js';
import { buildPerformancePlan } from '../../src/domain/performancePlan.js';
import {
  PerformanceEditError, addSound, addTake, moveSound, newPerformance,
  removeSound, setScene, setSoundLayer, trimSound,
} from '../../src/domain/performanceEdit.js';
import { HOUSE_FPS, HOUSE_SAMPLE_RATE, secondsToSamples } from '../../src/domain/time.js';
import { decodeToAnalysis, normaliseMaster } from '../../src/render/audio.js';
import { ingestSoundSegments } from '../../src/render/ingest.js';
import { compose } from '../../src/render/compose.js';
import { FFMPEG, run } from '../../src/render/ffmpeg.js';
import { SILENT_FLOOR_DB, measureSound } from '../../src/render/ingest.js';

const SECONDS = 8;
const SONG = secondsToSamples(SECONDS);
const AT = '2026-09-30T00:00:00.000Z';

let dir: string;
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

/*
 * A SILENT SONG AND A ONE-SECOND TONE.
 *
 * So "is the effect audible at 04 seconds and not at 01" is a question
 * the output answers by itself: the song contributes nothing, and
 * anything measured is the layer. A song with music in it would make
 * the same test a matter of arguing about decibels.
 */
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-layers-'));
  await run(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo:d=${SECONDS}`,
    '-c:a', 'libopus', '-f', 'webm', join(dir, 'song.webm'),
  ]);
  await run(FFMPEG, [
    '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:r=48000:d=1',
    '-af', 'volume=6', '-c:a', 'libopus', '-f', 'webm', join(dir, 'clap.webm'),
  ]);
  await run(FFMPEG, [
    '-y', '-f', 'lavfi',
    '-i', `color=c=0x304050:s=320x180:r=${HOUSE_FPS}:d=${SECONDS}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    join(dir, 'take.mp4'),
  ]);
}, 180_000);

function master(): MasterTrack {
  return {
    assetId: 'song' as AssetId, title: 'Quiet', class: 'own',
    durationSamples: SONG,
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

function layer(over: Partial<SoundLayer> = {}): SoundLayer {
  return {
    id: 'snd_clap', assetId: 'clap' as AssetId, label: 'Applause',
    track: 'effect', fromSample: secondsToSamples(4),
    durationSamples: HOUSE_SAMPLE_RATE, createdAt: AT, ...over,
  };
}

function performance(): Performance {
  const p = newPerformance('A Performance', master(), AT);
  addTake(p, take());
  setScene(p, 0, { layoutId: 'performance_full', takeIds: ['take_one'] });
  return p;
}

/** Which fixture each asset id is, since they are not all one container. */
const FILE: Record<string, string> = { take: 'take.mp4' };

async function render(p: Performance, name: string): Promise<string> {
  const out = join(dir, `${name}.mp4`);
  await compose(buildPerformancePlan(p), {
    workDir: join(dir, `work-${name}`),
    outputPath: out,
    /* The take is a picture and the rest is sound, so they are not the
       same container — the first run of this file asked for take.webm
       and ffmpeg told the truth about it. */
    resolveAsset: (assetId) => join(dir, FILE[assetId] ?? `${assetId}.webm`),
    resolveStill: (id) => join(dir, `${id}.png`),
    masterAudioPath: join(dir, 'song.webm'),
  });
  return out;
}

/**
 * What the output measures over one second of itself.
 *
 * `measureSound` ANSWERS ZERO FOR SILENCE, which is a refusal and not a
 * level: `astats` prints `-inf` for a stretch with nothing in it and the
 * reading carries `windows: 0` to say so. Taken at face value the
 * refusal reads as the loudest second in the file, and the first run of
 * this test duly reported that the silence before the effect was louder
 * than the effect. Silence is the floor here, which is what it is.
 */
async function loudnessAt(path: string, second: number): Promise<number> {
  const slice = join(dir, `slice-${second}-${Math.random().toString(36).slice(2)}.wav`);
  await run(FFMPEG, [
    '-y', '-ss', String(second), '-t', '1', '-i', path,
    '-vn', '-c:a', 'pcm_s16le', slice,
  ]);
  const heard = await measureSound(slice);
  return heard.windows === 0 ? SILENT_FLOOR_DB : heard.rmsDb;
}

describe('a sound on the timeline', () => {
  it('is placed where the author put it, with no alignment at all', () => {
    const p = performance();
    addSound(p, layer());
    expect(p.sounds).toHaveLength(1);
    expect(soundOnSong(p.sounds![0]!, SONG)).toEqual({
      fromSample: secondsToSamples(4), toSample: secondsToSamples(5),
    });
  });

  it('refuses one with no name, no length, or past the end of the song', () => {
    const p = performance();
    expect(() => addSound(p, layer({ label: '  ' }))).toThrow(PerformanceEditError);
    expect(() => addSound(p, layer({ durationSamples: 0 }))).toThrow(/measured length/);
    expect(() => addSound(p, layer({ fromSample: SONG + 1 }))).toThrow(/past the end/);
    expect(p.sounds).toBeUndefined();
  });

  it('refuses two with the same id', () => {
    const p = performance();
    addSound(p, layer());
    expect(() => addSound(p, layer())).toThrow(/already a sound/);
  });

  it('moves along the song', () => {
    const p = performance();
    addSound(p, layer());
    moveSound(p, 'snd_clap', secondsToSamples(2));
    expect(p.sounds![0]!.fromSample).toBe(secondsToSamples(2));
    expect(() => moveSound(p, 'snd_clap', SONG + 1)).toThrow(/past the end/);
    expect(() => moveSound(p, 'snd_nothing', 0)).toThrow(/no sound/);
  });

  /*
   * ITS TRIM IS ON ITS OWN CLOCK, which is the opposite of a take's
   * and the difference is worth a test. A take is aligned to the song
   * so the clock the author looks at IS the song's; a sound effect has
   * no alignment, and "from half a second in" is a fact about the file.
   */
  it('trims on its own clock, not the song’s', () => {
    const p = performance();
    addSound(p, layer());
    trimSound(p, 'snd_clap', secondsToSamples(0.25), null);
    expect(soundSpan(p.sounds![0]!).length).toBe(secondsToSamples(0.75));
    /* It still starts where it was put; it is just shorter. */
    expect(soundOnSong(p.sounds![0]!, SONG)).toEqual({
      fromSample: secondsToSamples(4), toSample: secondsToSamples(4.75),
    });
  });

  /*
   * AND AT THE TAIL, WHICH IS A DIFFERENT MARK. A trim is two of them
   * and a test that only moves one proves half a feature — the head
   * mark moves where the file is read from, the tail mark moves how
   * long it is heard, and a version that dropped the tail entirely
   * passed everything else in this file.
   */
  it('trims the tail too, which shortens it where it sits', () => {
    const p = performance();
    addSound(p, layer());
    trimSound(p, 'snd_clap', null, secondsToSamples(0.5));
    expect(soundSpan(p.sounds![0]!).length).toBe(secondsToSamples(0.5));
    expect(soundOnSong(p.sounds![0]!, SONG)).toEqual({
      fromSample: secondsToSamples(4), toSample: secondsToSamples(4.5),
    });
  });

  /*
   * A LAYER CANNOT SIT PAST THE END OF THE SONG, and `addSound`
   * refuses to put one there — but the song is not immutable any more
   * [B6], and a layer placed at 03:00 of a four-minute song is past
   * the end of the two-minute song that replaces it. The clamp is what
   * keeps that document from planning a piece in a stretch of master
   * clock that does not exist.
   */
  it('is pinned inside the song, however the song later changes', () => {
    const late = layer({ fromSample: secondsToSamples(20) });
    expect(soundOnSong(late, SONG)).toEqual({ fromSample: SONG, toSample: SONG });
  });

  it('refuses a trim that leaves nothing', () => {
    const p = performance();
    addSound(p, layer());
    expect(() => trimSound(p, 'snd_clap', HOUSE_SAMPLE_RATE, HOUSE_SAMPLE_RATE))
      .toThrow(/leaves nothing/);
  });

  it('is taken off the timeline, and the field goes with the last one', () => {
    const p = performance();
    addSound(p, layer());
    removeSound(p, 'snd_clap');
    expect(p.sounds).toBeUndefined();
    expect(() => removeSound(p, 'snd_clap')).toThrow(/no sound/);
  });

  /* Four tracks, which differ in which lane they are drawn on and in
     nothing else: the mixer treats them identically. [U-18, B10a] */
  it('sits on a named track', () => {
    const p = performance();
    addSound(p, layer({ track: 'ambience' }));
    setSoundLayer(p, 'snd_clap', { track: 'voice' });
    expect(p.sounds![0]!.track).toBe('voice');
  });

  it('has a volume of its own, bounded like every other fader here', () => {
    const p = performance();
    addSound(p, layer());
    setSoundLayer(p, 'snd_clap', { gainDb: -6 });
    expect(p.sounds![0]!.gainDb).toBe(-6);
    expect(() => setSoundLayer(p, 'snd_clap', { gainDb: 40 })).toThrow(/24 dB/);
  });

  /*
   * A LOOPED LAYER RUNS TO THE END OF THE SONG — ten seconds of rain
   * under four minutes of music. Its own length says nothing about how
   * long it is heard for, which is the argument footage already makes.
   */
  it('runs to the end of the song when it loops', () => {
    const p = performance();
    addSound(p, layer({ track: 'ambience' }));
    setSoundLayer(p, 'snd_clap', { loop: true });
    expect(soundOnSong(p.sounds![0]!, SONG).toSample).toBe(SONG);
  });
});

describe('what the plan carries', () => {
  it('carries a piece for the layer, on its own', () => {
    const p = performance();
    addSound(p, layer());
    const pieces = (buildPerformancePlan(p).performanceAudio ?? [])
      .filter((piece) => piece.kind === 'sound');
    expect(pieces).toHaveLength(1);
    expect(pieces[0]!.fromSample).toBe(secondsToSamples(4));
    expect(pieces[0]!.toSample).toBe(secondsToSamples(5));
    expect(pieces[0]!.mediaFromSample).toBe(0);
  });

  it('leaves a muted layer out entirely', () => {
    const p = performance();
    addSound(p, layer());
    setSoundLayer(p, 'snd_clap', { muted: true });
    expect((buildPerformancePlan(p).performanceAudio ?? [])
      .filter((piece) => piece.kind === 'sound')).toHaveLength(0);
  });

  /*
   * CLIPPED TO THE WINDOW, and read from the right place. A clip of
   * the second half carries the effect that lands in the second half,
   * read from however far into itself the window cut.
   */
  it('clips to a clip, and reads from where the clip begins', () => {
    const p = performance();
    addSound(p, layer({ fromSample: secondsToSamples(3) }));
    const plan = buildPerformancePlan(p, {
      span: { fromSample: secondsToSamples(3.5), toSample: SONG },
    });
    const piece = (plan.performanceAudio ?? []).find((one) => one.kind === 'sound');
    expect(piece?.fromSample).toBe(0);
    expect(piece?.mediaFromSample).toBe(secondsToSamples(0.5));
  });

  /*
   * BOTH CUTS AT ONCE, which is the case the arithmetic can get wrong
   * while looking right on either one alone: a layer trimmed a quarter
   * of a second into itself, whose first half second on the song fell
   * outside the clip, is read from three quarters of a second in.
   */
  it('adds the clip’s cut to the layer’s own trim, not instead of it', () => {
    const p = performance();
    addSound(p, layer({ fromSample: secondsToSamples(3) }));
    trimSound(p, 'snd_clap', secondsToSamples(0.25), null);
    const plan = buildPerformancePlan(p, {
      span: { fromSample: secondsToSamples(3.5), toSample: SONG },
    });
    const piece = (plan.performanceAudio ?? []).find((one) => one.kind === 'sound');
    expect(piece?.mediaFromSample).toBe(secondsToSamples(0.75));
  });

  /* Its own fader reaches the mixer, or it is a control that stores a
     number and changes nothing. [B10a] */
  it('carries the layer’s own level, and carries none when there is none', () => {
    const plain = performance();
    addSound(plain, layer());
    expect((buildPerformancePlan(plain).performanceAudio ?? [])
      .find((one) => one.kind === 'sound')?.gainDb).toBeUndefined();

    const quiet = performance();
    addSound(quiet, layer());
    setSoundLayer(quiet, 'snd_clap', { gainDb: -6 });
    expect((buildPerformancePlan(quiet).performanceAudio ?? [])
      .find((one) => one.kind === 'sound')?.gainDb).toBe(-6);
  });

  it('leaves out a layer the clip does not reach', () => {
    const p = performance();
    addSound(p, layer({ fromSample: secondsToSamples(6) }));
    const plan = buildPerformancePlan(p, {
      span: { fromSample: 0, toSample: secondsToSamples(4) },
    });
    expect((plan.performanceAudio ?? []).filter((one) => one.kind === 'sound'))
      .toHaveLength(0);
  });

  /* A different set of layers is a different plan, or the cache serves
     a mix without the applause in it. [U-16] */
  it('changes the plan hash', () => {
    const plain = buildPerformancePlan(performance()).planHash;
    const withClap = performance();
    addSound(withClap, layer());
    expect(buildPerformancePlan(withClap).planHash).not.toBe(plain);
  });
});

describe('a render with a sound on it', () => {
  /*
   * THE ASSERTION THAT CANNOT BE MADE FROM A PLAN. The song is silent,
   * so anything measured in the output is the layer — and measuring
   * one second at a time says WHERE it is, not merely that it is.
   */
  it('is heard where it was put, and nowhere else', async () => {
    const p = performance();
    addSound(p, layer({ fromSample: secondsToSamples(4) }));
    const out = await render(p, 'clap');

    const before = await loudnessAt(out, 1);
    const during = await loudnessAt(out, 4);
    const after = await loudnessAt(out, 6);

    expect(during, `at 4s ${during}, at 1s ${before}`).toBeGreaterThan(before + 20);
    expect(during, `at 4s ${during}, at 6s ${after}`).toBeGreaterThan(after + 20);
  }, 300_000);

  it('is not heard at all when it is muted', async () => {
    const p = performance();
    addSound(p, layer({ fromSample: secondsToSamples(4) }));
    setSoundLayer(p, 'snd_clap', { muted: true });
    const out = await render(p, 'muted-clap');
    const during = await loudnessAt(out, 4);
    const before = await loudnessAt(out, 1);
    expect(Math.abs(during - before), `${before} vs ${during}`).toBeLessThan(6);
  }, 300_000);

  /* Ten seconds of rain under a four-minute song: the source is one
     second long and it is heard at both four seconds and six. */
  it('fills the song when it loops', async () => {
    const p = performance();
    addSound(p, layer({ track: 'ambience', fromSample: 0 }));
    setSoundLayer(p, 'snd_clap', { loop: true });
    const out = await render(p, 'rain');
    for (const second of [1, 4, 6]) {
      expect(await loudnessAt(out, second), `at ${second}s`).toBeGreaterThan(-45);
    }
  }, 300_000);
});

/**
 * WHAT THE WORKER DOES TO AN UPLOADED SOUND.  [TIMELINE B6h; U-02]
 *
 * The route writes the bytes down and the worker normalises and
 * COUNTS, and the count is what the timeline draws, the planner plans
 * and the trim marks are measured against. A source assertion can say
 * `decodeToAnalysis` is called; only running it can say the number it
 * produces is the length of the audio.
 */
describe('measuring an uploaded sound the way the worker does', () => {
  it('counts the samples that are there, whatever the container claimed', async () => {
    /* An mp3 at 44.1 kHz: a rate that is not the house rate, in a
       container whose header rounds, which is the ordinary case. */
    const source = join(dir, 'upload.mp3');
    await run(FFMPEG, [
      '-y', '-f', 'lavfi', '-i', 'sine=frequency=330:r=44100:d=2.5',
      '-c:a', 'libmp3lame', source,
    ]);

    const normalised = join(dir, 'upload-snd.webm');
    await normaliseMaster(source, normalised);
    const counted = await decodeToAnalysis(normalised, join(dir, 'upload.f32'));

    /* Two and a half seconds at the HOUSE rate, whatever it arrived
       at — a layer at 44.1 kHz mixed against a 48 kHz master drifts
       all the way through. Encoders pad the ends of an mp3, so this
       is to a twentieth of a second rather than to the sample. */
    expect(Math.abs(counted - secondsToSamples(2.5)))
      .toBeLessThan(HOUSE_SAMPLE_RATE / 20);
  }, 120_000);

  /* And it is audible where it is put, which is the whole point of
     having measured it: the length decides the width of the block,
     the stretch it is planned over and the clock a trim is on. */
  it('lands on the timeline at its measured length', async () => {
    const source = join(dir, 'upload2.mp3');
    await run(FFMPEG, [
      '-y', '-f', 'lavfi', '-i', 'sine=frequency=330:r=44100:d=1',
      '-c:a', 'libmp3lame', source,
    ]);
    const normalised = join(dir, 'upload2-snd.webm');
    await normaliseMaster(source, normalised);
    const counted = await decodeToAnalysis(normalised, join(dir, 'upload2.f32'));

    const p = performance();
    addSound(p, layer({
      id: 'snd_upload', assetId: 'upload2-snd' as AssetId,
      fromSample: secondsToSamples(4), durationSamples: counted,
    }));
    const piece = (buildPerformancePlan(p).performanceAudio ?? [])
      .find((one) => one.kind === 'sound');
    expect(piece?.toSample).toBe(secondsToSamples(4) + counted);
  }, 120_000);
});

/**
 * JOINING A RECORDING THAT HAS NO PICTURE.  [TIMELINE B6i; U-06]
 *
 * A voice-over comes from a microphone and nothing else. The joiner
 * every other recording in this product uses asks for a video stream
 * in the first line of its filtergraph, and ffmpeg's answer to that is
 * "Stream specifier ':v' matches no streams" — which is precisely what
 * the first browser run of this feature produced, after every source
 * assertion about it had passed. So this one runs ffmpeg.
 */
describe('joining a recorded sound', () => {
  it('joins audio-only segments into one file of the right length', async () => {
    /* Three segments, as a rolling recorder produces them. */
    const parts: string[] = [];
    for (const [index, frequency] of [220, 330, 440].entries()) {
      const part = join(dir, `part-${index}.webm`);
      await run(FFMPEG, [
        '-y', '-f', 'lavfi',
        '-i', `sine=frequency=${frequency}:r=48000:d=1`,
        '-c:a', 'libopus', '-vn', '-f', 'webm', part,
      ]);
      parts.push(part);
    }

    const joined = join(dir, 'joined.webm');
    await ingestSoundSegments(parts, joined);
    const counted = await decodeToAnalysis(joined, join(dir, 'joined.f32'));

    /*
     * THREE SECONDS, NOT ONE. The concat DEMUXER keeps only the first
     * segment of browser-captured media and says nothing about it; a
     * voice-over that lost everything after its first second would
     * look like a short recording. This assertion is the whole reason
     * the filter is used instead.
     */
    expect(Math.abs(counted - secondsToSamples(3)))
      .toBeLessThan(HOUSE_SAMPLE_RATE / 10);
  }, 120_000);

  it('refuses to assemble nothing rather than writing an empty file', async () => {
    await expect(ingestSoundSegments([], join(dir, 'nothing.webm')))
      .rejects.toThrow(/no segments/);
  });
});
