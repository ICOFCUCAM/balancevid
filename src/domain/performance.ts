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

/**
 * What to draw a take in before it has been given a colour.
 *
 * `addTake` assigns one from `TAKE_ACCENTS`, so a stored document
 * always has it — but the view renders takes mid-upload, mid-record
 * and from older documents, and twelve places were each written
 * `take.accent ?? '#3e7ca6'`. Twelve hand-copied literals of the
 * first entry of that table, which would go stale in eleven of them
 * the first time somebody reordered it.
 *
 * IT LIVES HERE AND NOT WITH THE TABLE, for the reason this file's
 * own header gives: `performanceEdit` reaches `newId`, `newId`
 * reaches `node:crypto`, and importing it from a client component
 * breaks the build. That is exactly what the first attempt at this
 * did — the header says "this codebase has learned that once
 * already", and it has now learned it twice. The table imports the
 * constant rather than the other way round, so there is one source
 * of truth and the view can reach it.
 */
export const TAKE_ACCENT_FALLBACK = '#3e7ca6';


import type { AssetId, Publication, TakeId } from './document.js';
import type { BeatGrid } from './beats.js';
import type { RoomPlate } from './environment.js';
import type { Id } from './ids.js';
import {
  type Frames, type Samples, HOUSE_FPS, HOUSE_SAMPLE_RATE, assertSamples,
  formatMasterPosition, framesToSamples, samplesToFrames,
} from './time.js';
/* Browser-safe: `transitions.ts` reaches nothing but `time.ts`. */
import {
  type TransitionAlign, type Transition, TRANSITIONS, transitionAlignOf, overlapSplit,
  transitionOf,
} from './transitions.js';

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

/**
 * Footage, rather than somebody performing.  [§2, S-29]
 *
 * The one place `kind` is read, so the absent-means-performance rule is
 * stated once and every caller gets it right by not having a choice.
 */
export function isFootage(take: PerformanceTake): boolean {
  return take.kind === 'footage';
}

/**
 * Whether this whole performance may be published.  [INV-15, §14]
 *
 * The master AND every piece of footage in it, because a clip nobody has the
 * rights to is exactly as publishable as a song nobody has the rights to. It
 * is written as "every one of them permits it" rather than "none of them
 * forbids it", so a class this build does not recognise refuses — the same
 * way round `mayPublish` is written, and for the same reason.
 *
 * Takes are not asked: a performance is the author performing. If that ever
 * stops being true it will be because somebody else recorded a take, and
 * that is a participation question (D-17), not a rights class.
 */
export function everythingMayBePublished(performance: Performance): boolean {
  if (!mayPublish(performance.master)) return false;
  return performance.takes.filter(isFootage).every(
    (take) => take.rights === 'own' || take.rights === 'licensed' || take.rights === 'open',
  );
}

