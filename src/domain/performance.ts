/**
 * The Performance.  [Doctrine STUDIO-TWO §1–§15, S-1, INV-00]
 *
 * BROWSER-SAFE, and kept that way on purpose. Studio Two's interface needs the
 * vocabulary in this file — the classes of master, the list of spaces, whether
 * a track may be published — and a single import of `newId` drags `node:crypto`
 * into the client bundle and breaks the build. This codebase has learned that
 * once already, with the render planner's geometry. So the constructor lives
 * with the edit operations, which are server-side, and everything here is
 * types, tables and arithmetic.
 *
 * One song. One master timeline. Many performances.
 *
 * This is the root document of Studio Two, and it is a SECOND ROOT rather than
 * a Conversation with a flag on it. The brief's §13 gives the reason and it is
 * structural, not stylistic:
 *
 *   Conversation   Source → Claim → Response → Evidence → Timeline
 *   Performance    Master → Takes → Scenes   → Switching → Master Video
 *
 * A Conversation's interventions are ORDERED, by the source frame each one is
 * anchored to (U-08). A Performance's takes are PARALLEL: five recordings all
 * occupying the same stretch of the same clock, none of them before or after
 * another. Putting them in `interventions` would mean an array whose order
 * means nothing, which is the shape of a field somebody misreads within a
 * release.
 *
 * WHAT IS SHARED is everything below the document: assets, ingest, the queue,
 * layouts (U-18), export profiles, the publication system. What is new is the
 * master clock, take alignment, scenes, and the environment.
 *
 * THE MASTER INVARIANT IS UNCHANGED. The brief's own closing principle —
 * "never merge the individual takes into one irreversible video until the
 * final master render" — is INV-00 said about a different document. So:
 * switching decisions are data, the environment is a field, the master video
 * is a representation, and a change of mind costs a re-plan and never a
 * re-record.
 */

import type { AssetId, Publication, TakeId } from './document.js';
import type { BeatGrid } from './beats.js';
import type { RoomPlate } from './environment.js';
import type { Id } from './ids.js';
import {
  type Frames, type Samples, HOUSE_SAMPLE_RATE, assertSamples, samplesToFrames,
} from './time.js';

export type PerformanceId = Id<'perf'>;
export type SceneId = Id<'scene'>;

export const PERFORMANCE_SCHEMA_VERSION = 2;

/* ------------------------------------------------------------------------ *
 *  The master track, and what may be done with it.  [S-9, INV-15]
 * ------------------------------------------------------------------------ */

/**
 * What the author may do with the music.  [STUDIO-TWO S-9, U-01, D-08]
 *
 * THIS IS THE FIELD THAT KEEPS THE PRODUCT DEFENSIBLE, and it is here rather
 * than in a warning dialogue because a dialogue is not an architecture.
 *
 * Studio One's rights posture rests on transformative commentary (D-08): a
 * response quotes a source, in proportion, attributed, and that is a coherent
 * position. Studio Two is not commentary. Performing over a commercial
 * recording engages mechanical, synchronisation and master-use rights, and
 * "I added a video" is not a fair-dealing argument.
 *
 * The product already has exactly the right mechanism, and it is U-01's two
 * source classes: a Class B source can be worked with and cannot be composed
 * into an export (INV-01). This is that shape, applied to music.
 *
 * Not legal advice; D-08's standing caveat applies and counsel reviews the
 * wording per jurisdiction before launch.
 */
export type MasterClass =
  /** The author's own recording or composition. */
  | 'own'
  /** The author holds a sync licence, or it came from a licensed library. */
  | 'licensed'
  /** Public domain, or a licence that permits this. Attribution may be a condition. */
  | 'open'
  /** A commercial recording the author has not said they may publish. */
  | 'third_party';

export const MASTER_CLASSES: readonly MasterClass[] =
  ['own', 'licensed', 'open', 'third_party'];

