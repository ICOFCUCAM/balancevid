/**
 * Where the finished sound comes from.  [Doctrine STUDIO-TWO §9, S-7, U-17]
 *
 * "The master vocal stays continuous while the video switches between
 *  environments."
 *
 * THAT SENTENCE IS THE WHOLE DESIGN. It says the audio timeline and the video
 * timeline are independent: scenes cut the picture, and they do not cut the
 * sound. Once that is true, §9's three modes are three answers to one question
 * — which sources are audible over this stretch of the song — and S-7's fourth,
 * a per-scene override, is free rather than a feature.
 *
 * WHAT COMES OUT OF HERE is a list of PIECES: one contiguous run of one source
 * on the master clock. Contiguous is the important word. In Mode C the vocal
 * is a single piece from the first cut to the last, so the renderer trims it
 * once and lays it down once — there is no seam at a picture cut because there
 * is nothing there to seam. A planner that emitted one piece per scene would
 * produce the same sound in theory and a click at every cut in practice.
 *
 * MODE B IS THE DANGEROUS ONE, as S-7 said: switching between takes' own audio
 * changes the room tone at every cut. The pieces therefore carry a fade at
 * each end, so picture and sound are allowed to change at the same instant
 * without the sound doing it instantly.
 */

import type { AssetId, TakeId } from './document.js';
import {
  type AudioMode, type Performance, type PerformanceTake, type PerformanceWindow,
  coverage, projectPerformance, takeById,
} from './performance.js';
import { type Samples, HOUSE_SAMPLE_RATE } from './time.js';

/**
 * The fade at each end of a piece, in samples (~24 ms).
 *
 * Long enough that a room-tone change is a movement rather than an edge, short
 * enough that a word starting on the cut is not swallowed. The same order as
 * U-17's declick, and for the same reason.
 */
export const AUDIO_FADE_SAMPLES = Math.round(HOUSE_SAMPLE_RATE * 0.024);

export interface AudioPiece {
  /** `master` is the song; `take` is a performance's own microphone. */
  kind: 'master' | 'take';
  /** On the master clock. */
  fromSample: Samples;
  toSample: Samples;
  takeId?: TakeId;
  assetId?: AssetId;
  /**
   * Where this piece begins inside the take's own media, in samples.
   *
   * Zero for the master, which IS the clock. For a take it is the arithmetic
   * INV-14 makes possible: the alignment was measured, so the sound can be
   * placed without anybody listening to it.
   */
  mediaFromSample: Samples;
  /** Fades, in samples, applied at this piece's own ends. */
  fadeInSamples: Samples;
  fadeOutSamples: Samples;
  /**
   * This take's clock against the song's, where it was measured. [§10, S-3]
   *
   * Absent means one. Present, the mixer reads more (or less) of the take than
   * the piece is long and plays it at that speed, for the same reason the
   * picture does: a correction applied only at the in-point is not a
   * correction of drift, it is a correction of the moment before it starts.
   */
  rateRatio?: number;
}

export class PerformanceAudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PerformanceAudioError';
  }
}

/**
 * Which sources are audible over each stretch of the song.
 *
 * Read per SPAN (a stretch with one scene on it) and then merged, so the modes
 * can differ scene by scene without the sound being chopped up by scenes that
 * agree with each other.
 */
