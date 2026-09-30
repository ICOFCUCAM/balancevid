'use client';

import { useCallback, useEffect, useState } from 'react';

import { useDevices, type Devices } from './useDevices.js';

/**
 * Which camera this MACHINE uses, remembered.  [CHANNEL §23, D-19, U-19]
 *
 * THE PICKER EXISTED AND THE CHOICE DID NOT SURVIVE THE PAGE. `useDevices`
 * lists every camera and `cameraConstraints` opens a named one, and nothing
 * wrote the answer down: a producer who plugged in a capture card, found it
 * in the menu and selected it had to do the same thing again the next
 * morning, and again after every reload. The only things this product
 * remembered about a machine were the quality preset and the ground.
 *
 * SO IT IS REMEMBERED THE WAY QUALITY IS — per browser, in localStorage,
 * for the same reason `useQuality` gives: what camera to use is a fact
 * about the room somebody is sitting in, not about the channel or the
 * performance. A guest joining from a hotel must not inherit the studio's
 * capture card.
 *
 * AND IT IS NOT READ DURING RENDER. The server renders these pages and has
 * no localStorage; a first render that used the stored value on the client
 * and nothing on the server is React #418, which this product has already
 * paid for once. The first render has no choice and the stored one arrives
 * immediately after, before any camera is opened.
 *
 * THE FALLBACK IS THE POINT, not a nicety. `cameraConstraints` asks for
 * `deviceId: { exact: … }` — deliberately, so a chosen camera is never
 * silently substituted — which means a REMEMBERED camera that has since
 * been unplugged makes `getUserMedia` throw. Remembering without forgetting
 * would turn "I used the capture card yesterday" into "the studio will not
 * open today". So a stored id that is no longer among the devices is
 * dropped, and the caller is told, rather than being handed an id that
 * cannot be opened.
 */

const CAMERA = 'balancevid.camera';
const MICROPHONE = 'balancevid.microphone';

export interface CameraChoice {
  /** Every camera and microphone the machine can see. */
  devices: Devices;
  /** The chosen camera, or undefined for "whatever the browser prefers". */
  cameraId: string | undefined;
  microphoneId: string | undefined;
  chooseCamera: (id: string | undefined) => void;
  chooseMicrophone: (id: string | undefined) => void;
  /** False until the stored values have been read, which is one paint. */
  settled: boolean;
  /**
   * What the remembered camera was called, when it is gone.
   *
   * SAID RATHER THAN SWALLOWED. Falling back silently is how somebody
   * broadcasts a whole show on the laptop's webcam without noticing the
   * capture card never came back. [U-19]
   */
  lost: string | null;
}

function stored(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    /* Private browsing, or storage disabled. No memory, and that is
       a degradation rather than a fault. */
    return undefined;
  }
}

function remember(key: string, value: string | undefined): void {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch { /* as above. */ }
}

export function useCamera(enabled = true): CameraChoice {
  const devices = useDevices(enabled);
  const [cameraId, setCameraId] = useState<string | undefined>(undefined);
  const [microphoneId, setMicrophoneId] = useState<string | undefined>(undefined);
  const [settled, setSettled] = useState(false);
  const [lost, setLost] = useState<string | null>(null);

  useEffect(() => {
    setCameraId(stored(CAMERA));
    setMicrophoneId(stored(MICROPHONE));
    setSettled(true);
  }, []);

  /*
   * THE FORGETTING. Once the device list is real — and it is empty, then
   * unnamed, then named, as permission arrives — a remembered id that is
   * not in it belongs to something that has been unplugged.
   *
   * GUARDED ON A NON-EMPTY LIST, because `enumerateDevices` answers with
   * nothing before permission is granted, and forgetting the chosen camera
   * every time the page loads would be the same bug as never remembering
   * it. An empty list is "not yet", not "gone".
   */
  useEffect(() => {
    if (!settled || devices.cameras.length === 0) return;
    if (!cameraId) return;
    const found = devices.cameras.find((one) => one.deviceId === cameraId);
    if (found) { setLost(null); return; }
    setLost('the camera you were using');
    setCameraId(undefined);
    remember(CAMERA, undefined);
  }, [cameraId, devices.cameras, settled]);

  useEffect(() => {
    if (!settled || devices.microphones.length === 0) return;
    if (!microphoneId) return;
    if (devices.microphones.some((one) => one.deviceId === microphoneId)) return;
    setMicrophoneId(undefined);
    remember(MICROPHONE, undefined);
  }, [devices.microphones, microphoneId, settled]);

  const chooseCamera = useCallback((id: string | undefined) => {
    setCameraId(id);
    setLost(null);
    remember(CAMERA, id);
  }, []);

  const chooseMicrophone = useCallback((id: string | undefined) => {
    setMicrophoneId(id);
    remember(MICROPHONE, id);
  }, []);

  return {
    devices, cameraId, microphoneId, chooseCamera, chooseMicrophone, settled, lost,
  };
}

/**
 * What the machine is actually using, in words.  [U-19]
 *
 * A STUDIO THAT DOES NOT NAME ITS CAMERA is a studio where the wrong one
 * is on air and nobody can tell. The default is the honest case rather
 * than a missing one — "whichever this machine prefers" is a real answer
 * and pretending otherwise would be worse.
 */
export function cameraName(
  devices: Devices, cameraId: string | undefined,
): string {
  if (!cameraId) {
    return devices.cameras.length > 1
      ? 'This machine’s default camera'
      : devices.cameras[0]?.label ?? 'The camera';
  }
  return devices.cameras.find((one) => one.deviceId === cameraId)?.label
    ?? 'A camera that is no longer connected';
}
