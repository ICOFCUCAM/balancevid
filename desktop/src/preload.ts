/**
 * The one door between the window and the machine.
 *   [TAKE-DESKTOP T-1, T-2]
 *
 * T-1 SAID THIS WOULD BE NAMED FUNCTIONS AND NOT `require`, and
 * this is the stage that opens it. Each one answers one
 * question, and none of them takes a path or a URL that reaches
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
 *   beginCapture(…)        make the directory and declare it,
 *                          BEFORE any media exists [T-4]
 *   writeChunk(…)          append one segment to one angle's file
 *   endCapture(spec)       write the measured starts and the spread
 *   captures()             what is on this machine
 *   capture(id)            one of them, in full
 *   forgetCapture(id)      throw one away, whole [T-5]
 *   call() / chooseCall()  which call this station records for —
 *                          by name, never by credential [T-5]
 *   send(id)               send a capture, resumable per source
 *   stopSend(id)           stop at the next piece
 *   sending(id)            how far it got
 *
 * THE WINDOW STILL HAS NO NODE, NO FILESYSTEM AND NO SOCKET. It
 * has a list of questions it may ask of something that does, and
 * the list is written out above because its length is the point:
 * a preload that exposed `ipcRenderer.invoke` would expose every
 * channel the main process will ever have, including the ones
 * T-4 added for writing video to disk and the ones T-5 added for
 * sending it somewhere.
 *
 * AND NOTHING COMES BACK THAT WAS NOT ASKED FOR. Each answer is
 * the main process's own data, already through the shared rules;
 * the renderer cannot hand a callback across, and the main
 * process cannot call into the window.
 */

import { contextBridge, ipcRenderer } from 'electron';

import type { Connection } from '../../shared/src/connections.js';
import type { Capture } from '../../shared/src/capture.js';
import type { captureOf } from '../../shared/src/capture.js';
import type { Machine } from './machine.js';
import type { Sending } from './submit.js';

export interface TakeBridge {
  connections(): Promise<Connection[]>;
  remember(list: Connection[]): Promise<Connection[]>;
  ask(typed: string): Promise<{
    instance: { name: string; origin: string };
    rows: unknown[];
  } | null>;
  openExternal(url: string): Promise<boolean>;
  machine(): Promise<Machine>;
  beginCapture(
    id: string, label: string, beganAt: string,
  ): Promise<string | null>;
  /*
   * THE CHUNK CROSSES AS A `Uint8Array`, not a `Blob`. Structured
   * clone carries a typed array to the main process; a `Blob` is
   * a handle to bytes the renderer owns and arrives as nothing
   * useful. The renderer reads it with `arrayBuffer()` first —
   * which is also the only place the bytes are copied.
   */
  writeChunk(id: string, file: string, bytes: Uint8Array): Promise<number>;
  endCapture(spec: Parameters<typeof captureOf>[0]): Promise<Capture | null>;
  captures(): Promise<Capture[]>;
  capture(id: string): Promise<Capture | null>;
  forgetCapture(id: string): Promise<boolean>;
  /*
   * THE CALL, AND NOT THE CREDENTIAL ON IT.  [T-5, D-21]
   *
   * `chooseCall` takes what somebody typed into the box on
   * CONNECT and hands it out; `call()` answers the name and the
   * origin so a person can read where their work is going. The
   * link never comes back across this bridge, because a
   * renderer is a web page and this one has four cameras
   * pointed at a room.
   */
  call(): Promise<Seen | null>;
  chooseCall(said: { origin: string; link: string; name: string } | null):
    Promise<Seen | null>;
  /*
   * SENDING, WHICH THE WINDOW ASKS FOR AND DOES NOT DO. The
   * renderer's policy is still `connect-src 'none'`: it has no
   * socket, and the capture it is submitting is gigabytes on a
   * disk it cannot read either.
   */
  send(id: string): Promise<{ sending: Sending; more: boolean } | null>;
  stopSend(id: string): Promise<boolean>;
  sending(id: string): Promise<SendingSeen | null>;
}

/** An installation as the window may know it. */
export interface Seen { origin: string; name: string }

/** How far a capture has got, with the credential stripped. */
export interface SendingSeen extends Sending {
  to: Seen | null;
  /** True while this process is in the middle of sending it. */
  running: boolean;
}

const bridge: TakeBridge = {
  connections: () => ipcRenderer.invoke('take:connections'),
  remember: (list) => ipcRenderer.invoke('take:remember', list),
  ask: (typed) => ipcRenderer.invoke('take:ask', typed),
  openExternal: (url) => ipcRenderer.invoke('take:open-external', url),
  machine: () => ipcRenderer.invoke('take:machine'),
  beginCapture: (id, label, beganAt) =>
    ipcRenderer.invoke('take:begin-capture', id, label, beganAt),
  writeChunk: (id, file, bytes) =>
    ipcRenderer.invoke('take:write-chunk', id, file, bytes),
  endCapture: (spec) => ipcRenderer.invoke('take:end-capture', spec),
  captures: () => ipcRenderer.invoke('take:captures'),
  capture: (id) => ipcRenderer.invoke('take:capture', id),
  forgetCapture: (id) => ipcRenderer.invoke('take:forget-capture', id),
  call: () => ipcRenderer.invoke('take:call'),
  chooseCall: (said) => ipcRenderer.invoke('take:choose-call', said),
  send: (id) => ipcRenderer.invoke('take:send', id),
  stopSend: (id) => ipcRenderer.invoke('take:stop-send', id),
  sending: (id) => ipcRenderer.invoke('take:sending', id),
};

contextBridge.exposeInMainWorld('take', bridge);
