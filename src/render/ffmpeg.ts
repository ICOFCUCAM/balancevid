/**
 * The ffmpeg boundary.
 *
 * Renders never run in the web tier (D-14). Everything here is worker-side and
 * assumes it may be killed and resumed — the shot cache (U-16) makes that cheap.
 */

import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

/**
 * WHICH BINARY, AND WHY IT CAN BE OVERRIDDEN.  [CHANNEL §13, C-24]
 *
 * `ffmpeg-static` is the default because a pinned binary is the only way
 * two machines render the same frame. But it is built WITHOUT freetype,
 * so it has no `drawtext` — and a channel's own identity is drawn with
 * `drawtext`. That cost this product every picture it transmitted: the
 * filtergraph was rejected, the segment failed, and the fallback put
 * four seconds of black on the wire, forever, while every health signal
 * stayed green.
 *
 * So a deployment that wants its station bug points this at an ffmpeg
 * that can draw one. Nothing else changes, and the code checks rather
 * than assumes — see `canDrawText`.
 */
export const FFMPEG = process.env['BALANCEVID_FFMPEG']
  || (ffmpegStatic as unknown as string) || 'ffmpeg';
export const FFPROBE = process.env['BALANCEVID_FFPROBE']
  || ffprobeStatic.path || 'ffprobe';

export class FfmpegError extends Error {
  constructor(readonly code: number | null, readonly args: string[], readonly stderr: string) {
    // The tail of stderr is where ffmpeg says what actually went wrong.
    super(`ffmpeg exited ${code}\n  args: ${args.join(' ')}\n  ${stderr.trim().split('\n').slice(-8).join('\n  ')}`);
    this.name = 'FfmpegError';
  }
}

export interface RunOptions {
  /** Called with ffmpeg's -progress output, so a render reports a real number
   *  rather than a spinner (D-13). */
  onProgress?: (info: Record<string, string>) => void;
  signal?: AbortSignal;
}

export interface RunResult { stdout: string; stderr: string }

/**
 * ffmpeg reports measurements (loudnorm, volumedetect) on STDERR and still
 * exits 0, so callers need both streams, not just stdout.
 */
export async function runCapture(bin: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let progressBuf = '';

    child.stdout.on('data', (d: Buffer) => {
      const text = d.toString();
      stdout += text;
      if (!opts.onProgress) return;
      progressBuf += text;
      const blocks = progressBuf.split('progress=');
      progressBuf = blocks.pop() ?? '';
      for (const block of blocks) {
        const info: Record<string, string> = {};
        for (const line of block.split('\n')) {
          const eq = line.indexOf('=');
          if (eq > 0) info[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
        }
        if (Object.keys(info).length) opts.onProgress(info);
      }
    });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    const onAbort = (): void => { child.kill('SIGKILL'); };
    opts.signal?.addEventListener('abort', onAbort, { once: true });

    child.on('error', reject);
    child.on('close', (code) => {
      opts.signal?.removeEventListener('abort', onAbort);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new FfmpegError(code, args, stderr));
    });
  });
}

export async function run(bin: string, args: string[], opts?: RunOptions): Promise<string> {
  return (await runCapture(bin, args, opts)).stdout;
}

export const ffmpeg = (args: string[], opts?: RunOptions): Promise<string> =>
  run(FFMPEG, ['-hide_banner', '-nostdin', '-y', ...args], opts);

export const ffmpegCapture = (args: string[], opts?: RunOptions): Promise<RunResult> =>
  runCapture(FFMPEG, ['-hide_banner', '-nostdin', '-y', ...args], opts);

export const ffprobe = (args: string[]): Promise<string> =>
  run(FFPROBE, ['-hide_banner', ...args]);


/* ------------------------------------------------------------------------ *
 *  What this build can actually do.  [CHANNEL §13, C-24]
 * ------------------------------------------------------------------------ */

