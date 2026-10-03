/**
 * How good the recording is, and which camera makes it.
 *   [CHANNEL §23; quality.ts, useDevices; D-19, U-19]
 *
 * THE FAULT THIS CLOSES. `useMasterRecording` asked for
 *
 *     video: { width: { ideal: 1280 }, height: { ideal: 720 } }
 *
 * written into the hook, with no `deviceId` and no frame rate. Nobody
 * decided that; it was the first thing that worked. And because the
 * render is RESOLUTION-AGNOSTIC — it takes the source's own dimensions
 * rather than compositing onto a fixed canvas — that one line was the
 * ceiling on every master this product has ever made. The author's own
 * performance probes at 1280×720: three takes, every one of them.
 *
 * Online TV has had the preset and the camera picker since §23. This is
 * the same two controls on the path that records the performance, from
 * the same two hooks rather than a second copy of either.
 *
 * AND 2160p IS A RECORDING FORMAT, NOT A TRANSMISSION ONE. It buys
 * reframing — cropping a 720p take to a close-up is visibly soft and
 * cropping a 2160p one is free — and a better archive. It is kept off
 * the live ladder because the broadcast path composites every frame on
 * a JavaScript canvas and re-encodes in real time, where 2160p is not a
 * risk of dropped frames but the expected outcome.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_QUALITY, DEFAULT_RECORDING_QUALITY, LIVE_QUALITY_ORDER, QUALITIES,
  QUALITY_ORDER, forLive, liveCapable, qualityFor, targetBytesPerSecond,
} from '../../src/domain/quality.js';

const ROOT = join(import.meta.dirname, '..', '..');
const code = (file: string) => readFileSync(join(ROOT, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*/gm, '');

const HOOK = code('app/p/[id]/useMasterRecording.ts');
const STUDIO = code('app/p/[id]/PerformanceStudio.tsx');
const TAKE = code('app/take/[link]/TakeApp.tsx');
const CHANNEL = code('app/t/[id]/ChannelStudio.tsx');
const CAMERA = code('app/useCamera.ts');
const USE_QUALITY = code('app/useQuality.ts');

describe('the ladder', () => {
  it('runs worst to best, and 2160p is the top of it', () => {
    const pixels = QUALITY_ORDER.map(
      (id) => QUALITIES[id].width * QUALITIES[id].height * QUALITIES[id].fps);
    for (let i = 1; i < pixels.length; i += 1) {
      expect(pixels[i]!).toBeGreaterThan(pixels[i - 1]!);
    }
    expect(QUALITIES.ultra.width).toBe(3840);
    expect(QUALITIES.ultra.height).toBe(2160);
  });

  /*
   * THIRTY, NOT SIXTY. 2160p60 through a browser encoder is a
   * different proposition, and the house rate is 30 — a recording
   * format that cannot be delivered is a setting that spends the
   * machine for nothing.
   */
  it('records 2160p at the house rate', () => {
    expect(QUALITIES.ultra.fps).toBe(30);
  });

  /*
   * THE BITRATE FOLLOWS COMPRESSION, NOT PIXEL COUNT, which is the
   * ratio the rest of the table already uses: four times the pixels
   * of 1080p wants roughly three times the bits, not four.
   */
  it('asks for about three times 1080p, not four', () => {
    const ratio = QUALITIES.ultra.videoBitsPerSecond
      / QUALITIES.high.videoBitsPerSecond;
    expect(ratio).toBeGreaterThan(2.5);
    expect(ratio).toBeLessThan(3.6);
  });
});