/**
 * May a performance over this track be published from this product?
 *
 * The one question INV-15 asks. A `third_party` master performs, rehearses,
 * previews and exports privately — everything except leaving the building.
 *
 * AN ALLOWLIST, NOT A DENYLIST, and the difference is not stylistic. The first
 * version read `class !== 'third_party'`, which means every value that is not
 * that one may be published — including a value nobody defined. A request
 * carrying `class: "neon"` got past it, and past INV-15 with it. Written this
 * way round, an unrecognised class is refused, which is the only safe default
 * for a question about somebody else's rights.
 */
export function mayPublish(master: MasterTrack): boolean {
  return master.class === 'own' || master.class === 'licensed' || master.class === 'open';
}

/** Which classes have to say what permits them. */
export function needsLicenceNote(master: MasterTrack): boolean {
  return master.class === 'licensed' || master.class === 'open';
}

export interface MasterTrack {
  assetId: AssetId;
  /** What the song is called. Carried into the attribution block. [U-21] */
  title: string;
  artist?: string;
  /** Who wrote it, which is a different person from who performed it. */
  writer?: string;
  class: MasterClass;
  /** For `licensed` and `open`: what permits this use. [INV-15] */
  licence?: string;
  /** Measured by decoding, never taken from a container header. [U-02] */
  durationSamples: Samples;
  /** Normalised to HOUSE_SAMPLE_RATE on ingest; kept for provenance. */
  sourceSampleRate?: number;
  /**
   * Where the performance actually begins.
   *
   * A count-in belongs to the MASTER, not to a take: every take hears the same
   * two bars, and the song's first downbeat is one number rather than five
   * that have to agree. [S-10]
   */
  countInSamples?: Samples;
  /** Detected, and therefore a suggestion until used. [§11, INV-06] */
  bpm?: number;
  /**
   * The master's own picture, where it brought one.  [§3, §5, INV-15]
   *
   * "A music video, or another video to perform against." A master arrives as
   * a song most of the time and the pipeline treats it as sound — but when it
   * is a video, throwing the picture away means Half Mode can only ever be two
   * takes of the performer, never the performer beside the thing they are
   * performing against.
   *
   * MEASURED, NOT ASSUMED. Present only when the file actually decoded to a
   * video stream, which is a fact about the file rather than about its
   * extension. Absent for every song, and for a video whose picture failed to
   * normalise — in which case the performance still works and is audio only,
   * because losing the accompaniment must not lose the song.
   */
  videoAssetId?: AssetId;
  /** The picture's own shape, for laying it out without decoding it again. */
  videoWidth?: number;
  videoHeight?: number;
}

/**
 * May the master's PICTURE be shown?  [INV-15, U-01, D-08]
 *
 * The same allowlist as its sound, and deliberately not a laxer one. Putting a
 * commercial music video on screen is a reproduction of the audiovisual work,
 * which is a distinct right from the mechanical and synchronisation rights
 * over the song — so if anything it is the stronger claim, and it would be
 * incoherent for a product that refuses to publish the sound to publish the
 * picture that came with it.
 *
 * Asked separately from `mayPublish` because the two questions are asked at
 * different moments — one when planning a render, one when publishing — and a
 * caller reaching for the wrong one should be reading the wrong name.
 */
export function mayShowMasterPicture(master: MasterTrack): boolean {
  return Boolean(master.videoAssetId) && mayPublish(master);
}

/* ------------------------------------------------------------------------ *
 *  Where a take sits on the music clock.  [§10, S-3, INV-14]
 * ------------------------------------------------------------------------ */

/**
 * How this take lines up with the song.
 *
 * MEASURED, NOT ASSUMED, which is the doctrine's oldest lesson applied to a
 * new quantity: "every duration in this system that came from a container
 * header was wrong at least once." A browser cannot simply be asked when a
 * recording started. Three errors are in play and they are different:
 *
 *   START LATENCY   `MediaRecorder.start()` does not begin capturing when it
 *                   is called.
 *   OUTPUT LATENCY  the master the performer HEARS is behind the master's own
 *                   clock by the audio device's output latency, so their
 *                   performance is late by exactly that much.
 *   DRIFT           two clocks nominally at 48 kHz are not, and over four
 *                   minutes the error grows. An offset alone cannot fix it,
 *                   which is why `rateRatio` exists.
 */
