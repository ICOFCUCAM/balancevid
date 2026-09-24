/**
 * Editing a Performance.  [Doctrine STUDIO-TWO §7, §8, §15, D-13, INV-00]
 *
 * Every operation mutates a draft document and nothing else — no I/O, no
 * rendering, no derived state — because the Performance is canonical and
 * everything downstream is recomputed from it.
 *
 * The two rules `edit.ts` keeps, kept here too:
 *
 *   DESTRUCTIVE ACTIONS ARE REVERSIBLE (D-13). Re-recording appends a take;
 *   trimming moves markers rather than cutting media; removing a take from a
 *   scene never touches the bytes on disk.
 *
 *   THE PERFORMANCE IS IRREPLACEABLE. Somebody sang that. Nothing here can
 *   leave a Performance with no way back to what was recorded.
 *
 * And one this file adds, which is the brief's own:
 *
 *   THE TAKES ARE NEVER MERGED. Nothing here produces media. Switching writes
 *   scenes, editing moves them, and the master video is made at the end from
 *   what they say.
 */

import { LAYOUTS } from './presentation.js';
import { newId } from './ids.js';
import type { TakeId } from './document.js';
import {
  type AudioMode, type MasterTrack, type Performance, type PerformanceTake, type Scene,
  AUDIO_MODES, MASTER_CLASSES, PERFORMANCE_SCHEMA_VERSION,
  coverage, orderedScenes, takeById,
} from './performance.js';
import { type Samples, assertSamples } from './time.js';

/**
 * A new Performance.
 *
 * Here rather than beside the type, because it is the one thing in that file
 * that needs an id generator and `newId` reaches `node:crypto` — which puts
 * the whole document module out of reach of the browser, and Studio Two's
 * interface needs its vocabulary.
 */
export function newPerformance(
  title: string, master: MasterTrack, at: string,
): Performance {
  return {
    schemaVersion: PERFORMANCE_SCHEMA_VERSION,
    id: newId('perf'),
    title,
    master,
    takes: [],
    scenes: [],
    audio: { mode: 'music_and_mic' },
    layoutProfileId: 'default',
    createdAt: at,
    updatedAt: at,
  };
}

export class PerformanceEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PerformanceEditError';
  }
}

const fail = (message: string): never => { throw new PerformanceEditError(message); };

/* ------------------------------------------------------------------------ *
 *  Takes.
 * ------------------------------------------------------------------------ */

/** A recording arrives. It is never merged into anything. [§1] */
export function addTake(performance: Performance, take: PerformanceTake): void {
  if (takeById(performance, take.id)) fail(`take ${take.id} is already in this performance`);
  performance.takes.push(take);
}

/**
 * Remove a take from the document.
 *
 * The media stays on disk (D-13) and every scene that named it forgets it —
 * silently leaving a scene pointing at a take that is gone would turn a
 * deletion into a render failure later.
 */
export function removeTake(performance: Performance, takeId: string): void {
  if (!takeById(performance, takeId)) fail(`no such take: ${takeId}`);
  if (performance.audio.vocalTakeId === takeId) {
    fail('that take is the master vocal — choose another vocal before removing it');
  }
  performance.takes = performance.takes.filter((take) => take.id !== takeId);
  for (const scene of performance.scenes) {
    scene.takeIds = scene.takeIds.filter((id) => id !== takeId);
  }
}

export function renameTake(performance: Performance, takeId: string, label: string): void {
  const trimmed = label.trim();
  if (!trimmed) fail('a take needs a name — that is how you will find it later');
  take(performance, takeId).label = trimmed;
}

/** Where the performance appears to happen. A field, never pixels. [§4, S-6] */
export function setEnvironment(
  performance: Performance, takeId: string, environment: PerformanceTake['environment'],
): void {
  const target = take(performance, takeId);
  if (environment.kind === 'space' && !environment.spaceId) {
    fail('a virtual space needs to say which one');
  }
  if (environment.kind === 'custom' && !environment.assetId) {
    fail('a custom background needs a picture');
  }
  target.environment = environment;
}

