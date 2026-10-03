/**
 * One start, and every start recorded.  [Doctrine U-06, U-08;
 * STUDIO-TWO S-3; TAKE-DESKTOP T-4]
 *
 * > *"All recorders start from one call, to local disk. Each
 * > source's measured start is written into the session."*
 *
 * THE ONE CALL IS A TIGHT LOOP AND NOT A PROMISE CHAIN, which is
 * the whole of the sub-millisecond spread PART THREE measured.
 * `recorder.start()` returns immediately; awaiting anything
 * between two of them would put a task boundary — and whatever
 * the browser decided to do in it — between two cameras that are
 * supposed to be one capture.
 *
 * SO NOTHING IS AWAITED INSIDE THE LOOP. The directory is made
 * first, the recorders are constructed first, and the loop that
 * starts them does one thing.
 *
 * THIS IS NOT A SECOND `useMasterRecording`. That hook answers
 * *where was the song when the recorder opened*, corrected by the
 * device latency the author calibrated, and it already says what
 * it does with no song: zero. There is no song here. What is
 * measured instead is how far apart the recorders began from
 * EACH OTHER, which is `shared/src/capture.ts`'s arithmetic and
 * is shared with the installation that reads it. The master
 * arithmetic stays where it is, used by the clients that have a
 * master. [B-1]
 *
 * SEGMENTS, BECAUSE A CRASH MUST LEAVE WHAT WAS RECORDED. Four
 * seconds, the same as every other recording in this product, and
 * each one appended to its angle's file as it arrives — so the
 * file on disk is always as long as the recording is. [U-06]
 */

import { type SourceStart, spreadMs } from '../../shared/src/capture.js';
import type { TakeBridge } from './preload.js';
import type { Open } from './cameras.js';

/** Rolling segments, as every other recording in this product uses. */
export const SEGMENT_MS = 4000;

export type Phase = 'idle' | 'recording' | 'finishing' | 'done' | 'failed';

export interface Angle {
  sourceId: string;
  label: string;
  file: string;
  bytes: number;
  hasAudio: boolean;
  width?: number;
  height?: number;
  frameRate?: number;
}

export interface Recording {
  id: string;
  label: string;
  beganAt: string;
  starts: SourceStart[];
  angles: Angle[];
}

/** What a file for one angle is called. Ordinal first, so a
    directory listing is the lineup. */
export function angleFile(slot: number, sourceId: string): string {
  const safe = sourceId.replace(/[^A-Za-z0-9]/g, '').slice(0, 24) || 'source';
  return `${String(slot).padStart(2, '0')}-${safe}.webm`;
}

/**
 * What the recorders are told to produce.
 *
 * VP8 AND OPUS, WHICH IS WHAT THE REST OF THE PRODUCT ALREADY
 * RECORDS. PART THREE measured eight concurrent recorders in
 * exactly this, and a capture station that chose differently
 * would be handing the installation a format its own clients
 * never send it.
 */
export const MIME = 'video/webm;codecs=vp8,opus';

function mimeFor(): string | undefined {
  try {
    return MediaRecorder.isTypeSupported(MIME) ? MIME : undefined;
  } catch {
    /* No MediaRecorder here at all. The caller gets a failure
       rather than a recording that silently produced nothing. */
    return undefined;
  }
}

/**
 * Start every source at once, and write what each of them did.
 *
 * Returns a handle that stops them. The capture is closed when
 * the last chunk has been written, not when `stop()` returns —
 * `useMasterRecording` learned that the expensive way: *"the
 * first version waited a fixed 600ms instead and hoped."*
 */
