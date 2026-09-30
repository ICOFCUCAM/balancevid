/*
 * The Take App's service worker.  [TAKE-APP T2c, T13, T13a; U-06]
 *
 * WHAT A PACKAGED CLIENT WAS SAID TO ADD, MINUS THE STORE ACCOUNT.
 * T13a recorded "a packaged Android / iOS app" as a gap and gave the
 * reason: a native client adds background upload and retry. A signed
 * binary in two stores needs accounts, certificates and a release
 * pipeline, and none of that is a change to this product. Background
 * upload and retry is, and this is it.
 *
 * SO THE ROW SPLITS HONESTLY. What is built: the Take App installs to
 * a home screen, opens without browser chrome, loads with no network,
 * and finishes its uploads after the tab is closed. What is not: a
 * listing in either store. The capability the row was justified by is
 * here; the distribution channel is not, and is not pretended to be.
 *
 * IT DRAINS THE SAME QUEUE THE PAGE FILLS, by importing the same file
 * the page does. A worker with its own idea of what is outstanding is
 * a worker that deletes a segment the page is still waiting on. [D-19]
 */

importScripts('/take-app/queue.js');

/*
 * BUMPED WHEN THE SHELL CHANGES, and used as the cache name so an old
 * shell is deleted rather than left to be served to somebody forever.
 */
const SHELL = 'balancevid-take-shell-v1';

/*
 * WHAT IS WORTH HOLDING OFFLINE, AND NOTHING MORE.
 *
 * Not the master track: it is a performer's reference for one song,
 * it is large, and caching somebody's unreleased recording onto a
 * phone indefinitely is a decision about their material, not about
 * loading time. [D-03]
 */
const SHELL_URLS = ['/take-app/queue.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      /* A shell that cannot be cached is not a reason to refuse to
         install: everything else here still works online. */
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names
        .filter((name) => name.startsWith('balancevid-take-shell-') && name !== SHELL)
        .map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

/*
 * NETWORK FIRST, CACHE AS THE FALLBACK, AND ONLY FOR THE SHELL.
 *
 * A take link is a credential and its page is per-request; an API
 * answer is about somebody's production. Neither is ever served from
 * a cache — a stale "that link is not open", or worse a cached
 * reference track under a link that has since been rotated, is the
 * kind of thing a cache should never be allowed to decide. [D-25]
 */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!SHELL_URLS.includes(url.pathname)) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(SHELL).then((cache) => cache.put(request, copy)).catch(() => undefined);
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit ?? Response.error())),
  );
});

/*
 * THE BACKGROUND HALF.  [T13a]
 *
 * Background Sync is what lets the phone finish an upload after the
 * performer has locked it and put it in their pocket — the browser
 * wakes this worker when there is a connection again, with no page
 * open anywhere. It is the one thing the web surface genuinely could
 * not do before, and it is why this file exists rather than a retry
 * loop in the page.
 *
 * IT IS NOT EVERYWHERE, and the page does not depend on it. Safari has
 * no Background Sync, so on an iPhone the queue drains while the page
 * is open and resumes the next time it is — which is still the whole
 * difference between a segment that is retried and one that is gone.
 * The page registers the sync where it exists and keeps its own
 * draining either way.
 */
self.addEventListener('sync', (event) => {
  if (event.tag !== 'take-upload') return;
  event.waitUntil(self.TakeQueue.drain());
});

/*
 * PERIODIC SYNC, WHERE THE BROWSER OFFERS IT. A phone that never
 * regains a connection while the page is open, and is never opened
 * again for a day, still finishes its upload.
 */
self.addEventListener('periodicsync', (event) => {
  if (event.tag !== 'take-upload') return;
  event.waitUntil(self.TakeQueue.drain());
});

/* And a page that knows it has just queued something may say so. */
self.addEventListener('message', (event) => {
  if (event.data && event.data.kind === 'take-drain') {
    event.waitUntil(self.TakeQueue.drain());
  }
});