export interface Alignment {
  /** Where this take's first sample sits on the master clock. */
  offsetSamples: Samples;
  /**
   * The take's clock measured against the master's. 1 means no drift.
   *
   * Applied multiplicatively, so a take that runs 20 ppm fast is corrected
   * across its whole length rather than only at its start.
   */
  rateRatio: number;
  /** How the offset was arrived at, because a guess and a measurement differ. */
  method: AlignmentMethod;
  /**
   * The author's correction, kept SEPARATE from the measurement.
   *
   * Two reasons, both learned from tools that get this wrong. Re-measuring
   * must not silently discard a human's fix; and keeping them apart is the
   * only way to see how far off the automatic answer was, which is the
   * feedback that improves it.
   */
  nudgeSamples?: Samples;
  /**
   * What the device was measured to add, and therefore what was taken off.
   * [§10, S-3]
   *
   * Recorded because it CHANGED the placement: a number that moved somebody's
   * take by forty milliseconds and left no trace is a number nobody can check
   * afterwards. Absent when the browser's clock was used on its own.
   */
  latencySamples?: Samples;
}

/**
 * How a take came to sit where it sits.  [§10, S-3]
 *
 * FOUR NAMES BECAUSE THERE ARE FOUR ANSWERS, and they are not equally good.
 * The type used to carry three while the code wrote two different things into
 * one of them — the worker meant "I heard the song inside the take" and the
 * browser meant "I subtracted this device's measured latency", and a label
 * that means two things is a label nobody can read.
 */
export type AlignmentMethod =
  /** From the audio clock at record time. The normal case, and good enough. */
  | 'measured'
  /** The clock, less a round trip this device was measured to add. Better. */
  | 'calibrated'
  /**
   * The song was audible in the take and was found in it. Best — and it only
   * happens when the master leaked from speakers, which costs something else.
   */
  | 'heard'
  /** The author placed it. Always wins, never overwritten. */
  | 'manual'
  /**
   * NOBODY HAS PLACED IT.  [§2, §10]
   *
   * The state a take is in when it was not recorded against the song at all —
   * footage filmed on a camera that knew nothing about the music, uploaded
   * afterwards, with no song audible in it to find. It sits at zero because
   * something has to, and zero is not a measurement.
   *
   * This exists because the alternative was calling it `manual`, which reads
   * as "the author placed it" on a take the author has never touched. That is
   * exactly the kind of small lie that makes somebody stop believing the
   * other messages — and the other messages here are about where their
   * performance is in time, which they cannot check by eye.
   *
   * It becomes `manual` the moment they move it, and `heard` if the song
   * turns out to be audible after all.
   */
  | 'unplaced';

/**
 * Is this take's position a fact about anything?
 *
 * False for a take nobody has placed and nothing has measured. Asked before
 * showing an offset, before reporting drift, and before rendering a scene
 * that uses it — three places that would otherwise each decide for
 * themselves what zero means.
 */
export function isPlaced(alignment: Alignment): boolean {
  return alignment.method !== 'unplaced';
}

/** Offset plus the author's nudge: where the take really starts. */
export function effectiveOffset(alignment: Alignment): Samples {
  return alignment.offsetSamples + (alignment.nudgeSamples ?? 0);
}

/**
 * A moment on the master clock, as a position inside this take's own media.
 *
 * Negative means the master is at a point before this take began, which is a
 * normal answer rather than an error: a take that covers only the chorus is
 * asked about the first verse every time the timeline is drawn.
 */
export function masterToTake(alignment: Alignment, masterSample: Samples): number {
  return (masterSample - effectiveOffset(alignment)) * alignment.rateRatio;
}

/** And back, for placing a take's own moment on the song. */
export function takeToMaster(alignment: Alignment, takeSample: number): Samples {
  return Math.round(takeSample / alignment.rateRatio) + effectiveOffset(alignment);
}

/* ------------------------------------------------------------------------ *
 *  The environment.  [§4, S-6]
 * ------------------------------------------------------------------------ */

/**
 * Where the performance appears to happen.
 *
 * A FIELD OF THE TAKE, never pixels in the recording — the brief says so and
 * D-16 agrees: "I would not permanently bake the background into the raw
 * recording." Bedroom → Studio is a re-plan, and the raw take is kept whatever
 * happens to it.
 */