/**
 * The author's correction to where a take sits on the song.  [§10, S-3]
 *
 * Written to `nudgeSamples`, never to the measurement. Two reasons, both
 * learned from tools that get it wrong: re-measuring must not discard a
 * human's fix, and keeping them apart is the only way to see how far off the
 * automatic answer was.
 */
export function nudgeTake(
  performance: Performance, takeId: string, nudgeSamples: Samples,
): void {
  if (!Number.isInteger(nudgeSamples)) {
    fail(`a nudge is a whole number of samples, got ${nudgeSamples}`);
  }
  take(performance, takeId).alignment.nudgeSamples = nudgeSamples;
}

/**
 * A measurement replaces a measurement.  [§10, S-3]
 *
 * A manual placement is never overwritten by an automatic one: the author
 * placed it because the automatic answer was wrong, and quietly putting the
 * wrong answer back is the worst thing this function could do.
 */
export function realign(
  performance: Performance, takeId: string, alignment: PerformanceTake['alignment'],
): void {
  const target = take(performance, takeId);
  if (target.alignment.method === 'manual' && alignment.method !== 'manual') {
    fail('this take was placed by hand — re-measuring would discard that');
  }
  assertSamples(Math.max(0, alignment.offsetSamples));
  target.alignment = { ...alignment, ...(target.alignment.nudgeSamples !== undefined
    ? { nudgeSamples: target.alignment.nudgeSamples } : {}) };
}

/**
 * Use only part of a take.  [S-10]
 *
 * Markers, not a cut: the media is untouched and the trim can be widened
 * again tomorrow. Both ends are on the MASTER clock, because that is the
 * clock the author is looking at.
 */
export function trimTake(
  performance: Performance, takeId: string,
  useFromSample: Samples | null, useToSample: Samples | null,
): void {
  const target = take(performance, takeId);
  if (useFromSample === null) delete target.useFromSample;
  else { assertSamples(useFromSample); target.useFromSample = useFromSample; }
  if (useToSample === null) delete target.useToSample;
  else { assertSamples(useToSample); target.useToSample = useToSample; }

  const { fromSample, toSample } = coverage(target);
  if (toSample <= fromSample) {
    fail('that trim leaves nothing of the take');
  }
}

/* ------------------------------------------------------------------------ *
 *  Scenes — written by switching, adjusted by dragging.  [§7, §8, S-4]
 * ------------------------------------------------------------------------ */

/**
 * Put something on screen from this moment on.
 *
 * THIS IS BOTH OF THE BRIEF'S TWO MODES. Pressed live while the song plays it
 * is §7's switching; called from a timeline it is §8's editing. There is one
 * artefact either way, which is why the two can never disagree.
 *
 * A scene at a sample that already has one REPLACES it rather than stacking a
 * second: pressing 2 twice at the same instant is one decision, and two
 * scenes at the same moment is a document whose order depends on a tiebreak.
 */
export function setScene(
  performance: Performance,
  at: Samples,
  scene: { layoutId: string; takeIds: string[]; transition?: string; label?: string;
    audioMode?: AudioMode },
): Scene {
  assertSamples(at);
  if (at >= performance.master.durationSamples) {
    fail('that is past the end of the song');
  }
  const layout = LAYOUTS[scene.layoutId];
  if (!layout) fail(`unknown arrangement: ${scene.layoutId}`);
  if (scene.takeIds.length === 0) fail('a scene has to show somebody');
  for (const id of scene.takeIds) take(performance, id);
  if (new Set(scene.takeIds).size !== scene.takeIds.length) {
    fail('the same take cannot occupy two panels of one scene');
  }
  if (scene.audioMode && !AUDIO_MODES.includes(scene.audioMode)) {
    fail(`unknown audio mode: ${scene.audioMode}`);
  }

  const existing = performance.scenes.find((s) => s.fromSample === at);
  const next: Scene = {
    id: existing?.id ?? newId('scene'),
    fromSample: at,
    layoutId: scene.layoutId,
    takeIds: [...scene.takeIds] as TakeId[],
    ...(scene.transition ? { transition: scene.transition } : {}),
    ...(scene.label ? { label: scene.label } : {}),
    ...(scene.audioMode ? { audioMode: scene.audioMode } : {}),
  };
  if (existing) performance.scenes[performance.scenes.indexOf(existing)] = next;
  else performance.scenes.push(next);
  return next;
}

