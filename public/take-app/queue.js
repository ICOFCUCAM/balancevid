/*
 * The upload queue.  [TAKE-APP T4, T13, T13a; Doctrine U-06, D-25]
 *
 * WHAT THE "PACKAGED APP" ROW WAS ACTUALLY ABOUT. T13a says a native
 * client would add "background upload and retry", and recorded itself as
 * a gap on the strength of it. The store account and the signing
 * certificate are genuinely out of reach here; background upload and
 * retry are not, and shipping the gap rather than the capability was
 * the wrong half to keep.
 *
 * AND IT IS NOT AN IMPROVEMENT, IT IS A FAULT. What shipped was
 *
 *     chunk: async (id, index, body) => { await fetch(...); }
 *
 * with no check on the response, under a caller that swallows the
 * rejection so the next segment can carry on. On a laptop in a studio
 * that is nearly always fine. On a phone on mobile data — the Take
 * App's entire premise — a segment that fails is gone, the take has a
 * hole in the middle of it, the duration still looks plausible, and
 * nobody is told. U-06 exists so a crash costs one segment; it does
 * not say the segment may be dropped in silence.
 *
 * SO A SEGMENT IS WRITTEN DOWN BEFORE IT IS SENT. IndexedDB holds the
 * bytes; the queue drains in the background, retries with a backoff,
 * and survives the tab being closed, the phone locking, the signal
 * going, and the browser being killed mid-song. What crosses to the
 * producer is still nothing until the performer presses Send — this
 * changes how reliably the bytes arrive, never who may see them.
 *
 * PLAIN SCRIPT, ON `self`, AND NOT A MODULE. It is loaded by two very
 * different things: the page, which wants to enqueue and to ask what
 * is outstanding, and the SERVICE WORKER, which drains it from a
 * `sync` event with no page open at all. `importScripts` is what a
 * classic worker has, module workers are not on every phone that
 * matters, and two copies of a queue is how a queue develops two
 * different ideas of what is in it. [D-19]
 */
