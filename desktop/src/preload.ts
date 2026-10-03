/**
 * The one door between the window and the machine.
 *   [TAKE-DESKTOP T-1, T-2]
 *
 * T-1 SAID THIS WOULD BE NAMED FUNCTIONS AND NOT `require`, and
 * this is the stage that opens it. Four of them, each answering
 * one question, none of them taking a path or a URL that reaches
 * anything untouched:
 *
 *   connections()          what is remembered
 *   remember(list)         remember this, and say what was kept
 *   ask(typed)             what does the installation at `typed` offer
 *   openExternal(url)      show this link in the person's own browser
 *   machine()              what the recording disk has left, and
 *                          what it just sustained — measured by
 *                          writing, because there is no way to ask
 *                          an operating system how fast a
 *                          filesystem is [T-3]
 *
 * THE WINDOW STILL HAS NO NODE, NO FILESYSTEM AND NO SOCKET. It
 * has four questions it may ask of something that does. A preload
 * that exposed `ipcRenderer.invoke` would be a preload that
 * exposed every channel the main process will ever have,
 * including the ones T-4 adds for writing video to disk.
 *
 * AND NOTHING COMES BACK THAT WAS NOT ASKED FOR. Each answer is
 * the main process's own data, already through the shared rules;
 * the renderer cannot hand a callback across, and the main
 * process cannot call into the window.
 */

import { contextBridge, ipcRenderer } from 'electron';

import type { Connection } from '../../shared/src/connections.js';
import type { Machine } from './machine.js';

export interface TakeBridge {
  connections(): Promise<Connection[]>;
  remember(list: Connection[]): Promise<Connection[]>;
  ask(typed: string): Promise<{
    instance: { name: string; origin: string };
    rows: unknown[];
  } | null>;
  openExternal(url: string): Promise<boolean>;
  machine(): Promise<Machine>;
}

const bridge: TakeBridge = {
  connections: () => ipcRenderer.invoke('take:connections'),
  remember: (list) => ipcRenderer.invoke('take:remember', list),
  ask: (typed) => ipcRenderer.invoke('take:ask', typed),
  openExternal: (url) => ipcRenderer.invoke('take:open-external', url),
  machine: () => ipcRenderer.invoke('take:machine'),
};

contextBridge.exposeInMainWorld('take', bridge);
