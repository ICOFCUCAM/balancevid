'use client';

/**
 * The page's end of the upload queue.  [TAKE-APP T4, T13a; U-06]
 *
 * The queue itself is `public/take-app/queue.js`, a plain script,
 * because the SERVICE WORKER runs the same code from a `sync` event with
 * no page open — and a worker with its own idea of what is outstanding
 * is a worker that deletes a segment the page is still waiting on.
 * This is the typed door onto it and nothing more. [D-19]
 *
 * EVERYTHING HERE DEGRADES RATHER THAN THROWS. A phone in private
 * browsing has no IndexedDB; an old browser has no service worker; a
 * locked-down one refuses both. None of that is a reason a performer
 * cannot record — it is a reason their upload is less durable, which
 * is a difference in quality, not in whether the product works. [U-19]
 */

export interface TakeQueueApi {
  put(record: {
    link: string; submissionId: string; index: number; blob: Blob;
    /** Which angle this segment is from; absent is the only one. [B-2] */
    track?: number;
  }): Promise<void>;
  drain(): Promise<{ sent: number; held: number; dead: number }>;
  pending(submissionId?: string): Promise<number>;
  broken(submissionId?: string): Promise<number>;
  forget(submissionId: string): Promise<void>;
}

/**
 * The device's own list of links it is waiting to hear about.
 *   [GO-VIRAL V-7]
 *
 * IN THE SAME FILE AND THE SAME DATABASE AS THE QUEUE, for the
 * reason that one states: the page and the service worker both
 * open it, and two scripts opening one IndexedDB at different
 * versions is a database that refuses whichever is behind.
 */
export interface TakeWatchApi {
  watch(link: string, saw?: string): Promise<void>;
  unwatch(link: string): Promise<void>;
  watching(): Promise<{ link: string; saw: string }[]>;
  saw(link: string): Promise<string | null>;
}

declare global {
  // eslint-disable-next-line no-var
  var TakeQueue: TakeQueueApi | undefined;
  // eslint-disable-next-line no-var
  var TakeWatch: TakeWatchApi | undefined;
}

let loading: Promise<TakeQueueApi | null> | null = null;

/**
 * The queue, or nothing.
 *
 * LOADED ONCE AND REMEMBERED, including the failure: a phone that
 * cannot have a queue should not be asked again on every segment.
 */
export function takeQueue(): Promise<TakeQueueApi | null> {
  if (loading) return loading;
  loading = (async () => {
    if (typeof window === 'undefined') return null;
    if (window.TakeQueue) return window.TakeQueue;
    /* No IndexedDB, no durable queue. Say so once, here. */
    if (!('indexedDB' in window)) return null;
    try {
      await new Promise<void>((resolve, reject) => {
        const tag = document.createElement('script');
        tag.src = '/take-app/queue.js';
        tag.onload = () => resolve();
        tag.onerror = () => reject(new Error('the upload queue could not be loaded'));
        document.head.appendChild(tag);
      });
    } catch {
      return null;
    }
    return window.TakeQueue ?? null;
  })();
  return loading;
}

/**
 * Ask for the queue to be drained, by every means this phone has.
 *
 * THREE, AND THEY ARE NOT ALTERNATIVES. The page drains it now, which
 * is what happens on a good connection. Background Sync drains it
 * after the phone is locked and put in a pocket — the one thing the
 * web surface genuinely could not do before, and the whole of T13a's
 * argument for a native client. Neither exists on every phone, and on
 * an iPhone only the first does, so the page never depends on the
 * worker having arrived.
 */
export async function askToDrain(): Promise<void> {
  const queue = await takeQueue();
  if (queue) void queue.drain().catch(() => undefined);
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sync = (registration as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    }).sync;
    if (sync) await sync.register('take-upload');
    registration.active?.postMessage({ kind: 'take-drain' });
  } catch {
    /* No worker, no sync, or a browser that refuses to register one.
       The page's own drain above has already run. */
  }
}

/**
 * Put the worker in place.  [T2c, T13a]
 *
 * Registered from the take page and nowhere else: the rest of the
 * product is a studio on a laptop, and a service worker over a studio
 * is a cache between a producer and their own material. [D-03]
 */
