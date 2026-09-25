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
import type {
  PerformanceFrame, PerformanceShot, RenderPlan, ResponseShot, Shot, SourceShot,
  TransitionShot,
} from '../domain/plan.js';
import { LAYOUTS, type Rect } from '../domain/presentation.js';
import { type EffectLook, lookFor } from '../domain/environment.js';
import { mixExpression, transitionFor } from '../domain/transitions.js';
import { backdropChain, blurBackdropChain, matteChain } from './matte.js';
import { mixPerformanceAudio } from './mix.js';
import { HOUSE_SAMPLE_RATE, type Frames, framesToSamples } from '../domain/time.js';
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
  /** Archived evidence captures live apart from media assets. [U-33] */
  resolveEvidence?: (assetId: AssetId) => string;
  cues?: Cue[];
  /**
   * The song, for a Performance.  [Doctrine STUDIO-TWO §9, S-7]
   *
   * Laid over the finished picture in ONE pass rather than sliced into the
   * shots. Scenes cut the picture; the song runs underneath them unbroken —
   * and slicing audio at video-frame boundaries is how you get a click at
   * every cut, which this codebase has already learned once about concat
   * boundaries and AAC's 1024-sample frames.
   */
  masterAudioPath?: string;
  /**
   * Stills: the room plates a matte is measured against, and an author's own
   * backdrop picture.  [Doctrine STUDIO-TWO §4, S-6]
   *
   * Separate from `resolveAsset` because these are pictures rather than
   * recordings — a plate resolved to a mezzanine mp4 path would be a file
   * that does not exist, discovered by ffmpeg rather than by us.
   */
  resolveStill?: (assetId: AssetId) => string;
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
  if (plan.audio.matchSpeakers) {
    for (const assetId of distinctAssets(plan.shots)) {
      const { inputI } = await measureLoudness(resolveAsset(assetId));
      gains.set(assetId, matchGainDb(inputI));
    }
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
    } else if (shot.kind === 'performance') {
      await renderPerformanceShot(shot, plan, path, resolveAsset, options);
    } else if (shot.kind === 'transition') {
      await renderTransitionShot(shot, plan, path, shotsDir, resolveAsset, options);
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

  /*
   * Pass 2b, for a Performance: the sound.  [STUDIO-TWO §9, S-7]
   *
   * Built in one piece from the plan's audio timeline — the song, and whichever
   * microphones the author's mode says are audible where — and written out so
   * the mastering below measures the MIX rather than the song on its own.
   */
  const performance = plan.shots.some(
    (shot) => shot.kind === 'performance' || shot.kind === 'transition');
  let performanceAudioPath: string | undefined;
  if (performance) {
    if (!options.masterAudioPath) {
      throw new Error('a performance render needs its master track');
    }
    performanceAudioPath = await mixPerformanceAudio({
      pieces: plan.performanceAudio ?? [],
      masterAudioPath: options.masterAudioPath,
      resolveAsset: (assetId) => resolveAsset(assetId as AssetId),
      totalSamples: framesToSamples(plan.totalOutputFrames, plan.exportProfile.fps),
      workDir,
      planHash: plan.planHash,
      run: options,
    });
  }

  // Pass 3a: measure, so pass 3b can hit the target rather than approach it.
  //
  // loudnorm's limiter treats its TP argument as a goal, not a wall, and lands
  // a few hundredths above it. The doctrine's -1 dBTP is a ceiling the
  // delivered file must be under, so we ask for headroom below it. This is
  // what a mastering engineer does with a limiter, and for the same reason.
  const TP_HEADROOM_DB = 0.3;
  const askTruePeak = plan.audio.truePeakDb - TP_HEADROOM_DB;
  const measurement = await measureLoudnorm(
    performanceAudioPath ?? bodyPath, plan.audio.loudnessLufs, askTruePeak);
  const loudnorm = measurement
    ? `loudnorm=I=${plan.audio.loudnessLufs}:TP=${askTruePeak}:LRA=11` +
      `:measured_I=${measurement.measuredI}:measured_TP=${measurement.measuredTp}` +
      `:measured_LRA=${measurement.measuredLra}:measured_thresh=${measurement.measuredThresh}` +
      `:offset=${measurement.offset}:linear=true:print_format=summary`
    : `loudnorm=I=${plan.audio.loudnessLufs}:TP=${askTruePeak}:LRA=11`;

  /*
   * A Performance's picture carries no sound, so the finished mix is brought
   * in here as a second input and mapped over the whole thing — one continuous
   * piece of audio under however many cuts. [S-7]
   */
  const master: string[] = ['-i', bodyPath];
  if (performanceAudioPath) {
    master.push('-i', performanceAudioPath, '-map', '0:v:0', '-map', '1:a:0');
  }
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

/**
 * A stretch of a song, with performances on it.
 * [Doctrine STUDIO-TWO §2, §5, §6, §7, U-18]
 *
 * PICTURE ONLY. The song is laid over the finished concatenation in one pass,
 * so nothing here emits audio — see `masterAudioPath` above for why slicing
 * the music at video-frame boundaries is the wrong shape.
 *
 * Otherwise this is the same job the other two shots do: a canvas, and a
 * layout's rects filled with media. The only new thing is that there are
 * several pieces of media rather than one, and which one goes in which panel
 * is a SLOT rather than a role — the scene said who, the layout says where.
 */
async function renderPerformanceShot(
  shot: PerformanceShot, plan: RenderPlan, outPath: string,
  resolveAsset: (id: AssetId) => string, opts: ComposeOptions,
): Promise<void> {
  const { width, height, fps } = plan.exportProfile;
  const layout = LAYOUTS[shot.layoutId] ?? LAYOUTS['performance_full']!;
  const total = shot.durationFrames;
  const seconds = frameSeconds(total, fps);
  const panels = layout.layers.filter((layer) => layer.source === 'take');
  /*
   * Only when the PLAN carried one. A layout can ask for the master's picture
   * and not get it — the rights may not allow it, or the master may be a song
   * with no picture to show — and the renderer must not go looking for what
   * the plan declined to give it. [INV-15]
   */
  const masterLayer = shot.master
    ? layout.layers.find((layer) => layer.source === 'master')
    : undefined;

  const inputs: string[] = [];
  for (const take of shot.takes) {
    /*
     * A take whose clock differs from the song's is read for LONGER than the
     * shot lasts, because it is about to be slowed to fit. Reading only the
     * shot's length would run the input out before the end. [§10, S-3]
     */
    const ratio = take.rateRatio ?? 1;
    /*
     * FOOTAGE PLAYS AGAIN.  [§5, S-29]
     *
     * `-stream_loop -1` before the input, bounded by the `-t` that follows
     * it: infinite in the demuxer, finite in the graph. It goes BEFORE `-i`
     * because it is an input option. The plan gives looping footage an IN
     * point of zero, so there is no interaction between the seek and the
     * loop to reason about: it plays from the top, round and round, until
     * `-t` runs out.
     */
    inputs.push(
      ...(take.loop ? ['-stream_loop', '-1'] : []),
      '-accurate_seek', '-ss', frameSeconds(take.mediaInFrame, fps),
      '-t', ((total / fps) * Math.max(1, ratio) + 0.2).toFixed(6),
      '-i', resolveAsset(take.assetId),
    );
  }
  /*
   * The master's picture, after the takes so a take's index is still its
   * slot. Seeked to where this stretch sits on the music clock — the sound
   * and the picture are two files cut from one original, so the same number
   * places both, and no drift correction applies: the master IS the clock.
   */
  let masterInput: number | undefined;
  if (shot.master) {
    masterInput = shot.takes.length;
    inputs.push(
      '-accurate_seek', '-ss', (shot.master.fromSample / HOUSE_SAMPLE_RATE).toFixed(6),
      '-t', (total / fps + 0.2).toFixed(6),
      '-i', resolveAsset(shot.master.assetId),
    );
  }

  /** Stills come after the takes and the master, so indices stay stable. */
  let nextInput = shot.takes.length + (shot.master ? 1 : 0);
  const still = (assetId: AssetId): number => {
    if (!opts.resolveStill) {
      throw new Error('this render needs a room plate and was given no way to find one');
    }
    inputs.push('-loop', '1', '-t', seconds, '-i', opts.resolveStill(assetId));
    return nextInput++;
  };

  const filters: string[] = [];
  /*
   * The canvas. Black rather than a blurred fill: a backdrop made from "the
   * source" has no meaning here, and inventing one from an arbitrary take
   * would be the product choosing a performance the author did not.
   */
  filters.push(`color=c=black:s=${width}x${height}:r=${fps}:d=${seconds}[bg]`);

  let last = 'bg';
  panels.forEach((layer, index) => {
    const take = shot.takes[index];
    if (!take) return;
    const box = pixelRect(layer.rect, width, height);
    const fitted = `f${index}`;
    /*
     * The drift correction, applied across the WHOLE shot rather than at its
     * in-point — correcting where a four-minute scene STARTS and letting it
     * slide apart inside itself is not a correction.
     *
     * The ratio is take samples per master sample (`masterToTake`), so a take
     * whose clock ran fast needs more of its own media to cover the same
     * stretch of song, and is therefore played FAST. Dividing the timestamps
     * is what does that. `setpts` before `fps`, so the frame-rate filter is
     * resampling a stream that already runs at the right speed. [INV-14]
     */
    const ratio = take.rateRatio ?? 1;
    const retime = ratio === 1 ? '' : `setpts=PTS/${ratio.toFixed(9)},`;
    filters.push(
      `[${index}:v]${fitFilter(layer.fit, box.w, box.h)},`
      + `setsar=1,${retime}fps=${fps},trim=end=${seconds},setpts=PTS-STARTPTS[${fitted}]`,
    );

    /*
     * §4. The performer is cut out of their room and put somewhere else —
     * or, by default and by preference, left exactly where they were. The
     * plan says which, and carries the measurement it was decided by, so
     * nothing is chosen here. [S-6, INV-16]
     */
    let panel = fitted;
    if (take.backdrop) {
      const { backdrop } = take;
      const keyable = `k${index}`;
      const plate = `pl${index}`;
      const behind = `bd${index}`;
      const composed = `m${index}`;

      if (backdrop.kind === 'blur') {
        // Their own room, softened: the same picture twice, one copy out of
        // focus behind the other.
        filters.push(`[${fitted}]format=gbrp,split=2[${keyable}][${keyable}_bg]`);
        filters.push(...blurBackdropChain(`${keyable}_bg`, behind));
      } else if (backdrop.kind === 'space') {
        filters.push(`[${fitted}]format=gbrp[${keyable}]`);
        filters.push(...backdropChain(
          lookFor(backdrop.spaceId), box.w, box.h, fps, seconds, behind));
      } else {
        filters.push(`[${fitted}]format=gbrp[${keyable}]`);
        const own = still(backdrop.assetId as AssetId);
        filters.push(
          `[${own}:v]${fitFilter('cover', box.w, box.h)},setsar=1,fps=${fps},`
          + `format=gbrp[${behind}]`);
      }

      const plateInput = still(backdrop.plateAssetId);
      filters.push(
        `[${plateInput}:v]${fitFilter(layer.fit, box.w, box.h)},setsar=1,fps=${fps},`
        + `format=gbrp[${plate}]`);
      filters.push(...matteChain({
        fg: keyable, plate, backdrop: behind, out: composed,
        threshold: backdrop.threshold, feather: backdrop.feather,
      }));
      panel = `${composed}_yuv`;
      filters.push(`[${composed}]format=yuv420p[${panel}]`);
    }

    /*
     * The master's panel, where there is one, is composited after every take
     * — so `vout` is named by whichever is genuinely last rather than by the
     * take loop assuming it is.
     */
    /*
     * §4's treatments, applied to the panel AFTER the performer has been cut
     * out and put somewhere. Grading before the matte would grade the room
     * they are being removed from, and the difference key is measured against
     * a plate of that room — changing its brightness first is changing the
     * thing the threshold was measured for. [S-6, INV-16]
     */
    if (take.effect) {
      const graded = `g${index}`;
      filters.push(...effectChain(take.effect, panel, graded, box.w, box.h));
      panel = graded;
    }

    const isLast = index === panels.length - 1 && !masterLayer;
    const next = isLast ? 'vout' : `s${index}`;
    filters.push(`[${last}][${panel}]overlay=${box.x}:${box.y}:shortest=0[${next}]`);
    last = next;
  });

  /*
   * What is being performed against.  [§5]
   *
   * `contain` where the layout says so, and the layout does say so: a take is
   * a person and cropping their edges is fine, while the master is somebody
   * else's composed frame and cropping it shows them something they did not
   * make. No drift correction — the master IS the clock, so there is nothing
   * for it to drift against.
   *
   * A layout that asks for the master on a performance whose rights do not
   * allow its picture leaves the panel as the backdrop shows it, rather than
   * substituting a take. The plan's own check says so out loud; quietly
   * filling the hole would be the product choosing an arrangement the author
   * did not.
   */
  if (masterLayer && masterInput !== undefined) {
    const box = pixelRect(masterLayer.rect, width, height);
    filters.push(
      `[${masterInput}:v]${fitFilter(masterLayer.fit, box.w, box.h)},`
      + `setsar=1,fps=${fps},trim=end=${seconds},setpts=PTS-STARTPTS,`
      + `format=yuv420p[mstr]`,
    );
    filters.push(`[${last}][mstr]overlay=${box.x}:${box.y}:shortest=0[vout]`);
    last = 'vout';
  } else if (!panels.some((_, index) => index === panels.length - 1) || last === 'bg') {
    // Nothing was composited at all — a layout with no usable panel. The
    // canvas is the output rather than a dangling label ffmpeg cannot map.
    filters.push(`[${last}]null[vout]`);
  }

  /*
   * A take that ran out mid-shot would leave its panel showing its last frame
   * for the rest of the scene. The document refuses to plan that — a scene's
   * takes must cover all of it — so reaching that state here is a bug
   * upstream rather than something to paper over.
   */
  if (panels.length === 0) filters.push('[bg]copy[vout]');

  await ffmpeg([
    '-y', ...inputs,
    '-filter_complex', filters.join(';'),
    '-map', '[vout]',
    // No audio at all, deliberately: the song arrives at the master pass.
    '-an',
    '-frames:v', String(total),
    ...encodeArgs(),
    outPath,
  ], opts);
}

/**
 * A treatment over one panel.  [STUDIO-TWO §4]
 *
 * Built from the look's numbers rather than from its name, so the renderer
 * never learns what "Spotlight" is — the same rule the spaces and the layouts
 * follow. A look with nothing set produces no filters at all, which is how
 * "none" costs nothing rather than costing an identity pass.
 *
 * `eq` before the vignette and the spotlight: brightness and contrast are
 * about the picture, and the light added or taken away afterwards is about
 * where the eye goes. Doing it the other way round grades the vignette.
 */
function effectChain(
  look: EffectLook, from: string, to: string, width: number, height: number,
): string[] {
  const steps: string[] = [];

  const eq: string[] = [];
  if (look.brightness !== undefined) eq.push(`brightness=${(look.brightness - 1).toFixed(3)}`);
  if (look.contrast !== undefined) eq.push(`contrast=${look.contrast.toFixed(3)}`);
  if (look.saturation !== undefined) eq.push(`saturation=${look.saturation.toFixed(3)}`);
  if (eq.length) steps.push(`eq=${eq.join(':')}`);

  /*
   * Warmth as a channel mix rather than a colour temperature filter: red up
   * and blue down by the same amount keeps the middle grey where it was, so
   * a warm grade does not also lift the whole picture.
   */
  if (look.warmth) {
    const w = look.warmth;
    steps.push(
      `colorchannelmixer=rr=${(1 + w).toFixed(3)}:gg=1:bb=${(1 - w).toFixed(3)}`);
  }

  if (look.vignette) steps.push(`vignette=angle=${(Math.PI / 5 * look.vignette).toFixed(4)}`);

  const chain = steps.length ? `${steps.join(',')}` : 'null';

  if (!look.spotlight) {
    steps.push('format=yuv420p');
    return [`[${from}]${steps.join(',')}[${to}]`];
  }

  /*
   * The pool of light. A radial gradient, screened over the graded panel, so
   * it ADDS light in one place rather than darkening everywhere else — which
   * is what makes it read differently from a strong vignette on a performance
   * that already has a drawn space behind it.
   */
  const radius = Math.round(Math.min(width, height) * look.spotlight);
  const lamp = `${to}_lamp`;
  const base = `${to}_base`;
  return [
    `[${from}]${chain}[${base}]`,
    `gradients=s=${width}x${height}:c0=0x2a2a2a:c1=0x000000:type=radial:`
      + `x0=${Math.round(width / 2)}:y0=${Math.round(height * 0.42)}:`
      + `nb_colors=2:d=1[${lamp}]`,
    `[${base}][${lamp}]blend=all_mode=screen:all_opacity=`
      + `${Math.min(0.5, look.spotlight).toFixed(3)},`
      + `crop=${width}:${height}:0:0,format=yuv420p[${to}]`,
  ].concat(radius > 0 ? [] : []);
}

/**
 * One arrangement becoming another.  [Doctrine STUDIO-TWO §11, S-8, U-16]
 *
 * Rendered as two ordinary performance shots and one `xfade` between them,
 * rather than as a third compositing path. The two halves are the SAME
 * function that renders every other performance shot, so a dissolve between
 * two Half Mode scenes with different environments works because nothing here
 * knows what a Half Mode scene or an environment is.
 *
 * The overlap is paid for out of the shots either side, so the finished video
 * is exactly as long as the song (INV-03): `xfade` outputs A + B - duration,
 * and both sides are exactly the overlap long, so the output is the overlap.
 */
async function renderTransitionShot(
  shot: TransitionShot, plan: RenderPlan, outPath: string, shotsDir: string,
  resolveAsset: (id: AssetId) => string, opts: ComposeOptions,
): Promise<void> {
  const { fps } = plan.exportProfile;
  const frames = shot.durationFrames;
  const style = transitionFor(shot.style);

  const half = async (side: 'a' | 'b', frame: PerformanceFrame): Promise<string> => {
    const path = join(shotsDir, `${shot.hash}.${side}.mp4`);
    if (await exists(path)) return path;
    await renderPerformanceShot({
      id: `${shot.id}_${side}`,
      kind: 'performance',
      hash: `${shot.hash}_${side}`,
      outputStartFrame: shot.outputStartFrame,
      durationFrames: frames,
      layoutId: frame.layoutId,
      fromSample: shot.fromSample,
      takes: frame.takes,
    }, plan, path, resolveAsset, opts);
    return path;
  };

  const from = await half('a', shot.from);
  const to = await half('b', shot.to);

  await ffmpeg([
    '-y', '-i', from, '-i', to,
    '-filter_complex',
    `[0:v]format=gbrp[xa];[1:v]format=gbrp[xb];`
    + `[xa][xb]blend=all_expr=${escapeFilterArgument(mixExpression(style, frames))},`
    /*
     * The timestamps are regenerated from the frame index, which is the same
     * trick the master pass uses and for the same reason. `blend` hands its
     * output on without a frame rate, so anything downstream that tries to
     * work one out guesses 25 — and the first version put an `fps` filter here
     * and silently dropped three frames of a ten-frame dissolve, which INV-03
     * caught at the end of the render rather than here.
     */
    + `format=yuv420p,setpts=N/${fps}/TB[vout]`,
    '-map', '[vout]',
    '-fps_mode', 'passthrough',
    '-an',
    '-frames:v', String(frames),
    ...encodeArgs(),
    outPath,
  ], opts);
}

async function renderSourceShot(
  shot: SourceShot, plan: RenderPlan, outPath: string,
  resolveAsset: (id: AssetId) => string, gains: Map<AssetId, number>, opts: RunOptions,
): Promise<void> {
  const { width, height, fps } = plan.exportProfile;
  const input = resolveAsset(shot.assetId);
  const n = shot.durationFrames;
  const layout = LAYOUTS[shot.layoutId] ?? LAYOUTS['full_source']!;
  const sourceLayer = layout.layers.find((l) => l.source === 'source');
  const fillsCanvas = !sourceLayer
    || (sourceLayer.fit === 'cover' && sourceLayer.rect.x === 0 && sourceLayer.rect.y === 0
        && sourceLayer.rect.w === 1 && sourceLayer.rect.h === 1);

  // Accurate seek: decode from the preceding keyframe and discard, so the
  // first frame out is exactly the frame asked for. [U-07 §2]
  const seek = [
    '-accurate_seek', '-ss', frameSeconds(shot.sourceInFrame, fps),
    '-i', input,
  ];
  const tail = [
    '-af', audioFilter(gains.get(shot.assetId) ?? 0, n, fps),
    // -frames:v is what makes the shot exactly N frames long, which is what
    // makes Σ(shots) == the planned duration (INV-03).
    '-frames:v', String(n),
    ...encodeArgs(),
  ];

  if (fillsCanvas && layout.backdrop !== 'blur') {
    await ffmpeg([
      ...seek,
      '-vf', `${fitFilter('cover', width, height)},fps=${fps}`,
      ...tail,
      outPath,
    ], opts);
    return;
  }

  // A source panel on a canvas it does not fill -- a 16:9 frame on a 9:16
  // clip (U-22 §3). Contained rather than cropped, over a blurred ground,
  // because cropping 16:9 to 9:16 throws away most of what is in the frame.
  const panel = pixelRect(sourceLayer?.rect ?? FULL_RECT, width, height);
  const blurRadius = Math.max(2, Math.round(Math.min(width, height) / 18));
  const chains: string[] = [
    layout.backdrop === 'blur'
      ? `[0:v]split=2[bg_src][panel_src]`
      : `[0:v]null[panel_src]`,
  ];
  if (layout.backdrop === 'blur') {
    chains.push(
      `[bg_src]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},boxblur=luma_radius=${blurRadius}:luma_power=1,` +
      `eq=brightness=-0.16:saturation=0.7,setsar=1,fps=${fps}[bg0]`,
    );
  } else {
    chains.push(`color=c=black:s=${width}x${height}:r=${fps}:d=${frameSeconds(n, fps)}[bg0]`);
  }
  chains.push(
    `[panel_src]${fitFilter(sourceLayer?.fit ?? 'contain', panel.w, panel.h)},fps=${fps}[panel]`,
    `[bg0][panel]overlay=x=${panel.x}:y=${panel.y}:eof_action=pass[vout]`,
  );

  await ffmpeg([
    ...seek,
    '-filter_complex', chains.join(';'),
    '-map', '[vout]', '-map', '0:a',
    ...tail,
    outPath,
  ], opts);
}

async function renderResponseShot(
  shot: ResponseShot, plan: RenderPlan, outPath: string, stillsDir: string,
  resolveAsset: (id: AssetId) => string, gains: Map<AssetId, number>, opts: ComposeOptions,
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

  // Each cue is a single still image. zoompan turns one frame into the whole
  // window, which is exactly the Ken Burns move the doctrine asks for.
  const resolveEvidence = opts.resolveEvidence ?? resolveAsset;
  const evidenceCues = shot.evidence ?? [];
  const evidenceIndices: number[] = [];
  for (const cue of evidenceCues) {
    evidenceIndices.push(inputs.filter((a) => a === '-i').length);
    inputs.push('-i', resolveEvidence(cue.captureAssetId));
  }

  // Computed here rather than as an ffmpeg expression: min(h,w) contains a
  // comma, and a comma inside a filter argument ends the filter.
  const blurRadius = Math.max(2, Math.round(Math.min(width, height) / 18));

  const chains: string[] = [];
  const blurBackdrop = layout.backdrop === 'blur' && stillIdx >= 0;
  if (stillIdx >= 0) {
    // Split only when the frame is genuinely consumed twice. An unconsumed
    // filter output does not warn -- it fails the whole graph with
    // "Error binding filtergraph inputs/outputs".
    chains.push(blurBackdrop
      ? `[${stillIdx}:v]split=2[still_bg][still_src]`
      : `[${stillIdx}:v]null[still_src]`);
  }
  if (blurBackdrop) {
    // Fill the canvas with an over-scaled, blurred, darkened copy of the frame
    // the layers sit on. Flat black bars read as a mistake; this reads as a
    // decision.
    chains.push(
      `[still_bg]scale=${width}:${height}:force_original_aspect_ratio=increase,` +
      `crop=${width}:${height},boxblur=luma_radius=${blurRadius}:luma_power=1,` +
      `eq=brightness=-0.16:saturation=0.7,setsar=1[bg0]`,
    );
  } else {
    chains.push(
      `color=c=black:s=${width}x${height}:r=${fps}:d=${frameSeconds(total, fps)}[bg0]`,
    );
  }

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
    const sourceLayer = layout.layers.find((l) => l.source === 'source' || l.source === 'still');
    const rect = sourceLayer?.rect ?? FULL_RECT;
    const px = pixelRect(rect, width, height);
    /*
     * Crop to what the response is about, before fitting.  [U-22 §3]
     *
     * A reframed panel is narrow, and a wide frame contained inside it is a
     * strip in which the thing being discussed is a few pixels across. The
     * plan says which part matters, derived from the marks the author placed,
     * and this cuts to it first so the fit has something worth fitting.
     *
     * `contain` after the crop rather than `cover`: the region is already the
     * shape the author's marks made, and cropping it a second time to fill
     * the panel would cut off the edges of the very thing being shown.
     */
    const focus = shot.sourceFocus;
    const crop = focus
      ? `crop=iw*${focus.w.toFixed(6)}:ih*${focus.h.toFixed(6)}:` +
        `iw*${focus.x.toFixed(6)}:ih*${focus.y.toFixed(6)},`
      : '';
    const fit = focus ? 'contain' : 'cover';
    chains.push(`[still_src]${crop}${fitFilter(fit, px.w, px.h)}[still]`);
  }

  let current = 'bg0';
  let step = 0;
  for (const layer of [...layout.layers].sort((a, b) => a.z - b.z)) {
    if (layer.source === 'evidence') continue; // composited below, on its own window
    const label = layer.source === 'user' ? 'user' : stillIdx >= 0 ? 'still' : null;
    if (!label) continue;
    const next = `v${step++}`;
    const { x, y } = pixelRect(layer.rect, width, height);
    chains.push(`[${current}][${label}]overlay=x=${x}:y=${y}:eof_action=pass[${next}]`);
    current = next;
  }

  /**
   * Evidence.  [Doctrine U-33 §2]
   *
   * "The render shows the document, then animates a zoom to the cited region
   *  while the user speaks. That motion is what makes an evidence citation
   *  persuasive on video rather than decorative."
   */
  if (evidenceCues.length > 0) {
    const panelRect = layout.layers.find((l) => l.source === 'evidence')?.rect
      ?? layout.layers.find((l) => l.source === 'source' || l.source === 'still')?.rect
      ?? { x: 0.04, y: 0.12, w: 0.58, h: 0.76 };
    const panel = pixelRect(panelRect, width, height);

    evidenceCues.forEach((cue, i) => {
      const input = evidenceIndices[i]!;
      const windowFrames = Math.max(1, cue.endFrame - cue.startFrame);
      const region = cue.region;
      // Fill the panel with the cited region, within reason: past about 6x the
      // capture's own pixels run out and the zoom shows mush.
      const target = region
        ? Math.min(6, Math.max(1, 1 / Math.max(region.w, region.h, 0.02)))
        : 1.12;
      const centreX = region ? region.x + region.w / 2 : 0.5;
      const centreY = region ? region.y + region.h / 2 : 0.5;
      // Reach the region over the first two-thirds, then hold it there.
      const zoomFrames = Math.max(1, Math.round(windowFrames * 0.66));

      const label = `ev${i}`;
      chains.push(
        `[${input}:v]${fitFilter('contain', panel.w, panel.h)},` +
        `zoompan=` +
          `z='min(${target.toFixed(4)}\,1+(${(target - 1).toFixed(4)})*on/${zoomFrames})':` +
          `x='max(0\,min(iw-iw/zoom\,${centreX.toFixed(4)}*iw-(iw/zoom)/2))':` +
          `y='max(0\,min(ih-ih/zoom\,${centreY.toFixed(4)}*ih-(ih/zoom)/2))':` +
          `d=${windowFrames}:s=${panel.w}x${panel.h}:fps=${fps},` +
        `setpts=PTS+${frameSeconds(cue.startFrame, fps)}/TB[${label}]`,
      );
      const next = `v${step++}`;
      chains.push(
        `[${current}][${label}]overlay=x=${panel.x}:y=${panel.y}:eof_action=pass:` +
        `enable='between(n\,${cue.startFrame}\,${Math.max(cue.startFrame, cue.endFrame - 1)})'[${next}]`,
      );
      current = next;
    });
  }

  /**
   * Blur is pixels, not a drawing, so it cannot be an ASS event. [U-12 §4]
   *
   * It is also a privacy tool — a face, an address, a document — which is why
   * it blurs the frame itself rather than covering it with a shape that could
   * be removed from the render plan later.
   */
  for (const [i, mark] of (shot.annotations ?? []).entries()) {
    if (mark.kind !== 'blur' || mark.points.length < 2) continue;
    const a = mark.points[0]!;
    const b = mark.points[1]!;
    const x = Math.round(Math.min(a.x, b.x) * width / 2) * 2;
    const y = Math.round(Math.min(a.y, b.y) * height / 2) * 2;
    const w = Math.max(2, Math.round(Math.abs(b.x - a.x) * width / 2) * 2);
    const h = Math.max(2, Math.round(Math.abs(b.y - a.y) * height / 2) * 2);
    const radius = Math.max(2, Math.round(Math.min(w, h) / 6));
    const region = `blur${i}`;
    const next = `v${step++}`;
    chains.push(
      `[${current}]split=2[blur_base${i}][blur_src${i}]`,
      `[blur_src${i}]crop=${w}:${h}:${x}:${y},boxblur=luma_radius=${radius}:luma_power=2[${region}]`,
      `[blur_base${i}][${region}]overlay=x=${x}:y=${y}:` +
      `enable='between(n\,${mark.startFrame}\,${Math.max(mark.startFrame, mark.endFrame - 1)})'[${next}]`,
    );
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

/**
 * A filter argument that contains commas.
 *
 * A comma separates filters in a graph, so an expression with one in it is
 * read as two filters and ffmpeg reports a missing filter named after half of
 * somebody's arithmetic. Escaped here rather than in the domain, because this
 * is a fact about a command line.
 */
function escapeFilterArgument(value: string): string {
  return value.replace(/[\\,;:'\[\]]/g, (character) => `\\${character}`);
}

function distinctAssets(shots: Shot[]): AssetId[] {
  // A performance shot carries several assets and contributes no audio, so it
  // has nothing to measure. Speakers are matched; a mastered song is not.
  return [...new Set(shots.flatMap(
    (s) => (s.kind === 'performance' || s.kind === 'transition' ? [] : [s.assetId])))];
}

async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch { return false; }
}
