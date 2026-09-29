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
import { EFFECT_LOOKS, type RoomPlate, SPACE_LOOKS, needsMatte } from './environment.js';
import {
  DEFAULT_TRANSITION, MAX_TRANSITION_FRAMES, MIN_TRANSITION_FRAMES,
  type TransitionAlign, isTransition, isTransitionAlign, transitionOf,
} from './transitions.js';
import { NO_CLEANUP, isCleanup } from './cleanup.js';
import { type ColourReading, isMeasured } from './colour.js';
import { NO_STABILIZER, isStabilizer } from './stabilize.js';
import { newId } from './ids.js';
import type { TakeId } from './document.js';
import {
  type AudioMode, type MasterTrack, type Performance, type PerformanceTake, type Scene,
  AUDIO_MODES, MASTER_CLASSES, PERFORMANCE_SCHEMA_VERSION,
  TAKE_ACCENT_FALLBACK,
  allProblems, coverage, coversSpan, mayPublish, orderedScenes, plateFor,
  renderProblems, takeById,
} from './performance.js';
import { type Frames, type Samples, assertSamples } from './time.js';

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

/**
 * WHAT THE SONG IS CALLED.  [STUDIO-TWO §3]
 *
 * The title arrives from the uploaded file's tags, or from its filename
 * when it has none — which is how a performance ends up called
 * "01 Track 1 (final) (2).mp3". Until now there was no way to change it:
 * the one name on every card, every rail and every published page was
 * whatever a stranger's encoder wrote into an ID3 frame.
 *
 * It renames the PERFORMANCE and not the master's metadata, because the
 * metadata is a record of the file that arrived and altering it would lose
 * the only evidence of where the audio came from. [U-25]
 */