export interface Environment {
  kind: EnvironmentKind;
  /** For `space`: which one, from SPACES. */
  spaceId?: string;
  /** For `custom`: the author's own image or loop. */
  assetId?: AssetId;
}

export type EnvironmentKind =
  /** The room they were actually in. Always available, always reliable. */
  | 'original'
  /** Their own room, softened. The dependable middle. */
  | 'blur'
  /** One of the supplied spaces. */
  | 'space'
  /** Their own picture behind them. */
  | 'custom';

/**
 * The supplied spaces, exactly as §4 lists them.
 *
 * Each is CONTENT the product ships, which means each needs a rights line of
 * its own — the product owns that problem rather than the author. [S-6]
 */
export const SPACES: readonly { id: string; label: string }[] = [
  { id: 'recording_studio', label: 'Recording Studio' },
  { id: 'concert_stage', label: 'Concert Stage' },
  { id: 'modern_room', label: 'Modern Room' },
  { id: 'university_hall', label: 'University Hall' },
  { id: 'church', label: 'Church' },
  { id: 'theatre', label: 'Theatre' },
  { id: 'beach', label: 'Beach' },
  { id: 'forest', label: 'Forest' },
  { id: 'city', label: 'City' },
  { id: 'mountain', label: 'Mountain' },
  { id: 'night_studio', label: 'Night Studio' },
];

/* ------------------------------------------------------------------------ *
 *  A take.
 * ------------------------------------------------------------------------ */

export interface PerformanceTake {
  id: TakeId;
  assetId: AssetId;
  /** What the author calls it: "Living room", "Beach". [§1] */
  label: string;
  environment: Environment;
  /**
   * The colour that identifies this take everywhere.  [§2, §7, U-20]
   *
   * The same idea participants have, for the same reason: in a four-take
   * performance the rail, the badge on the stage, the timeline row and every
   * block on the master video are all talking about the same take, and a
   * colour is what says so at a glance. A label alone means reading four
   * words to find out which strip of the timeline is the beach.
   *
   * Assigned when the take is added and never reassigned. A take that changed
   * colour because another was deleted would relabel the whole timeline
   * underneath somebody mid-edit.
   */
  accent?: string;
  /**
   * A treatment over this take's picture.  [§4]
   *
   * SEPARATE FROM THE ENVIRONMENT, because they answer different questions.
   * The environment is what is BEHIND the performer — their own room, a
   * drawn space, their own picture — and blurring it is a statement about
   * the room, which is why `blur` is an environment and not an effect. An
   * effect is a treatment over the composed panel: how it is lit, how it is
   * graded, where the eye is sent.
   *
   * Absent means none, which is the default and the honest one: a product
   * whose takes arrive pre-graded is deciding how somebody's performance
   * looks before they have seen it.
   */
  effect?: string;
  /**
   * Which plate this take is matted against. [§4, S-6, INV-16]
   *
   * A reference rather than a copy: one plate serves every take recorded in
   * that room, and the measurement belongs to the room rather than to
   * whichever take happened to be next. Absent means no matte was measured
   * for this take, which is why its environment can only be `original`.
   */
  plateAssetId?: AssetId;
  alignment: Alignment;
  /** Measured by decoding. [U-02] */
  durationSamples: Samples;
  /**
   * The part of the take the author wants, on the MASTER clock.
   *
   * Absent means all of it. Present, it is how a take covers only the chorus
   * — which is the difference between a feature people demo and one they use:
   * five full passes of a four-minute song is twenty minutes of singing to
   * change eight bars. [S-10]
   */
  useFromSample?: Samples;
  useToSample?: Samples;
  /** Whether this take's own audio is usable, or it was recorded silent. */
  hasAudio?: boolean;
  createdAt: string;
}

/**
 * What stretch of the song this take can actually fill.
 *
 * Derived from the alignment and the media, narrowed by the author's trim.
 * Not stored, for the reason nothing derivable is stored: two numbers that
 * must agree eventually do not.
 */
