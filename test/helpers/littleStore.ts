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
  rows: () => Row[];
} {
  const held = new Map<string, Row>();
  let built = false;

  const objectStore = () => ({
    put(row: Row) { held.set(row.key, row); },
    delete(key: string) { held.delete(key); },
    getAll() {
      const request: { onsuccess?: (event: { target: { result: Row[] } }) => void } = {};
      later(() => request.onsuccess?.({ target: { result: [...held.values()] } }));
      return request;
    },
    createIndex() { /* declared by the queue, never read by it. */ },
  });

  const db = {
    objectStoreNames: { contains: () => built },
    createObjectStore() { built = true; return objectStore(); },
    transaction() {
      const transaction: {
        oncomplete?: () => void; onerror?: () => void; onabort?: () => void;
        objectStore: () => ReturnType<typeof objectStore>;
        error: null;
      } = { objectStore, error: null };
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
    rows: () => [...held.values()],
    indexedDB: {
      open() {
        const request: {
          onupgradeneeded?: () => void; onsuccess?: () => void; onerror?: () => void;
          result: typeof db; error: null;
        } = { result: db, error: null };
        later(() => {
          if (!built) request.onupgradeneeded?.();
          request.onsuccess?.();
        });
        return request;
      },
    },
  };
}
