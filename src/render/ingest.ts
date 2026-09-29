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
import type { ColourReading } from '../domain/colour.js';

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

export interface IngestOptions extends RunOptions {
  /**
   * Treat `inputPath` as an ffmpeg concat list rather than a media file.
   *
   * A rolling pre-roll buffer cannot be a byte-level ring: MediaRecorder writes
   * its header into the first blob only, so dropping old bytes leaves clusters
   * no demuxer can read. The recorder therefore emits self-contained segments,
   * and they are joined here -- by ffmpeg, which can concatenate independent
   * WebM files, rather than by concatenating buffers. [U-04, U-06]
   */
  concatList?: boolean;
  /** Which file to probe for stream presence when the input is a list. */
  probePath?: string;
}

export async function ingest(
  inputPath: string,
  mezzaninePath: string,
  opts: IngestOptions = {},
): Promise<IngestResult> {
  const source = await probe(opts.probePath ?? inputPath);
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
  if (opts.concatList) args.push('-f', 'concat', '-safe', '0');
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
 * What this take's picture measures.  [MASTER-EDIT §8, U-02]
 *
 * THE SAME SHAPE AS `measureLoudness` AND FOR THE SAME REASON. A colour
 * match without a measurement is a slider, and a slider is the author doing
 * by eye what the product can do by arithmetic — which is exactly what U-02
 * says not to ship. `signalstats` reports per-plane averages and deciles;
 * the domain turns two readings into a grade and never looks at a file.
 *
 * SAMPLED, NOT SCANNED. A four-minute take at thirty a second is seven
 * thousand frames, and the numbers that matter — average brightness, the
 * spread, the cast — are the same from thirty well-spread frames as from
 * all of them. `fps=1/N` walks the whole take rather than the first few
 * seconds, which matters because the first few seconds of a performance
 * take are somebody walking back from the camera.
 *
 * It returns `frames: 0` rather than throwing when there is no picture to
 * measure: a take with no video is a legal document in this product
 * (footage can be audio-only), and the domain already treats an unmeasured
 * reading as "not asked" rather than as "no difference". ffmpeg REFUSES a
 * video filter chain on a file with no video rather than producing an empty
 * one, so that case arrives as a non-zero exit and is caught here.
 */
export async function measureColour(
  path: string, durationSeconds = 0,
): Promise<ColourReading> {
  /* One frame every few seconds, and never fewer than one a minute. */
  const every = Math.max(1, Math.round(durationSeconds / 30) || 1);
  /*
   * STDOUT, NOT STDERR, and this is the whole reason the render test for
   * this exists. `metadata=print:file=-` means the FILE named `-`, which is
   * stdout; everything else ffmpeg says goes to stderr, so reading stderr
   * returns a perfectly well-formed log with no measurements in it and the
   * parser answers "nothing was measured". Which is a legal answer, so
   * nothing throws, and the match silently never happens.
   */
  let stdout: string;
  try {
    ({ stdout } = await ffmpegCapture([
      '-i', path,
      '-vf', `fps=1/${every},signalstats,metadata=print:file=-`,
      '-an', '-f', 'null', '-',
    ]));
  } catch (error) {
    /*
     * NARROW, BECAUSE THE FIRST VERSION WAS NOT AND IT COST AN HOUR. A bare
     * `.catch(() => '')` turns every failure — a missing file, a codec this
     * build cannot open, a binary that would not spawn — into "nothing was
     * measured", which is a legal answer, so nothing throws and the match
     * silently never happens. The caller then says "both takes have to be
     * measured" about two takes it just measured.
     *
     * The one failure that IS "nothing to measure" is a file with no video
     * in it, which ffmpeg refuses by name. Everything else is a fault and
     * is thrown, so the route can say what went wrong.
     */
    const said = error instanceof Error ? error.message : '';
    if (/does not contain any stream|Output file is empty/i.test(said)) {
      return { y: 0, ySpread: 0, u: 128, v: 128, saturation: 0, frames: 0 };
    }
    throw error;
  }
  return parseSignalstats(stdout);
}

/**
 * The averages over every frame `signalstats` printed.
 *
 * AVERAGED HERE RATHER THAN BY `signalstats`, which reports per frame and
 * has no notion of a whole take. A median would be more robust to one
 * blown-out frame and needs every sample held; at thirty samples the mean
 * is within a hair of it and the arithmetic is one line.
 */
export function parseSignalstats(text: string): ColourReading {
  const sums = { y: 0, yLow: 0, yHigh: 0, u: 0, v: 0, saturation: 0 };
  let frames = 0;
  let current: Partial<Record<keyof typeof sums | 'seen', number>> = {};
  const push = () => {
    if (current['seen'] === undefined) return;
    frames += 1;
    for (const key of Object.keys(sums) as (keyof typeof sums)[]) {
      sums[key] += current[key] ?? 0;
    }
    current = {};
  };
  for (const line of text.split('\n')) {
    if (/^frame:/.test(line)) { push(); continue; }
    const found = /lavfi\.signalstats\.([A-Z]+)=(-?[\d.]+)/.exec(line);
    if (!found) continue;
    const value = Number(found[2]);
    switch (found[1]) {
      case 'YAVG': current.y = value; current['seen'] = 1; break;
      case 'YLOW': current.yLow = value; break;
      case 'YHIGH': current.yHigh = value; break;
      case 'UAVG': current.u = value; break;
      case 'VAVG': current.v = value; break;
      case 'SATAVG': current.saturation = value; break;
      default: break;
    }
  }
  push();
  if (frames === 0) {
    return { y: 0, ySpread: 0, u: 128, v: 128, saturation: 0, frames: 0 };
  }
  const mean = (total: number) => Math.round((total / frames) * 100) / 100;
  return {
    y: mean(sums.y),
    ySpread: Math.max(0, mean(sums.yHigh) - mean(sums.yLow)),
    u: mean(sums.u),
    v: mean(sums.v),
    saturation: mean(sums.saturation),
    frames,
  };
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

/**
 * Full loudnorm measurement, for a two-pass master.  [Doctrine U-17 §4, INV-11]
 *
 * Single-pass loudnorm is a dynamic estimator: it lands roughly a decibel off
 * the target and can overshoot true peak. The doctrine sets +-0.5 LU and a
 * hard -1 dBTP ceiling, which only the measure-then-apply pass reaches. This
 * is the difference between an export that sounds mastered and one that makes
 * the audience reach for the volume control.
 */
export interface LoudnormMeasurement {
  measuredI: number;
  measuredTp: number;
  measuredLra: number;
  measuredThresh: number;
  offset: number;
}

export async function measureLoudnorm(
  path: string, targetLufs: number, truePeakDb: number, lra = 11,
): Promise<LoudnormMeasurement | null> {
  const { stderr } = await ffmpegCapture([
    '-i', path,
    '-af', `loudnorm=I=${targetLufs}:TP=${truePeakDb}:LRA=${lra}:print_format=json`,
    '-f', 'null', '-',
  ]);
  const match = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!match) return null;
  try {
    const json = JSON.parse(match[0]) as Record<string, string>;
    const num = (key: string): number => Number(json[key]);
    const measurement: LoudnormMeasurement = {
      measuredI: num('input_i'),
      measuredTp: num('input_tp'),
      measuredLra: num('input_lra'),
      measuredThresh: num('input_thresh'),
      offset: num('target_offset'),
    };
    // A silent or near-silent track measures as -inf and cannot be normalised
    // meaningfully; falling back to the single pass is correct there.
    return Object.values(measurement).every(Number.isFinite) ? measurement : null;
  } catch {
    return null;
  }
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

/**
 * The editing proxy.  [Doctrine D-14 "client-side preview, server-side final"]
 *
 * The editor does not scrub the mezzanine. It scrubs a small, widely decodable
 * proxy: faster to load, cheaper to seek, and free of the codec-licensing
 * variation that decides whether a given browser can play H.264 at all.
 *
 * The proxy MUST have the same frame count and frame rate as the mezzanine.
 * The user chooses their interrupt frame by looking at the proxy, and the
 * renderer cuts the mezzanine; if the two disagreed about which frame is frame
 * N, frame-exactness would be true of the file and false of the experience.
 * That parity is asserted, not assumed.
 */
export const PROXY = {
  maxWidth: 854,
  videoCodec: 'libvpx',
  audioCodec: 'libopus',
  videoBitrate: '1200k',
  audioBitrate: '96k',
} as const;

export async function makeProxy(
  mezzaninePath: string, proxyPath: string, opts: RunOptions = {},
): Promise<MediaInfo> {
  await mkdir(dirname(proxyPath), { recursive: true });
  await ffmpeg([
    '-i', mezzaninePath,
    '-vf', `scale='min(${PROXY.maxWidth},iw)':-2:flags=bicubic,fps=${HOUSE.fps}`,
    '-fps_mode', 'passthrough',
    '-c:v', PROXY.videoCodec, '-b:v', PROXY.videoBitrate,
    '-deadline', 'realtime', '-cpu-used', '8',
    '-g', String(HOUSE.fps * HOUSE.gopSeconds), '-keyint_min', String(HOUSE.fps * HOUSE.gopSeconds),
    '-c:a', PROXY.audioCodec, '-b:a', PROXY.audioBitrate, '-ar', String(HOUSE.audioSampleRate),
    proxyPath,
  ], opts);

  const info = await probe(proxyPath);
  return info;
}

/**
 * Assemble captured segments into one house-format take.
 *
 * The concat DEMUXER cannot be used here. MediaRecorder writes each segment
 * with its own timeline starting at zero and no reliable duration, so the
 * demuxer computes the wrong offsets and silently keeps only the first
 * segment -- a response that loses everything after its first few seconds.
 *
 * The concat FILTER decodes each input and joins the frames, ignoring
 * container timing entirely. It re-encodes, which ingest does anyway.
 */
export async function ingestSegments(
  segmentPaths: string[], mezzaninePath: string, opts: RunOptions = {},
): Promise<IngestResult> {
  if (segmentPaths.length === 0) throw new Error('no segments to assemble');
  const first = await probe(segmentPaths[0]!);
  await mkdir(dirname(mezzaninePath), { recursive: true });

  const width = first.width || 1280;
  const height = first.height || 720;
  const hasAudio = first.hasAudio;

  const args: string[] = [];
  for (const path of segmentPaths) args.push('-i', path);
  if (!hasAudio) {
    args.push('-f', 'lavfi', '-i', `anullsrc=channel_layout=stereo:sample_rate=${HOUSE.audioSampleRate}`);
  }

  const chains: string[] = [];
  const labels: string[] = [];
  segmentPaths.forEach((_, i) => {
    chains.push(
      `[${i}:v]fps=${HOUSE.fps},scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,format=${HOUSE.pixelFormat},setsar=1[v${i}]`,
    );
    if (hasAudio) {
      chains.push(
        `[${i}:a]aresample=${HOUSE.audioSampleRate},aformat=channel_layouts=stereo,asetpts=N/SR/TB[a${i}]`,
      );
      labels.push(`[v${i}][a${i}]`);
    } else {
      labels.push(`[v${i}]`);
    }
  });
  chains.push(
    `${labels.join('')}concat=n=${segmentPaths.length}:v=1:a=${hasAudio ? 1 : 0}` +
    `[vout]${hasAudio ? '[aout]' : ''}`,
  );

  const gop = String(HOUSE.fps * HOUSE.gopSeconds);
  args.push(
    '-filter_complex', chains.join(';'),
    '-map', '[vout]',
    '-map', hasAudio ? '[aout]' : `${segmentPaths.length}:a`,
    '-fps_mode', 'cfr', '-r', String(HOUSE.fps),
    '-c:v', HOUSE.videoCodec, '-profile:v', HOUSE.videoProfile,
    '-preset', HOUSE.preset, '-crf', String(HOUSE.crf),
    '-g', gop, '-keyint_min', gop, '-sc_threshold', '0',
    '-c:a', HOUSE.audioCodec, '-ar', String(HOUSE.audioSampleRate),
    '-ac', String(HOUSE.audioChannels), '-b:a', HOUSE.audioBitrate,
    '-movflags', '+faststart',
    '-shortest',
    mezzaninePath,
  );

  await ffmpeg(args, opts);
  const info = await probe(mezzaninePath);
  return { mezzaninePath, info, synthesisedVideo: false, synthesisedAudio: !hasAudio };
}
