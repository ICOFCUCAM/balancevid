import { expect, it } from 'vitest';
import { measureSound, parseAstats } from '../../src/render/ingest.js';
import { ffmpegCapture } from '../../src/render/ffmpeg.js';
const F = 'var/accounts/acct_owner/performances/perf_09464951603e4d9c8544/assets/asset_28e3a55676ef4ff6abcemezz.mp4';
it('probe', async () => {
  console.log('measureSound:', JSON.stringify(await measureSound(F)));
  const r = await ffmpegCapture(['-i', F, '-af', 'astats=metadata=1:reset=0,ametadata=print:file=-', '-vn', '-f', 'null', '-']);
  console.log('parseAstats :', JSON.stringify(parseAstats(r.stdout)));
  console.log('stdout len  :', r.stdout.length);
  expect(1).toBe(1);
});