/**
 * The filters this binary has, asked once.
 *
 * ASKED, NOT ASSUMED, and that distinction is the whole of C-24. Every
 * filter this product emits was written against a build somebody had in
 * front of them, and one of them — `drawtext` — is absent from the build
 * that ships. A filtergraph naming a filter that is not there does not
 * degrade: ffmpeg rejects the GRAPH, so one missing filter takes the
 * whole picture with it.
 *
 * Cached for the life of the process, because a binary does not grow
 * filters while it runs and the playout engine asks four times a second.
 */
let known: Promise<Set<string>> | null = null;
export function availableFilters(bin = FFMPEG): Promise<Set<string>> {
  if (known) return known;
  known = runCapture(bin, ['-hide_banner', '-filters'])
    .then(({ stdout, stderr }) => {
      const out = new Set<string>();
      /* ` T.. name  V->V  description` — the name is the second field of
         a line whose first is the flags. Reading stderr too because
         some builds write the list there. */
      for (const line of `${stdout}\n${stderr}`.split('\n')) {
        const found = /^\s*[A-Z.]{3,}\s+(\S+)\s+\S+->\S+/.exec(line);
        if (found?.[1]) out.add(found[1]);
      }
      return out;
    })
    /*
     * A BINARY THAT WILL NOT ANSWER IS TAKEN AT ITS WORD: nothing is
     * available. The caller then draws no text, which is a picture
     * without a bug — and a picture without a bug beats no picture.
     */
    .catch(() => new Set<string>());
  return known;
}

/** Can this build draw text over a frame? */
export async function canDrawText(bin = FFMPEG): Promise<boolean> {
  return (await availableFilters(bin)).has('drawtext');
}

/** For a test that needs to ask a second binary. */
export function forgetFilters(): void { known = null; }

/* ------------------------------------------------------------------------ *
 *  How loud is it?  [CHANNEL §5, §10, U-23, C-33]
 * ------------------------------------------------------------------------ */

/**
 * Measure an item's integrated loudness and true peak, once.
 *
 * `ebur128` WITH `peak=true`, WHICH IS THE WHOLE MEASUREMENT. The
 * summary lands on stderr at the end of a pass over the file, so the
 * file is decoded once and discarded — `-f null -` writes nothing.
 * That is a real cost on a long film, which is exactly why the
 * caller caches it for the life of the process.
 *
 * TRUE PEAK, NOT SAMPLE PEAK. `peak=true` asks for both; the true
 * peak is the one R128 writes its ceiling against, because a signal
 * that only touches 0 dBFS at the samples can overshoot between them
 * and every lossy codec downstream reconstructs the overshoot as
 * clipping. Reading the sample peak and calling it true would be a
 * ceiling that does not hold.
 *
 * NOTHING IS GUESSED WHEN IT FAILS. A file ffmpeg cannot decode, a
 * build without the filter, a probe that times out — all return
 * nothing, and the caller leaves the item's level alone. A guessed
 * loudness is a gain applied to somebody's master on the strength of
 * an assumption.
 */
export async function measureLoudness(
  path: string,
): Promise<{ lufs: number; truePeak: number } | undefined> {
  let said: string;
  try {
    ({ stderr: said } = await ffmpegCapture([
      '-nostdin', '-hide_banner', '-i', path,
      '-map', '0:a:0', '-af', 'ebur128=peak=true',
      '-f', 'null', '-',
    ]));
  } catch {
    return undefined;
  }
  /*
   * THE SUMMARY, NOT THE RUNNING COMMENTARY. `ebur128` prints a line
   * per frame as it goes and a block at the end; the running lines
   * also contain `I:` and would match a loose pattern, giving the
   * loudness of whichever moment the regex happened to reach. The
   * summary's own labels are indented and distinct, so they are what
   * is read.
   */
  const summary = said.slice(said.lastIndexOf('Integrated loudness'));
  const lufs = Number(/I:\s*(-?[\d.]+|-inf)\s*LUFS/.exec(summary)?.[1]);
  const truePeak = Number(/Peak:\s*(-?[\d.]+|-inf)\s*dBFS/.exec(summary)?.[1]);
  if (!Number.isFinite(lufs)) return undefined;
  return { lufs, truePeak };
}
