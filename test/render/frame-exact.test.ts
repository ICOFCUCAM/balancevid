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
import { buildClipPlan } from '../../src/domain/clips.js';
import { projectTimeline } from '../../src/domain/timeline.js';
import { assertTimelineInvariants } from '../../src/domain/invariants.js';
import { HOUSE_FPS } from '../../src/domain/time.js';
import { compose } from '../../src/render/compose.js';
import { ffmpeg } from '../../src/render/ffmpeg.js';
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

describe('composite layouts (U-18)', () => {
  it('renders a side-by-side response to the planned frame count', async () => {
    // 'critique' is side-by-side over a blurred backdrop, so this exercises the
    // split/overlay graph and the backdrop that replaces flat black bars.
    const conversation = makeConversation(
      SOURCE_FRAMES,
      ANCHORS.map((frame) => makeIntervention(frame, RESPONSE_FRAMES, { type: 'critique' })),
    );
    conversation.source.mezzanineAssetId = 'asset_source' as AssetId;
    for (const ivn of conversation.interventions) {
      for (const take of ivn.takes) take.assetId = 'asset_response' as AssetId;
    }

    const plan = buildRenderPlan(conversation, { burnInCaptions: true });
    expect(plan.shots.filter((s) => s.kind === 'response')
      .every((s) => s.layoutId === 'side_by_side')).toBe(true);

    const workDir = join(dir, 'work', 'composite');
    await mkdir(workDir, { recursive: true });
    const outputPath = join(workDir, 'FINAL.mp4');
    // compose() asserts INV-03 against the plan itself and throws if the
    // rendered file disagrees, so reaching this line is the assertion.
    const result = await compose(plan, {
      workDir, outputPath,
      resolveAsset: (id) => (id === 'asset_source' ? sourceMezz : responseMezz),
    });
    expect(result.totalOutputFrames).toBe(plan.totalOutputFrames);
    expect((await probe(outputPath)).durationFrames).toBe(plan.totalOutputFrames);
  }, 300_000);
});

describe('evidence (U-33)', () => {
  it('shows a document and zooms to the cited region, in frame', async () => {
    const evidencePath = join(dir, 'evidence.png');
    // A page-like image with a distinct block where the "cited line" sits.
    await ffmpeg([
      '-f', 'lavfi', '-i', 'color=c=white:s=900x1200',
      '-f', 'lavfi', '-i', 'color=c=#1133aa:s=520x60',
      '-filter_complex', '[0:v][1:v]overlay=x=140:y=520',
      '-frames:v', '1', evidencePath,
    ]);

    const conversation = makeConversation(
      SOURCE_FRAMES,
      ANCHORS.map((frame) => makeIntervention(frame, RESPONSE_FRAMES, { type: 'fact_check' })),
    );
    conversation.source.mezzanineAssetId = 'asset_source' as AssetId;
    for (const ivn of conversation.interventions) {
      for (const take of ivn.takes) take.assetId = 'asset_response' as AssetId;
    }

    const target = conversation.interventions[0]!;
    const take = target.takes[0]!;
    target.evidence = [{
      id: 'ev_test' as never,
      kind: 'web',
      title: 'Office for National Statistics — unemployment',
      url: 'https://example.org/stats',
      captureAssetId: 'asset_evidence' as AssetId,
      contentHash: 'deadbeef',
      retrievedAt: '2026-09-22T12:00:00.000Z',
      // The cited block sits at y≈0.43 of the page, a fifth of its height.
      locator: { region: { x: 0.15, y: 0.42, w: 0.58, h: 0.06 }, quote: 'unemployment fell' },
      // Offsets into what the author kept, not positions in the recording.
      appearOffset: 15,
      dismissOffset: take.mediaOutFrame - take.mediaInFrame,
      archived: true,
    }];

    const plan = buildRenderPlan(conversation, { burnInCaptions: true });
    const shot = plan.shots.find((s) => s.kind === 'response') as { evidence?: unknown[] };
    expect(shot.evidence, 'the plan carries the evidence cue').toHaveLength(1);

    const workDir = join(dir, 'work', 'evidence');
    await mkdir(workDir, { recursive: true });
    const outputPath = join(workDir, 'FINAL.mp4');
    // compose() checks its own frame count against the plan and throws on a
    // mismatch, so a zoom that breaks the filter graph cannot pass quietly.
    const result = await compose(plan, {
      workDir, outputPath,
      resolveAsset: (id) => (id === 'asset_source' ? sourceMezz : responseMezz),
      resolveEvidence: () => evidencePath,
    });
    expect(result.totalOutputFrames).toBe(plan.totalOutputFrames);
    expect((await probe(outputPath)).durationFrames).toBe(plan.totalOutputFrames);
  }, 300_000);

  it('does not show evidence that has not been archived', () => {
    const conversation = makeConversation(SOURCE_FRAMES, [makeIntervention(90, RESPONSE_FRAMES)]);
    conversation.source.mezzanineAssetId = 'asset_source' as AssetId;
    conversation.interventions[0]!.evidence = [{
      id: 'ev_pending' as never,
      kind: 'web',
      title: 'not yet fetched',
      retrievedAt: '2026-09-22T12:00:00.000Z',
      locator: {},
      archived: false,
    }];
    const shot = buildRenderPlan(conversation).shots.find((s) => s.kind === 'response') as
      { evidence?: unknown[] };
    expect(shot.evidence).toBeUndefined();
  });
});

