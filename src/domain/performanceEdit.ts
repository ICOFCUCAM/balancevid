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

import { LAYOUTS, takeSlots } from './presentation.js';
import { type RoomPlate, SPACE_LOOKS, needsMatte } from './environment.js';
import { DEFAULT_TRANSITION, isTransition } from './transitions.js';
import { newId } from './ids.js';
import type { TakeId } from './document.js';
import {
  type AudioMode, type MasterTrack, type Performance, type PerformanceTake, type Scene,
  AUDIO_MODES, MASTER_CLASSES, PERFORMANCE_SCHEMA_VERSION,
  coverage, orderedScenes, plateFor, takeById,
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
    plates: [],
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
  if (environment.kind === 'space' && !SPACE_LOOKS[environment.spaceId!]) {
    fail(`unknown space: ${environment.spaceId}`);
  }
  if (environment.kind === 'custom' && !environment.assetId) {
    fail('a custom background needs a picture');
  }
  /*
   * INV-16, at the door as well as at the render. Anything but the room they
   * were actually in needs the performer separated from that room, and the
   * only thing here that can separate them is a plate. Refused with the
   * remedy, because "not possible" and "record three seconds of the empty
   * room" are the same fact said two ways and only one of them is useful.
   */
  if (needsMatte(environment) && !plateFor(performance, target)) {
    fail('that background needs a matte, and this take has no plate to make one '
      + 'from — record three seconds of the empty room, then set it again');
  }
  target.environment = environment;
}

/* ------------------------------------------------------------------------ *
 *  Plates — the room with nobody in it.  [§4, S-6, INV-16]
 * ------------------------------------------------------------------------ */

/**
 * A measured plate arrives.
 *
 * Appended rather than replacing: a performance recorded over a week is
 * recorded in more than one light, and the takes shot against the old plate
 * still need it. Nothing is ever matted against a plate it was not shot with.
 */
export function addPlate(performance: Performance, plate: RoomPlate): void {
  if (performance.plates.some((p) => p.assetId === plate.assetId)) {
    fail('that plate is already on this performance');
  }
  performance.plates.push(plate);
}

/**
 * Which plate a take is matted against.
 *
 * Set when the take is recorded, from whichever plate was current; changed
 * afterwards only by an author who knows the camera did not move between the
 * two. Clearing it puts the take back in its own room, so the environment
 * goes back with it rather than being left describing a matte that no longer
 * exists.
 */
export function usePlate(
  performance: Performance, takeId: string, plateAssetId: string | null,
): void {
  const target = take(performance, takeId);
  if (plateAssetId === null) {
    delete target.plateAssetId;
    if (needsMatte(target.environment)) target.environment = { kind: 'original' };
    return;
  }
  const plate = performance.plates.find((p) => p.assetId === plateAssetId);
  if (!plate) fail(`no such plate: ${plateAssetId}`);
  target.plateAssetId = plate!.assetId;
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
  /*
   * The arrangement decides how many takes it can hold, and it is asked here
   * rather than discovered at render time. Three takes in a two-panel scene
   * is not a preference to interpret — it is a panel that does not exist, and
   * a silently dropped performance is the kind of thing an author finds after
   * exporting.
   */
  const slots = takeSlots(layout!);
  if (slots > 0 && scene.takeIds.length !== slots) {
    fail(`"${layout!.label}" holds ${slots} `
      + `performance${slots === 1 ? '' : 's'}, not ${scene.takeIds.length}`);
  }
  if (scene.audioMode && !AUDIO_MODES.includes(scene.audioMode)) {
    fail(`unknown audio mode: ${scene.audioMode}`);
  }
  // §11's list is longer than what is built, and a scene naming a transition
  // nobody wrote is a render that fails at the end rather than an edit that
  // fails now. [S-8]
  if (scene.transition && !isTransition(scene.transition)) {
    fail(`unknown transition: ${scene.transition}`);
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

/**
 * How this scene arrives.  [§11, S-8]
 *
 * On the scene being arrived AT, because that is the boundary it describes and
 * because a scene deleted takes its own transition with it rather than leaving
 * a dissolve into something else.
 */
export function setTransition(
  performance: Performance, sceneId: string, transition: string | null,
): void {
  const scene = performance.scenes.find((s) => s.id === sceneId)
    ?? fail(`no such scene: ${sceneId}`) as never;
  if (transition === null || transition === DEFAULT_TRANSITION) {
    delete scene.transition;
    return;
  }
  if (!isTransition(transition)) fail(`unknown transition: ${transition}`);
  scene.transition = transition;
}

/**
 * One scene's answer, where it differs from the performance's.  [S-7]
 *
 * The fourth mode S-7 said came free once the sound timeline was separate from
 * the picture: the crowd from the concert-stage take under the chorus, and the
 * studio vocal everywhere else. `null` puts the scene back on the
 * performance's own mode rather than freezing today's default into it.
 */
export function setSceneAudio(
  performance: Performance, sceneId: string, mode: AudioMode | null,
): void {
  const scene = performance.scenes.find((s) => s.id === sceneId)
    ?? fail(`no such scene: ${sceneId}`) as never;
  if (mode === null) { delete scene.audioMode; return; }
  if (!AUDIO_MODES.includes(mode)) fail(`unknown audio mode: ${mode}`);
  if (mode === 'master_vocal' && !performance.audio.vocalTakeId) {
    fail('name a take as the master vocal before a scene can ask for it');
  }
  scene.audioMode = mode;
}

/* ------------------------------------------------------------------------ *
 *  Beats — a suggestion until somebody says otherwise.  [§11, S-8, INV-06]
 * ------------------------------------------------------------------------ */

/**
 * What the detector heard. Written unaccepted, always.
 *
 * Re-detecting does not silently re-accept: if the author had accepted the
 * old grid and the song was replaced, the new reading is a new suggestion.
 */
export function recordBeats(
  performance: Performance,
  detected: { bpm: number; phaseSamples: Samples; confidence: number },
  detector: string, at: string,
): void {
  if (!Number.isFinite(detected.bpm) || detected.bpm <= 0) fail('that is not a tempo');
  assertSamples(detected.phaseSamples);
  performance.beats = {
    bpm: detected.bpm,
    phaseSamples: detected.phaseSamples,
    confidence: detected.confidence,
    detector,
    detectedAt: at,
  };
}

/** A human said yes, and only now may anything move a cut. [INV-06] */
export function acceptBeats(performance: Performance, who: string, at: string): void {
  const beats = performance.beats ?? fail('no beats have been found in this song') as never;
  if (!who.trim()) fail('an acceptance needs somebody to have made it');
  performance.beats = { ...beats, acceptedBy: who.trim(), acceptedAt: at };
}

/**
 * Half it, double it, or type it.  [S-8]
 *
 * The one correction the detector needs: it cannot tell a tempo from twice a
 * tempo, and neither can a person — but the person knows which one they are
 * counting. Setting it is itself an acceptance, because the author has just
 * told the product what the tempo is.
 */
export function setTempo(
  performance: Performance, bpm: number, who: string, at: string,
): void {
  const beats = performance.beats ?? fail('no beats have been found in this song') as never;
  if (!Number.isFinite(bpm) || bpm < 20 || bpm > 400) fail(`that is not a tempo: ${bpm}`);
  performance.beats = {
    ...beats,
    bpm: Number(bpm.toFixed(2)),
    acceptedBy: who.trim() || beats.acceptedBy || fail('who is setting this tempo?') as never,
    acceptedAt: at,
  };
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