describe('2160p never reaches the air', () => {
  /*
   * THE LOAD-BEARING HALF. The broadcast path composites every frame
   * onto a canvas IN JAVASCRIPT and the playout engine re-encodes in
   * real time. `maximum` already warns that a machine which cannot
   * keep up drops frames silently and looks like a bad connection; at
   * 2160p that is the expected outcome on most machines — a setting
   * that appears to work and makes the picture WORSE, which is what
   * the head of `quality.ts` says a quality control must never be.
   */
  it('is not on the live ladder', () => {
    expect(liveCapable('ultra')).toBe(false);
    expect(LIVE_QUALITY_ORDER).not.toContain('ultra');
    for (const id of LIVE_QUALITY_ORDER) expect(liveCapable(id)).toBe(true);
  });

  /* Everything that was live-capable before still is: this adds, it
     does not re-tune anybody's broadcast. */
  it('leaves the live ladder exactly as it was', () => {
    expect(LIVE_QUALITY_ORDER).toEqual(['low', 'standard', 'high', 'maximum']);
    expect(DEFAULT_QUALITY).toBe('standard');
    expect(QUALITIES.standard.width).toBe(1280);
    expect(QUALITIES.standard.videoBitsPerSecond).toBe(2_500_000);
  });

  /*
   * AND A STORED `ultra` IS CLAMPED RATHER THAN REFUSED. The operator
   * asked for the best picture, not for an error; going live at
   * `maximum` is the honest reading of that.
   */
  it('falls back to maximum rather than refusing', () => {
    expect(forLive(QUALITIES.ultra).id).toBe('maximum');
    for (const id of LIVE_QUALITY_ORDER) {
      expect(forLive(QUALITIES[id]).id).toBe(id);
    }
  });

  /* Clamped where it is READ, which is the place that cannot be
     bypassed by a hand-edited preference or a shared machine. */
  it('is clamped in the hook, not only at the menu', () => {
    expect(USE_QUALITY).toMatch(/scope === 'live' && !liveCapable\(id\)/);
  });

  /* The live studio is untouched by any of this. */
  it('leaves Online TV asking for the live scope', () => {
    expect(CHANNEL).toMatch(/useQuality\(\)/);
    expect(CHANNEL).not.toMatch(/useQuality\('recording'\)/);
    expect(CHANNEL).not.toMatch(/\bultra\b/);
  });
});

describe('two presets, because they are two questions', () => {
  /*
   * A studio on a poor line records at 2160p and broadcasts at 720p,
   * and both are correct at once. One shared preset would force the
   * operator to choose which of the two to get wrong.
   */
  it('remembers them under different keys', () => {
    expect(USE_QUALITY).toMatch(/live: 'balancevid\.quality'/);
    expect(USE_QUALITY).toMatch(/recording: 'balancevid\.recording-quality'/);
  });

  /* The live key is unchanged, so no stored broadcast setting moves. */
  it('keeps the live key it already had', () => {
    expect(USE_QUALITY).toContain("'balancevid.quality'");
  });

  /*
   * AND THE RECORDING DEFAULT IS 1080p, WHICH IS A STATED CHANGE.
   * The recorder hard-coded 720p and consulted no preset, so this
   * raises what is ASKED FOR. The constraint is `ideal`, so a camera
   * that only does 720p still gives 720p rather than refusing.
   */
  it('records at 1080p by default, and says so', () => {
    expect(DEFAULT_RECORDING_QUALITY).toBe('high');
    expect(QUALITIES[DEFAULT_RECORDING_QUALITY].height).toBe(1080);
    expect(qualityFor(DEFAULT_RECORDING_QUALITY).id).toBe('high');
  });

  it('offers 2160p to the recorder and not to the broadcast', () => {
    expect(USE_QUALITY).toMatch(
      /offered: scope === 'live' \? LIVE_QUALITY_ORDER : QUALITY_ORDER/);
  });
});

