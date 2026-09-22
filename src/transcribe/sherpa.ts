/**
 * The local ASR engine.  [Doctrine D-14, U-03]
 *
 * sherpa-onnx running an offline zipformer transducer. Chosen because it is
 * fully local -- a product whose users record unpublished opinions should not
 * have to ship every take to a third party to get a transcript (D-03) -- and
 * because a transducer reports per-token onsets, which is what makes
 * word-level timing possible at all.
 *
 * It implements Transcriber and nothing upstream knows it exists.
 */

import { spawn } from 'node:child_process';
import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HOUSE_FPS, secondsToFrames } from '../domain/time.js';
import { ffmpeg } from '../render/ffmpeg.js';
import { segment } from './segmentation.js';
import {
  TRANSCRIPT_VERSION, type Transcriber, type Transcript,
  type TranscribeOptions, type TranscriptWord,
} from './types.js';

const MODELS_ROOT = process.env['BALANCEVID_MODELS'] ?? join(process.cwd(), 'var', 'models');
const PYTHON = process.env['BALANCEVID_PYTHON'] ?? join(process.cwd(), '.venv', 'bin', 'python');
const SCRIPT = join(process.cwd(), 'scripts', 'asr', 'transcribe.py');

export const SHERPA_MODEL_DIR = join(MODELS_ROOT, 'sherpa-onnx-zipformer-en-2023-06-26');
export const SHERPA_VAD_MODEL = join(MODELS_ROOT, 'silero_vad.onnx');

interface PythonOutput {
  engine: string;
  model: string;
  language: string;
  durationSeconds: number;
  words: Array<{ text: string; start: number; end: number }>;
  speechSegments: Array<{ start: number; end: number }>;
}

export class SherpaTranscriber implements Transcriber {
  readonly id = 'sherpa-onnx-zipformer-en';
  readonly label = 'Local — zipformer (English)';

  async available(): Promise<boolean> {
    for (const path of [PYTHON, SCRIPT, SHERPA_VAD_MODEL, join(SHERPA_MODEL_DIR, 'tokens.txt')]) {
      try { await access(path); } catch { return false; }
    }
    return true;
  }

  async transcribe(
    mediaPath: string, assetId: string, options: TranscribeOptions = {},
  ): Promise<Transcript> {
    const work = await mkdtemp(join(tmpdir(), 'balancevid-asr-'));
    const wav = join(work, 'audio.wav');
    try {
      // 16 kHz mono is what the acoustic model expects. Anything else is
      // resampled inside the engine, unobserved, with results we cannot
      // reason about -- so the conversion happens here, explicitly.
      await ffmpeg([
        '-i', mediaPath,
        '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le',
        wav,
      ]);

      const raw = await this.run([
        '--wav', wav,
        '--model-dir', SHERPA_MODEL_DIR,
        '--vad-model', SHERPA_VAD_MODEL,
        '--threads', String(options.threads ?? 4),
        '--language', options.language ?? 'en',
      ], options.signal);

      const output = JSON.parse(raw) as PythonOutput;
      const words = toWords(output);
      const { sentences, paragraphs } = segment(words);

      return {
        version: TRANSCRIPT_VERSION,
        engine: output.engine,
        model: output.model,
        language: output.language,
        characteristics: { punctuation: false, casing: 'upper', speakerLabels: false },
        createdAt: new Date().toISOString(),
        assetId,
        durationFrames: secondsToFrames(output.durationSeconds, HOUSE_FPS),
        words,
        sentences,
        paragraphs,
      };
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  }

  private run(args: string[], signal?: AbortSignal): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn(PYTHON, [SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
      child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });
      const onAbort = (): void => { child.kill('SIGKILL'); };
      signal?.addEventListener('abort', onAbort, { once: true });
      child.on('error', reject);
      child.on('close', (code) => {
        signal?.removeEventListener('abort', onAbort);
        if (code === 0) resolve(stdout);
        else reject(new Error(`transcriber exited ${code}: ${stderr.trim().split('\n').slice(-6).join(' | ')}`));
      });
    });
  }
}

function toWords(output: PythonOutput): TranscriptWord[] {
  // Which speech run each word came from. The VAD's runs are a better turn
  // boundary than any gap threshold applied afterwards (see segmentation).
  const runs = output.speechSegments;
  return output.words.map((word) => {
    const index = runs.findIndex((run) => word.start >= run.start - 0.001 && word.start <= run.end + 0.001);
    return {
      text: word.text,
      startFrame: secondsToFrames(Math.max(0, word.start), HOUSE_FPS),
      endFrame: secondsToFrames(Math.max(0, word.end), HOUSE_FPS),
      segment: index < 0 ? 0 : index,
    };
  });
}
