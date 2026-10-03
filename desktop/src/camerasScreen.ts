/**
 * CAMERAS and PREPARE, on one screen.  [TAKE-DESKTOP T-3]
 *
 * ONE SCREEN AND NOT TWO, which is a decision rather than a
 * shortcut. The brief's flow names them separately, and they are
 * separate questions — *which cameras* and *can this machine
 * record them* — but the answer to the second changes every time
 * somebody answers the first. A PREPARE on its own page would be
 * a page the operator walks to, reads a refusal on, walks back
 * from, and walks to again. The checks sit under the grid and
 * move as the grid does.
 *
 * THE GRID IS `readSources`, WHICH IS PURE AND SHARED. Nothing
 * here decides what a tile says; it decides what a tile LOOKS
 * like. [D-19]
 *
 * AND THE PICTURES ARE `<video>` ELEMENTS KEPT ACROSS REDRAWS. A
 * grid rebuilt from scratch on every frame would tear down four
 * video elements sixty times a second, which is a black
 * multiview and a hot laptop. The tiles are made once per source
 * and only their readings are written.
 */

import {
  type SourceFeed, livePictures, readSources,
} from '../../shared/src/sourceGrid.js';
import { prepare, rateSays, sizeSays } from '../../shared/src/prepare.js';
import type { Machine } from './machine.js';
import type { TakeBridge } from './preload.js';
import {
  type Device, type Open, closeOpen, feedOf, listDevices, openDevice,
  settingsOf,
} from './cameras.js';
import { Levels } from './levels.js';
import { type Recording, recordingSays, startCapture } from './record.js';
import { checkAgainstRoom } from './check.js';
import { offsetSamples } from '../../shared/src/capture.js';

