'use client';

/**
 * "Add audio."  [TIMELINE B6h, B8]
 *
 * The one place a sound gets onto this timeline, so the song's menu and
 * the takes rail cannot come to differ about what happens when you add
 * one — which is the same argument the take menu made for existing at
 * all. [D-19]
 *
 * WHERE IT LANDS IS THE PLAYHEAD. A file knows nothing about the song,
 * so the only thing that can say where the author meant it to go is
 * where they were looking when they asked. Everything else about the
 * layer — how long it is, above all — is measured by the worker, not
 * guessed here. [U-02, U-23]
 */

/** What a file is called once the extension is off it. */
export function soundLabel(filename: string): string {
  const named = filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 60);
  return named || 'Sound';
}

export interface SoundUpload {
  label: string;
  track: 'voice' | 'effect' | 'ambience' | 'music';
  fromSample: number;
  loop?: boolean;
}

/** Where the bytes go, with everything the file cannot say itself. */
export function soundUploadUrl(
  performanceId: string, asked: SoundUpload,
): string {
  const query = new URLSearchParams({
    label: asked.label,
    track: asked.track,
    /* A whole number of samples, because every position here is one. */
    fromSample: String(Math.max(0, Math.round(asked.fromSample))),
  });
  if (asked.loop) query.set('loop', 'true');
  return `/api/performances/${encodeURIComponent(performanceId)}`
    + `/sounds?${query.toString()}`;
}

/**
 * WHAT A SOUND FILE IS, said to the file picker.
 *
 * Audio, and video too: "add the audio of this clip" is a real thing to
 * want and the ingest strips the picture anyway — refusing an mp4 here
 * would be the product knowing better than the author about a file it
 * is about to throw half of away.
 */
export const SOUND_ACCEPT = 'audio/*,video/*';

export interface SoundPicked {
  file: File;
  label: string;
}

/**
 * Ask for a file and send it.  [B6h]
 *
 * The input is made, used and dropped rather than left in the tree: a
 * menu row cannot own a hidden `<input>`, and a studio that keeps one
 * around for every way of starting an upload ends up with several.
 */
export function pickSound(
  performanceId: string,
  asked: Omit<SoundUpload, 'label'> & { label?: string },
  said: {
    onStarted?: (label: string) => void;
    onFinished: (jobId: string) => void;
    onError: (message: string) => void;
  },
): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = SOUND_ACCEPT;
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (!file) return;
    const label = asked.label ?? soundLabel(file.name);
    said.onStarted?.(label);
    void sendSound(performanceId, file, { ...asked, label }, said);
  });
  document.body.append(input);
  input.click();
}

/** The request itself, apart from the picker so it can be tested. */
export async function sendSound(
  performanceId: string,
  file: Blob,
  asked: SoundUpload,
  said: {
    onFinished: (jobId: string) => void;
    onError: (message: string) => void;
  },
  send: typeof fetch = fetch,
): Promise<void> {
  try {
    const response = await send(soundUploadUrl(performanceId, asked), {
      method: 'POST',
      body: file,
      headers: { 'content-type': 'application/octet-stream' },
    });
    const body = await response.json().catch(() => ({})) as {
      job?: { id?: string }; error?: string;
    };
    if (!response.ok) throw new Error(body.error ?? 'that sound could not be added');
    /*
     * NOTHING IS ON THE TIMELINE YET, and the caller is told which job
     * to watch rather than being handed a layer. The document learns
     * about the sound when its length has been counted; showing it
     * before then would mean drawing a block whose width is a guess.
     */
    if (body.job?.id) said.onFinished(body.job.id);
    else throw new Error('that sound could not be added');
  } catch (error) {
    said.onError(error instanceof Error ? error.message : String(error));
  }
}
