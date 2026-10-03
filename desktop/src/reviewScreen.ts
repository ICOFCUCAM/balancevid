/**
 * REVIEW and SUBMIT, on one screen.  [TAKE-DESKTOP T-5]
 *
 * > *"Review each angle and all of them; no editing. Submit
 * > sends the set under one capture, resumable per source, over
 * > the existing Take protocol."*
 *
 * ONE SCREEN AND TWO STEPS, for the reason CAMERAS and PREPARE
 * are one: what you are about to send is the thing you are
 * looking at, and a SUBMIT page of its own would be a page you
 * walk to having left the pictures behind. The frozen flow
 * names them separately because they are separate questions;
 * they are not separate places.
 *
 * NO EDITING, AND THE BRIEF IS EXPLICIT ABOUT IT. There is no
 * trim, no take-the-best-bit, no reorder. *"No editor in Take.
 * Studio Two produces."* What this screen offers is watching
 * what was recorded and deciding whether to send it, which is
 * the whole of what a capture station's operator decides.
 *
 * EACH ANGLE AND ALL OF THEM. The grid plays every angle
 * together, because the question *did the four of them get it*
 * is not answerable one at a time; pressing one tile makes it
 * the only one, because the question *is camera three in focus*
 * is not answerable in a quarter of the window. Two views of
 * one capture, which is what the multiview in Studio Two is
 * for and the reason this is not a third one: Studio Two cuts,
 * this one checks.
 *
 * THE VIDEOS COME FROM A SCHEME THE MAIN PROCESS ANSWERS. The
 * window has no filesystem and is not getting one, and a
 * gigabyte of video read into a `Blob` to watch ten seconds of
 * it would be a capture station that cannot review a long
 * take. [main.ts, `take-capture:`]
 */

import type { Capture } from '../../shared/src/capture.js';
import { spreadSays as spreadFromStarts } from '../../shared/src/capture.js';
import type { SendingSeen, TakeBridge } from './preload.js';
import { NOTHING_SENT, progressOf, sendingSays } from './submit.js';

/** How often a running send is asked how far it got. */
export const POLL_MS = 700;

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * Where one angle's media is.
 *
 * BOTH IN THE PATH, AND THE HOST IS A CONSTANT.
 *
 * The id went in the host first, which reads better and does
 * not work: a URL host is CASE-FOLDED, and a capture id is
 * `cap_20261003T120928_p67y` — ISO 8601's own uppercase `T` in
 * a string that is otherwise lowercase. Every angle came back
 * 404, the grid drew four black rectangles, and nothing in
 * either file looked wrong. Found by playing it. A path
 * component is not folded. [T-5]
 */
export function angleSrc(captureId: string, file: string): string {
  return `take-capture://capture/${encodeURIComponent(captureId)}`
    + `/${encodeURIComponent(file)}`;
}

/** What a capture is called, for a person reading a list. */
export function captureSays(capture: Capture): string {
  const when = new Date(capture.beganAt);
  const clock = Number.isNaN(when.getTime())
    ? capture.beganAt : when.toLocaleString();
  const angles = capture.angles.length === 1
    ? '1 angle' : `${capture.angles.length} angles`;
  return `${clock} · ${angles}`;
}