export function coverage(take: PerformanceTake): { fromSample: Samples; toSample: Samples } {
  const naturalFrom = Math.max(0, effectiveOffset(take.alignment));
  const naturalTo = takeToMaster(take.alignment, take.durationSamples);
  return {
    fromSample: Math.max(naturalFrom, take.useFromSample ?? naturalFrom),
    toSample: Math.min(naturalTo, take.useToSample ?? naturalTo),
  };
}

/**
 * The plate this take is matted against, if any.  [§4, S-6, INV-16]
 *
 * A query rather than a field, for the reason nothing derivable is a field:
 * the plate is on the performance and the take names it, so there is one
 * place for the measurement to be wrong rather than two.
 */
export function plateFor(
  performance: Performance, take: PerformanceTake,
): RoomPlate | undefined {
  if (!take.plateAssetId) return undefined;
  return performance.plates.find((plate) => plate.assetId === take.plateAssetId);
}

/** Does this take have picture at this moment of the song? */
export function covers(take: PerformanceTake, masterSample: Samples): boolean {
  const { fromSample, toSample } = coverage(take);
  return masterSample >= fromSample && masterSample < toSample;
}

/**
 * Does this take have picture for ALL of this stretch of the song?
 *
 * The question the timeline has to ask, and the one it is easy to get wrong:
 * asking only about a span's first sample lets a take that starts a scene and
 * runs out halfway through pass as though it covered the whole thing, and the
 * rest of the scene renders black with nothing having complained. Found by a
 * test that expected a complaint and got silence.
 */
export function coversSpan(
  take: PerformanceTake, fromSample: Samples, toSample: Samples,
): boolean {
  const own = coverage(take);
  /*
   * ASKED IN FRAMES, because frames are what gets rendered.
   *
   * A take begins whenever the recorder began, which is a few hundred samples
   * either side of the song's own zero — nine milliseconds, a third of a
   * frame, a difference the export cannot represent and no one can see. Asked
   * in samples, that take "does not reach" a scene starting at zero, and the
   * product refuses to render a performance for being eight thousandths of a
   * second short. It did exactly that as soon as the browser's measurement
   * started reaching the document, and the message was about extending a take
   * that was already long enough.
   *
   * Flooring makes the two ends behave differently, and correctly: at the
   * start, a take that begins inside the first frame begins at frame zero; at
   * the end, a take that runs out inside the last frame is a frame short, and
   * a frame short is a black frame. [U-08, INV-02]
   */
  return samplesToFrames(Math.max(0, own.fromSample)) <= samplesToFrames(fromSample)
    && samplesToFrames(own.toSample) >= samplesToFrames(toSample);
}

/* ------------------------------------------------------------------------ *
 *  Scenes — the primitive.  [§7, §8, §15, S-4]
 * ------------------------------------------------------------------------ */

/**
 * A stretch of the song, and what is on screen during it.
 *
 * SCENES ARE THE PRIMITIVE AND SWITCHING IS HOW YOU WRITE THEM. Read as three
 * features, §7 (live switching), §8 (editing the result) and §15 (scenes) are
 * three timelines that have to be kept in step. Read properly, §15 is the
 * general case:
 *
 *   a hard cut          a scene with one take
 *   §5's Half Mode      a scene with two
 *   §6's four-way       a scene with four
 *   §7 live switching   APPENDS scenes as keys are pressed
 *   §8 timeline editing MOVES `fromSample` on scenes that already exist
 *
 * One artefact, two ways in, and no chance of the two disagreeing — the same
 * resolution the Conversation Room reached when the stage history turned out
 * to be the interventions.
 *
 * There is no `toSample`. A scene runs until the next one begins, or until the
 * song ends. Storing an end would be storing something derivable, and the two
 * numbers would eventually disagree. [U-08]
 */
export interface Scene {
  id: SceneId;
  /** Where it begins on the master clock. Order is derived from this. */
  fromSample: Samples;
  /** Which arrangement. A row in LAYOUTS, never a code branch. [U-18] */
  layoutId: string;
  /** Which takes occupy it, in layer order. */
  takeIds: TakeId[];
  /** How it arrives. [§11] */
  transition?: string;
  /** The author's name for it — "Chorus", "Verse 2". [§15] */
  label?: string;
  /** Where this scene's sound comes from, when it differs. [S-7] */
  audioMode?: AudioMode;
}