/** What is asked of every camera, until somebody asks for otherwise. */
const WANT = { width: 1920, height: 1080, frameRate: 30 };

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function camerasScreen(root: HTMLElement): () => void {
  const bridge = (window as { take?: TakeBridge }).take;
  const levels = new Levels();

  let devices: Device[] = [];
  let chosen: string[] = [];
  const open = new Map<string, Open>();
  let machine: Machine | null = null;
  let frame = 0;
  /* What is being recorded, and how to stop it. [T-4] */
  let running: {
    recording: Recording; stop: () => Promise<Recording>; since: number;
  } | null = null;
  let last: Recording | null = null;

  const picker = el('div', 'picker');
  const grid = el('div', 'grid');
  const checks = el('div', 'checks');
  const tiles = new Map<string, {
    box: HTMLElement; video: HTMLVideoElement;
    says: HTMLElement; badge: HTMLElement; meter: HTMLElement;
  }>();

  /* ---------------------------------------------------------------- *
   *  Choosing.
   * ---------------------------------------------------------------- */

  function drawPicker(): void {
    picker.replaceChildren();
    picker.appendChild(el('p', 'label', 'Cameras on this machine'));
    if (devices.length === 0) {
      picker.appendChild(el('p', 'hint',
        'No cameras found. Plug one in, or allow the camera in your '
        + 'system settings.'));
      return;
    }
    const list = el('div', 'devices');
    for (const device of devices) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = chosen.includes(device.id) ? 'device on' : 'device';
      row.dataset['testid'] = 'device';
      row.dataset['deviceId'] = device.id;
      row.dataset['on'] = chosen.includes(device.id) ? 'true' : 'false';
      row.appendChild(el('span', 'device-name', device.label));
      /* A capture card is told from a webcam by what it calls
         itself, which is a guess and is labelled as one. */
      row.appendChild(el('span', 'device-kind',
        device.kind === 'capture' ? 'capture' : 'camera'));
      row.addEventListener('click', () => { void toggle(device.id); });
      list.appendChild(row);
    }
    picker.appendChild(list);
  }

  async function toggle(id: string): Promise<void> {
    if (chosen.includes(id)) {
      const was = open.get(id);
      if (was) { closeOpen(was); open.delete(id); }
      levels.forget(id);
      tiles.get(id)?.box.remove();
      tiles.delete(id);
      chosen = chosen.filter((one) => one !== id);
      drawPicker();
      await remeasure();
      return;
    }
    chosen = [...chosen, id];
    drawPicker();
    draw();
    const device = devices.find((one) => one.id === id);
    if (!device) return;
    const opened = await openDevice(device, WANT, true);
    open.set(id, opened);
    levels.listen(id, opened.stream);
    /*
     * AND THE DEVICES ARE ASKED AGAIN. A browser hides labels
     * until permission is granted, so the first enumeration on a
     * fresh machine returns devices all called nothing. The real
     * names arrive once a stream has opened.
     */
    devices = await listDevices();
    drawPicker();
    draw();
    await remeasure();
  }

  /* ---------------------------------------------------------------- *
   *  The grid.
   * ---------------------------------------------------------------- */

  function tileFor(id: string): NonNullable<ReturnType<typeof tiles.get>> {
    const had = tiles.get(id);
    if (had) return had;
    const box = el('div', 'tile');
    box.dataset['testid'] = 'tile';
    box.dataset['deviceId'] = id;
    const video = document.createElement('video');
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;
    const says = el('span', 'tile-says');
    says.dataset['testid'] = 'tile-says';
    const badge = el('span', 'tile-badge');
    badge.dataset['testid'] = 'tile-badge';
    const meter = el('span', 'tile-meter-fill');
    const well = el('span', 'tile-meter');
    well.appendChild(meter);
    box.append(video, says, badge, well);
    grid.appendChild(box);
    const made = { box, video, says, badge, meter };
    tiles.set(id, made);
    return made;
  }

  function feeds(): SourceFeed[] {
    return chosen.map((id) => {
      const opened = open.get(id);
      const device = devices.find((one) => one.id === id);
      if (!opened) {
        return {
          id, kind: device?.kind ?? 'camera',
          ...(device?.label ? { label: device.label } : {}),
          opening: true, hasVideo: false, hasAudio: false,
        } satisfies SourceFeed;
      }
      /* Re-read while it is running: a track that renegotiated
         reports a different size, and a stopped one reports
         nothing at all. [PART THREE] */
      if (opened.stream) Object.assign(opened, settingsOf(opened.stream));
      return feedOf(opened, levels.read(id));
    });
  }

  function draw(): void {
    const readings = readSources(feeds());
    grid.dataset['count'] = String(readings.length);
    for (const reading of readings) {
      if (!reading.id) continue;
      const tile = tileFor(reading.id);
      tile.box.dataset['health'] = reading.health;
      tile.box.dataset['slot'] = String(reading.slot);
      const stream = open.get(reading.id)?.stream ?? null;
      if (stream && tile.video.srcObject !== stream) {
        tile.video.srcObject = stream;
      }
      tile.says.textContent = reading.says;
      tile.says.dataset['on'] = reading.says ? 'true' : 'false';
      /* The slot number leads, the way a monitor in the switching
         stage does: a tile is a thing an operator presses by
         number. [SwitchingStage] */
      tile.badge.textContent = [
        `${reading.slot}`, reading.label, reading.format,
      ].filter(Boolean).join(' · ');
      tile.meter.style.height = `${Math.round(reading.energy * 100)}%`;
      tile.meter.dataset['mic'] = reading.mic;
    }
    grid.dataset['live'] = String(livePictures(readings));
    /* The picture looks exactly the same recording or not. */
    grid.dataset['recording'] = running ? 'true' : 'false';
  }

  /* ---------------------------------------------------------------- *
   *  PREPARE.
   * ---------------------------------------------------------------- */

  function drawChecks(): void {
    const readings = readSources(feeds());
    const planned = readings.map((one) => {
      const opened = one.id ? open.get(one.id) : undefined;
      return {
        ...(opened?.width ? { width: opened.width } : {}),
        ...(opened?.height ? { height: opened.height } : {}),
        ...(opened?.frameRate ? { frameRate: opened.frameRate } : {}),
        hasAudio: one.mic !== 'none',
        live: one.eye === 'live',
      };
    });
    const ready = prepare(planned, machine
      ?? { freeBytes: 0, writeBytesPerSecond: 0 });

    checks.replaceChildren();
    checks.dataset['armable'] = String(ready.armable);
    checks.appendChild(el('p', 'label', 'Before recording'));
    for (const check of ready.checks) {
      const row = el('div', 'check');
      row.dataset['testid'] = 'check';
      row.dataset['check'] = check.id;
      row.dataset['ok'] = String(check.ok);
      row.dataset['blocking'] = String(check.blocking);
      /*
       * A MARK, NOT A COLOUR ALONE. A checklist that says pass
       * and fail only in red and green is a checklist a
       * colour-blind operator cannot read, in a room where the
       * next thing that happens is a recording.
       */
      row.appendChild(el('span', 'check-mark',
        check.ok ? '✓' : check.blocking ? '✕' : '!'));
      row.appendChild(el('span', 'check-says', check.says));
      checks.appendChild(row);
    }
    const arm = document.createElement('button');
    arm.type = 'button';
    arm.className = running ? 'go arm recording' : 'go arm';
    arm.dataset['testid'] = 'arm';
    arm.dataset['recording'] = running ? 'true' : 'false';
    /*
     * A RUNNING RECORDING IS ALWAYS STOPPABLE, whatever the
     * checks now say. A disk that filled while recording makes
     * `armable` false, and disabling the stop button at that
     * moment would be the application holding somebody's
     * recording open because it had decided they should not have
     * started it. [U-19]
     */
    arm.disabled = !running && !ready.armable;
    arm.textContent = running
      ? 'Stop' : ready.armable ? 'Record' : 'Not ready';
    arm.title = running
      ? 'Stop, and write what was measured.'
      : ready.armable
        ? 'Start every camera at once, to this machine.'
        : 'Fix what is marked above.';
    arm.addEventListener('click', () => { void press(); });
    checks.appendChild(arm);

    if (running) {
      const clock = el('p', 'running', recordingSays(
        running.recording, (performance.now() - running.since) / 1000));
      clock.dataset['testid'] = 'running';
      checks.appendChild(clock);
    } else if (last) {
      /*
       * AND WHAT THE LAST ONE MEASURED STAYS ON THE SCREEN. An
       * operator who looks away during a take should not have to
       * open a file manager to learn whether the angles agreed.
       */
      const said = el('p', 'done');
      said.dataset['testid'] = 'last-capture';
      said.textContent = `${last.angles.length} angles written · `
        + `${recordingSays(last, 0).split(' · ').slice(1).join(' · ')
          || 'one source'} · ${last.id}`;
      checks.appendChild(said);
    }
    if (machine) {
      checks.appendChild(el('p', 'note',
        `Measured on this machine: ${sizeSays(machine.freeBytes)} free, `
        + `${rateSays(machine.writeBytesPerSecond)} sustained.`));
    }
  }

  /**
   * The one call.  [T-4]
   *
   * EVERY SOURCE THE OPERATOR CHOSE, IN THE ORDER THEY CHOSE
   * THEM, so the files are numbered the way the tiles are. A
   * capture whose `01-` is the second camera is a capture
   * somebody has to decode by watching it.
   */
  async function press(): Promise<void> {
    if (!bridge) return;
    if (running) {
      const was = running;
      running = null;
      drawChecks();
      last = await was.stop();
      /*
       * AND THE ROOM IS ASKED WHETHER THE CLOCK WAS RIGHT.
       * Stored beside the measured offsets, never instead of
       * them: `endCapture` has already written those, and this
       * writes the manifest again with the checks alongside.
       * [T-4]
       */
      const rooms = last.angles
        .map((angle) => {
          const heard = levels.room(angle.sourceId);
          return heard && {
            sourceId: angle.sourceId,
            samples: heard.samples,
            rate: heard.rate,
            measuredSamples: offsetSamples(last!.starts, angle.sourceId),
          };
        })
        .filter((one): one is NonNullable<typeof one> => Boolean(one));
      const agreed = checkAgainstRoom(rooms);
      if (agreed.length > 0) {
        await bridge.endCapture({
          id: last.id, label: last.label, beganAt: last.beganAt,
          endedAt: new Date().toISOString(),
          starts: last.starts,
          angles: last.angles.map((angle) => {
            const start = last!.starts.find((one) => one.id === angle.sourceId);
            return {
              ...angle,
              calledAtMs: start?.calledAtMs ?? 0,
              ...(start?.firstChunkAtMs === undefined
                ? {} : { firstChunkAtMs: start.firstChunkAtMs }),
            };
          }),
          checks: agreed,
        });
      }
      drawChecks();
      return;
    }
    const sources = chosen
      .map((id, index) => ({ open: open.get(id), slot: index + 1 }))
      .filter((one): one is { open: NonNullable<typeof one.open>; slot: number } =>
        Boolean(one.open));
    const began = await startCapture(bridge, sources,
      new Date().toLocaleString());
    if (!began) return;
    /* Keep the room sound from the start, for the check. [T-4] */
    levels.keep(sources.map((one) => one.open.device.id));
    running = { ...began, since: performance.now() };
    drawChecks();
  }

  async function remeasure(): Promise<void> {
    machine = (await bridge?.machine()) ?? null;
    drawChecks();
  }

  /* ---------------------------------------------------------------- *
   *  Running.
   * ---------------------------------------------------------------- */

  function tick(): void {
    draw();
    frame = requestAnimationFrame(tick);
  }

  root.replaceChildren();
  root.appendChild(el('h1', 'mark', 'Take'));
  root.appendChild(el('p', 'sub', 'Choose what to record, and check it.'));
  root.append(picker, grid, checks);

  drawPicker();
  drawChecks();
  frame = requestAnimationFrame(tick);
  /*
   * THE CHECKS ARE REDRAWN ON A SLOW TIMER AND THE GRID ON A
   * FRAME. A disk measurement writes sixty-four megabytes; doing
   * that per frame would be a PREPARE screen that fills the disk
   * it is checking. The grid is cheap and must be smooth; this is
   * not and must not be.
   */
  const slow = setInterval(drawChecks, 2_000);
  /* The clock ticks every second while recording and not at all
     otherwise: a screen that redrew its checks every second when
     nothing was happening would be measuring the disk sixty times
     a minute. */
  const clock = setInterval(() => { if (running) drawChecks(); }, 1_000);

  void (async () => {
    devices = await listDevices();
    drawPicker();
    await remeasure();
  })();

  return () => {
    cancelAnimationFrame(frame);
    clearInterval(slow);
    clearInterval(clock);
    /* A recording left running when the screen goes is a
       recording nobody closed. Stopped, and its manifest
       written. */
    void running?.stop();
    for (const one of open.values()) closeOpen(one);
    open.clear();
    levels.close();
  };
}
