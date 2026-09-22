/** Build a source video for the end-to-end run: frames that carry their index. */
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { makeSyntheticVideo } from '../test/render/synthetic.js';

const out = process.argv[2] ?? '/tmp/bv-fixture';
await mkdir(out, { recursive: true });
const mp4 = join(out, 'source.mp4');
await makeSyntheticVideo(mp4, join(out, 'source.rgb'), { frames: 600, width: 640, height: 360, toneHz: 220 });
process.stdout.write(`${mp4}\n`);
