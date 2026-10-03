/**
 * Take Software for desktop — the shell.  [TAKE-DESKTOP T-1]
 *
 * > *"Phone Take = personal participation. Desktop Take =
 * > multi-camera capture station."*
 *
 * WHAT T-1 SHIPS, AND NOTHING MORE: an application that installs,
 * opens a window, and says it is not connected to anything.
 * That is the document's own description of a complete and
 * honest first release, and the honesty is the point — a shell
 * that pretended to have a camera in it would be a worse first
 * release than one that admits what it is.
 *
 * ELECTRON, AND THE REASON IS THE RECORDING. This application's
 * whole job is four cameras starting together, and
 * `useMasterRecording` already does that against Chromium's
 * `MediaRecorder` in four clients. Electron ships ONE Chromium
 * on every platform it builds for. A webview shell — Tauri and
 * everything like it — uses the operating system's own engine:
 * WebKitGTK on Linux, WebView2 on Windows. That means a
 * different `MediaRecorder`, different codec support and
 * different device enumeration per platform, and the single
 * claim this product makes about a capture is that its angles
 * agree about when they started. A capture station whose
 * measurement depends on which operating system it is on is not
 * one. [T-4]
 *
 * The cost is stated rather than hidden: a Chromium per install,
 * which is a large download for a program that will spend its
 * life writing video files. It buys one measurement on every
 * platform, and T-4 is the stage that cashes it.
 *
 * NO NETWORK IN THE SHELL, which is not a placeholder. The
 * brief: *"The recording does not need to depend on the
 * internet."* Everything through T-4 is this application
 * recording to its own disk, and the first line of code that
 * opens a socket belongs to T-2.
 */

import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

import { asOrigin } from '../../shared/src/connections.js';
import { askInstance } from './ask.js';
import { measure } from './machine.js';
import {
  beginCapture, captureDir, endCapture, listCaptures, oneCapture,
  readSendingOf, removeCapture, writeChunk, writeSendingOf,
} from './recordings.js';
import { isSending, sendCapture, stopSending } from './sending.js';
import { callSeen, readCall, readStored, writeCall, writeStored } from './store.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The questions the window may ask.  [T-2, T-4, T-5]
 *
 * REGISTERED ONCE, BEFORE ANY WINDOW OPENS, because a handler
 * registered per window is a handler registered twice the second
 * time somebody opens one.
 *
 * EVERY ARGUMENT IS TREATED AS UNTRUSTED even though the only
 * caller is a page this application shipped. That is not
 * ceremony: the renderer is where a camera's bytes and a
 * studio's URL will meet, and the day something in it is
 * confused the main process must not be.
 */
