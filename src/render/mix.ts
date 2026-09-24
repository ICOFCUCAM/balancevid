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

import type { AudioPiece } from '../domain/performanceAudio.js';
import { HOUSE_SAMPLE_RATE } from '../domain/time.js';
import { ffmpeg, type RunOptions } from './ffmpeg.js';

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
    const steps = [
      `atrim=start=${seconds(piece.mediaFromSample)}`
      + `:end=${seconds(piece.mediaFromSample + length)}`,
      'asetpts=PTS-STARTPTS',
      // Every source is brought to the house rate before anything else
      // touches it: a 44.1 kHz take mixed against a 48 kHz song is the drift
      // INV-14 exists to refuse, arriving by the back door.
      `aresample=${HOUSE_SAMPLE_RATE}`,
    ];
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
    if (piece.kind !== 'take' || !piece.assetId) continue;
    if (inputOfAsset.has(piece.assetId)) continue;
    inputOfAsset.set(piece.assetId, inputs.length / 2);
    inputs.push('-i', resolveAsset(piece.assetId));
  }

  const graph = mixGraph(
    pieces,
    (piece) => (piece.kind === 'master' ? 0 : inputOfAsset.get(piece.assetId!)!),
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