/**
 * Where the finished sound comes from.  [§9]
 *
 * The brief's modes A, B and C. The structural consequence is in C: the master
 * vocal stays continuous while the picture switches, which means THE AUDIO
 * TIMELINE AND THE VIDEO TIMELINE ARE INDEPENDENT. Scenes cut the picture;
 * they do not cut the sound. Once that is true, A and B are special cases of
 * it and a per-scene override is free.
 */
export type AudioMode =
  /** A — the music as backing, the performer's microphone as the vocal. */
  | 'music_and_mic'
  /** B — whatever the visible take recorded. */
  | 'take_audio'
  /** C — one vocal, recorded once, continuous across every cut. */
  | 'master_vocal';

export const AUDIO_MODES: readonly AudioMode[] =
  ['music_and_mic', 'take_audio', 'master_vocal'];

/* ------------------------------------------------------------------------ *
 *  The document.
 * ------------------------------------------------------------------------ */

export interface Performance {
  schemaVersion: number;
  id: PerformanceId;
  title: string;
  master: MasterTrack;
  /**
   * Every recording made against this master. PARALLEL, not ordered — see the
   * note at the top of this file for why that matters.
   */
  takes: PerformanceTake[];
  /** Order is derived from `fromSample`, never stored. [U-08] */
  scenes: Scene[];
  /**
   * The rooms this performance has been recorded in, measured. [§4, S-6]
   *
   * Plural because a performance made over a week is made in more than one
   * light. Newest last; a take names the one it was shot against.
   */
  plates: RoomPlate[];
  audio: {
    mode: AudioMode;
    /** For `master_vocal`: which take is the voice. It is a take like any other. */
    vocalTakeId?: TakeId;
  };
  layoutProfileId: string;
  /** How captions look, as everywhere else. [U-19 §2] */
  captionStyleId?: string;
  /**
   * The pulse of the song, detected.  [§11, S-8, INV-06]
   *
   * A SUGGESTION until somebody accepts it, and nothing in the product may
   * move one of the author's cuts while it is unaccepted. Stored on the
   * performance rather than on the master track because it is a reading of
   * the music rather than a fact about the file.
   */
  beats?: BeatGrid;
  publication?: Publication;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------------ *
 *  Derivations.
 * ------------------------------------------------------------------------ */

/**
 * The scenes in the order they play.
 *
 * Derived on every read, exactly as `orderedInterventions` is, and for the
 * same reason: an order that is stored is an order that can be wrong. Ties
 * break on id so the result is stable — two scenes at the same sample is a
 * defect the invariants catch, but a derivation that reorders itself between
 * two reads is a worse one.
 */
export function orderedScenes(performance: Performance): Scene[] {
  return [...performance.scenes].sort(
    (a, b) => a.fromSample - b.fromSample || a.id.localeCompare(b.id));
}

/** What is on screen at this moment of the song, if anything is. */
export function sceneAt(performance: Performance, masterSample: Samples): Scene | null {
  const ordered = orderedScenes(performance);
  let found: Scene | null = null;
  for (const scene of ordered) {
    if (scene.fromSample > masterSample) break;
    found = scene;
  }
  return found;
}

export function takeById(
  performance: Performance, takeId: string,
): PerformanceTake | undefined {
  return performance.takes.find((take) => take.id === takeId);
}

/**
 * The song, cut into the spans the scenes make of it.
 *
 * This is the Performance's answer to `projectTimeline` — the artefact a
 * render plan is built from, kept separate from the plan for the same reason
 * Studio One keeps them separate: the projection is arithmetic over the
 * document and can be tested without a renderer anywhere near it.
 */
export interface PerformanceSpan {
  scene: Scene;
  fromSample: Samples;
  toSample: Samples;
  /** Where it lands on the output clock. Pictures cut on frames. [INV-02] */
  outputStartFrame: Frames;
  durationFrames: Frames;
  /** The takes this span shows, resolved and in layer order. */
  takes: PerformanceTake[];
  /**
   * Takes named by the scene that have no picture here.
   *
   * Reported rather than silently dropped: a four-way scene that is quietly a
   * three-way because one take does not reach that far is exactly the kind of
   * thing an author discovers after rendering.
   */
  missing: TakeId[];
}

export interface PerformanceTimeline {
  spans: PerformanceSpan[];
  totalSamples: Samples;
  totalOutputFrames: Frames;
  /**
   * Stretches of the song with nothing on screen.
   *
   * Not an error. A performance being assembled has gaps, and a timeline that
   * refused to exist until it was finished would be useless while it was
   * being made. The author is shown them; the renderer refuses them.
   */
  gaps: { fromSample: Samples; toSample: Samples }[];
}

/**
 * A stretch of the song to project, rather than all of it.  [§14]
 *
 * A clip is the master render with a window on it — the same scenes, the same
 * matte, the same sound — so there is one projection and not a second one for
 * short videos. The output clock is rebased to the window, because a clip
 * starts at its own zero.
 */
export interface PerformanceWindow {
  fromSample: Samples;
  toSample: Samples;
}

export function projectPerformance(
  performance: Performance, window?: PerformanceWindow,
): PerformanceTimeline {
  const songEnd = performance.master.durationSamples;
  assertSamples(songEnd);
  const start = window ? Math.max(0, Math.min(window.fromSample, songEnd)) : 0;
  const end = window ? Math.max(start, Math.min(window.toSample, songEnd)) : songEnd;
  /** Output frames are counted from the window, not from the song. */
  const zero = samplesToFrames(start);
  const ordered = orderedScenes(performance);
  const spans: PerformanceSpan[] = [];
  const gaps: { fromSample: Samples; toSample: Samples }[] = [];

  /*
   * Song with nothing on it, at the beginning of what is being projected.
   *
   * Asked as "is a scene in force here", not "does a scene start here": a
   * window opening in the middle of a four-minute scene is covered by it, and
   * a clip that reported a gap there would refuse to render the chorus.
   */
  const inForce = ordered.filter((scene) => scene.fromSample <= start).pop();
  if (!inForce) {
    const next = ordered.find((scene) => scene.fromSample > start)?.fromSample ?? end;
    if (Math.min(next, end) > start) {
      gaps.push({ fromSample: start, toSample: Math.min(next, end) });
    }
  }

  for (let i = 0; i < ordered.length; i += 1) {
    const scene = ordered[i]!;
    const fromSample = Math.max(start, Math.min(scene.fromSample, end));
    const toSample = Math.min(ordered[i + 1]?.fromSample ?? end, end);
    if (toSample <= fromSample) continue;

    const takes: PerformanceTake[] = [];
    const missing: TakeId[] = [];
    for (const id of scene.takeIds) {
      const take = takeById(performance, id);
      /*
       * A take must exist AND cover this span from end to end. Covering only
       * its start is not enough: a take that runs out halfway through a scene
       * leaves the rest of it black, and a timeline that reported that as
       * fine would be reporting the author's mistake as their intention.
       */
      if (take && coversSpan(take, fromSample, toSample)) takes.push(take);
      else missing.push(id as TakeId);
    }

    const outputStartFrame = samplesToFrames(fromSample) - zero;
    spans.push({
      scene,
      fromSample,
      toSample,
      outputStartFrame,
      durationFrames: samplesToFrames(toSample) - samplesToFrames(fromSample),
      takes,
      missing,
    });
  }

  return {
    spans,
    totalSamples: end - start,
    totalOutputFrames: samplesToFrames(end) - zero,
    gaps,
  };
}

/**
 * How much of the song has a picture on it.
 *
 * The Performance's equivalent of the source ratio the Studio shows while you
 * work (U-35): one number that says how far from finished this is, without
 * anybody having to watch it.
 */
export function covered(performance: Performance): number {
  const timeline = projectPerformance(performance);
  if (timeline.totalSamples === 0) return 0;
  const filled = timeline.spans
    .filter((span) => span.takes.length > 0)
    .reduce((sum, span) => sum + (span.toSample - span.fromSample), 0);
  return filled / timeline.totalSamples;
}

/** House rate, exported so callers need not reach into `time` for it. */
export { HOUSE_SAMPLE_RATE };