function listen(): void {
  ipcMain.handle('take:connections', () => readStored());
  ipcMain.handle('take:remember', (_event, list: unknown) => writeStored(list));
  ipcMain.handle('take:ask', (_event, typed: unknown) =>
    (typeof typed === 'string' ? askInstance(typed) : null));
  /*
   * A LINK OPENS IN THE PERSON'S OWN BROWSER, and only if it is
   * somewhere this application would have gone anyway.
   * `shell.openExternal` hands a string to the operating system,
   * which will happily open `file:///` or a registered
   * application's own scheme — so the string goes through
   * `asOrigin` first, which answers only for http and https.
   */
  /*
   * WHAT THE RECORDING DISK CAN DO, MEASURED BY WRITING TO IT.
   * The window cannot: `statfs` is Node's, and timing a real
   * write needs a real file. `userData` for now, because T-3 has
   * no recording directory yet — T-4 is the stage that lets the
   * operator choose one, and this measures whatever that turns
   * out to be. [T-3, T-4]
   */
  ipcMain.handle('take:machine', () => measure(app.getPath('userData')));
  /*
   * RECORDING, WHICH IS THE ONLY THING THE WINDOW CANNOT DO FOR
   * ITSELF. `MediaRecorder` lives in the renderer and the disk
   * lives out here, so the bytes cross once, as a typed array,
   * and are appended to a file whose name the main process
   * checks. [T-4]
   *
   * EVERY ARGUMENT IS A STRING FROM A WEB PAGE until it has been
   * checked. `captureDir` refuses an id that is not one, which
   * is what stops `../../` being a path.
   */
  ipcMain.handle('take:begin-capture', async (
    _event, id: unknown, label: unknown, beganAt: unknown,
  ) => {
    if (typeof id !== 'string' || typeof label !== 'string'
      || typeof beganAt !== 'string') return null;
    const dir = await beginCapture(id, label.slice(0, 120), beganAt)
      .catch(() => null);
    /*
     * WHERE IT IS GOING IS WRITTEN WHEN IT BEGINS.  [T-5]
     *
     * Not when somebody presses SEND, which is the obvious place
     * and the wrong one: an operator who records four calls on
     * Monday and re-points the station on Tuesday would send
     * Monday's work to Tuesday's studio. A capture was recorded
     * FOR something, and the moment it knows that is the moment
     * it starts.
     *
     * THE WINDOW IS NOT ASKED FOR IT. The renderer declares a
     * capture by id; the credential is read out here, from the
     * call this station is pointed at, and the page never holds
     * it. [D-21]
     */
    if (dir) {
      const call = await readCall();
      if (call) await writeSendingOf(id, { done: {}, to: call });
    }
    return dir;
  });
  ipcMain.handle('take:write-chunk', async (
    _event, id: unknown, file: unknown, bytes: unknown,
  ) => {
    if (typeof id !== 'string' || typeof file !== 'string') return 0;
    if (!(bytes instanceof Uint8Array)) return 0;
    return writeChunk(id, file, bytes).catch(() => 0);
  });
  ipcMain.handle('take:end-capture', async (_event, spec: unknown) => {
    if (!spec || typeof spec !== 'object') return null;
    return endCapture(spec as Parameters<typeof endCapture>[0])
      .catch(() => null);
  });
  ipcMain.handle('take:captures', () => listCaptures().catch(() => []));
  ipcMain.handle('take:forget-capture', async (_event, id: unknown) => {
    if (typeof id !== 'string') return false;
    stopSending(id);
    return removeCapture(id).then(() => true).catch(() => false);
  });

  /*
   * THE CALL, AND THE HALF OF IT THE WINDOW MAY SEE.  [T-5, D-21]
   *
   * `take:call` answers the name and the origin, so a person can
   * read where their work is going. It does not answer the link,
   * because the link is a credential and the renderer is a web
   * page with four cameras pointed at a room. The window sets
   * one by handing over what somebody typed; it never gets one
   * back.
   */
  ipcMain.handle('take:call', async () => callSeen(await readCall()));
  ipcMain.handle('take:choose-call', async (_event, said: unknown) =>
    callSeen(await writeCall(said)));

  /*
   * SENDING, WHICH THE WINDOW ASKS FOR AND DOES NOT DO. [T-5]
   *
   * `take:send` runs until the capture is sent, refused, or the
   * connection goes, and answers what happened. `take:sending`
   * is what a screen polls while it runs — polled rather than
   * pushed, because the one-way door is the arrangement: the
   * main process answers questions and never calls into the
   * window. [T-1 preload]
   */
  ipcMain.handle('take:send', async (_event, id: unknown) => {
    if (typeof id !== 'string') return null;
    return sendCapture(id).catch(() => null);
  });
  ipcMain.handle('take:stop-send', (_event, id: unknown) => {
    if (typeof id === 'string') stopSending(id);
    return true;
  });
  ipcMain.handle('take:sending', async (_event, id: unknown) => {
    if (typeof id !== 'string') return null;
    const record = await readSendingOf(id).catch(() => null);
    if (!record) return null;
    const { to, ...rest } = record;
    /* The credential is stripped on the way out, in one place. */
    return { ...rest, to: callSeen(to ?? null), running: isSending(id) };
  });
  ipcMain.handle('take:capture', async (_event, id: unknown) =>
    (typeof id === 'string' ? oneCapture(id).catch(() => null) : null));
  ipcMain.handle('take:open-external', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !asOrigin(url)) return false;
    await shell.openExternal(url);
    return true;
  });
}

/**
 * The camera and the microphone, asked for once.  [T-3]
 *
 * ELECTRON DENIES `getUserMedia` BY DEFAULT and a window that
 * silently gets nothing is a window the operator thinks is
 * broken. Only `media` is granted, and only to the page this
 * application shipped: a capture station needs a camera, and it
 * needs nothing else on that list — not the clipboard, not
 * notifications, not location.
 *
 * THE OPERATING SYSTEM STILL ASKS ITS OWN QUESTION. This answers
 * Electron's, not macOS's or Windows's; a person who has refused
 * the camera to this application in their system settings is
 * refusing it, and `getUserMedia` says so to the tile.
 */
function allowCameras(window: BrowserWindow): void {
  window.webContents.session.setPermissionRequestHandler(
    (_contents, permission, decide) => decide(permission === 'media'));
  window.webContents.session.setPermissionCheckHandler(
    (_contents, permission) => permission === 'media');
}

