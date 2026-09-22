/**
 * Build a source video for the end-to-end run.
 *
 * The picture carries each frame's index, so the render can be decoded and
 * checked frame by frame. The audio is real speech, so the transcript,
 * captions and claim cards are exercised rather than merely wired up -- a sine
 * tone would let a broken ASR path pass silently.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { makeSyntheticVideo } from '../test/render/synthetic.js';
import { ffmpeg } from '../src/render/ffmpeg.js';

const out = process.argv[2] ?? '/tmp/bv-fixture';
const speechDir = process.argv[3]
  ?? 'var/models/sherpa-onnx-zipformer-en-2023-06-26/test_wavs';
await mkdir(out, { recursive: true });

// A page-like image to attach as evidence, with a distinct block standing in
// for the cited line.
await ffmpeg([
  '-f', 'lavfi', '-i', 'color=c=white:s=900x1200',
  '-f', 'lavfi', '-i', 'color=c=#1133aa:s=520x60',
  '-filter_complex', '[0:v][1:v]overlay=x=140:y=520',
  '-frames:v', '1', join(out, 'evidence.png'),
]);

const silent = join(out, 'picture.mp4');
await makeSyntheticVideo(silent, join(out, 'source.rgb'), {
  frames: 600, width: 640, height: 360, toneHz: 220,
});

const mp4 = join(out, 'source.mp4');
const clips = ['0.wav', '1.wav', '0.wav', '1.wav', '0.wav', '1.wav']
  .map((n) => resolve(speechDir, n))
  .filter((p) => existsSync(p));

if (clips.length === 0) {
  process.stdout.write(`${silent}\n`);
} else {
  // Speech clips, separated by half a second of room tone so the segmenter has
  // real sentence boundaries to find.
  const list = join(out, 'speech.txt');
  await writeFile(list, clips.map((p) => `file '${p}'`).join('\n') + '\n', 'utf8');
  const speech = join(out, 'speech.wav');
  await ffmpeg([
    '-f', 'concat', '-safe', '0', '-i', list,
    '-af', 'apad=pad_dur=0.5,aresample=48000',
    '-ac', '2', speech,
  ]);
  // Pad the speech to the picture's length. Muxing with -shortest would
  // silently truncate the video to the audio, and the whole point of this
  // fixture is that the picture is exactly 600 known frames long.
  await ffmpeg([
    '-i', silent, '-i', speech,
    '-map', '0:v', '-map', '1:a',
    '-af', 'apad', '-t', String(600 / 30),
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
    mp4,
  ]);
  process.stdout.write(`${mp4}\n`);
}