/** The footage that is stopping this performance being published, if any. */
export function unpublishableFootage(performance: Performance): PerformanceTake[] {
  return performance.takes.filter(
    (take) => isFootage(take)
      && !(take.rights === 'own' || take.rights === 'licensed' || take.rights === 'open'),
  );
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

/**
 * What a take IS.  [§2, §5, S-29]
 *
 * "Sometimes we would upload videos of the waves in the sea, birds moving and
 *  animals running to add with the music."
 *
 * Two different things share a slot on the stage. A PERFORMANCE is somebody
 * singing the song: it was recorded against the master, it has an offset that
 * was measured, it may carry the vocal, and it is the author's own work.
 * FOOTAGE is the sea: nobody performed it, nothing about it can be measured
 * against the song, its audio is not part of this record, and it may very
 * well belong to somebody else.
 *
 * WHY ONE TYPE AND NOT TWO. They occupy the same slots in the same layouts,
 * take the same number keys, sit in the same timeline lanes and are cut into
 * the same scenes. A second entity would mean a second branch at every one of
 * those places, which is precisely what U-18 forbids — layouts are data, and
 * a slot that had to ask what kind of thing was filling it would be a code
 * branch wearing a layout's clothes.
 *
 * So the differences live in FIELDS, and every one of them is checked where
 * it matters: footage never carries the vocal (§9), never claims a measured
 * alignment (§10), and never publishes without saying whose it is (INV-15).
 */
export type TakeKind = 'performance' | 'footage';

export interface PerformanceTake {
  id: TakeId;
  assetId: AssetId;
  /**
   * Absent means a performance.  [§2, S-29]
   *
   * Absent rather than defaulted in the writer, because every performance
   * made before footage existed is a performance and no migration should have
   * to say so. `isFootage` is the only thing that reads it.
   */
  kind?: TakeKind;
  /**
   * Footage only: play it again until the scene is over.  [§5, S-29]
   *
   * Ten seconds of waves against a thirty-second chorus is the normal case,
   * not the exception — stock scenery is short and songs are not. Without
   * this the panel goes black two thirds of the way through a chorus, which
   * is the product showing an author a fault and calling it their edit.
   *
   * A performance is never looped: a singer who stopped singing has stopped,
   * and playing them again would put a second chorus under the first.
   */
  loop?: boolean;
  /**
   * Footage only: whose it is.  [INV-15, §14]
   *
   * The same question the master answers, asked again because it has the same
   * answer-shape and the same consequence. A performance needs no class — it
   * is the author performing — but a clip of the sea came from somewhere, and
   * a product that refuses to publish somebody else's SONG while publishing
   * somebody else's PICTURE is not being careful, it is being inconsistent.
   */
  rights?: MasterClass;
  /** For `licensed` and `open` footage: what permits this use. [INV-15] */
  rightsNote?: string;
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
export function coverage(
  take: PerformanceTake, songSamples?: Samples,
): { fromSample: Samples; toSample: Samples } {
  const naturalFrom = Math.max(0, effectiveOffset(take.alignment));
  /*
   * Looping footage covers the whole song.  [§5, S-29]
   *
   * Its own length says nothing about where it can go: ten seconds of waves
   * can fill a four-minute song, and asking "how long is the clip" to decide
   * "which part of the song may show it" is asking the wrong file. The song's
   * length is passed rather than read off the take, because a take does not
   * know what it is part of.
   */
  const naturalTo = take.loop && songSamples !== undefined
    ? songSamples
    : takeToMaster(take.alignment, take.durationSamples);
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

/**
 * Does this take have picture at this moment of the song?
 *
 * `songSamples` is how looping footage is asked about: ten seconds of waves
 * has picture for the whole song, and its own duration says nothing about it.
 * Optional so the ordinary caller, asking about a performance, is unchanged.
 * [§5, S-29]
 */
export function covers(
  take: PerformanceTake, masterSample: Samples, songSamples?: Samples,
): boolean {
  const { fromSample, toSample } = coverage(take, songSamples);
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
  songSamples?: Samples,
): boolean {
  const own = coverage(take, songSamples);
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
  /**
   * How long the arrival takes, when the author has said. Absent means the
   * style's own length, which is what almost every join should keep.
   * [MASTER-EDIT §3]
   */
  transitionFrames?: Frames;
  /** Which of the two shots pays for it. Absent means centred. */
  transitionAlign?: TransitionAlign;
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
      if (take && coversSpan(take, fromSample, toSample,
        performance.master.durationSamples)) takes.push(take);
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

/* ------------------------------------------------------------------------ *
 * WHY A RENDER IS REFUSED                                                    *
 * ------------------------------------------------------------------------ */

/**
 * What is wrong with a performance, as something to act on.
 *
 * THIS EXISTS BECAUSE THE RULE WAS WRITTEN TWICE.  [D-19]
 *
 * `assertPerformanceRenderable` (invariants.ts) said it properly: which
 * stretch, from where to where, and what to do about it. The console said it
 * again, on its own, worse — it summed the gaps into one number and printed
 * that number through `formatMasterPosition`, so "1.248 seconds are
 * uncovered, somewhere" came out as `00:01.248 of the song has nothing on
 * screen`, which reads as a POSITION and names nowhere. It also never asked
 * about `span.missing` at all, so a scene naming a take that runs out
 * halfway left the button enabled and the author found out by pressing it.
 *
 * One rule, one place, two callers: the console explains and blocks, the
 * invariant refuses. The invariant cannot be the shared one — it imports
 * `quoteHash` from `ids.ts` and so drags `node:crypto` into any browser
 * bundle that touches it — which is why this lives here, beside the
 * projection it reads. Same reason `TAKE_ACCENT_FALLBACK` does.
 */
export interface RenderProblem {
  kind: 'no-scenes' | 'gap' | 'short-takes' | 'empty-scene';
  /** Where on the song clock, for every kind that has a place. */
  fromSample?: Samples;
  toSample?: Samples;
  /** Named by the scene and not reaching, for `short-takes`. */
  takeIds?: TakeId[];
  /** What is wrong and what to do, in one sentence, for a person. */
  say: string;
  /**
   * A GAP A SCENE COULD SIMPLY BE EXTENDED OVER.
   *
   * Present when there is a scene starting exactly where the gap ends, which
   * is the shape every gap has today: song before the first scene. Moving
   * that scene back closes the hole in one action instead of making the
   * author re-cut a boundary by hand.
   *
   * Positional, so a browser can compute it without reaching for the edit
   * functions — whether the move actually helps is the server's to decide,
   * because only the server may run the edit and re-ask this question.
   */
  extend?: { sceneId: SceneId; fromSample: Samples };
}

/**
 * Everything standing between this performance and a file.
 *
 * All of them, not the first: an author is better served by being told all of
 * what is wrong than by fixing one thing and pressing the button again. The
 * invariant still fails on the first, because an exception is one sentence.
 */
export function renderProblems(
  performance: Performance, window?: PerformanceWindow,
): RenderProblem[] {
  const timeline = projectPerformance(performance, window);
  const problems: RenderProblem[] = [];

  if (timeline.spans.length === 0) {
    return [{
      kind: 'no-scenes',
      say: 'this performance has no scenes, so there is nothing to render',
    }];
  }

  for (const gap of timeline.gaps) {
    /* The scene that begins where the hole ends, if there is one. */
    const next = performance.scenes.find((s) => s.fromSample === gap.toSample);
    problems.push({
      kind: 'gap',
      fromSample: gap.fromSample,
      toSample: gap.toSample,
      say: `no performance on them from ${formatMasterPosition(gap.fromSample)} `
        + `to ${formatMasterPosition(gap.toSample)} — put a take on that stretch, `
        + 'or start the scene that follows it earlier',
      ...(next ? { extend: { sceneId: next.id, fromSample: gap.fromSample } } : {}),
    });
  }

  for (const span of timeline.spans) {
    /*
     * Named but absent, checked BEFORE the empty case, because when a scene
     * names one take that does not reach it both are true and this is the one
     * that says something the author can act on. "Names no take" would be
     * accurate and unhelpful: they did name one.
     */
    if (span.missing.length > 0) {
      problems.push({
        kind: 'short-takes',
        fromSample: span.fromSample,
        toSample: span.toSample,
        takeIds: [...span.missing],
        say: `the scene from ${formatMasterPosition(span.fromSample)} to `
          + `${formatMasterPosition(span.toSample)} expects `
          + `${span.scene.takeIds.length} performance(s), but `
          + `${span.missing.join(', ')} do not reach all of it — `
          + 'either move the scene boundary or extend the take',
      });
    } else if (span.takes.length === 0) {
      /*
       * An empty scene. `setScene` refuses to make one, so reaching this means
       * a document that was edited by something else — which is exactly when
       * an invariant earns its place.
       */
      problems.push({
        kind: 'empty-scene',
        fromSample: span.fromSample,
        toSample: span.toSample,
        say: `the scene at ${formatMasterPosition(span.fromSample)} shows nobody`,
      });
    }
  }

  return problems;
}

/* ------------------------------------------------------------------------ *
 * MASTER CHECK                                                               *
 * ------------------------------------------------------------------------ */

/* ------------------------------------------------------------------------ *
 *  A join, as time.  [MASTER-EDIT §3, INV-03, D-19]
 * ------------------------------------------------------------------------ */

/**
 * Where a transition lies on the song clock, and who paid for it.
 *
 * THIS EXISTED TWICE, AND THE TWO AGREED ONLY BY LUCK. The planner spent
 * `overlapSplit`'s asymmetric before/after; MASTER CHECK spent
 * `ceil(frames/2)` on both sides. Those are the same span for an even
 * length and different for an odd one, and both lengths in the table are
 * even — ten frames and twenty-four — so nothing had ever disagreed.
 *
 * The moment an author can type nine, they do: the split pays five and four,
 * the check asks for five and five, and MASTER CHECK ticks a join whose
 * render the planner then refuses — which is precisely the failure the
 * checklist exists to prevent. So this is one answer with three callers
 * BEFORE the control that would have split them ships, not after. [D-19]
 *
 * Null for a cut, because a cut is not a length of time and has nothing to
 * ask of its neighbours.
 */
export interface JoinSpan {
  style: Transition;
  align: TransitionAlign;
  /** Frames taken from the shot being left, and from the one arriving. */
  before: Frames;
  after: Frames;
  /** The same span on the song clock, clamped to the song. */
  fromSample: Samples;
  toSample: Samples;
}

export function joinSpan(
  scene: Scene, song: Samples,
): JoinSpan | null {
  const style = transitionOf(scene);
  if (style.frames <= 0) return null;
  const align = transitionAlignOf(scene);
  const { before, after } = overlapSplit(style, align);
  return {
    style,
    align,
    before,
    after,
    fromSample: Math.max(0, scene.fromSample - framesToSamples(before)),
    toSample: Math.min(song, scene.fromSample + framesToSamples(after)),
  };
}

/**
 * Every join whose neighbours cannot pay for it, said in the author's words.
 *
 * Asked by MASTER CHECK before a render, and by the edit that sets a
 * duration, which makes the change and puts it back if this list got longer.
 * An author is never left holding a document that fails a check they could
 * have been stopped from reaching.
 */
export function joinProblems(performance: Performance): string[] {
  const scenes = orderedScenes(performance);
  const song = performance.master.durationSamples;
  const out: string[] = [];
  for (let i = 1; i < scenes.length; i += 1) {
    const scene = scenes[i]!;
    /* By the table and not by `transitionFor`, which falls back to a cut —
       a style nobody wrote must be reported, not silently downgraded. */
    if (scene.transition !== undefined && !Object.hasOwn(TRANSITIONS, scene.transition)) {
      out.push(`${scene.transition} is not a transition`);
      continue;
    }
    const join = joinSpan(scene, song);
    if (!join) continue;
    const where = formatMasterPosition(scene.fromSample);
    /*
     * THE NEIGHBOURS MUST HAVE THE TIME BEFORE THEY CAN HAVE THE PICTURE. A
     * mix longer than the section it eats into does not shorten that section,
     * it deletes it, and the planner refuses such a plan outright. Saying so
     * here means the author reads it in the checklist rather than in a
     * failed render.
     */
    const room = joinRoom(scenes, i, song);
    if (join.before > room.before || join.after > room.after) {
      out.push(`the ${join.style.label.toLowerCase()} at ${where} is longer than `
        + 'the sections it joins — shorten it, or move the boundary');
      continue;
    }
    for (const id of [...(scenes[i - 1]?.takeIds ?? []), ...scene.takeIds]) {
      const take = takeById(performance, id);
      if (!take || !coversSpan(take, join.fromSample, join.toSample, song)) {
        out.push(`${take?.label ?? id} has no picture across the `
          + `${join.style.label.toLowerCase()} at ${where}`);
      }
    }
  }
  return out;
}

/**
 * EVERYTHING WRONG WITH THE DOCUMENT RIGHT NOW, as sentences a person reads.
 *
 * The guard every edit that can break something asks before and after
 * itself. It exists because the two halves used to be asked separately, and
 * separate questions can be traded against each other: an edit that closes
 * a hole and breaks a dissolve in the same move passes a guard that only
 * knows about holes.
 *
 * FOR `coverGap` THIS IS BELT AND BRACES AND IS SAID TO BE. Its rule is that
 * problems must STRICTLY DECREASE, and every hole it is offered for is the
 * stretch before the first scene, so the move it makes lengthens a section
 * rather than shortening one and cannot take room away from a join. No
 * reachable trade was found; the question is widened anyway, because the
 * narrow version was right only for reasons outside itself. For
 * `moveBoundary` the trade is real and there is a test that makes it.
 *
 * Sentences rather than objects, because the guard's whole job is to compare
 * two readings and say what is NEW, and two problems are the same problem
 * exactly when an author would read the same line twice. [D-19]
 */
export function allProblems(performance: Performance): string[] {
  return [
    ...renderProblems(performance).map((problem) => problem.say),
    ...joinProblems(performance),
  ];
}

/**
 * How many frames each side of a join could pay, if asked.
 *
 * Strictly less than the section itself, on both sides: a transition that
 * consumed a whole shot would leave the picture track with a scene of zero
 * length, which the planner treats as a broken plan rather than a short one.
 */
export function joinRoom(
  scenes: readonly Scene[], index: number, song: Samples,
): { before: Frames; after: Frames } {
  const scene = scenes[index];
  const previous = scenes[index - 1];
  if (!scene || !previous) return { before: 0, after: 0 };
  const end = scenes[index + 1]?.fromSample ?? song;
  return {
    before: Math.max(0, samplesToFrames(scene.fromSample - previous.fromSample) - 1),
    after: Math.max(0, samplesToFrames(end - scene.fromSample) - 1),
  };
}

/**
 * Everything that must be true before a master is worth rendering.
 * [MASTER-EDIT §13, §12 P0, INV-02, INV-03]
 *
 * A LIST OF TICKS IS A PROMISE, and the one thing this must never do is tick
 * something it did not check. "Frame rate consistent" printed green because
 * the product hopes so is worse than not printing it: it teaches an author
 * to trust the list, and then spends that trust on the one render where it
 * mattered. So every item here carries `says` — what was actually compared
 * — and every item is computed from the document in front of it.
 *
 * TWO OF THEM COULD NOT BE CHECKED AS ASKED, and are therefore checked as
 * something true instead:
 *
 *   A take carries no frame rate and no pixel size; it is conformed to the
 *   house rate on ingest, and the document does not record what it was
 *   before. So "frame rate consistent" asks the question the document CAN
 *   answer — does every cut land on an exact frame boundary of the output
 *   clock — which is INV-02 and is the failure that would actually show.
 *
 *   "Resolution valid" is about the OUTPUT, because that is the resolution
 *   this render has. An encoder wants even dimensions and a profile that
 *   exists.
 *
 * AND ONE OF THEM CLOSES A HOLE THE CODE ALREADY KNEW ABOUT. `transitions.ts`
 * has said since it was written that a dissolve "has a precondition the
 * planner has to check: both takes must have picture across the whole
 * overlap, including the part that lies outside their own scenes" — and
 * nothing checked it. A transition whose neighbours run out mid-mix is a
 * render that dips to black in the middle of a dissolve.
 */
export interface MasterCheckItem {
  id: string;
  /** The line an author reads. */
  label: string;
  ok: boolean;
  /** What was compared, so a tick means something. */
  says: string;
  /** The problems behind a failure, where they have a place on the clock. */
  problems?: RenderProblem[];
}

export function masterCheck(
  performance: Performance, profileId: string,
  profiles: Record<string, { width: number; height: number; fps: number }>,
): { items: MasterCheckItem[]; ready: boolean } {
  const timeline = projectPerformance(performance);
  const problems = renderProblems(performance);
  const song = performance.master.durationSamples;
  const scenes = orderedScenes(performance);
  const byKind = (kind: RenderProblem['kind']) =>
    problems.filter((problem) => problem.kind === kind);
  const item = (
    id: string, label: string, ok: boolean, says: string,
    found: RenderProblem[] = [],
  ): MasterCheckItem => ({
    id, label, ok, says, ...(found.length > 0 ? { problems: found } : {}),
  });

  const items: MasterCheckItem[] = [];

  /* 1. The song is a song, and the projection is as long as it. */
  items.push(item('song', 'Song duration matches',
    song > 0 && timeline.totalSamples === song,
    song > 0
      ? `${formatMasterPosition(timeline.totalSamples)} projected against `
        + `${formatMasterPosition(song)} of song`
      : 'the song has no duration'));

  /* 2. Coverage: no hole of any kind, which is three problems in one line. */
  const uncovered = [...byKind('gap'), ...byKind('short-takes'),
    ...byKind('empty-scene'), ...byKind('no-scenes')];
  items.push(item('covers', 'Video covers entire duration',
    uncovered.length === 0,
    uncovered.length === 0
      ? 'every moment of the song has a take on it'
      : `${uncovered.length} stretch(es) with nothing to show`,
    uncovered));

  /* 3. And the specific kind the brief names. */
  const gaps = byKind('gap');
  items.push(item('gaps', 'No timeline gaps', gaps.length === 0,
    gaps.length === 0 ? 'the picture track begins at 00:00.000 and never stops'
      : `${gaps.length} gap(s)`, gaps));

  /*
   * 4. Overlaps. Two scenes cannot overlap by construction — a scene runs
   *    until the next one begins — so what CAN go wrong is two scenes
   *    claiming the same instant, and spans that fail to tile the output
   *    clock. Both are checked rather than assumed.
   */
  const starts = scenes.map((scene) => scene.fromSample);
  const doubled = starts.length !== new Set(starts).size;
  let tiles = true;
  let expected = 0;
  for (const span of timeline.spans) {
    if (span.outputStartFrame !== expected) tiles = false;
    expected += span.durationFrames;
  }
  items.push(item('overlaps', 'No overlapping master segments',
    !doubled && tiles,
    doubled ? 'two segments begin at the same instant'
      : tiles ? `${timeline.spans.length} segment(s), edge to edge`
        : 'the segments do not tile the output clock'));

  /* 5. Every take a scene names still exists and has something in it. */
  const missing = new Set<string>();
  for (const scene of scenes) {
    for (const id of scene.takeIds) {
      const take = takeById(performance, id);
      if (!take || take.durationSamples <= 0) missing.add(id);
    }
  }
  items.push(item('sources', 'All source takes available', missing.size === 0,
    missing.size === 0
      ? `${new Set(scenes.flatMap((scene) => scene.takeIds)).size} take(s) in use`
      : `${[...missing].join(', ')} named by a scene and not here`));

  /*
   * 6. THE PRECONDITION `transitions.ts` NAMED AND NOBODY CHECKED — now one
   *    function, asked here and by the planner and by the edit that sets a
   *    duration, so the three can never disagree. [D-19]
   */
  const badJoins = joinProblems(performance);
  items.push(item('transitions', 'Transitions valid', badJoins.length === 0,
    badJoins.length === 0
      ? `${Math.max(0, scenes.length - 1)} join(s), every mix covered on both sides`
      : badJoins[0]!));

  /*
   * 7. Sound. The three modes fail differently: one needs a nominated vocal
   *    that has audio, one needs the take on screen to have any.
   */
  const silent = (id: string) => takeById(performance, id)?.hasAudio === false;
  let audioSays = 'the song, under the picture';
  let audioOk = true;
  const mode = performance.audio.mode;
  if (mode === 'master_vocal') {
    const vocal = performance.audio.vocalTakeId;
    audioOk = Boolean(vocal && !silent(vocal));
    audioSays = audioOk ? `one vocal throughout, from ${takeById(performance, vocal!)?.label}`
      : 'the vocal take has no sound';
  } else if (mode === 'take_audio') {
    const mute = scenes.flatMap((scene) => scene.takeIds).filter(silent);
    audioOk = mute.length === 0;
    audioSays = audioOk ? 'every take on screen has its own sound'
      : `${mute.length} take(s) on screen recorded no sound`;
  }
  items.push(item('audio', 'Audio present', audioOk, audioSays));

  /*
   * 8. Frames.
   *
   * THE FIRST VERSION OF THIS CRIED WOLF, which for a checklist is the
   * worst thing it can do. It asked whether every cut lands exactly on a
   * frame boundary — and a cut is placed from the playhead, so it lands
   * wherever the song happened to be. At the house rate that is one sample
   * in 1600: the scene I moved to 30000 while testing is 18.75 frames, and
   * every cut an author makes by pressing a number is as arbitrary. The
   * check would have failed on nearly every performance, for something the
   * renderer handles by rounding, and an author would have learned to
   * ignore the list.
   *
   * QUANTISATION IS NOT A DEFECT. `samplesToFrames` rounds to the nearest
   * frame, which is by definition within half of one — 20ms at the house
   * rate. What IS a defect is a segment shorter than a single frame: two
   * cuts inside 1/25s leave a span that renders nothing at all, and
   * nothing prevents one being made. That is the question worth asking.
   */
  const tooShort = timeline.spans.filter((span) => span.durationFrames < 1);
  items.push(item('frames', 'Frame rate consistent', tooShort.length === 0,
    tooShort.length === 0
      ? `every segment at least one frame at ${HOUSE_FPS}fps, cuts quantised to the grid`
      : `${tooShort.length} segment(s) shorter than a frame — they would render nothing`));

  /* 9 and 10. The output's own shape, which is the only resolution there is. */
  const profile = profiles[profileId];
  items.push(item('resolution', 'Resolution valid',
    Boolean(profile) && profile!.width > 0 && profile!.height > 0
      && profile!.width % 2 === 0 && profile!.height % 2 === 0,
    profile ? `${profile.width}×${profile.height}` : `no such profile: ${profileId}`));
  items.push(item('aspect', 'Output aspect ratio valid', Boolean(profile),
    profile ? `${(profile.width / profile.height).toFixed(4)} — every arrangement `
      + 'reframes for it' : 'unknown'));

  return { items, ready: items.every((entry) => entry.ok) };
}

/**
 * How a hole could be closed, offering only what would close it.
 * [MASTER-EDIT §13]
 *
 * THE BRIEF LISTS FIVE REMEDIES. Two of them cannot apply to a hole at the
 * start of a song — there is no previous take to extend and no previous
 * frame to freeze — and one of them ("add transition") is not a repair at
 * all: a transition between two shots does not put a shot where there is
 * none. Offering all five and failing on three is how a repair menu teaches
 * somebody to stop reading it.
 *
 * AND "CHOOSE A TAKE" IS ONLY WORTH OFFERING FOR TAKES THAT REACH. The
 * product already knows which ones do — `coversSpan` is the same question
 * the timeline asks — so the list is the takes that would actually cover
 * the stretch, and it says so when none of them would. A picker that lets
 * you choose a take that does not reach has moved the error, not fixed it.
 */
export interface Repair {
  id: 'use-next' | 'choose' | 'use-previous' | 'freeze';
  label: string;
  /** Why it is offered, or why it is not. */
  says: string;
  available: boolean;
  /** For `choose`: the takes that would actually cover the stretch. */
  takeIds?: TakeId[];
}

export function repairsFor(
  performance: Performance, problem: RenderProblem,
): Repair[] {
  const song = performance.master.durationSamples;
  const from = problem.fromSample ?? 0;
  const to = problem.toSample ?? song;
  const scenes = orderedScenes(performance);
  const before = [...scenes].reverse().find((scene) => scene.fromSample < from);
  const covering = performance.takes
    .filter((take) => take.durationSamples > 0 && coversSpan(take, from, to, song))
    .map((take) => take.id);

  return [
    {
      id: 'use-next',
      label: 'Use the next take',
      available: Boolean(problem.extend),
      says: problem.extend
        ? 'start the scene that follows this stretch earlier'
        : 'nothing follows this stretch',
    },
    {
      id: 'choose',
      label: 'Choose a take',
      available: covering.length > 0,
      says: covering.length > 0
        ? `${covering.length} take(s) have picture across all of it`
        : 'no take reaches across this stretch',
      takeIds: covering,
    },
    {
      id: 'use-previous',
      label: 'Extend the previous take',
      available: false,
      says: before
        ? 'a scene already runs up to this stretch — its TAKE is what falls '
          + 'short, so extend or replace the take'
        : 'nothing comes before this stretch',
    },
    {
      id: 'freeze',
      label: 'Freeze the previous frame',
      available: false,
      says: 'a still held from a take is not something the renderer can make yet',
    },
  ];
}

/**
 * Where the work has got to.  [§2, §14, U-04, D-14]
 *
 * PERFORM → COMPOSE → MASTER → DELIVER is not a new idea about Studio Two;
 * it is what Studio Two already does, said out loud. Takes are recorded,
 * scenes are directed over them, one file is made, versions of that file go
 * out. The studio had all four and named none of them, so the page below the
 * editor read as a list of unrelated controls — sound, then shapes, then a
 * clip, then a preview picture, then a publish button — with nothing saying
 * which of them belonged to the same act.
 *
 * IT IS A READOUT AND NOT A WIZARD, which is the whole difference. Nothing
 * gates anything: a take can be re-recorded after the master is made, a
 * scene moved after it is published, the render pressed again. Every stage
 * stays reachable at every moment. What this says is where the work IS, the
 * way a meter says what a signal is doing — and it is derived from the
 * document every time it is asked, so it cannot say something the document
 * does not. [U-04: the interrupt is the product]
 *
 * IN THE DOMAIN AND NOT IN THE COMPONENT, because "is this performance
 * composed" is a fact about a performance, and a fact worth drawing is a
 * fact worth testing.
 */
export type StageId = 'perform' | 'compose' | 'master' | 'deliver';

export interface Stage {
  id: StageId;
  label: string;
  /** What is done here, in the words of doing it. */
  hint: string;
  done: boolean;
}

/** What a render job looks like from here: enough to say which and whether. */
export interface RenderState {
  state: string;
  payload?: Record<string, unknown> | undefined;
}

/** The master IS the wide one; everything else is a version of it. [§14] */
export const MASTER_PROFILE = 'youtube_16x9';

export function stagesOf(
  performance: Performance, renders: readonly RenderState[],
): Stage[] {
  const profileOf = (job: RenderState) =>
    String(job.payload?.['exportProfileId'] ?? MASTER_PROFILE);
  const done = renders.filter((job) => job.state === 'done');
  const published = Boolean(performance.publication
    && !performance.publication.unpublishedAt);
  return [
    {
      id: 'perform',
      label: 'Perform',
      hint: 'Record and manage takes',
      done: performance.takes.some((take) => take.durationSamples > 0),
    },
    {
      id: 'compose',
      label: 'Compose',
      hint: 'Edit, mix and add effects',
      /*
       * Not "has scenes" but "has scenes a renderer would accept". A song
       * with a hole in it is still being composed, whatever else is true of
       * it — and that is the same question the render console and the
       * renderer ask, rather than a third opinion about it. [D-19, INV-03]
       */
      done: performance.scenes.length > 0 && renderProblems(performance).length === 0,
    },
    {
      id: 'master',
      label: 'Master',
      hint: 'Create your final video',
      done: done.some((job) => profileOf(job) === MASTER_PROFILE),
    },
    {
      id: 'deliver',
      label: 'Deliver',
      hint: 'Export and publish',
      done: published || done.some((job) => profileOf(job) !== MASTER_PROFILE),
    },
  ];
}

/**
 * Which stage the work is at: the first thing not yet done, or the last.
 *
 * NOT "the furthest done", which is the tempting reading and the wrong one.
 * A performance that is mastered and then has a hole cut back into it is at
 * COMPOSE again, and a readout that kept saying DELIVER because it once got
 * there would be describing the past.
 */
export function stageNow(stages: readonly Stage[]): number {
  const next = stages.findIndex((stage) => !stage.done);
  return next === -1 ? stages.length - 1 : next;
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
