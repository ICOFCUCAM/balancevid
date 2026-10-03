/*
 * The television network's service worker.  [TV-NETWORK N-9]
 *
 * > *"Yes — I think BalanceVid should eventually have a dedicated
 * > Online TV application. Not just the existing web Watch page."*
 *
 * THE SAME SPLIT THE TAKE APP'S WORKER MADE, AND FOR THE SAME
 * REASON. That one says it plainly: *"a signed binary in two
 * stores needs accounts, certificates and a release pipeline, and
 * none of that is a change to this product."* What IS a change to
 * this product is the thing installing — an icon on a home screen
 * or a television, opening without browser chrome, saying
 * something sensible with no network. That is here. A listing in
 * anybody's store is not, and is not pretended to be.
 *
 * IT CACHES NOTHING BUT THE APOLOGY, and that is the design
 * rather than an unfinished version of one. You cannot watch
 * television offline, and a channel grid served out of last
 * week's cache is a page that lies about what is on — which is
 * the single thing this whole network exists to tell the truth
 * about. The guide, the directory and the station page are all
 * answers about *now*, and a stale one is worse than none.
 *
 * SO WHAT IT ADDS IS ONE THING: an installed app that opens to a
 * browser error page looks broken, and one that opens to its own
 * name saying "no connection" looks like an app. Same absence,
 * said by the thing the viewer installed.
 */

const SHELL = 'balancevid-tv-shell-v1';
const OFFLINE = '/tv-app/offline.html';

/*
 * The apology and the icons it may need. Nothing else: no page,
 * no API answer, no picture of a channel that may have gone.
 */
const SHELL_URLS = [OFFLINE, '/tv-app/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(SHELL_URLS))
      /* A shell that cannot be cached is not a reason to refuse to
         install: everything else here works online, which is every
         case but one. */
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      /* An old shell is deleted rather than left to be served to
         somebody for ever. */
      .then((names) => Promise.all(
        names.filter((name) => name.startsWith('balancevid-tv-shell-')
          && name !== SHELL).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  /*
   * NAVIGATIONS ONLY. A segment, a playlist or an API answer that
   * fails should fail — the player has its own recovery and the
   * page has its own refresh, and a worker that intercepted them
   * would be a second opinion about whether the channel is up.
   */
  if (request.mode !== 'navigate' || request.method !== 'GET') return;
  event.respondWith(
    /* Network first, always, and the cache holds no page to
       prefer anyway. */
    fetch(request).catch(() => caches.match(OFFLINE)
      .then((hit) => hit ?? new Response(
        'No connection.',
        { status: 503, headers: { 'content-type': 'text/plain' } }))),
  );
});