export async function startCapture(
  bridge: TakeBridge,
  sources: readonly { open: Open; slot: number }[],
  label: string,
  now: () => number = () => performance.now(),
): Promise<{
  recording: Recording;
  stop: () => Promise<Recording>;
} | null> {
  const usable = sources.filter((one) => one.open.stream);
  if (usable.length === 0) return null;

  const beganAt = new Date().toISOString();
  const id = `cap_${beganAt.replace(/[-:]/g, '').replace(/\..*/, '')}`
    + `_${Math.random().toString(36).slice(2, 6)}`;
  /* The directory exists before any media does. [RecordingSink] */
  if (!(await bridge.beginCapture(id, label, beganAt))) return null;

  const recording: Recording = {
    id, label, beganAt, starts: [], angles: [],
  };
  const bytes = new Map<string, number>();
  const writes: Promise<unknown>[] = [];
  const recorders: { one: MediaRecorder; sourceId: string }[] = [];
  const mimeType = mimeFor();

  /*
   * CONSTRUCTED FIRST, STARTED SECOND. Building a `MediaRecorder`
   * allocates an encoder, and doing that between two `start()`
   * calls is the spread this file exists to keep small.
   */
  for (const { open, slot } of usable) {
    const sourceId = open.device.id;
    const file = angleFile(slot, sourceId);
    bytes.set(sourceId, 0);
    recording.angles.push({
      sourceId,
      label: open.device.label,
      file,
      bytes: 0,
      hasAudio: (open.stream?.getAudioTracks().length ?? 0) > 0,
      ...(open.width ? { width: open.width } : {}),
      ...(open.height ? { height: open.height } : {}),
      ...(open.frameRate ? { frameRate: open.frameRate } : {}),
    });

    const recorder = new MediaRecorder(open.stream!,
      mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (event) => {
      if (event.data.size === 0) return;
      /*
       * THE FIRST CHUNK IS WHEN CAPTURE DEMONSTRABLY EXISTED, and
       * it is stamped here rather than in the write: the write is
       * an `await` away and would measure the disk instead.
       */
      const start = recording.starts.find((each) => each.id === sourceId);
      if (start && start.firstChunkAtMs === undefined) {
        start.firstChunkAtMs = now();
      }
      writes.push((async () => {
        const buffer = await event.data.arrayBuffer();
        const wrote = await bridge.writeChunk(id, file, new Uint8Array(buffer));
        bytes.set(sourceId, (bytes.get(sourceId) ?? 0) + wrote);
      })().catch(() => undefined));
    };
    recorders.push({ one: recorder, sourceId });
  }

  /*
   * AND HERE IS THE ONE CALL. Nothing between two `start()`s but
   * the loop itself and one `now()`.
   */
  for (const { one, sourceId } of recorders) {
    one.start(SEGMENT_MS);
    recording.starts.push({ id: sourceId, calledAtMs: now() });
  }

  let stopped = false;
  const stop = async (): Promise<Recording> => {
    if (stopped) return recording;
    stopped = true;
    await Promise.all(recorders.map(({ one }) => new Promise<void>((done) => {
      if (one.state === 'inactive') { done(); return; }
      one.addEventListener('stop', () => done(), { once: true });
      one.stop();
    })));
    /*
     * EVERY CHUNK HAS LANDED BEFORE THE MANIFEST IS WRITTEN. The
     * sizes in it are read off the files, so a manifest written
     * early would record a capture shorter than the capture is.
     */
    await Promise.all(writes);
    for (const angle of recording.angles) {
      angle.bytes = bytes.get(angle.sourceId) ?? 0;
    }
    /*
     * EACH ANGLE CARRIES THE TWO INSTANTS ITS OFFSET CAME FROM.
     * The type refused the manifest without them, which was
     * right: `offsetSamples` with no `calledAtMs` and no
     * `firstChunkAtMs` beside it is a number somebody has to
     * trust rather than check.
     */
    await bridge.endCapture({
      id, label, beganAt,
      endedAt: new Date().toISOString(),
      starts: recording.starts,
      angles: recording.angles.map((angle) => {
        const start = recording.starts.find((one) => one.id === angle.sourceId);
        return {
          ...angle,
          calledAtMs: start?.calledAtMs ?? 0,
          ...(start?.firstChunkAtMs === undefined
            ? {} : { firstChunkAtMs: start.firstChunkAtMs }),
        };
      }),
    });
    return recording;
  };

  return { recording, stop };
}

/** What to tell somebody while it runs. */
export function recordingSays(recording: Recording, seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const clock = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  const spread = spreadMs(recording.starts);
  /*
   * THE SPREAD IS SHOWN WHILE RECORDING, not only afterwards. It
   * is the one number that says whether this is a capture or four
   * videos, and an operator who learns it at the end learns it too
   * late to do anything.
   */
  return recording.starts.length < 2 ? clock
    : `${clock} · ${recording.angles.length} angles, `
      + `${spread < 1 ? '<1' : spread.toFixed(1)} ms apart`;
}