export function reviewScreen(root: HTMLElement): () => void {
  const bridge = (window as { take?: TakeBridge }).take;

  let captures: Capture[] = [];
  let chosen: Capture | null = null;
  let state: SendingSeen | null = null;
  let only: string | null = null;
  let poll = 0;

  const list = el('div', 'captures');
  const detail = el('div', 'review');
  const players = new Map<string, HTMLVideoElement>();

  /* ---------------------------------------------------------------- *
   *  The list of what is on this machine.
   * ---------------------------------------------------------------- */

  function drawList(): void {
    list.replaceChildren();
    if (captures.length === 0) {
      list.appendChild(el('p', 'quiet',
        'Nothing recorded on this machine yet. RECORD makes one.'));
      return;
    }
    for (const capture of captures) {
      const row = el('button', 'capture-row');
      (row as HTMLButtonElement).type = 'button';
      row.dataset['testid'] = 'capture-row';
      row.dataset['capture'] = capture.id;
      row.dataset['chosen'] = chosen?.id === capture.id ? 'true' : 'false';
      row.append(
        el('span', 'capture-when', captureSays(capture)),
        el('span', 'capture-label', capture.label || 'Capture'),
      );
      row.addEventListener('click', () => { void choose(capture); });
      list.appendChild(row);
    }
  }

  /* ---------------------------------------------------------------- *
   *  One capture, watched and sent.
   * ---------------------------------------------------------------- */

  async function choose(capture: Capture): Promise<void> {
    stopPlayers();
    chosen = capture;
    only = null;
    state = (await bridge?.sending(capture.id)) ?? null;
    drawList();
    drawDetail();
  }

  function stopPlayers(): void {
    for (const video of players.values()) {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
    players.clear();
  }

  function drawDetail(): void {
    stopPlayers();
    detail.replaceChildren();
    if (!chosen) {
      detail.appendChild(el('p', 'quiet',
        'Choose a capture to watch it and send it.'));
      return;
    }
    const capture = chosen;
    const sending = state ?? { ...NOTHING_SENT, to: null, running: false };

    detail.appendChild(el('h2', 'review-title', capture.label || 'Capture'));
    /*
     * THE SPREAD IS SHOWN HERE TOO, and this is the moment it
     * matters most: it is the last point before the work leaves
     * the machine at which somebody can see that these four
     * videos are, or are not, one capture. [T-4]
     */
    const says = [
      captureSays(capture),
      spreadFromStarts(capture.angles.map((one) => ({
        id: one.sourceId,
        calledAtMs: one.calledAtMs,
        ...(one.firstChunkAtMs === undefined
          ? {} : { firstChunkAtMs: one.firstChunkAtMs }),
      }))),
    ].filter(Boolean).join(' · ');
    const line = el('p', 'quiet', says);
    line.dataset['testid'] = 'review-says';
    detail.appendChild(line);

    /* ---- the pictures ---- */
    const grid = el('div', 'review-grid');
    grid.dataset['only'] = only ?? '';
    for (const angle of capture.angles) {
      if (only && angle.file !== only) continue;
      const tile = el('div', 'review-tile');
      tile.dataset['testid'] = 'review-tile';
      tile.dataset['file'] = angle.file;
      const video = document.createElement('video');
      video.dataset['testid'] = 'review-video';
      video.controls = Boolean(only);
      video.muted = !only;
      video.preload = 'metadata';
      video.src = angleSrc(capture.id, angle.file);
      players.set(angle.file, video);
      const name = el('span', 'review-name', angle.label || angle.file);
      /*
       * PRESSING A TILE MAKES IT THE ONLY ONE, and pressing it
       * again puts the others back. A capture station operator
       * checking focus on camera three should not have to
       * explain to the application what they want twice.
       */
      tile.addEventListener('click', () => {
        only = only === angle.file ? null : angle.file;
        drawDetail();
      });
      tile.append(video, name);
      grid.appendChild(tile);
    }
    detail.appendChild(grid);

    const row = el('div', 'review-controls');
    const playAll = el('button', 'ctl');
    (playAll as HTMLButtonElement).type = 'button';
    playAll.dataset['testid'] = 'review-play';
    playAll.textContent = only ? 'Play' : 'Play all';
    playAll.addEventListener('click', () => {
      /*
       * EVERY ANGLE FROM THE SAME PLACE. They are not frame-locked
       * and are not pretending to be — this is a check, not a
       * timeline, and the thing that aligns them is `offsetSamples`
       * on the installation that accepts them. Starting them
       * together from zero is what makes four cameras of one room
       * recognisably one room. [no editor in Take]
       */
      for (const video of players.values()) {
        video.currentTime = 0;
        void video.play().catch(() => undefined);
      }
    });
    row.appendChild(playAll);
    detail.appendChild(row);

    /* ---- sending it ---- */
    const where = el('p', 'review-to');
    where.dataset['testid'] = 'review-to';
    where.textContent = sendingSays(capture, sending, sending.to);
    detail.appendChild(where);

    if (sending.trouble) {
      const bad = el('p', 'bad', sending.trouble);
      bad.dataset['testid'] = 'review-trouble';
      detail.appendChild(bad);
    }

    const seen = progressOf(capture, sending);
    if (seen.bytes > 0 && !sending.sentAt) {
      const bar = el('div', 'bar');
      bar.dataset['testid'] = 'review-bar';
      const fill = el('div', 'bar-fill');
      fill.style.width = `${Math.round((seen.bytes / Math.max(1, seen.total)) * 100)}%`;
      bar.appendChild(fill);
      detail.appendChild(bar);
    }

    const acts = el('div', 'review-controls');
    if (!sending.sentAt) {
      const send = el('button', 'go');
      (send as HTMLButtonElement).type = 'button';
      send.dataset['testid'] = 'review-send';
      (send as HTMLButtonElement).disabled = !sending.to || sending.running;
      send.textContent = sending.running ? 'Sending…'
        : seen.bytes > 0 ? 'Keep sending' : 'Send to the studio';
      send.addEventListener('click', () => { void start(capture); });
      acts.appendChild(send);
      if (sending.running) {
        const halt = el('button', 'ctl');
        (halt as HTMLButtonElement).type = 'button';
        halt.dataset['testid'] = 'review-stop';
        halt.textContent = 'Stop';
        halt.addEventListener('click', () => { void bridge?.stopSend(capture.id); });
        acts.appendChild(halt);
      }
    }
    /*
     * THROWN AWAY WHOLE, and only ever by being asked. A capture
     * that has been sent is still the operator's copy — the
     * installation has one now, and this machine's disk is the
     * thing PREPARE spent a stage worrying about. [T-3]
     */
    const bin = el('button', 'ctl');
    (bin as HTMLButtonElement).type = 'button';
    bin.dataset['testid'] = 'review-forget';
    bin.textContent = 'Delete from this machine';
    bin.addEventListener('click', () => { void forget(capture); });
    acts.appendChild(bin);
    detail.appendChild(acts);
  }

  async function start(capture: Capture): Promise<void> {
    if (!bridge) return;
    /* Shown as running at once, so the button cannot be pressed
       twice while the first answer is in flight. */
    state = { ...(state ?? { ...NOTHING_SENT, to: null, running: false }),
      running: true };
    drawDetail();
    watch(capture);
    const answer = await bridge.send(capture.id);
    window.clearInterval(poll);
    poll = 0;
    state = (await bridge.sending(capture.id)) ?? state;
    if (answer) captures = await bridge.captures();
    drawList();
    drawDetail();
  }

  /**
   * Ask how far it got while it runs.
   *
   * POLLED AND NOT PUSHED, which keeps the one-way door the
   * preload was built around: the main process answers
   * questions and never calls into the window. A send is
   * measured in minutes and a person watching wants to see it
   * move; under a second is often enough for that and cheap
   * enough to be nothing. [T-1]
   */
  function watch(capture: Capture): void {
    window.clearInterval(poll);
    poll = window.setInterval(() => {
      void (async () => {
        const now = await bridge?.sending(capture.id);
        if (!now || chosen?.id !== capture.id) return;
        state = now;
        drawDetail();
        if (!now.running) { window.clearInterval(poll); poll = 0; }
      })();
    }, POLL_MS);
  }

  async function forget(capture: Capture): Promise<void> {
    await bridge?.forgetCapture(capture.id);
    stopPlayers();
    chosen = null;
    state = null;
    captures = (await bridge?.captures()) ?? [];
    drawList();
    drawDetail();
  }

  /* ---------------------------------------------------------------- *
   *  Opening it.
   * ---------------------------------------------------------------- */

  root.replaceChildren();
  root.appendChild(el('h1', 'mark', 'Review'));
  root.appendChild(el('p', 'sub',
    'Watch what was recorded, then send it as one capture.'));
  const columns = el('div', 'review-columns');
  columns.append(list, detail);
  root.appendChild(columns);
  drawList();
  drawDetail();

  void (async () => {
    captures = (await bridge?.captures()) ?? [];
    drawList();
    if (captures[0]) await choose(captures[0]);
  })();

  return () => {
    window.clearInterval(poll);
    poll = 0;
    stopPlayers();
  };
}