describe('annotations (§14, U-12)', () => {
  it('draws vector marks and blurs a region, in frame', async () => {
    const conversation = makeConversation(
      SOURCE_FRAMES,
      ANCHORS.map((frame) => makeIntervention(frame, RESPONSE_FRAMES, { type: 'context' })),
    );
    conversation.source.mezzanineAssetId = 'asset_source' as AssetId;
    for (const ivn of conversation.interventions) {
      for (const take of ivn.takes) take.assetId = 'asset_response' as AssetId;
    }

    const target = conversation.interventions[0]!;
    const take = target.takes[0]!;
    target.annotations = [
      {
        id: 'ann_circle' as never, kind: 'ellipse',
        points: [{ x: 0.2, y: 0.25 }, { x: 0.6, y: 0.65 }],
        style: { color: '#ffcc00', width: 0.006 }, z: 0,
        appearOffset: 10, dismissOffset: take.mediaOutFrame - take.mediaInFrame,
        drawFrames: 12,
      },
      {
        id: 'ann_arrow' as never, kind: 'arrow',
        points: [{ x: 0.8, y: 0.2 }, { x: 0.62, y: 0.42 }],
        style: { color: '#ff5533', width: 0.005 }, z: 1,
      },
      {
        id: 'ann_text' as never, kind: 'text',
        points: [{ x: 0.1, y: 0.8 }], text: 'look at this',
        style: { color: '#ffffff' }, z: 2,
      },
      {
        // A privacy blur, which is pixels rather than a drawing. [U-12 §4]
        id: 'ann_blur' as never, kind: 'blur',
        points: [{ x: 0.05, y: 0.05 }, { x: 0.25, y: 0.2 }],
        style: {}, z: 3,
      },
      {
        /*
         * Point: one click, a ring around the thing being discussed.
         *
         * Its own case because it is the only mark defined by a single
         * coordinate — every other drawing derives its extent from two, and
         * the draw-on wipe has to be told the ring's size rather than
         * measuring the points.
         */
        id: 'ann_point' as never, kind: 'point',
        points: [{ x: 0.72, y: 0.7 }],
        style: { color: '#6fb3e0', width: 0.005 }, z: 4,
        appearOffset: 6, dismissOffset: take.mediaOutFrame - take.mediaInFrame,
        drawFrames: 8,
      },
    ];

    const plan = buildRenderPlan(conversation, { burnInCaptions: true });
    const shot = plan.shots.find((s) => s.kind === 'response') as
      { annotations?: unknown[]; layoutId: string };
    expect(shot.annotations).toHaveLength(5);
    expect(shot.layoutId).toBe('freeze_pip');

    const workDir = join(dir, 'work', 'annotations');
    await mkdir(workDir, { recursive: true });
    const outputPath = join(workDir, 'FINAL.mp4');
    // compose() checks its own frame count against the plan, so a drawing that
    // breaks the subtitle file or a blur that breaks the filter graph fails here.
    const result = await compose(plan, {
      workDir, outputPath,
      resolveAsset: (id) => (id === 'asset_source' ? sourceMezz : responseMezz),
    });
    expect(result.totalOutputFrames).toBe(plan.totalOutputFrames);
    expect((await probe(outputPath)).durationFrames).toBe(plan.totalOutputFrames);
  }, 300_000);
});

describe('vertical clips (U-22)', () => {
  it('renders one pair as a self-contained vertical clip', async () => {
    const conversation = makeConversation(
      SOURCE_FRAMES,
      ANCHORS.map((frame) => makeIntervention(frame, RESPONSE_FRAMES, {
        type: 'critique', quote: 'The policy was clearly successful.',
      })),
    );
    conversation.source.mezzanineAssetId = 'asset_source' as AssetId;
    for (const ivn of conversation.interventions) {
      for (const take of ivn.takes) take.assetId = 'asset_response' as AssetId;
    }

    const plan = buildClipPlan(conversation, conversation.interventions[1]!.id);
    expect(plan.exportProfile.height).toBe(1920);
    expect(plan.shots).toHaveLength(2);
    expect(plan.openingClaim?.text).toBe('The policy was clearly successful.');

    const workDir = join(dir, 'work', 'clip');
    await mkdir(workDir, { recursive: true });
    const outputPath = join(workDir, 'CLIP.mp4');
    const result = await compose(plan, {
      workDir, outputPath,
      resolveAsset: (id) => (id === 'asset_source' ? sourceMezz : responseMezz),
    });

    const info = await probe(outputPath);
    expect(result.totalOutputFrames).toBe(plan.totalOutputFrames);
    expect(info.durationFrames).toBe(plan.totalOutputFrames);
    expect(info.width).toBe(1080);
    expect(info.height).toBe(1920);
    // Short enough for the formats it is made for.
    expect(info.durationSeconds).toBeLessThan(90);
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
    const { inputI, inputTp } = await measureLoudness(outputPath);
    // The doctrine's tolerance, not a convenient one: ±0.5 LU of the target
    // and never above the true-peak ceiling. [INV-11, U-17 §4]
    expect(inputI).toBeGreaterThan(plan.audio.loudnessLufs - 0.5);
    expect(inputI).toBeLessThan(plan.audio.loudnessLufs + 0.5);
    expect(inputTp).toBeLessThanOrEqual(plan.audio.truePeakDb);
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
  // 'explain' renders full-screen user (U-11), so a response frame contains no
  // source pixels anywhere. That is what lets the decoder below tell the two
  // apart. A composite layout such as 'critique' fills the canvas behind the
  // panels with a blurred copy of the frozen source frame, which is correct for
  // the product and useless as a discriminator -- the composite path is covered
  // by its own test below.
  const conversation = makeConversation(
    SOURCE_FRAMES,
    ANCHORS.map((frame) => makeIntervention(frame, RESPONSE_FRAMES, { type: 'explain' })),
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