function open(): void {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 880,
    minHeight: 560,
    /* The page's own ground, so there is no white flash on
       launch — the same reason the Take App's manifest sets it. */
    backgroundColor: '#0e0f11',
    title: 'Take',
    show: false,
    webPreferences: {
      /* The named questions, and nothing else. [T-2] */
      preload: join(HERE, 'preload.cjs'),
      /*
       * THE RENDERER IS A WEB PAGE AND IS TREATED AS ONE. No Node
       * in it, context isolation on, sandbox on.
       *
       * T-1 SAID THE STAGE THAT NEEDED THE MACHINE WOULD OPEN
       * NAMED FUNCTIONS RATHER THAN `require`, AND T-2 IS IT:
       * `preload.ts` is the list, and every stage since has
       * added to it by name. The window still has no filesystem
       * and no socket — it has a set of named questions it may
       * ask of something that does.
       */
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      /* There is no remote content and will not be: everything
         this application draws it ships with. */
      webSecurity: true,
    },
  });

  /* Shown when it has something to show, rather than as a grey
     rectangle that fills in. */
  window.once('ready-to-show', () => window.show());

  /*
   * NOTHING NAVIGATES AWAY FROM THE APPLICATION. A link in the
   * renderer opens in the person's own browser; the window itself
   * stays on the page it shipped with. An Electron window that
   * can be navigated is an Electron window that can be navigated
   * somewhere else.
   */
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  allowCameras(window);

  void window.loadFile(join(HERE, 'index.html'));
}

/**
 * How REVIEW sees what was recorded.  [TAKE-DESKTOP T-5]
 *
 * A SCHEME OF ITS OWN, NOT `file://` AND NOT A BLOB. The
 * window has no filesystem and is not getting one, and handing
 * it a whole angle as a `Blob` would mean reading a gigabyte of
 * video into the renderer's memory to look at the first ten
 * seconds of it. A scheme the main process answers lets
 * `<video>` do what it is for — ask for the part it is playing
 * — and `net.fetch` on a `file://` URL serves byte ranges for
 * it.
 *
 * THE ID AND THE FILE ARE CHECKED BY THE SAME RULES THAT WROTE
 * THEM. `captureDir` refuses an id that is not one; the file
 * name is matched against the same shape `writeChunk` accepts.
 * A scheme handler that joined whatever it was given would be
 * the `../../` hole in a different coat, and this one is
 * reachable from a page.
 *
 * REGISTERED AS PRIVILEGED BEFORE THE APP IS READY, because
 * Electron decides what a scheme may do — streaming and ranges
 * among them — at registration and not at use.
 */
const MEDIA_SCHEME = 'take-capture';

protocol.registerSchemesAsPrivileged([{
  scheme: MEDIA_SCHEME,
  privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true },
}]);

function serveCaptures(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    let id = '';
    let file = '';
    try {
      const asked = new URL(request.url);
      /*
       * THE ID IS IN THE PATH AND NOT THE HOST, AND THAT COST A
       * BROWSER RUN TO LEARN.
       *
       * It was `take-capture://<id>/<file>`, which reads better
       * and does not work: a URL host is CASE-FOLDED, and a
       * capture id is `cap_20261003T120928_p67y` — ISO 8601's
       * own uppercase `T`, in the middle of a string that is
       * otherwise lowercase. Every angle 404'd, the review grid
       * drew four black rectangles, and nothing in the code
       * looked wrong. A path component is not folded. [T-5]
       */
      const parts = asked.pathname.split('/').filter(Boolean)
        .map((one) => decodeURIComponent(one));
      id = parts[0] ?? '';
      file = parts[1] ?? '';
      if (parts.length !== 2) return new Response('no', { status: 400 });
    } catch {
      return new Response('no', { status: 400 });
    }
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(file) || file.includes('..')) {
      return new Response('no', { status: 400 });
    }
    let dir: string;
    try {
      dir = captureDir(id);
    } catch {
      return new Response('no', { status: 400 });
    }
    return net.fetch(pathToFileURL(join(dir, file)).toString(), {
      /* The range header is the whole point: a player asks for
         the part it is playing. */
      headers: request.headers,
      method: 'GET',
    }).catch(() => new Response('gone', { status: 404 }));
  });
}

app.whenReady().then(() => {
  listen();
  serveCaptures();
  open();
  /* macOS keeps an application running with no windows. */
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) open();
  });
}).catch(() => app.quit());

/* Everywhere else, the last window closing is the application
   closing. */
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
