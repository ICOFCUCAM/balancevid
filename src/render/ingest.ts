/**
 * Ingest normalisation.  [Doctrine U-02, INV-04]
 *
 * "No asset -- source or response -- enters the timeline until it has been
 * normalised to the house format."
 *
 * Real uploads carry variable frame rate, rotation metadata, odd pixel formats,
 * and missing or multi-channel audio. Concatenating that material produces
 * drifting audio, frozen frames, and green flashes at every cut. This module is
 * the precondition for every promise the doctrine makes about precision.
 *
 * The original is never modified and never read by a render. It is the user's
 * property and the evidence of authenticity; the mezzanine is what the render
 * engine is permitted to touch.
 */

import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { HOUSE_FPS } from '../domain/time.js';
import { ffmpeg, ffmpegCapture, type RunOptions } from './ffmpeg.js';
import { probe, type MediaInfo } from './probe.js';

/** The house format. One shape, so concat never has to reconcile two. */
export const HOUSE = {
  fps: HOUSE_FPS,
  /** Keyframe every second: a cut is at worst 30 frames from one. [U-07 §2] */
  gopSeconds: 1,
  pixelFormat: 'yuv420p',
  videoCodec: 'libx264',
  videoProfile: 'high',
  crf: 18,
  preset: 'veryfast',
  audioCodec: 'aac',
  audioSampleRate: 48_000,
  audioChannels: 2,
  audioBitrate: '192k',
  /** Audio-only takes get a black video track so every shot has both streams. */
  silentVideoSize: '1280x720',
} as const;

export interface IngestResult {
  mezzaninePath: string;
  info: MediaInfo;
  /** What we had to synthesise, so the UI can tell the user the truth. */
  synthesisedVideo: boolean;
  synthesisedAudio: boolean;
}

export async function ingest(
  inputPath: string,
  mezzaninePath: string,
  opts: RunOptions = {},
): Promise<IngestResult> {
  const source = await probe(inputPath);
  await mkdir(dirname(mezzaninePath), { recursive: true });

  const gop = String(HOUSE.fps * HOUSE.gopSeconds);
  const args: string[] = [];

  // A missing stream is synthesised rather than rejected: a voice-only response
  // is a first-class way to respond (§8), and it still has to concat.
  if (!source.hasVideo) {
    args.push('-f', 'lavfi', '-i', `color=c=black:s=${HOUSE.silentVideoSize}:r=${HOUSE.fps}`);
  }
  if (!source.hasAudio) {
    args.push('-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=${HOUSE.audioSampleRate}`);
  }
  args.push('-i', inputPath);

  const realIndex = (!source.hasVideo ? 1 : 0) + (!source.hasAudio ? 1 : 0);
  const videoIn = source.hasVideo ? `${realIndex}:v:0` : '0:v:0';
  const audioIn = source.hasAudio ? `${realIndex}:a:0` : (source.hasVideo ? '0:a:0' : '1:a:0');

  args.push('-map', videoIn, '-map', audioIn);

  // Constant frame rate is the whole point: VFR WebM from MediaRecorder is the
  // single most common cause of a broken concat.
  args.push(
    '-vf', `fps=${HOUSE.fps},format=${HOUSE.pixelFormat}`,
    '-c:v', HOUSE.videoCodec,
    '-profile:v', HOUSE.videoProfile,
    '-preset', HOUSE.preset,
    '-crf', String(HOUSE.crf),
    '-g', gop, '-keyint_min', gop,
    // Closed GOP: every keyframe is a legal cut point.
    '-sc_threshold', '0',
    '-x264-params', `keyint=${gop}:min-keyint=${gop}:scenecut=0:open-gop=0`,
    '-c:a', HOUSE.audioCodec,
    '-ar', String(HOUSE.audioSampleRate),
    '-ac', String(HOUSE.audioChannels),
    '-b:a', HOUSE.audioBitrate,
    // Bake rotation in rather than carrying metadata a compositor may ignore.
    '-metadata:s:v:0', 'rotate=0',
    '-movflags', '+faststart',
    '-shortest',
    mezzaninePath,
  );

  await ffmpeg(args, opts);

  // Re-probe the RESULT. The mezzanine's duration is the one the timeline uses,
  // and it is measured, never assumed. [U-02]
  const info = await probe(mezzaninePath);
  return {
    mezzaninePath,
    info,
    synthesisedVideo: !source.hasVideo,
    synthesisedAudio: !source.hasAudio,
  };
}

/**
 * Integrated loudness of an asset, for per-speaker matching.  [Doctrine U-17 §3]
 *
 * Measured once per asset and cached. This is the number that stops the source
 * being loud and the commentary being quiet -- the single highest-leverage
 * quality decision in the doctrine.
 */
export async function measureLoudness(path: string): Promise<{ inputI: number; inputTp: number }> {
  const { stderr } = await ffmpegCapture([
    '-i', path, '-af', 'loudnorm=print_format=json', '-f', 'null', '-',
  ]);
  return parseLoudnorm(stderr);
}

/**
 * The gain that brings an asset to the common reference before any ducking
 * decision is made.  [Doctrine U-17 §3]
 *
 * Silence measures as -inf (or near it); applying a huge gain to it would
 * amplify only the noise floor, so it is left alone.
 */
export const SPEAKER_REFERENCE_LUFS = -16;

export function matchGainDb(measuredLufs: number, reference = SPEAKER_REFERENCE_LUFS): number {
  if (!Number.isFinite(measuredLufs) || measuredLufs < -70) return 0;
  return Math.max(-24, Math.min(24, reference - measuredLufs));
}

export function parseLoudnorm(stderr: string): { inputI: number; inputTp: number } {
  const match = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!match) return { inputI: -23, inputTp: -1 };
  try {
    const json = JSON.parse(match[0]) as Record<string, string>;
    const i = Number(json['input_i']);
    const tp = Number(json['input_tp']);
    return {
      inputI: Number.isFinite(i) ? i : -23,
      inputTp: Number.isFinite(tp) ? tp : -1,
    };
  } catch {
    return { inputI: -23, inputTp: -1 };
  }
}
