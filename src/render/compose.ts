/**
 * The compositor: render plan -> MP4.  [Doctrine U-16, U-17, U-18, U-23]
 *
 *   render(plan, assets) -> bytes
 *
 * Shots are content-addressed and cached, so editing one response re-renders
 * one shot. That speed is what makes users iterate, and iteration is what makes
 * the output polished.
 *
 * Three passes:
 *   1. per-shot composite (cached by shot.hash)
 *   2. concat, stream copy -- no re-encode, no generation loss
 *   3. master: burn-in text and loudness-normalise
 */

import { mkdir, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import type { AssetId } from '../domain/document.js';
import type { RenderPlan, ResponseShot, Shot, SourceShot } from '../domain/plan.js';
import { LAYOUTS, type Rect } from '../domain/presentation.js';
import type { Frames } from '../domain/time.js';
import { ffmpeg, type RunOptions } from './ffmpeg.js';
import { HOUSE, matchGainDb, measureLoudness, measureLoudnorm } from './ingest.js';
import { buildAss, buildSrt, buildVtt, type Cue } from './subtitles.js';
import { probeFrameCount } from './probe.js';
import { InvariantViolation } from '../domain/invariants.js';

export interface ComposeOptions extends RunOptions {
  /** Scratch directory. Holds the shot cache, so keep it between renders. */
  workDir: string;
  outputPath: string;
  resolveAsset: (assetId: AssetId) => string;
  cues?: Cue[];
}

export interface ComposeResult {
  outputPath: string;
  assPath: string;
  srtPath: string;
  vttPath: string;
  planHash: string;
  shotsRendered: number;
  shotsCached: number;
  totalOutputFrames: Frames;
}

export async function compose(plan: RenderPlan, options: ComposeOptions): Promise<ComposeResult> {
  const { workDir, outputPath, resolveAsset } = options;
  const shotsDir = join(workDir, 'shots');
  const stillsDir = join(workDir, 'stills');
  await mkdir(shotsDir, { recursive: true });
  await mkdir(stillsDir, { recursive: true });

  // --- Pass 0: per-speaker loudness -----------------------------------------
  // Measured once per asset, before any ducking decision. [U-17 §3]
  const gains = new Map<AssetId, number>();
  for (const assetId of distinctAssets(plan.shots)) {
    const { inputI } = await measureLoudness(resolveAsset(assetId));
    gains.set(assetId, matchGainDb(inputI));
  }

  // --- Pass 1: shots --------------------------------------------------------
  let shotsRendered = 0;
  let shotsCached = 0;
  const shotPaths: string[] = [];

  for (const shot of plan.shots) {
    const path = join(shotsDir, `${shot.hash}.mp4`);
    shotPaths.push(path);
    if (await exists(path)) { shotsCached++; continue; }
    if (shot.kind === 'source') {
      await renderSourceShot(shot, plan, path, resolveAsset, gains, options);
    } else {
      await renderResponseShot(shot, plan, path, stillsDir, resolveAsset, gains, options);
    }
    shotsRendered++;
  }

  // --- Pass 2: concat -------------------------------------------------------
  const listPath = join(workDir, `${plan.planHash}.concat.txt`);
  await writeFile(listPath, shotPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const bodyPath = join(workDir, `${plan.planHash}.body.mp4`);
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-movflags', '+faststart', bodyPath], options);

  // --- Pass 3: master -------------------------------------------------------
  const assPath = join(workDir, `${plan.planHash}.ass`);
  await writeFile(assPath, buildAss(plan, { cues: options.cues ?? [] }));

  // Pass 3a: measure, so pass 3b can hit the target rather than approach it.
  //
  // loudnorm's limiter treats its TP argument as a goal, not a wall, and lands
  // a few hundredths above it. The doctrine's -1 dBTP is a ceiling the
  // delivered file must be under, so we ask for headroom below it. This is
  // what a mastering engineer does with a limiter, and for the same reason.
  const TP_HEADROOM_DB = 0.3;
  const askTruePeak = plan.audio.truePeakDb - TP_HEADROOM_DB;
  const measurement = await measureLoudnorm(
    bodyPath, plan.audio.loudnessLufs, askTruePeak);
  const loudnorm = measurement
    ? `loudnorm=I=${plan.audio.loudnessLufs}:TP=${askTruePeak}:LRA=11` +
      `:measured_I=${measurement.measuredI}:measured_TP=${measurement.measuredTp}` +
      `:measured_LRA=${measurement.measuredLra}:measured_thresh=${measurement.measuredThresh}` +
      `:offset=${measurement.offset}:linear=true:print_format=summary`
    : `loudnorm=I=${plan.audio.loudnessLufs}:TP=${askTruePeak}:LRA=11`;

  const master: string[] = ['-i', bodyPath];
  if (plan.captions.burnIn) {
    master.push(
      // setpts rewrites each frame's timestamp from its own index, producing
      // perfect CFR without resampling. Asking ffmpeg to convert to CFR
      // instead makes it duplicate a frame wherever a concat boundary leaves a
      // ragged timestamp -- and a duplicated frame is a violated INV-02.
      '-vf', `ass=${escapeFilterPath(assPath)},setpts=N/FRAME_RATE/TB`,
      '-fps_mode', 'passthrough',
      '-c:v', HOUSE.videoCodec, '-profile:v', HOUSE.videoProfile,
      '-preset', HOUSE.preset, '-crf', String(HOUSE.crf),
      '-pix_fmt', HOUSE.pixelFormat,
      '-frames:v', String(plan.totalOutputFrames),
    );
  } else {
    // No text to draw means no reason to re-encode the picture at all, so the
    // shot cache pays off in full.
    master.push('-c:v', 'copy');
  }
  master.push(
    // EBU R128 master, two-pass. INV-11 checks the result. [U-17 §4]
    '-af', loudnorm,
    '-c:a', HOUSE.audioCodec, '-ar', String(HOUSE.audioSampleRate),
    '-ac', String(HOUSE.audioChannels), '-b:a', HOUSE.audioBitrate,
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    outputPath,
  );
  await ffmpeg(master, options);

  // --- INV-03, verified on the artefact itself -----------------------------
  // A render that silently disagrees with its plan is the failure mode this
  // whole architecture exists to prevent, so the renderer checks its own work.
  const actualFrames = await probeFrameCount(outputPath);
  if (Number.isFinite(actualFrames) && actualFrames !== plan.totalOutputFrames) {
    throw new InvariantViolation(
      'INV-03',
      `rendered ${actualFrames} frames, plan says ${plan.totalOutputFrames}`,
    );
  }

  const cues = options.cues ?? [];
  const srtPath = `${outputPath}.srt`;
  const vttPath = `${outputPath}.vtt`;
  await writeFile(srtPath, buildSrt(cues, plan.exportProfile.fps));
  await writeFile(vttPath, buildVtt(cues, plan.exportProfile.fps));

  return {
    outputPath, assPath, srtPath, vttPath,
    planHash: plan.planHash,
    shotsRendered, shotsCached,
    totalOutputFrames: plan.totalOutputFrames,
  };
}

// ---------------------------------------------------------------------------

async function renderSourceShot(
  shot: SourceShot, plan: RenderPlan, outPath: string,
  resolveAsset: (id: AssetId) => string, gains: Map<AssetId, number>, opts: RunOptions,
): Promise<void> {
  const { fps } = plan.exportProfile;
  const input = resolveAsset(shot.assetId);
  const n = shot.durationFrames;

  await ffmpeg([
    // Accurate seek: decode from the preceding keyframe and discard, so the
    // first frame out is exactly the frame asked for. [U-07 §2]
    '-accurate_seek', '-ss', frameSeconds(shot.sourceInFrame, fps),
    '-i', input,
    '-vf', `${fitFilter('cover', plan.exportProfile.width, plan.exportProfile.height)},fps=${fps}`,
    '-af', audioFilter(gains.get(shot.assetId) ?? 0, n, fps),
    // -frames:v is what makes the shot exactly N frames long, which is what
    // makes Σ(shots) == the planned duration (INV-03).
    '-frames:v', String(n),
    ...encodeArgs(),
    outPath,
  ], opts);
}

async function renderResponseShot(
  shot: ResponseShot, plan: RenderPlan, outPath: string, stillsDir: string,
  resolveAsset: (id: AssetId) => string, gains: Map<AssetId, number>, opts: RunOptions,
): Promise<void> {
  const { width, height, fps } = plan.exportProfile;
  const layout = LAYOUTS[shot.layoutId] ?? LAYOUTS['full_user']!;
  const total = shot.durationFrames;
  const speech = shot.mediaOutFrame - shot.mediaInFrame;

  // A layout that shows the source during a response shows it FROZEN: the
  // source is paused, by definition. This is the freeze frame of U-13/U-15.
  const needsStill = layout.layers.some((l) => l.source === 'source' || l.source === 'still');
  let stillPath: string | null = null;
  if (needsStill && shot.sourceAssetId) {
    stillPath = join(stillsDir, `${shot.sourceAssetId}_${shot.anchorFrame}.png`);
    if (!(await exists(stillPath))) {
      await ffmpeg([
        '-accurate_seek', '-ss', frameSeconds(shot.anchorFrame, fps),
        '-i', resolveAsset(shot.sourceAssetId),
        '-frames:v', '1', stillPath,
      ], opts);
    }
  }

  const inputs: string[] = [
    '-accurate_seek', '-ss', frameSeconds(shot.mediaInFrame, fps),
    '-t', frameSeconds(speech, fps),
    '-i', resolveAsset(shot.assetId),
  ];
  const userIdx = 0;
  let stillIdx = -1;
  if (stillPath) {
    stillIdx = 1;
    inputs.push('-loop', '1', '-framerate', String(fps), '-i', stillPath);
  }

  const chains: string[] = [
    `color=c=black:s=${width}x${height}:r=${fps}:d=${frameSeconds(total, fps)}[bg0]`,
  ];

  // Clean air at the head and tail: the first and last frames are held, so a
  // response never butts straight against a cut. [U-17 §6]
  const padHead = frameSeconds(shot.padHeadFrames, fps);
  const padTail = frameSeconds(shot.padTailFrames, fps);
  const userRect = layout.layers.find((l) => l.source === 'user')?.rect ?? FULL_RECT;
  const userPx = pixelRect(userRect, width, height);
  chains.push(
    `[${userIdx}:v]${fitFilter('cover', userPx.w, userPx.h)},` +
    `tpad=start_mode=clone:start_duration=${padHead}:stop_mode=clone:stop_duration=${padTail}[user]`,
  );
  if (stillIdx >= 0) {
    const rect = layout.layers.find((l) => l.source === 'source' || l.source === 'still')?.rect ?? FULL_RECT;
    const px = pixelRect(rect, width, height);
    chains.push(`[${stillIdx}:v]${fitFilter('cover', px.w, px.h)}[still]`);
  }

  let current = 'bg0';
  let step = 0;
  for (const layer of [...layout.layers].sort((a, b) => a.z - b.z)) {
    const label = layer.source === 'user' ? 'user' : stillIdx >= 0 ? 'still' : null;
    if (!label) continue;
    const next = `v${step++}`;
    const { x, y } = pixelRect(layer.rect, width, height);
    chains.push(`[${current}][${label}]overlay=x=${x}:y=${y}:eof_action=pass[${next}]`);
    current = next;
  }

  const gain = gains.get(shot.assetId) ?? 0;
  const totalSeconds = total / fps;
  chains.push(
    `[${userIdx}:a]volume=${gain.toFixed(2)}dB,` +
    `adelay=${Math.round((shot.padHeadFrames / fps) * 1000)}:all=1,` +
    `apad,atrim=0:${totalSeconds.toFixed(6)},` +
    // 2 ms of fade at each edge: the de-click that stops a hard sample cut
    // popping mid-waveform. [U-17 §1]
    `afade=t=in:st=0:d=0.002,` +
    `afade=t=out:st=${Math.max(0, totalSeconds - 0.002).toFixed(6)}:d=0.002[aout]`,
  );

  await ffmpeg([
    ...inputs,
    '-filter_complex', chains.join(';'),
    '-map', `[${current}]`, '-map', '[aout]',
    '-frames:v', String(total),
    ...encodeArgs(),
    outPath,
  ], opts);
}

// --- filter helpers --------------------------------------------------------

/**
 * Fit a stream into a normalised rect on the canvas.
 * Layouts are data; this is the one place that turns a rect into pixels. [U-18]
 */
function fitFilter(fit: 'cover' | 'contain', targetW: number, targetH: number): string {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const tw = even(targetW), th = even(targetH);
  if (fit === 'contain') {
    return `scale=${tw}:${th}:force_original_aspect_ratio=decrease,` +
      `pad=${tw}:${th}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1`;
  }
  return `scale=${tw}:${th}:force_original_aspect_ratio=increase,crop=${tw}:${th},setsar=1`;
}

const FULL_RECT: Rect = { x: 0, y: 0, w: 1, h: 1 };

function pixelRect(rect: Rect, canvasW: number, canvasH: number): { x: number; y: number; w: number; h: number } {
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return {
    x: even(rect.x * canvasW),
    y: even(rect.y * canvasH),
    w: even(rect.w * canvasW),
    h: even(rect.h * canvasH),
  };
}

function audioFilter(gainDb: number, frames: Frames, fps: number): string {
  const seconds = frames / fps;
  return `volume=${gainDb.toFixed(2)}dB,apad,atrim=0:${seconds.toFixed(6)},` +
    `afade=t=in:st=0:d=0.002,afade=t=out:st=${Math.max(0, seconds - 0.002).toFixed(6)}:d=0.002`;
}

function encodeArgs(): string[] {
  const gop = String(HOUSE.fps * HOUSE.gopSeconds);
  return [
    '-c:v', HOUSE.videoCodec, '-profile:v', HOUSE.videoProfile,
    '-preset', HOUSE.preset, '-crf', String(HOUSE.crf),
    '-pix_fmt', HOUSE.pixelFormat,
    '-g', gop, '-keyint_min', gop, '-sc_threshold', '0',
    '-c:a', HOUSE.audioCodec, '-ar', String(HOUSE.audioSampleRate),
    '-ac', String(HOUSE.audioChannels), '-b:a', HOUSE.audioBitrate,
    '-video_track_timescale', String(HOUSE.fps * 1000),
  ];
}

/** Exact rational seconds. Seeking by a rounded float is how cuts drift. [U-07] */
function frameSeconds(frames: Frames, fps: number): string {
  return (frames / fps).toFixed(6);
}

function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
}

function distinctAssets(shots: Shot[]): AssetId[] {
  return [...new Set(shots.map((s) => s.assetId))];
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}