(function attach(scope) {
  'use strict';

  var DB = 'balancevid-take';
  var VERSION = 1;
  var STORE = 'chunks';

  /*
   * A BACKOFF, NOT A HAMMER. A phone that has just lost signal will not
   * find it again by being asked twelve times a second, and a server
   * that is refusing is not helped either. Doubling, with a ceiling
   * short enough that coming out of a tunnel is noticed.
   */
  var BACKOFF_MS = [0, 1000, 3000, 8000, 20000, 45000];
  var MAX_BACKOFF = 45000;

  function open() {
    return new Promise(function (resolve, reject) {
      var request = scope.indexedDB.open(DB, VERSION);
      request.onupgradeneeded = function () {
        var db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'key' });
          store.createIndex('submission', 'submissionId', { unique: false });
        }
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function tx(mode, run) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(STORE, mode);
        var store = transaction.objectStore(STORE);
        var out = run(store);
        transaction.oncomplete = function () { db.close(); resolve(out && out.value); };
        transaction.onerror = function () { db.close(); reject(transaction.error); };
        transaction.onabort = function () { db.close(); reject(transaction.error); };
      });
    });
  }

  function all() {
    return tx('readonly', function (store) {
      var box = {};
      store.getAll().onsuccess = function (event) { box.value = event.target.result; };
      return box;
    }).then(function (rows) { return rows || []; });
  }

  /*
   * ZERO-PADDED, SO A PLAIN SORT IS THE RECORDING'S OWN ORDER — the
   * same decision the route makes about the files it writes, for the
   * same reason.
   */
  function keyOf(submissionId, index) {
    return submissionId + '#' + String(index).padStart(6, '0');
  }

  /** Write a segment down. Nothing is sent until `drain` runs. */
  function put(record) {
    return tx('readwrite', function (store) {
      store.put({
        key: keyOf(record.submissionId, record.index),
        link: record.link,
        submissionId: record.submissionId,
        index: record.index,
        blob: record.blob,
        tries: 0,
        dead: false,
        firstAt: Date.now(),
        nextAt: 0,
        lastError: '',
      });
    });
  }

  function drop(key) {
    return tx('readwrite', function (store) { store.delete(key); });
  }

  function save(row) {
    return tx('readwrite', function (store) { store.put(row); });
  }

  /**
   * Send what is outstanding, oldest first.
   *
   * SERIAL, AND THAT IS DELIBERATE. Four parallel uploads from a phone
   * on a weak connection is how all four time out. The index is in the
   * URL, so order is not needed for correctness — it is needed because
   * the performer watching a counter go down wants it to go down.
   */
  function drain() {
    return all().then(function (rows) {
      var now = Date.now();
      var due = rows
        .filter(function (row) { return !row.dead && (row.nextAt || 0) <= now; })
        .sort(function (a, b) { return a.key < b.key ? -1 : 1; });

      var sent = 0;
      var held = 0;
      var dead = 0;

      return due.reduce(function (chain, row) {
        return chain.then(function () {
          return send(row).then(function (verdict) {
            if (verdict === 'sent') { sent += 1; return drop(row.key); }
            if (verdict === 'dead') {
              dead += 1;
              row.dead = true;
              return save(row);
            }
            held += 1;
            row.tries += 1;
            row.nextAt = Date.now()
              + (BACKOFF_MS[Math.min(row.tries, BACKOFF_MS.length - 1)] || MAX_BACKOFF);
            return save(row);
          });
        });
      }, Promise.resolve()).then(function () {
        return { sent: sent, held: held, dead: dead };
      });
    });
  }

  /**
   * One segment, and what its answer means.
   *
   * THREE OUTCOMES AND NOT TWO. "Sent" and "try again" are the obvious
   * pair; the third is a refusal that trying again cannot fix — an
   * empty chunk, a link that is no longer open, an id the server will
   * not accept. Retrying those forever is a counter that never reaches
   * zero and a performer who cannot tell a bad signal from a closed
   * request. They are marked instead, and the page says the recording
   * is incomplete rather than pretending it is still on its way.
   */
  function send(row) {
    var at = '/api/take/' + encodeURIComponent(row.link)
      + '/submissions/' + encodeURIComponent(row.submissionId)
      + '?index=' + row.index;
    return scope.fetch(at, {
      method: 'POST',
      body: row.blob,
      headers: { 'content-type': 'application/octet-stream' },
    }).then(function (response) {
      if (response.ok) return 'sent';
      /* Busy, rate-limited, or broken at their end: all worth repeating. */
      if (response.status === 408 || response.status === 429
        || response.status >= 500) return 'again';
      return 'dead';
    }).catch(function () {
      /* No answer at all is the case this whole file exists for. */
      return 'again';
    });
  }

  /** How many segments of this recording have not arrived. */
  function pending(submissionId) {
    return all().then(function (rows) {
      return rows.filter(function (row) {
        return !row.dead && (!submissionId || row.submissionId === submissionId);
      }).length;
    });
  }

  /** How many can never arrive, so the page can say so rather than spin. */
  function broken(submissionId) {
    return all().then(function (rows) {
      return rows.filter(function (row) {
        return row.dead && (!submissionId || row.submissionId === submissionId);
      }).length;
    });
  }

  /**
   * Throw a recording's segments away.  [T4]
   *
   * "Take 3 doesn't have to reach the server at all if they delete it
   * locally." With a queue in front of the network that becomes
   * literally true for anything still waiting: a take deleted before
   * its last segment went up costs the performer nothing and the
   * producer never hears of it.
   */
  function forget(submissionId) {
    return all().then(function (rows) {
      return rows.filter(function (row) { return row.submissionId === submissionId; })
        .reduce(function (chain, row) {
          return chain.then(function () { return drop(row.key); });
        }, Promise.resolve());
    });
  }

  scope.TakeQueue = {
    put: put,
    drain: drain,
    pending: pending,
    broken: broken,
    forget: forget,
    keyOf: keyOf,
  };
}(self));
