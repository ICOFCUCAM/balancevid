'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Which camera, and which microphone.  [Doctrine CHANNEL §23, ROOM §2, D-19]
 *
 * THE PRODUCT COULD ALREADY REACH EVERY CAMERA AND COULD NOT CHOOSE ONE.
 * Six places call `getUserMedia` and not one of them passed a `deviceId`,
 * so the browser silently picked its default — which on a machine with a
 * built-in webcam, a capture card and a phone plugged in is whichever the
 * operating system happened to nominate, with no way to say otherwise.
 *
 * What `getUserMedia` reaches is not a short list. Anything the operating
 * system presents as a camera is a camera to a browser:
 *
 *   the laptop's own webcam
 *   a USB webcam
 *   A PHONE, through Continuity Camera, Camo, EpocCam or Android's own
 *     USB webcam mode — the phone becomes a system camera and needs
 *     nothing from this product
 *   A PROFESSIONAL CAMERA, through a UVC capture card (Cam Link,
 *     Blackmagic) or a camera with USB-UVC output — likewise
 *
 * So the gap was never the hardware. It was the absence of a picker.
 *
 * LABELS ARE BLANK UNTIL PERMISSION IS GRANTED, and this is the detail that
 * makes a naive device picker useless: `enumerateDevices` will happily
 * return four cameras called "" before the person has allowed access, so a
 * menu built at page load is a menu of empty strings. The list is therefore
 * re-read after a stream opens, and `named` says whether the labels can be
 * trusted yet.
 *
 * AND IT WATCHES FOR CHANGES. `devicechange` fires when something is
 * plugged in or pulled out. A broadcaster who connects a camera mid-show
 * should find it in the menu without reloading the page, and one whose
 * capture card fell out should see it leave.
 */

export interface Device {
  deviceId: string;
  label: string;
}

export interface Devices {
  cameras: Device[];
  microphones: Device[];
  /** Whether the labels are real. False before permission has been granted. */
  named: boolean;
  /** Re-read the list. Call it after a stream opens, when labels arrive. */
  refresh: () => Promise<void>;
}

export function useDevices(enabled = true): Devices {
  const [cameras, setCameras] = useState<Device[]>([]);
  const [microphones, setMicrophones] = useState<Device[]>([]);
  const [named, setNamed] = useState(false);

  const refresh = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const pick = (kind: MediaDeviceKind) => all
        .filter((device) => device.kind === kind && device.deviceId)
        .map((device, index) => ({
          deviceId: device.deviceId,
          /*
           * A device with no label still needs to be distinguishable from
           * the other three with no label, or the menu is four identical
           * rows. Numbered until the browser tells us what they are.
           */
          label: device.label
            || `${kind === 'videoinput' ? 'Camera' : 'Microphone'} ${index + 1}`,
        }));
      const video = pick('videoinput');
      setCameras(video);
      setMicrophones(pick('audioinput'));
      setNamed(video.some((device) => device.label && !/^Camera \d+$/.test(device.label)));
    } catch { /* no permission, or no media stack. The menu stays empty. */ }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const media = navigator.mediaDevices;
    if (!media?.addEventListener) return;
    const onChange = () => { void refresh(); };
    media.addEventListener('devicechange', onChange);
    return () => media.removeEventListener('devicechange', onChange);
  }, [enabled, refresh]);

  return { cameras, microphones, named, refresh };
}

/**
 * What to ask `getUserMedia` for.
 *
 * `exact` rather than `ideal` on the device, deliberately: a broadcaster who
 * chose the capture card and silently got the laptop's webcam instead would
 * be on air with the wrong picture and no indication of it. Failing is the
 * honest outcome, and the caller says which camera could not be opened.
 *
 * The SIZE AND FRAME RATE stay `ideal`, because those are preferences — a
 * camera that only does 1024×576 should be used at 1024×576 rather than
 * refused, and a webcam asked for 60 fps should give its 30 rather than
 * nothing. The quality preset raises what is ASKED FOR; what arrives is
 * whatever the camera has. [quality.ts]
 */
export function cameraConstraints(
  deviceId?: string, width = 1280, height = 720, fps = 30,
): MediaStreamConstraints['video'] {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: fps },
  };
}

export function microphoneConstraints(
  deviceId?: string,
): MediaStreamConstraints['audio'] {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
}