describe('the recorder stops hard-coding the picture', () => {
  /*
   * THE LINE THAT MADE EVERY MASTER 720p. Named here so it cannot
   * come back: a literal 1280×720 in this hook, reached by default
   * rather than by choice.
   */
  it('takes the constraints from its caller', () => {
    expect(HOOK).toMatch(/video\?: MediaStreamConstraints\['video'\]/);
    expect(HOOK).toMatch(/video \?\? \{ width: \{ ideal: 1280 \}/);
  });

  /*
   * AND RE-OPENS THE CAMERA WHEN THEY CHANGE. A preset chosen and
   * then ignored until the page reloads is the class of control this
   * file exists to prevent. [U-19]
   */
  it('re-arms when the choice changes', () => {
    expect(HOOK).toMatch(/\}, \[audioOnly, masterUrl, sampleRate, video\]\)/);
  });

  /* Both recording surfaces compose it the same way, from the same
     two hooks — not a second copy of either. [D-19] */
  it.each([
    ['Studio Two', 'app/p/[id]/PerformanceStudio.tsx'],
    ['the Take App', 'app/take/[link]/TakeApp.tsx'],
  ])('%s asks for the chosen camera at the chosen size', (_name, file) => {
    const source = code(file);
    expect(source).toMatch(/useQuality\('recording'\)/);
    expect(source).toMatch(/useCamera\(/);
    expect(source).toMatch(/cameraConstraints\(\s*\n?\s*camera\.cameraId/);
    expect(source).toMatch(/grade\.quality\.fps/);
  });

  /*
   * A sound-only recording has no camera to choose. [T12, B6i]
   *
   * `!soundOnly` AND NOT THE WHOLE EXPRESSION. This read
   * `useCamera(!soundOnly)` exactly, and V-3 added a second reason
   * not to open a camera — a call whose terms have not been agreed
   * to yet — which broke a test that was right about the product
   * and wrong about the line. What matters is that the flag is
   * driven BY `soundOnly`, not that `soundOnly` is the only thing
   * in it; the alternative is a test that has to be edited every
   * time another honest reason to leave the camera shut is found.
   * [T-1]
   */
  it('asks for no camera where there is no picture', () => {
    expect(TAKE).toMatch(/video: soundOnly \? undefined : cameraConstraints\(/);
    expect(TAKE).toMatch(/useCamera\(!soundOnly\b/);
  });
});

describe('the camera is remembered', () => {
  /*
   * THE PICKER EXISTED AND THE CHOICE DID NOT SURVIVE THE PAGE. The
   * only things this product remembered about a machine were the
   * quality preset and the ground.
   */
  it('is stored per machine, like the quality is', () => {
    expect(CAMERA).toMatch(/'balancevid\.camera'/);
    expect(CAMERA).toMatch(/'balancevid\.microphone'/);
    expect(CAMERA).toMatch(/window\.localStorage\.setItem/);
  });

  /*
   * AND NOT READ DURING RENDER. The server renders these pages and
   * has no localStorage; a first render that used the stored value
   * on the client and nothing on the server is React #418, which
   * this product has already paid for once.
   */
  it('reads the stored value after the first paint', () => {
    expect(CAMERA).toMatch(/useEffect\(\(\) => \{\s*\n\s*setCameraId\(stored\(CAMERA\)\)/);
  });

  /*
   * THE FALLBACK IS THE POINT. `cameraConstraints` asks for
   * `deviceId: { exact: … }` deliberately, so a chosen camera is
   * never silently substituted — which means a REMEMBERED camera
   * that has been unplugged makes `getUserMedia` throw. Remembering
   * without forgetting turns "I used the capture card yesterday"
   * into "the studio will not open today".
   */
  it('forgets a camera that is no longer there', () => {
    expect(CAMERA).toMatch(/const found = devices\.cameras\.find/);
    expect(CAMERA).toMatch(/setCameraId\(undefined\)/);
    expect(CAMERA).toMatch(/remember\(CAMERA, undefined\)/);
  });

  /*
   * AND ONLY ONCE THE LIST IS REAL. `enumerateDevices` answers with
   * nothing before permission is granted, so forgetting on an empty
   * list would be the same bug as never remembering. Empty is "not
   * yet", not "gone".
   */
  it('does not forget it before the list has arrived', () => {
    expect(CAMERA).toMatch(/devices\.cameras\.length === 0\) return/);
  });

  /*
   * AND IT SAYS SO. Falling back silently is how somebody records a
   * whole session on the laptop webcam without noticing the capture
   * card never came back. [U-19]
   */
  it('says when it has fallen back', () => {
    expect(CAMERA).toMatch(/setLost\(/);
    expect(STUDIO).toMatch(/record-camera-lost/);
    expect(TAKE).toMatch(/take-camera-lost/);
  });
});

describe('what the controls say', () => {
  /*
   * A PRESET THAT DOES NOT SAY WHAT IT COSTS is a preset chosen by
   * its name. A performer picking 2160p on mobile data deserves to
   * know before they sing for four minutes.
   */
  it('shows the cost of the chosen preset', () => {
    for (const id of QUALITY_ORDER) {
      expect(QUALITIES[id].needs.length).toBeGreaterThan(20);
      expect(QUALITIES[id].records.length).toBeGreaterThan(20);
    }
  });

  /*
   * AND IN THE RIGHT UNITS, which a browser run caught. `needs` is
   * the LIVE menu's sentence and talks about the uplink — "about
   * 770 kB/s up" — and it was showing under the record button in
   * Studio Two, where nothing is uploaded and the cost is disk. A
   * sentence about bandwidth on a control that spends none is the
   * same fault as a menu that says "7 more" when there are
   * eighteen.
   */
  it('describes a recording as a recording, not as a broadcast', () => {
    expect(STUDIO).toMatch(/grade\.quality\.records/);
    expect(TAKE).toMatch(/grade\.quality\.records/);
    expect(STUDIO).not.toMatch(/grade\.quality\.needs/);
    expect(TAKE).not.toMatch(/grade\.quality\.needs/);
    for (const id of QUALITY_ORDER) {
      /* Megabytes, and never the uplink. */
      expect(QUALITIES[id].records).toMatch(/MB a minute/);
      expect(QUALITIES[id].records).not.toMatch(/ up\b|kB\/s/);
      /* And the live sentence still is the live sentence. */
      expect(QUALITIES[id].needs).not.toMatch(/MB a minute/);
    }
  });

  /* And 2160p says what it is for, and that the master is still 1080p. */
  it('says 2160p is for recording, not for delivery', () => {
    expect(QUALITIES.ultra.needs).toMatch(/[Rr]ecording only/);
    expect(QUALITIES.ultra.needs).toMatch(/1080p/);
  });

  /*
   * GONE ONCE RECORDING STARTS, rather than present and refusing:
   * changing the camera mid-take would reopen the stream.
   */
  it('offers them only while they can still be acted on', () => {
    expect(STUDIO).toMatch(/\{recording\.phase === 'idle' && \(\s*\n\s*<div data-testid="record-setup"/);
    expect(TAKE).toMatch(/recording\.phase === 'idle' \|\| recording\.phase === 'ready'/);
  });

  /*
   * AND THE CAMERA MENU WAITS FOR REAL LABELS, because
   * `enumerateDevices` answers with unnamed entries until permission
   * is granted and a menu of "Camera 1, Camera 2" helps nobody.
   */
  it('waits for real labels before offering a camera menu', () => {
    expect(STUDIO).toMatch(/camera\.devices\.named && camera\.devices\.cameras\.length > 1/);
    expect(TAKE).toMatch(/camera\.devices\.named && camera\.devices\.cameras\.length > 1/);
  });
});

describe('the meter still reads against the preset', () => {
  /* The feed meter's target has to move with the ladder, or the
     verdict it prints is about a number nobody is spending. */
  it('targets the new preset too', () => {
    expect(targetBytesPerSecond(QUALITIES.ultra))
      .toBe(Math.round((20_000_000 + 192_000) / 8));
  });
});
