/**
 * The song, the microphones, and where each of them is audible.
 * [Doctrine STUDIO-TWO §9, S-7, U-17, INV-11]
 *
 * One pass that turns `planPerformanceAudio`'s pieces into a single continuous
 * track, laid under a picture that cuts as often as the author likes.
 *
 * WHY IT IS ITS OWN FILE, and its own ffmpeg pass. A Conversation's shots each
 * carry their own sound because the sound IS the cut. A Performance's sound
 * does not cut at all — mixing it inside the shot renderer would mean slicing
 * it at video-frame boundaries and re-joining it, which is a click at every
 * cut. So the picture is concatenated first, the sound is built here in one
 * piece, and the two meet once, at the master pass.
 *
 * MIXED WITHOUT NORMALISATION. `amix` divides by the number of inputs unless
 * told otherwise, which would make the song quieter the moment a vocal came in
 * and louder again when it stopped — a fader nobody touched. Levels are left
 * where they were recorded and the whole mix is mastered once at the end
 * (U-17, INV-11), which is the same order a mastering engineer works in.
 */

import { join } from 'node:path';

import { audioEffect } from '../domain/audioEffect.js';
import type { AudioPiece } from '../domain/performanceAudio.js';
import { HOUSE_SAMPLE_RATE } from '../domain/time.js';
import { ffmpeg, type RunOptions } from './ffmpeg.js';
import { cleanupFor } from '../domain/cleanup.js';

const seconds = (samples: number): string => (samples / HOUSE_SAMPLE_RATE).toFixed(6);

/**
 * The filter graph, as a string, so the hard part is testable without ffmpeg.
 *
 * `inputOf` says which ffmpeg input a piece's audio comes from: the song, or
 * one take's mezzanine. Everything else here is arithmetic on the master
 * clock, which INV-14 made exact.
 */
export function mixGraph(
  pieces: AudioPiece[], inputOf: (piece: AudioPiece) => number, totalSamples: number,
): string {
  const whole = seconds(totalSamples);
  if (pieces.length === 0) {
    // A performance with nothing audible anywhere is a legal document — Mode B
    // over takes recorded silent — and it renders as silence rather than as an
    // error, because the picture is still the author's work.
    return `anullsrc=r=${HOUSE_SAMPLE_RATE}:cl=stereo,atrim=end=${whole},`
      + 'asetpts=PTS-STARTPTS[aout]';
  }

  const chains: string[] = [];
  const labels: string[] = [];
  pieces.forEach((piece, index) => {
    const label = `ap${index}`;
    labels.push(`[${label}]`);
    const length = piece.toSample - piece.fromSample;
    /*
     * A take whose clock differs from the song's is READ for longer (or
     * shorter) than the piece lasts and then played at that speed, exactly as
     * its picture is. `atempo` changes the speed without changing the pitch,
     * which at a few parts per million is inaudible either way and is the
     * right thing to mean. [§10, S-3, INV-14]
     */
    const ratio = piece.rateRatio ?? 1;
    const source = Math.round(length * ratio);
    const steps = [
      /*
       * A LOOPED LAYER IS READ ROUND AND ROUND.  [TIMELINE B8, S-29]
       *
       * Ten seconds of rain under a four-minute song: `aloop` with
       * `-1` repeats the whole input for as long as anything asks it
       * for samples, and the `atrim` below then takes the stretch the
       * piece actually covers. Before the trim, or the trim would cut
       * the first pass and loop nothing.
       */
      ...(piece.loop ? ['aloop=loop=-1:size=2147483647'] : []),
      `atrim=start=${seconds(piece.mediaFromSample)}`
      + `:end=${seconds(piece.mediaFromSample + source)}`,
      'asetpts=PTS-STARTPTS',
      // Every source is brought to the house rate before anything else
      // touches it: a 44.1 kHz take mixed against a 48 kHz song is the drift
      // INV-14 exists to refuse, arriving by the back door.
      `aresample=${HOUSE_SAMPLE_RATE}`,
      ...(ratio === 1 ? [] : [`atempo=${ratio.toFixed(9)}`]),
      /*
       * THE ROOM, DEALT WITH BEFORE ANYTHING ELSE IS.  [MASTER-EDIT §8]
       *
       * Here rather than after the mix, because the noise belongs to ONE
       * microphone: denoising the sum would mean an FFT denoiser deciding
       * which parts of the song are the fan. And after `aresample`, because
       * `highpass=f=90` means ninety hertz of the house rate and not of
       * whatever rate the phone recorded at.
       *
       * Only a take, never the master, and the plan is what says which —
       * `planPerformanceAudio` sets this field on take pieces alone.
       */
      ...(cleanupFor(piece.cleanup)?.stages ?? []),
    ];
    /*
     * THE SONG'S OWN LEVEL.  [TIMELINE B6e, B6f]
     *
     * BEFORE THE FADES, deliberately: a fade is a ramp to silence and
     * a gain applied after one would scale the ramp itself, so a
     * faded-out song at -6 dB would end at -6 dB instead of at
     * nothing. Volume is what the piece IS; a fade is what happens to
     * it at the edges.
     *
     * Mute arrives here as a gain of -120 dB rather than as a missing
     * piece, because the song is the clock and a clock that vanishes
     * takes the video's length with it. [INV-03]
     */
    /*
     * WHAT IT IS MADE TO SOUND LIKE, BEFORE THE FADER AND THE FADES.
     *   [TIMELINE B6j]
     *
     * An effect is what the sound IS; the fader is how loud that is,
     * and a fade is what happens to it at the edges. Putting the
     * effect after the fader would mean a radio treatment that lifts
     * 2 dB quietly undoing a cut the author made; putting it after a
     * fade-out would let an echo ring on after the silence the fade
     * arrived at, which is the one thing a fade is for.
     */
    for (const stage of audioEffect(piece.effect)?.stages() ?? []) {
      steps.push(stage);
    }
    if (piece.gainDb !== undefined && piece.gainDb !== 0) {
      steps.push(`volume=${piece.gainDb.toFixed(3)}dB`);
    }
    if (piece.fadeInSamples > 0) {
      steps.push(`afade=t=in:st=0:d=${seconds(piece.fadeInSamples)}`);
    }
    if (piece.fadeOutSamples > 0) {
      steps.push(
        `afade=t=out:st=${seconds(length - piece.fadeOutSamples)}`
        + `:d=${seconds(piece.fadeOutSamples)}`);
    }
    if (piece.fromSample > 0) {
      // `all=1` or only the first channel is delayed, which is a stereo image
      // that walks to one side. Whole milliseconds because that is adelay's
      // unit; the fade covers the sub-millisecond remainder.
      steps.push(`adelay=${Math.round(piece.fromSample / HOUSE_SAMPLE_RATE * 1000)}:all=1`);
    }
    chains.push(`[${inputOf(piece)}:a]${steps.join(',')}[${label}]`);
  });

  const mixed = pieces.length === 1 ? labels[0]!.slice(1, -1) : 'amixed';
  if (pieces.length > 1) {
    chains.push(
      `${labels.join('')}amix=inputs=${pieces.length}:normalize=0`
      // Without this, amix raises the remaining inputs as others end — which
      // is the song getting louder every time a vocal stops.
      + ':dropout_transition=0[amixed]');
  }
  /*
   * Padded to the song and then cut to it. The picture is exactly as long as
   * the song (INV-03), and audio that stops early is a video that ends in
   * silence nobody asked for.
   */
  chains.push(
    `[${mixed}]apad=whole_dur=${whole},atrim=end=${whole},asetpts=PTS-STARTPTS[aout]`);
  return chains.join(';');
}

