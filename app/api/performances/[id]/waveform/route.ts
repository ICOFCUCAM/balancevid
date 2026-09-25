import { readAnalysis } from '../../../../../src/render/audio.js';
import { accessTo } from '../../../../../src/auth/request.js';
import { paths } from '../../../../../src/store/paths.js';
import { loadPerformance } from '../../../../../src/store/performances.js';
import { fail, json } from '../../../../../src/web/http.js';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** Enough to draw a song across a screen, and no more. */
const BUCKETS = 900;

/**
 * The song, as something to draw.  [Doctrine STUDIO-TWO §2, U-23]
 *
 * PEAKS, NOT SAMPLES. A four-minute song is eleven million samples and the
 * timeline is a thousand pixels wide; sending the samples would be sending
 * eleven thousand of them per pixel for the browser to throw away. The peak
 * of each bucket is what a waveform IS — the loudest thing in that slice —
 * so the reduction happens where the data already lives.
 *
 * Read from the analysis copy the alignment pipeline already made (mono
 * floats at the house rate), so this adds no decode and no ffmpeg: the web
 * tier still cannot render anything (U-23).
 */
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { id } = await params;
  let performance;
  try {
    performance = await loadPerformance(id);
  } catch {
    return fail(404, 'performance not found');
  }
  if (await accessTo(request, performance) === 'denied') {
    return fail(404, 'performance not found');
  }

  const total = performance.master.durationSamples;
  if (total <= 0) return json({ peaks: [], durationSamples: 0 });

  let samples: Float32Array;
  try {
    samples = await readAnalysis(paths.masterAnalysis(id), 0, total);
  } catch {
    // The song is still being decoded. Not an error: the timeline draws a
    // flat line and fills in when the analysis lands.
    return json({ peaks: [], durationSamples: total, pending: true });
  }

  const per = Math.max(1, Math.floor(samples.length / BUCKETS));
  const peaks: number[] = [];
  for (let at = 0; at + per <= samples.length && peaks.length < BUCKETS; at += per) {
    let loudest = 0;
    for (let i = at; i < at + per; i += 1) {
      const value = Math.abs(samples[i] ?? 0);
      if (value > loudest) loudest = value;
    }
    // Two decimals: a waveform is a shape, and the third decimal is a byte
    // per bucket that nobody can see.
    peaks.push(Math.round(Math.min(1, loudest) * 100) / 100);
  }

  return json({ peaks, durationSamples: total });
}
