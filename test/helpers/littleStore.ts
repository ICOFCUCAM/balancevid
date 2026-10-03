/**
 * Enough IndexedDB to run the Take App's upload queue.
 *   [TAKE-APP T13a; TAKE-DESKTOP B-2]
 *
 * `public/take-app/queue.js` is a plain script on `self`, because the
 * page and the SERVICE WORKER load the same file and two copies of a
 * queue is how a queue develops two ideas of what is in it. That makes
 * it testable by running it — which nothing did, because Node has no
 * IndexedDB and the queue's own tests read its source instead.
 *
 * READING THE SOURCE WAS ENOUGH UNTIL B-2. A key is a string, and a
 * test that the string is built the way the file says it is built is a
 * test of the file. What B-2 needs to know is different: that a second
 * camera's fourth segment does not OVERWRITE the first camera's fourth
 * segment — which is a fact about a store, not about a string, and the
 * store is the thing that was missing.
 *
 * SO THIS IS A STORE AND NOT A MOCK. It holds rows, it replaces a row
 * whose key is already there, and it hands them all back in insertion
 * order, which is every behaviour the queue depends on. What it does
 * not have — versions beyond the first, indexes that are read,
 * cursors, aborting a transaction half way — the queue does not use.
 * A stub that pretended to have them would be a second IndexedDB
 * nobody has measured. [D-19]
 */

interface Row { key: string; [field: string]: unknown }

/** What the queue calls `scope`: `self`, with the two globals it uses. */
export interface LittleScope {
  indexedDB: unknown;
  fetch: (url: string, init: { method: string; body: unknown }) => Promise<{
    ok: boolean; status: number;
  }>;
  /** The device's own list of links it is waiting on. [GO-VIRAL V-7] */
  TakeWatch?: {
    watch(link: string, saw?: string): Promise<void>;
    unwatch(link: string): Promise<void>;
    watching(): Promise<{ link: string; saw: string }[]>;
    saw(link: string): Promise<string | null>;
  };
  TakeQueue?: {
    put(record: Record<string, unknown>): Promise<void>;
    drain(): Promise<{ sent: number; held: number; dead: number }>;
    pending(submissionId?: string): Promise<number>;
    broken(submissionId?: string): Promise<number>;
    forget(submissionId: string): Promise<void>;
    keyOf(submissionId: string, index: number, track?: number): string;
  };
}

/** Every request this fakes answers on the next turn of the loop. */
function later(settle: () => void): void {
  queueMicrotask(settle);
}

export function littleStore(): {
  indexedDB: unknown;
  rows: (store?: string) => Row[];
} {
  /*
   * ONE MAP PER STORE, WHICH IT DID NOT HAVE.  [GO-VIRAL V-7]
   *
   * The first version held one map and ignored the store name,
   * which was exactly right while `chunks` was the only store
   * there was. V-7 added `watch` to the same database — for the
   * reason the file itself gives, that two scripts opening one
   * IndexedDB at different versions is a database that refuses
   * whichever is behind — and a fake that mixed the two would
   * have the worker reading segments as links.
   *
   * AND THE KEY PATH IS THE STORE'S OWN. `chunks` is keyed on
   * `key` and `watch` on `link`; a fake that assumed one would
   * file every row of the other under `undefined`.
   */
  const held = new Map<string, Map<string, Row>>();
  const keys = new Map<string, string>();

  const rowsOf = (name: string) => {
    const already = held.get(name);
    if (already) return already;
    const made = new Map<string, Row>();
    held.set(name, made);
    return made;
  };

  const objectStore = (name: string) => ({
    put(row: Row) {
      rowsOf(name).set(String(row[keys.get(name) ?? 'key']), row);
    },
    delete(key: string) { rowsOf(name).delete(key); },
    getAll() {
      const request: {
        onsuccess?: (event: { target: { result: Row[] } }) => void;
        result?: Row[];
      } = {};
      later(() => {
        request.result = [...rowsOf(name).values()];
        request.onsuccess?.({ target: { result: request.result } });
      });
      return request;
    },
    createIndex() { /* declared by the queue, never read by it. */ },
  });

  const db = {
    objectStoreNames: { contains: (name: string) => held.has(name) },
    createObjectStore(name: string, options?: { keyPath?: string }) {
      rowsOf(name);
      keys.set(name, options?.keyPath ?? 'key');
      return objectStore(name);
    },
    transaction(name: string) {
      const transaction: {
        oncomplete?: () => void; onerror?: () => void; onabort?: () => void;
        objectStore: () => ReturnType<typeof objectStore>;
        error: null;
      } = { objectStore: () => objectStore(name), error: null };
      /*
       * COMPLETE AFTER THE WORK, not with it. The queue reads its
       * result out of a box the request's own callback fills, so a
       * transaction that completed first would hand back nothing —
       * which is exactly what the real one does not do, and the
       * reason the two microtask hops below are not padding.
       */
      later(() => { later(() => transaction.oncomplete?.()); });
      return transaction;
    },
    close() { /* nothing is held open. */ },
  };

  return {
    rows: (store = 'chunks') => [...rowsOf(store).values()],
    indexedDB: {
      open() {
        const request: {
          onupgradeneeded?: () => void; onsuccess?: () => void; onerror?: () => void;
          result: typeof db; error: null;
        } = { result: db, error: null };
        later(() => {
          /* The upgrade runs until every store the file wants exists. */
          request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      },
    },
  };
}
