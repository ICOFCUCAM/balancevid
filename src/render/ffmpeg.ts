/**
 * The ffmpeg boundary.
 *
 * Renders never run in the web tier (D-14). Everything here is worker-side and
 * assumes it may be killed and resumed — the shot cache (U-16) makes that cheap.
 */

import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';

export const FFMPEG = (ffmpegStatic as unknown as string) ?? 'ffmpeg';
export const FFPROBE = ffprobeStatic.path ?? 'ffprobe';

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
