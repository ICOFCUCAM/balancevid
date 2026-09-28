/**
 * Which camera, and which microphone.  [Doctrine CHANNEL §23]
 *
 * The product could always reach any camera the operating system exposes —
 * a laptop's own, a USB webcam, a phone over Continuity Camera or Camo, a
 * professional camera through a UVC capture card. What it could not do was
 * CHOOSE one: six `getUserMedia` call sites and not one `deviceId` between
 * them, so the browser picked its default and there was no way to say
 * otherwise.
 *
 * These are the two lines that decide what is asked for, and the `exact`
 * in them is the part worth a test.
 */

import { describe, expect, it } from 'vitest';

import { cameraConstraints, microphoneConstraints } from '../../app/useDevices.js';

describe('what a camera is asked for', () => {
  /*
   * NOTHING CHOSEN IS NOT THE SAME AS CHOOSING NOTHING. With no device
   * named the browser should use its default — which is right for a laptop
   * with one camera, and is what this did before there was a picker.
   */
  it('names no device when none was chosen', () => {
    const asked = cameraConstraints() as MediaTrackConstraints;
    expect(asked.deviceId).toBeUndefined();
    expect(asked.width).toEqual({ ideal: 1280 });
  });

  /*
   * EXACT, NOT IDEAL, AND THIS IS THE WHOLE POINT. `ideal` means "prefer
   * this, substitute freely" — so a broadcaster who chose the capture card
   * would silently go on air through the laptop's webcam with nothing on
   * screen to say so. Failing is the honest outcome.
   */
  it('demands the exact camera that was chosen', () => {
    const asked = cameraConstraints('cam_capture_card') as MediaTrackConstraints;
    expect(asked.deviceId).toEqual({ exact: 'cam_capture_card' });
  });

  /*
   * The SIZE stays a preference. A camera that only does 1024×576 should
   * be used at 1024×576 rather than refused — the resolution is a wish,
   * the device is not.
   */
  it('keeps the size a preference so an odd camera still opens', () => {
    const asked = cameraConstraints('cam_1', 1920, 1080) as MediaTrackConstraints;
    expect(asked.width).toEqual({ ideal: 1920 });
    expect(asked.height).toEqual({ ideal: 1080 });
    expect(asked.deviceId).toEqual({ exact: 'cam_1' });
  });
});

describe('what a microphone is asked for', () => {
  it('names no device when none was chosen', () => {
    const asked = microphoneConstraints() as MediaTrackConstraints;
    expect(asked.deviceId).toBeUndefined();
  });

  it('demands the exact microphone that was chosen', () => {
    const asked = microphoneConstraints('mic_usb') as MediaTrackConstraints;
    expect(asked.deviceId).toEqual({ exact: 'mic_usb' });
  });

  /*
   * The browser's own cleanup stays on whichever microphone is picked. The
   * Room measures voice activity on top of it (ROOM §2) and its thresholds
   * were set by ear against a cleaned signal.
   */
  it('keeps the browser cleanup the room was tuned against', () => {
    const asked = microphoneConstraints('mic_usb') as MediaTrackConstraints;
    expect(asked.echoCancellation).toBe(true);
    expect(asked.noiseSuppression).toBe(true);
    expect(asked.autoGainControl).toBe(true);
  });
});
