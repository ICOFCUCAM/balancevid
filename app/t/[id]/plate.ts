'use client';

import {
  PLATE_FRAMES, PLATE_PROBE, matteFeather, matteThreshold, noiseFrom,
  plateVerdict,
} from '../../../src/domain/environment.js';

/**
 * Three seconds of the room with nobody in it, taken in the control room.
 * [Doctrine CHANNEL §26; STUDIO-TWO §4, S-6]
 *
 * *"There is no segmentation model here guessing where a person ends; there
 *  is a PLATE — three seconds of the room with nobody in it — and everything
 *  that differs from the plate by more than the room's own measured noise is
 *  the performer."*
 *
 * STUDIO TWO TAKES ONE BEFORE A PERFORMANCE; a broadcast has to take one
 * while it is happening, of whoever is on the wire. So this is the same
 * measurement done from a `<video>` rather than from a file: the same number
 * of frames, reduced to the same 160×90, and the same per-pixel standard
 * deviation over time — `noiseFrom`, which both paths now call. A studio
 * that promised a clean key and a render that did not deliver one would be
 * two answers to one question. [D-19]
 *
 * AND IT CAN BE TAKEN OF A GUEST. Their camera is already in the mesh and
 * already decoded in this browser, so "ask them to step out of shot and
 * press Take plate" is the whole procedure — no upload, no round trip, and
 * nothing of their room stored anywhere but this page. [D-03]
 */

/** How long the whole capture takes. Sixteen frames, about two seconds. */
const EVERY_MS = 120;

export interface LivePlate {
  /** The averaged still, as something a shader can sample. */
  still: HTMLCanvasElement;
  /** How much the room moves on its own, 0..1. Measured. */
  noise: number;
  /** How well a matte from it will hold up, 0..1. Measured. */
  quality: number;
  /** What to tell the operator, in their language rather than ours. */
  says: string;
  ok: boolean;
  /** Exactly what the compositor needs, so nothing re-derives it. */
  threshold: number;
  feather: number;
  capturedAt: string;
  width: number;
  height: number;
}

/** The size the averaged still is kept at. */
const STILL = { width: 640, height: 360 };

/**
 * Take one.
 *
 * TWO ACCUMULATORS AT TWO SIZES, in one pass over the frames: a small grey
 * one for the measurement, because movement is a property of the room and
 * not of its resolution, and a larger colour one for the still the matte
 * will difference against. Averaging is the point — differencing against a
 * single noisy frame puts that frame's noise into every matte for ever.
 */
export async function takePlate(video: HTMLVideoElement): Promise<LivePlate> {
  if (video.videoWidth === 0) throw new Error('there is no picture to plate');

  const probe = document.createElement('canvas');
  probe.width = PLATE_PROBE.width;
  probe.height = PLATE_PROBE.height;
  const probePaper = probe.getContext('2d', { willReadFrequently: true });

  const still = document.createElement('canvas');
  still.width = STILL.width;
  still.height = STILL.height;
  const stillPaper = still.getContext('2d', { willReadFrequently: true });
  if (!probePaper || !stillPaper) throw new Error('no canvas');

  const pixels = PLATE_PROBE.width * PLATE_PROBE.height;
  const sum = new Float64Array(pixels);
  const sumSquares = new Float64Array(pixels);
  const average = new Float64Array(STILL.width * STILL.height * 4);

  for (let frame = 0; frame < PLATE_FRAMES; frame += 1) {
    probePaper.drawImage(video, 0, 0, probe.width, probe.height);
    const small = probePaper.getImageData(0, 0, probe.width, probe.height).data;
    for (let i = 0; i < pixels; i += 1) {
      /* Rec. 601 luma, which is what ffmpeg's `format=gray` produces —
         so the two measurements are of the same grey. */
      const grey = 0.299 * small[i * 4]! + 0.587 * small[i * 4 + 1]!
        + 0.114 * small[i * 4 + 2]!;
      sum[i]! += grey;
      sumSquares[i]! += grey * grey;
    }

    stillPaper.drawImage(video, 0, 0, still.width, still.height);
    const big = stillPaper.getImageData(0, 0, still.width, still.height).data;
    for (let i = 0; i < average.length; i += 1) average[i]! += big[i]!;

    if (frame < PLATE_FRAMES - 1) {
      await new Promise((done) => { window.setTimeout(done, EVERY_MS); });
    }
  }

  const out = stillPaper.createImageData(still.width, still.height);
  for (let i = 0; i < average.length; i += 1) {
    out.data[i] = Math.round(average[i]! / PLATE_FRAMES);
  }
  /* Alpha back to opaque: averaging it is harmless but rounding is not. */
  for (let i = 3; i < out.data.length; i += 4) out.data[i] = 255;
  stillPaper.putImageData(out, 0, 0);

  const measured = noiseFrom(sum, sumSquares, PLATE_FRAMES, pixels);
  const asPlate = {
    assetId: 'live' as never,
    noise: measured.noise,
    quality: measured.quality,
    width: video.videoWidth,
    height: video.videoHeight,
    capturedAt: new Date().toISOString(),
  };
  const verdict = plateVerdict(asPlate);
  return {
    still,
    noise: measured.noise,
    quality: measured.quality,
    says: verdict.text,
    ok: verdict.ok,
    /* Computed here so the compositor is handed numbers and never a
       policy: the same two functions the ffmpeg chain is built from. */
    threshold: matteThreshold(asPlate),
    feather: matteFeather(asPlate),
    capturedAt: asPlate.capturedAt,
    width: video.videoWidth,
    height: video.videoHeight,
  };
}

/** About how long `takePlate` will hold the camera, for the button to say. */
export const PLATE_SECONDS = Math.round((PLATE_FRAMES * EVERY_MS) / 1000);
