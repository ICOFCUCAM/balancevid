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

import { app, BrowserWindow, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

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
      /*
       * THE RENDERER IS A WEB PAGE AND IS TREATED AS ONE. No Node
       * in it, context isolation on, and nothing exposed through a
       * preload bridge that T-1 does not need — which is nothing.
       * A capture station will eventually want the filesystem; the
       * stage that needs it is the stage that opens the door, and
       * it opens one named function rather than `require`. [T-4]
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