export async function installWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    /*
     * SCOPED TO THE ROOT because the worker must also be able to reach
     * `/api/take/...` when it drains — a worker scoped to `/take/`
     * could not. It caches nothing outside its shell list, which is
     * what actually keeps it out of the studio's way.
     */
    return await navigator.serviceWorker.register('/take-sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

/**
 * Wait until a recording's segments have all arrived.  [T4, T5; U-06]
 *
 * SEND IS A JOIN, AND A JOIN OF WHAT IS THERE. `PUT …/submissions/<id>`
 * concatenates the `.part` files on disk and calls the result the
 * performance — so sending while a segment is still queued produces a
 * submission with a hole in it, of a plausible length, that nobody can
 * tell from a complete one until they watch it.
 *
 * THE RACE IS NOT NEW; the queue only made it visible. The original
 * chunk upload was fire-and-forget under a caller that ignored its
 * rejection, so the same truncation was possible and there was nothing
 * to wait ON. Now there is.
 *
 * BOUNDED, because a performer on a train must not be held at a
 * spinner for ever. What comes back says which it was, and the page
 * says so in those words rather than "that did not send".
 */
export async function settle(
  submissionId: string, waitMs = 60000,
): Promise<{ ok: true } | { ok: false; reason: 'waiting' | 'broken'; left: number }> {
  const queue = await takeQueue();
  /* No queue means the segments went straight up: nothing to wait for. */
  if (!queue) return { ok: true };

  const until = Date.now() + waitMs;
  for (;;) {
    void askToDrain();
    const [left, dead] = await Promise.all([
      queue.pending(submissionId), queue.broken(submissionId),
    ]);
    if (left === 0) {
      /*
       * A SEGMENT THAT CAN NEVER ARRIVE IS NOT A SLOW ONE. An empty
       * chunk, a link since rotated, an id the server refuses:
       * retrying is a counter that never reaches zero. The performer
       * is told the recording is incomplete instead of watching it
       * spin. [U-19]
       */
      if (dead > 0) return { ok: false, reason: 'broken', left: dead };
      return { ok: true };
    }
    if (Date.now() >= until) return { ok: false, reason: 'waiting', left };
    await new Promise((wake) => { setTimeout(wake, 1000); });
  }
}

/* ------------------------------------------------------------------ *
 *  Waiting to hear.  [GO-VIRAL V-7; Doctrine D-03, D-25]
 * ------------------------------------------------------------------ */

/** The watch list, or nothing. Loaded by the same script as the queue. */
export async function takeWatch(): Promise<TakeWatchApi | null> {
  await takeQueue();
  return (typeof window === 'undefined' ? null : window.TakeWatch) ?? null;
}

/**
 * Start waiting to hear about this link.
 *
 * NOTHING IS SENT ANYWHERE. The link goes into this device's own
 * store beside its upload queue, and the worker asks with it. The
 * installation is told nothing about this device and holds no
 * address for it — which is the whole of what V-7 is. [D-03]
 *
 * `saw` IS WRITTEN AT THE SAME MOMENT, because the page has just
 * shown the person whatever there is to know. A device that
 * started watching with an empty memory would be notified, a
 * minute later, about the thing on the screen in front of them.
 *
 * AND THE PERMISSION IS ASKED FOR SEPARATELY, by whoever calls
 * this. Watching without notifications is a device that finds out
 * the next time the page opens, which is better than not watching
 * and costs nobody a prompt they did not ask for. [U-19]
 */
export async function startWatching(link: string, saw: string): Promise<void> {
  const list = await takeWatch();
  if (!list) return;
  await list.watch(link, saw).catch(() => undefined);
  await wakeTheWorker();
}

/** Stop. The row goes; nothing was ever anywhere else. */
export async function stopWatching(link: string): Promise<void> {
  const list = await takeWatch();
  if (!list) return;
  await list.unwatch(link).catch(() => undefined);
}

/** Whether this device is waiting to hear about this link. */
export async function isWatching(link: string): Promise<boolean> {
  const list = await takeWatch();
  if (!list) return false;
  return (await list.saw(link).catch(() => null)) !== null;
}

/**
 * Ask the browser to wake the worker about this, by every means it
 * has — and depend on none of them.
 *
 * PERIODIC SYNC IS CHROME AND AN INSTALLED APP, Background Sync is
 * most things but not Safari, and a message only reaches a worker
 * that is already running. On a phone with none of them the page
 * asks when it is opened, which is what happens today and remains
 * correct. Every call is wrapped, because a browser refusing to
 * register one of these is not a reason a performer cannot record.
 */
async function wakeTheWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const periodic = (registration as ServiceWorkerRegistration & {
      periodicSync?: { register(tag: string, options?: { minInterval: number }): Promise<void> };
    }).periodicSync;
    /* Once a day. A competition is judged over days, not minutes,
       and a worker woken hourly is a battery nobody consented to. */
    if (periodic) {
      await periodic.register('take-watch', { minInterval: 24 * 60 * 60 * 1000 })
        .catch(() => undefined);
    }
    const sync = (registration as ServiceWorkerRegistration & {
      sync?: { register(tag: string): Promise<void> };
    }).sync;
    if (sync) await sync.register('take-watch').catch(() => undefined);
    registration.active?.postMessage({ kind: 'take-watch' });
  } catch {
    /* No worker, or a browser that refuses. The page still asks. */
  }
}

/**
 * Ask to be told.  [GO-VIRAL V-7]
 *
 * THE PROMPT IS THE WHOLE OF WHAT IS ASKED FOR, and it is asked
 * for once, by a person pressing a button that says what it is
 * for. No account, no address, no identity — the permission is
 * the browser's and the link is already on the device.
 *
 * A REFUSAL LOSES THE NOTIFICATION AND NOTHING ELSE. The device
 * goes on watching, the worker goes on recording what it learns,
 * and the page says it when it is next opened. Which is why the
 * watch is started whatever the answer was.
 */
export async function askToBeTold(
  link: string, saw: string,
): Promise<'granted' | 'denied' | 'unavailable'> {
  await startWatching(link, saw);
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unavailable';
  }
  try {
    const answer = await Notification.requestPermission();
    return answer === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'unavailable';
  }
}