export function renamePerformance(performance: Performance, title: string): void {
  const next = title.trim();
  if (!next) fail('a song needs a name');
  if (next.length > 200) fail('that name is too long');
  performance.title = next;
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
/**
 * The colours takes are identified by, in the order they are handed out.
 *
 * Distinct from the participant palette on purpose: a room's colours separate
 * PEOPLE, and a performance's separate TAKES OF ONE PERSON. Sharing a table
 * would eventually put Sarah and Take 3 in the same colour in a product that
 * shows both, which is a worse confusion than having two short lists.
 */
export const TAKE_ACCENTS = [
  TAKE_ACCENT_FALLBACK,
  '#4f8a5b', '#c99a2e', '#b5553f', '#8a6fb0', '#5f8f8f', '#c2794f',
];

export function addTake(performance: Performance, take: PerformanceTake): void {
  if (takeById(performance, take.id)) fail(`take ${take.id} is already in this performance`);
  /*
   * A colour, unless the caller brought one. Assigned from how many takes
   * there ARE rather than from a counter, so it is a pure function of the
   * document — and never reassigned afterwards, because a take that changed
   * colour when another was deleted would relabel the whole timeline
   * underneath somebody mid-edit. [§2, §7]
   */
  if (!take.accent) {
    take.accent = TAKE_ACCENTS[performance.takes.length % TAKE_ACCENTS.length]!;
  }
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
  /*
   * AND THE OTHER HALF OF THE STABILISER'S REFUSAL. `setStabilize` refuses a
   * take that is already in a replaced background; this refuses a
   * replacement on a take that is already stabilised. Either alone would
   * leave the ORDER THE AUTHOR HAPPENED TO PRESS THINGS IN deciding whether
   * the render comes out torn, which is the worst kind of rule: it works
   * when you test it and fails for somebody who did it the other way.
   * [INV-16, MASTER-EDIT §8]
   */
  if (needsMatte(environment) && target.stabilize) {
    fail(`"${target.label}" is stabilised, and a replaced background is keyed `
      + 'against a still of the room the take no longer lines up with — turn '
      + 'the stabiliser off first');
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

  const { fromSample, toSample } = coverage(target, performance.master.durationSamples);
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

/**
 * Close a hole by starting the next scene earlier.  [§8, INV-03]
 *
 * A gap is song with no picture, and every gap this product can produce has
 * the same shape: the stretch before the first scene begins. The author's
 * remedy has always been available — drag the boundary back — and has always
 * been theirs to work out from a sentence. This is that drag, as one action,
 * offered beside the sentence that names the hole.
 *
 * IT REFUSES A FIX THAT IS NOT ONE. Moving a scene back over the hole only
 * works if the takes in it have picture that far back; if they do not, the
 * gap is replaced by "these takes do not reach all of it", which is the same
 * render refused for a different reason and a worse experience than not
 * offering the button. So the move is made, the question is asked again, and
 * anything short of an improvement is put back — with what went wrong said
 * out loud, because "that did not work" teaches nobody anything.
 *
 * Nothing is rendered black to make this pass. A hole stays a hole until
 * something covers it. [INV-03]
 */
export function coverGap(
  performance: Performance, sceneId: string, fromSample: Samples,
): void {
  assertSamples(fromSample);
  const scene = performance.scenes.find((s) => s.id === sceneId)
    ?? fail(`no such scene: ${sceneId}`) as never;
  if (fromSample >= scene.fromSample) {
    fail('that scene already starts at or before there');
  }
  /*
   * ASKED OF THE WHOLE DOCUMENT, not of the holes alone. `renderProblems`
   * says nothing about transitions, and an edit judged by half the questions
   * can pass by trading one against the other. No such trade was found for
   * THIS operation — the hole is always the stretch before the first scene,
   * so the move lengthens a section rather than shortening one — but a guard
   * that is right for reasons outside itself is one refactor from being
   * wrong, and it asks the same question the others ask. [D-19]
   */
  const before = allProblems(performance);
  const was = scene.fromSample;
  moveScene(performance, sceneId, fromSample);
  const after = allProblems(performance);
  if (after.length >= before.length) {
    scene.fromSample = was;
    const blame = after.find((problem) => !before.includes(problem));
    fail(blame
      ? `starting that scene earlier does not cover the hole: ${blame}`
      : 'starting that scene earlier does not cover the hole');
  }
}

/**
 * Trim: move the boundary this clip starts at.  [MASTER-EDIT §2, §12 P1]
 *
 * TRIM IN A PARTITION IS A BOUNDARY MOVE, and saying so is the whole design.
 * A Scene has a `fromSample` and no end — it runs until the next one begins
 * — which is what makes the picture track continuous by construction and is
 * why this product cannot produce the gap-between-two-clips that every
 * sequencer can. Giving a scene its own out-point would buy a trim control
 * and sell INV-03 to pay for it.
 *
 * So there is no out-point. A clip's out IS the next clip's in, one clip's
 * trim is its neighbour's, and the inspector says that on screen rather than
 * pretending otherwise. The last clip has no out at all, because the song
 * ends where the song ends.
 *
 * WHAT THIS ADDS OVER `moveScene` IS THE GUARD. `moveScene` refuses a
 * collision and the far end of the song and nothing else, which is right for
 * switching — a live decision is the author's and is not second-guessed —
 * and wrong for dragging, where the author is looking at the consequence and
 * would rather be stopped than shown a hole. Same operation, same document,
 * one more question asked. [D-19]
 */
export function moveBoundary(
  performance: Performance, sceneId: string, toSample: Samples,
): void {
  assertSamples(toSample);
  const scene = performance.scenes.find((s) => s.id === sceneId)
    ?? fail(`no such scene: ${sceneId}`) as never;
  const before = allProblems(performance);
  const was = scene.fromSample;
  moveScene(performance, sceneId, toSample);
  const introduced = allProblems(performance).find((p) => !before.includes(p));
  if (introduced !== undefined) {
    scene.fromSample = was;
    fail(introduced);
  }
}

/**
 * Put a take on a stretch that has nothing on it.  [MASTER-EDIT §13]
 *
 * The other repair. `coverGap` drags the following scene back over the hole,
 * which is right when that scene's takes reach; this puts a NEW scene at the
 * start of the hole with a take that does. Both end with the hole closed and
 * neither renders black to get there.
 *
 * IT REFUSES A TAKE THAT WOULD NOT COVER IT, for the same reason `coverGap`
 * refuses a move that does not help: a repair that swaps "nothing is on
 * screen here" for "this take does not reach all of it" has moved the error.
 * The caller is told which takes would work — `repairsFor` computes exactly
 * that — so reaching this message means something raced.
 */
export function coverWith(
  performance: Performance, at: Samples, toSample: Samples, takeId: string,
): Scene {
  assertSamples(at);
  assertSamples(toSample);
  const chosen = take(performance, takeId);
  if (!coversSpan(chosen, at, toSample, performance.master.durationSamples)) {
    fail(`${chosen.label} has no picture across all of that stretch`);
  }
  const before = allProblems(performance).length;
  const scene = setScene(performance, at, {
    layoutId: 'performance_full', takeIds: [takeId],
  });
  if (allProblems(performance).length >= before) {
    performance.scenes = performance.scenes.filter((entry) => entry.id !== scene.id);
    fail('putting a take there does not close the hole');
  }
  return scene;
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
    const voice = take(performance, id!);
    /*
     * The waves cannot be the vocal.  [§9, S-29]
     *
     * Mode C is one performance of the song carried across every picture
     * change; footage is not a performance of the song. Refused here rather
     * than left to sound wrong, because a whole export would go out with surf
     * where the voice should be and nothing in the document would say why.
     */
    if (voice.kind === 'footage') {
      fail('footage cannot be the vocal — pick a take of somebody performing');
    }
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
  /*
   * A LENGTH SET FOR A DISSOLVE IS NOT A LENGTH FOR A FADE. Both exist in
   * frames, so keeping the number would type-check and be wrong: eight
   * frames is a brisk dissolve and a fade so short it reads as a flicker.
   * Changing the style puts the length back to that style's own. The
   * alignment is kept, because "who pays" is the author's taste about this
   * join and does not change with what is drawn across it.
   */
  delete scene.transitionFrames;
}

/**
 * How long the arrival takes, and which shot pays for it.
 * [MASTER-EDIT §3, §12 P1, INV-03]
 *
 * THE REASON THIS WAS A READOUT AND IS NOW A CONTROL. Duration was written
 * down as "not yet yours to set: both depend on whether the two takes have
 * picture across the overlap" — which was true, and was a description of a
 * constraint rather than a reason not to offer it. The constraint is
 * checkable: `joinProblems` is the same question MASTER CHECK asks before a
 * render and the planner asks before it builds one. So the length is the
 * author's to set, and anything the join cannot pay for is put back with the
 * reason said out loud, exactly as `coverGap` does. [D-19]
 *
 * THREE STATES, NOT TWO, FOR EACH ARGUMENT. `null` means "back to the
 * style's own", which is how an author undoes a length without having to
 * remember what it was. `undefined` means "leave that one alone" — and it
 * has to exist, because the alignment buttons send an alignment and nothing
 * else, and a two-state argument would read their silence as "reset the
 * duration". Pressing *Centred* would quietly throw away the length the
 * author had just dialled in, which is the kind of bug nobody reports
 * because it looks like they mis-clicked.
 */
export function setTransitionTiming(
  performance: Performance, sceneId: string,
  frames: Frames | null | undefined, align: string | null | undefined,
): void {
  const scene = performance.scenes.find((s) => s.id === sceneId)
    ?? fail(`no such scene: ${sceneId}`) as never;
  const ordered = orderedScenes(performance);
  if (ordered[0]?.id === scene.id) fail('nothing comes before that scene');
  if (transitionOf(scene).frames === 0) {
    fail('a cut has no length — choose a dissolve or a fade first');
  }
  if (align !== null && align !== undefined && !isTransitionAlign(align)) {
    fail(`unknown alignment: ${align}`);
  }
  const wanted = align as TransitionAlign | null | undefined;
  if (frames !== null && frames !== undefined) {
    if (!Number.isSafeInteger(frames)) fail('a duration is a whole number of frames');
    if (frames < MIN_TRANSITION_FRAMES) fail('a transition is at least one frame long');
    if (frames > MAX_TRANSITION_FRAMES) {
      fail(`${MAX_TRANSITION_FRAMES} frames is the longest a transition may be — `
        + 'past that it is a shot of its own, not a join');
    }
  }

  const hadFrames = scene.transitionFrames;
  const hadAlign = scene.transitionAlign;
  const before = new Set(allProblems(performance));

  if (frames === null) delete scene.transitionFrames;
  else if (frames !== undefined) scene.transitionFrames = frames;
  if (wanted === null) delete scene.transitionAlign;
  else if (wanted !== undefined) scene.transitionAlign = wanted;

  /*
   * PUT BACK, NOT REFUSED IN ADVANCE. Working out beforehand whether a given
   * length fits would be a fourth copy of the arithmetic in `joinSpan`, and
   * the fourth copy is the one that disagrees. Asking the same question the
   * render will ask, after the change, cannot drift from it.
   */
  const introduced = allProblems(performance).find((problem) => !before.has(problem));
  if (introduced !== undefined) {
    if (hadFrames === undefined) delete scene.transitionFrames;
    else scene.transitionFrames = hadFrames;
    if (hadAlign === undefined) delete scene.transitionAlign;
    else scene.transitionAlign = hadAlign;
    fail(introduced);
  }
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
 *  Publishing.  [§14, U-31, INV-15]
 * ------------------------------------------------------------------------ */

/**
 * Give the performance an audience.
 *
 * WHAT IS PUBLISHED IS A RENDER, as it is for a conversation: somebody
 * following a link watches a finished video, not a document that may change
 * under them while they are watching it.
 *
 * NOT RESPONDABLE, and the field is not a question here. U-31's "anyone can
 * open it and respond to it" is about a conversation, where responding is the
 * product. A performance is not an argument to answer; there is no mechanism
 * to answer it with, and offering the option would be a promise of a feature
 * that does not exist.
 */
export function publishPerformance(
  performance: Performance,
  options: { planHash: string; publishedAt: string; author?: string },
): void {
  if (!mayPublish(performance.master)) {
    /*
     * INV-15, at the act it exists for. Every other gate in this product is
     * about an exportable FILE; this is the one about a URL, and it is the
     * one that matters most — a private copy of a performance over somebody
     * else's record is a rehearsal, and a link to it is publishing it.
     */
    fail(`"${performance.master.title}" is not marked as something you may publish, `
      + 'so this cannot be given an audience. A private export is still yours.');
  }
  if (performance.scenes.length === 0) fail('there is nothing here to publish yet');
  if (!options.planHash.trim()) fail('publish a render, not a draft');

  performance.publication = {
    publishedAt: options.publishedAt,
    respondable: false,
    planHash: options.planHash,
    ...(options.author?.trim() ? { author: options.author.trim() } : {}),
  };
}

/** Withdraw it. The file stays on disk; the link stops working. */
export function unpublishPerformance(performance: Performance, at: string): void {
  const publication = performance.publication ?? fail('this is not published') as never;
  publication.unpublishedAt = at;
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

/**
 * What is done to a take's picture.  [Doctrine STUDIO-TWO §4, INV-00]
 *
 * Stored on the take rather than baked into it, exactly as the environment
 * is: the grade is a decision about the recording and the recording is the
 * work. Changing it re-renders and never re-records.
 *
 * An unknown id is refused here rather than silently kept, because this is
 * the door a person comes through — the RENDERER is lenient with an id it
 * does not recognise, since a plan made against a look that was later removed
 * should still render. Strict at the door, forgiving downstream.
 */
export function setEffect(
  performance: Performance, takeId: string, effect: string | null,
): void {
  const take = takeById(performance, takeId);
  if (!take) throw new PerformanceEditError(`no take ${takeId} in this performance`);
  if (effect === null || effect === 'none') {
    delete take.effect;
    return;
  }
  if (!EFFECT_LOOKS[effect]) throw new PerformanceEditError(`unknown treatment: ${effect}`);
  take.effect = effect;
}

/**
 * What to do about the room this take was recorded in.
 * [MASTER-EDIT §8, §12 P2]
 *
 * The same shape as `setEffect` deliberately: one field, one table, `null`
 * for none. A second way of saying "this take gets a named treatment" would
 * be a second place for the two to disagree about what `none` means. [D-19]
 *
 * IT REFUSES A TAKE WITH NO SOUND IN IT, which `setEffect` has no analogue
 * of. A denoiser on silence is not harmless — it is a control that appears
 * to work, and the author spends the next twenty minutes wondering why the
 * cleanup they chose did nothing. `hasAudio` is measured on ingest, so this
 * is a question the document can answer. [U-02]
 */
export function setCleanup(
  performance: Performance, takeId: string, cleanup: string | null,
): void {
  const take = takeById(performance, takeId);
  if (!take) throw new PerformanceEditError(`no take ${takeId} in this performance`);
  if (cleanup === null || cleanup === NO_CLEANUP) {
    delete take.cleanup;
    return;
  }
  if (!isCleanup(cleanup)) throw new PerformanceEditError(`unknown cleanup: ${cleanup}`);
  if (take.hasAudio === false) {
    throw new PerformanceEditError(
      `"${take.label}" was recorded with no sound in it — there is nothing to clean`);
  }
  take.cleanup = cleanup;
}

/**
 * What this take measured, written down.  [MASTER-EDIT §8, U-02]
 *
 * The render layer does the looking; this records it. Separate from
 * `matchColour` below because measuring and deciding are different acts:
 * a reading is a fact about the media and survives the author changing
 * their mind about which take to match.
 */
export function setColourReading(
  performance: Performance, takeId: string, reading: ColourReading,
): void {
  const take = takeById(performance, takeId);
  if (!take) throw new PerformanceEditError(`no take ${takeId} in this performance`);
  take.colour = reading;
}

/**
 * Grade this take towards another one.  [MASTER-EDIT §8, §12 P2]
 *
 * THE REFERENCE, NOT THE GRADE. Storing the computed correction would
 * freeze it against measurements that can change; storing which take to
 * match means the grade is derived from whatever the two currently measure.
 *
 * ONE HOP, AND THE REFUSALS ARE WHAT MAKE THAT TRUE. A take cannot match
 * itself, and cannot match a take that is itself matching something —
 * because then "what will this look like" has an answer that depends on
 * traversal order, and a cycle has no answer at all. The planner follows no
 * chain; this is what stops one being built.
 */
export function matchColour(
  performance: Performance, takeId: string, toTakeId: string | null,
): void {
  const take = takeById(performance, takeId);
  if (!take) throw new PerformanceEditError(`no take ${takeId} in this performance`);
  if (toTakeId === null) {
    delete take.matchTo;
    return;
  }
  if (toTakeId === takeId) {
    throw new PerformanceEditError('a take already looks like itself');
  }
  const to = takeById(performance, toTakeId);
  if (!to) throw new PerformanceEditError(`no take ${toTakeId} in this performance`);
  if (to.matchTo) {
    throw new PerformanceEditError(
      `"${to.label}" is itself matched to another take — match to that one instead`);
  }
  if (!isMeasured(take.colour) || !isMeasured(to.colour)) {
    throw new PerformanceEditError(
      'both takes have to be measured before they can be matched');
  }
  /*
   * AND NOTHING MAY BECOME A CHAIN BEHIND OUR BACK. This take may already
   * be somebody else's reference; making it match a third would turn their
   * one hop into two. Refused for the same reason as above, and said from
   * the other side so the author knows which take to look at.
   */
  const follower = performance.takes.find((other) => other.matchTo === take.id);
  if (follower) {
    throw new PerformanceEditError(
      `"${follower.label}" is matched to this take — unmatch it first`);
  }
  take.matchTo = to.id as TakeId;
}

/**
 * Take the shake out of this take.  [MASTER-EDIT §5, §8, §12 P2]
 *
 * The same shape as `setEffect` and `setCleanup`: one field, one table,
 * `null` for none. What it adds is a refusal the other two do not need.
 *
 * A STABILIZED TAKE CANNOT ALSO BE MATTED, and this is where that is said.
 * §4's background replacement keys the performer out by differencing the
 * take against a still plate of the same room (INV-16). Stabilizing moves
 * the picture relative to that plate, so every edge in the room lands
 * somewhere the plate says is empty and the matte fills with torn fringes.
 * No ordering saves it — stabilize first and the plate no longer matches;
 * matte first and the stabilizer is tracking a performer against a
 * background that is not moving with them.
 *
 * Refused from BOTH sides: this refuses a take that is already in a drawn
 * space, and `setEnvironment` refuses a stabilized take. One of the two
 * alone would leave the order the author happened to press things in
 * deciding whether the render comes out torn.
 */
export function setStabilize(
  performance: Performance, takeId: string, stabilize: string | null,
): void {
  const take = takeById(performance, takeId);
  if (!take) throw new PerformanceEditError(`no take ${takeId} in this performance`);
  if (stabilize === null || stabilize === NO_STABILIZER) {
    delete take.stabilize;
    return;
  }
  if (!isStabilizer(stabilize)) {
    throw new PerformanceEditError(`unknown stabilizer: ${stabilize}`);
  }
  if (take.environment.kind !== 'original') {
    throw new PerformanceEditError(
      `"${take.label}" is in a replaced background, which is keyed against a `
      + 'still of the room — stabilising moves the picture away from it. '
      + 'Put the take back in its own room first.');
  }
  take.stabilize = stabilize;
}

/* ------------------------------------------------------------------------ *
 *  Footage.  [§2, §5, §14, S-29]
 * ------------------------------------------------------------------------ */

/**
 * Whether this footage plays again until the scene is over.
 *
 * Only footage. A performance that is played twice is a singer singing the
 * chorus over themselves, which is not an edit anybody asked for — and
 * refusing it here means the renderer never has to wonder.
 */
export function setLoop(performance: Performance, takeId: string, loop: boolean): void {
  const target = take(performance, takeId);
  if (target.kind !== 'footage') {
    fail('only footage loops — a performance plays once');
  }
  if (loop) target.loop = true;
  else delete target.loop;
}

/**
 * Whose footage this is.  [INV-15, §14]
 *
 * Written the same way the master's class is, through the same table, because
 * it is the same question with the same consequence: without an answer this
 * performance does not publish. A `licensed` or `open` clip must say what
 * permits it, for the reason INV-15 gives — a claim with nothing behind it is
 * worse than no claim, because it looks like one.
 */
export function setFootageRights(
  performance: Performance, takeId: string, rights: string, note?: string | null,
): void {
  const target = take(performance, takeId);
  if (target.kind !== 'footage') {
    fail('a take is the author performing — it has no rights class to set');
  }
  if (!MASTER_CLASSES.includes(rights as never)) fail(`unknown rights class: ${rights}`);
  target.rights = rights as never;
  const trimmed = (note ?? '').trim();
  if (trimmed) target.rightsNote = trimmed.slice(0, 300);
  else delete target.rightsNote;
  if ((rights === 'licensed' || rights === 'open') && !target.rightsNote) {
    fail('say what permits this footage — a licence, or where it is from');
  }
}
