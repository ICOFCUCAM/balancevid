/**
 * The cameras on this machine, opened.  [TAKE-DESKTOP T-3, T-6]
 *
 * THE ABSTRACTION IS INTRODUCED HERE WITH ITS TWO REACHABLE
 * IMPLEMENTATIONS, which is the document's own staging:
 *
 *     CameraSource
 *     ├── LocalCamera      (here)
 *     ├── CaptureDevice    (here, where the OS presents one as a camera)
 *     ├── NDISource        (T-6)
 *     └── RTSPSource       (T-6)
 *
 * > *"Then the rest of Take doesn't care where the camera came
 * > from."*
 *
 * So everything above this file takes a `SourceFeed` and never
 * asks how the picture arrived. T-6 adds two openers and changes
 * nothing else.
 *
 * A CAPTURE CARD IS A CAMERA TO THE OPERATING SYSTEM, which is
 * why `CaptureDevice` is not a different opener: Blackmagic,
 * Elgato and an HDMI dongle all present as a video input and
 * `getUserMedia` takes them by device id. The distinction is kept
 * because an operator reads it — *"which of these four is the
 * desk camera"* — and because T-6's sources genuinely are
 * different.
 *
 * IT DOES NOT RECORD. Opening a stream, measuring its level and
 * drawing it is T-3; writing it to disk is T-4, and
 * `useMasterRecording`'s arithmetic is the one copy for every
 * client when that stage comes.
 */

import type { SourceFeed, SourceKind } from '../../shared/src/sourceGrid.js';

export interface Device {
  id: string;
  label: string;
  kind: SourceKind;
}

/**
 * A capture card, told from a webcam by what it calls itself.
 *
 * A GUESS, AND LABELLED AS ONE. There is no API that says "this
 * is a capture card"; the label is all there is, and these are
 * the names the common ones use. Guessing wrong costs a word in
 * a badge and nothing else — which is why it is allowed to be a
 * guess at all.
 */
const CAPTURE_NAMES =
  /\b(capture|blackmagic|decklink|elgato|cam ?link|hdmi|ndi|magewell|aja|epiphan|usb ?video)\b/i;

export function kindOf(label: string): SourceKind {
  return CAPTURE_NAMES.test(label) ? 'capture' : 'camera';
}

/**
 * What a device is called when it will not say.
 *
 * A BROWSER HIDES LABELS UNTIL PERMISSION IS GRANTED, and the
 * first enumeration on a fresh machine returns four devices all
 * called nothing. `Camera 2` is better than an empty tile, and
 * the real labels arrive on the next enumeration — which is why
 * `listDevices` is called again after the first stream opens.
 */
export function nameOf(label: string, index: number): string {
  const trimmed = label.trim();
  return trimmed || `Camera ${index + 1}`;
}

/** Every video input this machine will admit to. */
export async function listDevices(): Promise<Device[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  let found: MediaDeviceInfo[];
  try {
    found = await navigator.mediaDevices.enumerateDevices();
  } catch {
    /* A machine that will not enumerate has no cameras as far as
       this screen is concerned, and PREPARE says so. */
    return [];
  }
  return found
    .filter((one) => one.kind === 'videoinput')
    .map((one, index) => ({
      id: one.deviceId,
      label: nameOf(one.label, index),
      kind: kindOf(one.label),
    }));
}

/** One source, open, with everything the grid needs to read it. */
export interface Open {
  device: Device;
  stream: MediaStream | null;
  refused?: string;
  /** Measured from the stream, not from what was asked for. */
  width?: number;
  height?: number;
  frameRate?: number;
}

/**
 * Why `getUserMedia` said no, in words an operator can act on.
 *
 * THE BROWSER'S OWN NAMES ARE NOT SENTENCES. `NotReadableError`
 * is what a camera another application has taken returns, and it
 * is also the single commonest thing that happens in a room with
 * four cameras and somebody's video-call window still open.
 */
export function refusalSays(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? '';
  switch (name) {
    case 'NotAllowedError':
      return 'Permission refused. Allow the camera in your system settings.';
    case 'NotReadableError':
      return 'Another application is using it. Close that and try again.';
    case 'NotFoundError':
      return 'It is no longer plugged in.';
    case 'OverconstrainedError':
      return 'It cannot do what was asked of it.';
    default:
      return 'It would not open.';
  }
}

/**
 * Open one device.
 *
 * WHAT IS ASKED FOR IS A PREFERENCE, NOT A DEMAND — `ideal`
 * rather than `exact`. A camera that can only do 720p should open
 * at 720p and be reported as such, which is what PREPARE's format
 * warning is for; demanding 1080p would turn a usable camera into
 * a refusal.
 *
 * AUDIO IS ASKED FOR AND NOT REQUIRED, and the two have to be
 * separate requests for that to be true: one call for both fails
 * entirely when a camera has no microphone, which is most capture
 * cards.
 */
export async function openDevice(
  device: Device,
  want: { width: number; height: number; frameRate: number },
  audio: boolean,
): Promise<Open> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        deviceId: { exact: device.id },
        width: { ideal: want.width },
        height: { ideal: want.height },
        frameRate: { ideal: want.frameRate },
      },
      audio: audio ? { deviceId: device.id } : false,
    });
    return { device, stream, ...settingsOf(stream) };
  } catch (error) {
    /*
     * A CAMERA WITH NO MICROPHONE IS NOT A FAILURE, and asking
     * for both in one call makes it one. Tried again without the
     * audio before giving up — which is the ordinary case for a
     * capture card, not an edge case.
     */
    if (audio) return openDevice(device, want, false);
    return { device, stream: null, refused: refusalSays(error) };
  }
}

/**
 * What the stream actually settled on.
 *
 * READ WHILE IT IS RUNNING. PART THREE recorded what happens
 * otherwise: the first eight-recorder measurement reported
 * `undefinedxundefined@undefined` because the settings were read
 * after `track.stop()`, and *"a measurement taken after the thing
 * being measured has stopped is not a measurement."*
 */
export function settingsOf(stream: MediaStream): {
  width?: number; height?: number; frameRate?: number;
} {
  const track = stream.getVideoTracks()[0];
  if (!track || track.readyState !== 'live') return {};
  const settings = track.getSettings();
  return {
    ...(settings.width ? { width: settings.width } : {}),
    ...(settings.height ? { height: settings.height } : {}),
    ...(settings.frameRate ? { frameRate: settings.frameRate } : {}),
  };
}

/** One open source, as the grid reads it. */
export function feedOf(open: Open, energy: number): SourceFeed {
  const video = open.stream?.getVideoTracks()[0];
  const audio = open.stream?.getAudioTracks()[0];
  return {
    id: open.device.id,
    label: open.device.label,
    kind: open.device.kind,
    ...(open.refused ? { refused: open.refused } : {}),
    hasVideo: Boolean(video) && video!.readyState === 'live',
    /*
     * `muted` IS THE BROWSER'S OWN WORD for a track that exists
     * and is delivering nothing — the capture card with no cable
     * in it, exactly the fault PREPARE refuses on.
     */
    videoDark: Boolean(video?.muted),
    hasAudio: Boolean(audio) && audio!.readyState === 'live',
    audioDark: Boolean(audio?.muted) || (audio ? !audio.enabled : false),
    energy,
    ...(open.width ? { width: open.width } : {}),
    ...(open.height ? { height: open.height } : {}),
    ...(open.frameRate ? { frameRate: open.frameRate } : {}),
  };
}

/** Stop everything a source holds. A camera left open is a light left on. */
export function closeOpen(open: Open): void {
  for (const track of open.stream?.getTracks() ?? []) track.stop();
}