export function planPerformanceAudio(
  performance: Performance, window?: PerformanceWindow,
): AudioPiece[] {
  const timeline = projectPerformance(performance, window);
  if (timeline.spans.length === 0) return [];
  /*
   * A clip's sound starts at the clip's own zero, while the SOURCES are still
   * read at their place in the song. Two clocks, and the piece carries both:
   * `fromSample` is where it lands in the finished video, `mediaFromSample` is
   * where to read it from. Confusing them is a chorus clip playing the first
   * verse. [§14]
   */
  const zero = window ? Math.max(0, window.fromSample) : 0;

  /** source key → the runs it is audible for, in order. */
  const runs = new Map<string, { takeId?: TakeId; from: Samples; to: Samples }[]>();

  const extend = (key: string, takeId: TakeId | undefined, from: Samples, to: Samples) => {
    if (to <= from) return;
    const list = runs.get(key) ?? [];
    const last = list[list.length - 1];
    /*
     * Touching runs are ONE run. This is what makes Mode C continuous, and it
     * is also what stops Mode A putting a seam in a vocal every time the
     * author cuts to another camera of the same person.
     */
    if (last && last.to === from) last.to = to;
    else list.push({ ...(takeId ? { takeId } : {}), from, to });
    runs.set(key, list);
  };

  for (const span of timeline.spans) {
    const mode: AudioMode = span.scene.audioMode ?? performance.audio.mode;

    if (mode === 'take_audio') {
      // B — whatever the visible take recorded, and nothing else.
      for (const take of span.takes) {
        if (!audible(take)) continue;
        clip(take, span.fromSample, span.toSample, (from, to) =>
          extend(`take:${take.id}`, take.id as TakeId, from, to));
      }
      continue;
    }

    // A and C both keep the song underneath.
    extend('master', undefined, span.fromSample, span.toSample);

    if (mode === 'music_and_mic') {
      /*
       * A — the microphone of whoever is on screen. Both of them, when two
       * are: a scene showing two performers is two people singing, and
       * choosing one of them for the author would be the product deciding who
       * the duet belongs to.
       */
      for (const take of span.takes) {
        if (!audible(take)) continue;
        clip(take, span.fromSample, span.toSample, (from, to) =>
          extend(`take:${take.id}`, take.id as TakeId, from, to));
      }
      continue;
    }

    // C — one vocal, recorded once, continuous across every cut.
    const vocalId = performance.audio.vocalTakeId;
    if (!vocalId) {
      throw new PerformanceAudioError(
        'the master vocal mode is chosen but no take has been named as the vocal');
    }
    const vocal = takeById(performance, vocalId);
    if (!vocal) throw new PerformanceAudioError(`no such vocal take: ${vocalId}`);
    if (!audible(vocal)) {
      throw new PerformanceAudioError(
        `"${vocal.label}" is the master vocal but was recorded with no sound in it`);
    }
    clip(vocal, span.fromSample, span.toSample, (from, to) =>
      extend(`take:${vocal.id}`, vocal.id as TakeId, from, to));
  }

  const pieces: AudioPiece[] = [];
  for (const [key, list] of runs) {
    for (const run of list) {
      if (key === 'master') {
        pieces.push({
          kind: 'master',
          fromSample: run.from - zero, toSample: run.to - zero,
          mediaFromSample: run.from,
          ...fades(run.from, run.to, performance, window),
        });
        continue;
      }
      const take = takeById(performance, run.takeId!)!;
      pieces.push({
        kind: 'take',
        takeId: take.id as TakeId,
        assetId: take.assetId as AssetId,
        fromSample: run.from - zero, toSample: run.to - zero,
        mediaFromSample: Math.max(0, Math.round(
          (run.from - effective(take)) * take.alignment.rateRatio)),
        ...(take.alignment.rateRatio !== 1
          ? { rateRatio: take.alignment.rateRatio } : {}),
        ...fades(run.from, run.to, performance, window),
      });
    }
  }

  // Deterministic order: the plan is hashed, and a Map's iteration order is a
  // property of how the document happened to be read.
  return pieces.sort((a, b) => a.fromSample - b.fromSample
    || (a.kind === b.kind ? 0 : a.kind === 'master' ? -1 : 1)
    || String(a.takeId).localeCompare(String(b.takeId)));
}

/** Which takes' sound is used anywhere, for the renderer to open. */
export function audioTakes(pieces: AudioPiece[]): AssetId[] {
  return [...new Set(pieces
    .filter((piece) => piece.kind === 'take')
    .map((piece) => piece.assetId as AssetId))];
}

/* ------------------------------------------------------------------------ */

/**
 * A take recorded silent contributes nothing and must not be asked to.
 *
 * `hasAudio` is measured when the take lands, so this is a fact about the
 * recording rather than an assumption about the author's microphone.
 */
function audible(take: PerformanceTake): boolean {
  return take.hasAudio !== false;
}

/** The part of this stretch the take actually has sound for. */
function clip(
  take: PerformanceTake, from: Samples, to: Samples,
  emit: (from: Samples, to: Samples) => void,
): void {
  const own = coverage(take);
  const start = Math.max(from, own.fromSample);
  const end = Math.min(to, own.toSample);
  if (end > start) emit(start, end);
}

function effective(take: PerformanceTake): Samples {
  return take.alignment.offsetSamples + (take.alignment.nudgeSamples ?? 0);
}

/**
 * The fades at a piece's ends.
 *
 * Absent at the very start and the very end of the song, where the master
 * pass's own mastering handles the edges — a fade-in on the first sample of a
 * song that begins on a downbeat is an audible mistake.
 */
function fades(
  from: Samples, to: Samples, performance: Performance, window?: PerformanceWindow,
): { fadeInSamples: Samples; fadeOutSamples: Samples } {
  const length = to - from;
  const fade = Math.min(AUDIO_FADE_SAMPLES, Math.floor(length / 2));
  /*
   * A clip's edges are the opposite case from the song's. The song begins on
   * a downbeat somebody wrote and must not be faded into; a clip is cut out of
   * the middle of a song and must be, or it starts with a bang and stops
   * mid-word. [§14]
   */
  if (window) return { fadeInSamples: fade, fadeOutSamples: fade };
  return {
    fadeInSamples: from <= 0 ? 0 : fade,
    fadeOutSamples: to >= performance.master.durationSamples ? 0 : fade,
  };
}
