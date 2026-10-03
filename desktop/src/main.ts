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

import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { asOrigin } from '../../shared/src/connections.js';
import { askInstance } from './ask.js';
import { readStored, writeStored } from './store.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * The four questions the window may ask.  [T-2]
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
  ipcMain.handle('take:open-external', async (_event, url: unknown) => {
    if (typeof url !== 'string' || !asOrigin(url)) return false;
    await shell.openExternal(url);
    return true;
  });
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
      /* The four named questions, and nothing else. [T-2] */
      preload: join(HERE, 'preload.cjs'),
      /*
       * THE RENDERER IS A WEB PAGE AND IS TREATED AS ONE. No Node
       * in it, context isolation on, sandbox on.
       *
       * T-1 SAID THE STAGE THAT NEEDED THE MACHINE WOULD OPEN
       * NAMED FUNCTIONS RATHER THAN `require`, AND T-2 IS IT:
       * four of them, in `preload.ts`. The window still has no
       * filesystem and no socket — it has four questions it may
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

  void window.loadFile(join(HERE, 'index.html'));
}

app.whenReady().then(() => {
  listen();
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