/**
 * Drag a boundary.  [§8]
 *
 * The one operation §8 asks for, and the only thing it may change is where a
 * scene begins. Moving a scene onto another's start would make two scenes at
 * one instant, so it is refused with the reason rather than silently
 * absorbing one into the other.
 */
export function moveScene(
  performance: Performance, sceneId: string, toSample: Samples,
): void {
  assertSamples(toSample);
  const scene = performance.scenes.find((s) => s.id === sceneId)
    ?? fail(`no such scene: ${sceneId}`) as never;
  if (toSample >= performance.master.durationSamples) {
    fail('that is past the end of the song');
  }
  if (performance.scenes.some((s) => s.id !== sceneId && s.fromSample === toSample)) {
    fail('there is already a scene starting at that moment');
  }
  scene.fromSample = toSample;
}

export function removeScene(performance: Performance, sceneId: string): void {
  if (!performance.scenes.some((s) => s.id === sceneId)) fail(`no such scene: ${sceneId}`);
  performance.scenes = performance.scenes.filter((s) => s.id !== sceneId);
}

/** Name a stretch of the song — "Chorus", "Verse 2". [§15] */
export function labelScene(
  performance: Performance, sceneId: string, label: string | null,
): void {
  const scene = performance.scenes.find((s) => s.id === sceneId)
    ?? fail(`no such scene: ${sceneId}`) as never;
  if (label === null || !label.trim()) delete scene.label;
  else scene.label = label.trim();
}

/**
 * Clear the picture track and start again.
 *
 * Offered because §7's live switching is a performance in itself and the
 * second attempt is usually better. It removes scenes and never a take: the
 * recordings are what cost something to make.
 */
export function clearScenes(performance: Performance): void {
  performance.scenes = [];
}

/* ------------------------------------------------------------------------ *
 *  Sound.  [§9, S-7]
 * ------------------------------------------------------------------------ */

export function setAudioMode(
  performance: Performance, mode: AudioMode, vocalTakeId?: string | null,
): void {
  if (!AUDIO_MODES.includes(mode)) fail(`unknown audio mode: ${mode}`);
  if (mode === 'master_vocal') {
    const id = vocalTakeId ?? performance.audio.vocalTakeId ?? null;
    if (!id) fail('the master vocal mode needs a take to use as the vocal');
    take(performance, id!);
    performance.audio = { mode, vocalTakeId: id as TakeId };
    return;
  }
  const { vocalTakeId: kept } = performance.audio;
  // The vocal take is remembered through a change of mode, so switching to
  // hear the room and back does not lose which take was the voice.
  performance.audio = { mode, ...(kept ? { vocalTakeId: kept } : {}) };
}

/* ------------------------------------------------------------------------ *
 *  Rights.  [§S-9, INV-15]
 * ------------------------------------------------------------------------ */

/**
 * Say what this music is, and what may be done with it.
 *
 * Changeable, because an author who records against a placeholder and then
 * buys a licence should not have to start again — and because the honest
 * default for anything uploaded is the most restrictive one, which they then
 * correct.
 */
export function classifyMaster(
  performance: Performance,
  update: { class: Performance['master']['class']; licence?: string | null },
): void {
  /*
   * Checked at runtime, not only in the types. This is reached from an HTTP
   * body, where the type is a description of what was hoped for — and an
   * unrecognised class written into the document is a rights answer nobody
   * gave. [INV-15]
   */
  if (!MASTER_CLASSES.includes(update.class)) {
    fail(`unknown class of music: ${String(update.class)}`);
  }
  performance.master.class = update.class;
  if (update.licence === null || update.licence === undefined) {
    if (update.class === 'own' || update.class === 'third_party') {
      delete performance.master.licence;
    }
  } else {
    performance.master.licence = update.licence.trim();
  }
}

/* ------------------------------------------------------------------------ */

function take(performance: Performance, takeId: string): PerformanceTake {
  return takeById(performance, takeId) ?? fail(`no such take: ${takeId}`) as never;
}

/** Exported for a panel that wants to show the scenes in order. */
export { orderedScenes };