/**
 * Build the mix as a file.
 *
 * Written out rather than piped into the master pass so it can be MEASURED:
 * EBU R128 mastering is two-pass, and the thing to measure is the mix, not the
 * song on its own. [U-17 §4, INV-11]
 */
export async function mixPerformanceAudio(options: {
  pieces: AudioPiece[];
  masterAudioPath: string;
  resolveAsset: (assetId: string) => string;
  totalSamples: number;
  workDir: string;
  planHash: string;
  run?: RunOptions;
}): Promise<string> {
  const { pieces, masterAudioPath, resolveAsset, totalSamples, workDir, planHash } = options;
  const outPath = join(workDir, `${planHash}.mix.flac`);

  const inputs: string[] = ['-i', masterAudioPath];
  const inputOfAsset = new Map<string, number>();
  for (const piece of pieces) {
    /*
     * A layer is a source like a take is: its own file, its own
     * input, resolved the same way. [TIMELINE B8]
     *
     * AND SO IS A REPLACED STRETCH OF THE SONG, which is a master
     * piece with an asset on it: the test is whether the piece names
     * a file, not what kind of piece it is. Asking the kind was how
     * the first version sent a re-recorded bridge to input 0 and
     * played the original over it. [B6g]
     */
    if (!piece.assetId) continue;
    if (inputOfAsset.has(piece.assetId)) continue;
    inputOfAsset.set(piece.assetId, inputs.length / 2);
    inputs.push('-i', resolveAsset(piece.assetId));
  }

  const graph = mixGraph(
    pieces,
    (piece) => (piece.assetId ? inputOfAsset.get(piece.assetId)! : 0),
    totalSamples,
  );

  await ffmpeg([
    '-y', ...inputs,
    '-filter_complex', graph,
    '-map', '[aout]',
    '-vn',
    // Lossless into the master pass: the one encode is the final one.
    '-c:a', 'flac', '-ar', String(HOUSE_SAMPLE_RATE), '-ac', '2',
    outPath,
  ], options.run);

  return outPath;
}
