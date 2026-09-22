/**
 * The frame-exactness test.  [Doctrine D-10, INV-02, Part 0 principle 2]
 *
 * "When you interrupt the speaker, you return to exactly where the speaker
 *  stopped. Not approximately. Not 'around 14:32'. Exactly."
 *
 * This renders a real MP4 through real ffmpeg from a source whose frames carry
 * their own index, then decodes the result and checks that every source frame
 * appears exactly once, in order. It is the product's central promise expressed
 * as something CI can fail on.
 */

import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AssetId } from '../../src/domain/document.js';
import { buildRenderPlan } from '../../src/domain/plan.js';
import { projectTimeline } from '../../src/domain/timeline.js';
import { assertTimelineInvariants } from '../../src/domain/invariants.js';
import { HOUSE_FPS } from '../../src/domain/time.js';
import { compose } from '../../src/render/compose.js';
import { ingest, measureLoudness } from '../../src/render/ingest.js';
import { probe } from '../../src/render/probe.js';
import { makeConversation, makeIntervention } from '../domain/fixtures.js';
import {
  RESPONSE_COLOUR, decodeIndex, makeSyntheticVideo, samplePerFrameColours,
} from './synthetic.js';

const SOURCE_FRAMES = 300;          // 10 seconds
const RESPONSE_FRAMES = 60;         // 2 seconds of speech per response
const ANCHORS = [90, 150, 240];     // 3s, 5s, 8s

let dir: string;
let sourceMezz: string;
let responseMezz: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'balancevid-frameexact-'));
  await mkdir(join(dir, 'work'), { recursive: true });

  const sourceRaw = join(dir, 'source.rgb');
  const responseRaw = join(dir, 'response.rgb');
  const sourceOriginal = join(dir, 'source.mp4');
  const responseOriginal = join(dir, 'response.mp4');

  await makeSyntheticVideo(sourceOriginal, sourceRaw, { frames: SOURCE_FRAMES, toneHz: 300 });
  await makeSyntheticVideo(responseOriginal, responseRaw, {
    // A take carries pre-roll ahead of the speech the user keeps. [U-04]
    frames: RESPONSE_FRAMES + 8 * HOUSE_FPS,
    fixedColour: RESPONSE_COLOUR,
    toneHz: 900,
  });

  sourceMezz = join(dir, 'source.mezz.mp4');
  responseMezz = join(dir, 'response.mezz.mp4');
  await ingest(sourceOriginal, sourceMezz);
  await ingest(responseOriginal, responseMezz);
}, 240_000);

afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('end-to-end frame exactness (INV-02)', () => {
  it('normalises both assets to the house format (U-02, INV-04)', async () => {
    const source = await probe(sourceMezz);
    expect(source.fps).toBeCloseTo(HOUSE_FPS, 1);
    expect(source.durationFrames).toBe(SOURCE_FRAMES);
    expect(source.hasAudio).toBe(true);
    expect(source.audioSampleRate).toBe(48_000);
    expect(source.audioChannels).toBe(2);
    expect(source.videoCodec).toBe('h264');
  });

  it('renders every source frame exactly once, in order, around three interruptions', async () => {
    const { plan, outputPath, result } = await render('exact');

    // The container must hold precisely what the plan promised (INV-03).
    const info = await probe(outputPath);
    expect(info.durationFrames).toBe(plan.totalOutputFrames);

    const colours = await samplePerFrameColours(outputPath, join(dir, 'out.rgb'));
    expect(colours).toHaveLength(plan.totalOutputFrames);

    const sourceIndices: number[] = [];
    let responseFrames = 0;
    for (const [r, g, b] of colours) {
      const index = decodeIndex(r, g, b);
      if (index === null || index >= SOURCE_FRAMES) responseFrames++;
      else sourceIndices.push(index);
    }

    // THE assertion. Every source frame, once, in ascending order, none missing.
    expect(sourceIndices).toHaveLength(SOURCE_FRAMES);
    expect(sourceIndices).toEqual(Array.from({ length: SOURCE_FRAMES }, (_, i) => i));

    // And the responses are all there, with their clean air.
    expect(responseFrames).toBe(plan.totalOutputFrames - SOURCE_FRAMES);
    expect(result.shotsRendered).toBeGreaterThan(0);
  }, 300_000);

  it('cuts out and resumes on the same frame at every anchor', async () => {
    const conversation = buildConversation();
    const timeline = projectTimeline(conversation);
    assertTimelineInvariants(conversation, timeline);

    const { outputPath, plan } = await render('exact'); // cached from the run above
    const colours = await samplePerFrameColours(outputPath, join(dir, 'out2.rgb'));

    // Walk the output; at each response, the last source frame before it and
    // the first after it must straddle the anchor with no gap and no repeat.
    let lastSourceIndex: number | null = null;
    let sawResponse = false;
    const resumePairs: Array<[number, number]> = [];
    for (const [r, g, b] of colours) {
      const index = decodeIndex(r, g, b);
      const isSource = index !== null && index < SOURCE_FRAMES;
      if (!isSource) { sawResponse = true; continue; }
      if (sawResponse && lastSourceIndex !== null) {
        resumePairs.push([lastSourceIndex, index]);
        sawResponse = false;
      }
      lastSourceIndex = index;
    }

    expect(resumePairs).toHaveLength(ANCHORS.length);
    for (const [i, [before, after]] of resumePairs.entries()) {
      const anchor = ANCHORS[i]!;
      expect(before).toBe(anchor - 1);   // cut out on the frame before the anchor
      expect(after).toBe(anchor);        // resume on the anchor itself
    }
    expect(plan.shots.filter((s) => s.kind === 'response')).toHaveLength(ANCHORS.length);
  }, 300_000);
});

describe('the shot cache (U-16)', () => {
  it('renders nothing the second time an unchanged plan is composed', async () => {
    const first = await render('cache');
    expect(first.result.shotsRendered).toBeGreaterThan(0);
    const second = await render('cache');
    expect(second.result.shotsRendered).toBe(0);
    expect(second.result.shotsCached).toBe(second.plan.shots.length);
  }, 300_000);
});

describe('audio mastering (INV-11, U-17)', () => {
  it('masters the export to its loudness target', async () => {
    const { outputPath, plan } = await render('exact');
    const { inputI } = await measureLoudness(outputPath);
    // ±1.0 LU: loudnorm's single-pass mode is not as tight as the ±0.5 the
    // doctrine sets for a two-pass master, and this test guards the mechanism.
    expect(inputI).toBeGreaterThan(plan.audio.loudnessLufs - 1.0);
    expect(inputI).toBeLessThan(plan.audio.loudnessLufs + 1.0);
  }, 300_000);
});

// ---------------------------------------------------------------------------

/**
 * Built once. Interventions and takes carry generated ids, and the shot cache
 * is keyed on them -- so a fixture that rebuilt itself per call would look like
 * a cache miss when the cache is working perfectly.
 */
let cachedConversation: ReturnType<typeof buildConversationFresh> | null = null;
function buildConversation() {
  cachedConversation ??= buildConversationFresh();
  return cachedConversation;
}

function buildConversationFresh() {
  const conversation = makeConversation(
    SOURCE_FRAMES,
    ANCHORS.map((frame) => makeIntervention(frame, RESPONSE_FRAMES, { type: 'critique' })),
  );
  // Point every asset id at the two mezzanines we actually built.
  conversation.source.mezzanineAssetId = 'asset_source' as AssetId;
  for (const ivn of conversation.interventions) {
    for (const take of ivn.takes) take.assetId = 'asset_response' as AssetId;
  }
  return conversation;
}

async function render(bucket: string) {
  const conversation = buildConversation();
  const plan = buildRenderPlan(conversation, { burnInCaptions: true });
  const workDir = join(dir, 'work', bucket);
  await mkdir(workDir, { recursive: true });
  const outputPath = join(workDir, 'FINAL.mp4');
  const result = await compose(plan, {
    workDir,
    outputPath,
    resolveAsset: (id) => (id === 'asset_source' ? sourceMezz : responseMezz),
  });
  return { plan, outputPath, result };
}
