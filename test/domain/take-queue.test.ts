/**
 * The upload queue, and the row it closes.
 *   [TAKE-APP T4, T5, T13, T13a, T2c; U-06, U-19, D-03, D-19, D-25]
 *
 * T13a recorded "a packaged Android / iOS app" as a gap and gave its
 * reason: a native client adds BACKGROUND UPLOAD AND RETRY. The store
 * account and the signing certificate are genuinely out of reach; that
 * capability is not, and shipping the gap rather than the capability
 * was keeping the wrong half.
 *
 * AND IT WAS NOT AN IMPROVEMENT, IT WAS A FAULT. What shipped was
 *
 *     chunk: async (id, index, body) => { await fetch(...); }
 *
 * — no check on the response — under a caller that swallows the
 * rejection. A segment that failed was gone: the take had a hole in
 * it, the duration still looked plausible, and nobody was told. U-06
 * exists so a crash costs one segment; it does not say a segment may
 * be dropped in silence.
 *
 * The queue is `public/take-app/queue.js` rather than a module,
 * because the SERVICE WORKER runs the same code from a `sync` event
 * with no page open, and two copies of a queue is how a queue develops
 * two ideas of what is in it.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { installWay } from '../../src/domain/getTheApp.js';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');
/* Anchored, so a `https://` inside the source survives. */
const code = (file: string) => read(file)
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*/gm, '');

const QUEUE = code('public/take-app/queue.js');
const WORKER = code('public/take-sw.js');
const DOOR = code('app/take/[link]/queue.ts');
const SINK = code('app/take/[link]/takeSink.ts');
const APP = code('app/take/[link]/TakeApp.tsx');
const MANIFEST = code('app/api/take/[link]/manifest/route.ts');
const BAR = code('app/take/[link]/InstallBar.tsx');
/*
 * THE MACHINERY MOVED AND THE WORDING DID NOT. A second surface
 * installs — the television network — and what the two share is
 * every subtle line of this: the standalone check, the Chromium
 * event, the Safari exception, the spent prompt. The bar keeps
 * the words; the hook keeps the behaviour. [D-19, TV-NETWORK N-9]
 */
const OFFER = code('app/useInstallOffer.ts');
const POLICY = code('src/auth/policy.ts');

describe('a segment is written down before it is sent', () => {
  /*
   * THE FAULT, NAMED SO IT CANNOT COME BACK. An unchecked `fetch` in
   * the chunk path is the whole of the silent-truncation bug, and it
   * is one careless edit away at any time.
   */
  it('never fires a chunk at the network and forgets it', () => {
    const chunk = SINK.slice(SINK.indexOf('chunk:'), SINK.indexOf('finish:'));
    expect(chunk).toMatch(/await queue\.put\(/);
    /* The fallback path exists, and unlike the original it reads the
       answer: a refusal is an error somebody can be shown. [U-19] */
    expect(chunk).toMatch(/if \(!response\.ok\) throw new Error/);
  });

  it('keeps the bytes, not just the intention', () => {
    expect(QUEUE).toMatch(/indexedDB\.open/);
    expect(QUEUE).toMatch(/blob: record\.blob/);
  });

  /*
   * ZERO-PADDED, so a plain sort is the recording's own order — the
   * same decision the route makes about the files it writes.
   */
  it('orders segments the way the server does', () => {
    expect(QUEUE).toMatch(/String\(index\)\.padStart\(6, '0'\)/);
  });
});

describe('what an answer means', () => {
  /*
   * THREE OUTCOMES AND NOT TWO. "Sent" and "try again" are the
   * obvious pair; the third is a refusal retrying cannot fix — an
   * empty chunk, a link since rotated, an id the server will not
   * accept. Retrying those is a counter that never reaches zero and
   * a performer who cannot tell a bad signal from a closed request.
   */
  it('separates a refusal from a bad connection', () => {
    expect(QUEUE).toMatch(/if \(response\.ok\) return 'sent'/);
    expect(QUEUE).toMatch(/response\.status === 408 \|\| response\.status === 429/);
    expect(QUEUE).toMatch(/response\.status >= 500\) return 'again'/);
    expect(QUEUE).toMatch(/return 'dead'/);
  });

  /* No answer at all is the case the whole file exists for. */
  it('retries when there is no answer', () => {
    expect(QUEUE).toMatch(/\.catch\(function \(\) \{[\s\S]{0,120}return 'again'/);
  });

  /*
   * A BACKOFF, NOT A HAMMER. A phone that has just lost signal will
   * not find it again by being asked twelve times a second.
   */
  it('backs off rather than hammering', () => {
    expect(QUEUE).toMatch(/BACKOFF_MS = \[0, 1000, 3000, 8000, 20000, 45000\]/);
    expect(QUEUE).toMatch(/row\.nextAt = Date\.now\(\)/);
    expect(QUEUE).toMatch(/\.filter\(function \(row\) \{ return !row\.dead && \(row\.nextAt \|\| 0\) <= now; \}\)/);
  });

  /*
   * SERIAL. Four parallel uploads from a phone on a weak connection
   * is how all four time out; the index is in the URL, so order is
   * not needed for correctness — it is needed because a performer
   * watching a counter wants it to go down.
   */
  it('sends one at a time', () => {
    expect(QUEUE).toMatch(/\.reduce\(function \(chain, row\)/);
    expect(QUEUE).toMatch(/Promise\.resolve\(\)\)/);
  });
});

describe('sending waits for the segments', () => {
  /*
   * SENDING IS A JOIN OF WHAT IS THERE. `PUT …/submissions/<id>`
   * concatenates the `.part` files on disk and calls the result the
   * performance — so sending while a segment is queued produces a
   * submission with a hole in it, of a plausible length, that nobody
   * can tell from a complete one until they watch it.
   *
   * THE RACE IS NOT NEW; the queue made it visible. The original
   * upload was fire-and-forget under a caller that ignored the
   * rejection, so the same truncation was possible and there was
   * nothing to wait ON.
   */
  it('settles the queue before it submits', () => {
    const send = APP.slice(APP.indexOf('const send = useCallback'),
      APP.indexOf('const drop = useCallback'));
    expect(send).toMatch(/const ready = await settle\(one\.id\)/);
    expect(send.indexOf('settle(one.id)')).toBeLessThan(send.indexOf('sendTake('));
  });

  /* Bounded: a performer on a train is not held at a spinner. */
  it('gives up waiting rather than hanging', () => {
    expect(DOOR).toMatch(/waitMs = 60000/);
    expect(DOOR).toMatch(/if \(Date\.now\(\) >= until\) return \{ ok: false, reason: 'waiting'/);
  });

  /*
   * AND IT SAYS WHICH IT WAS. "Still uploading 3 parts" is a fact;
   * "that did not send" in front of a take that is merely slow is
   * a broken button. [U-19]
   */
  /*
   * AND IT SAYS SO WHILE IT WAITS, not a minute later. The first
   * browser run pressed Send with two segments queued on a phone
   * with no signal and the page said nothing for sixty seconds:
   * the button read "Sending…" and the performer had no way to
   * know whether it was working, stuck or broken. It was working.
   */
  it('says what it is waiting for before it waits', () => {
    const send = APP.slice(APP.indexOf('const send = useCallback'),
      APP.indexOf('const drop = useCallback'));
    const note = send.indexOf('Still uploading');
    const wait = send.indexOf('await settle(one.id)');
    expect(note).toBeGreaterThan(-1);
    expect(note).toBeLessThan(wait);
    expect(send).toMatch(/you can leave the page open/);
  });

  it('tells them which of the two it is', () => {
    expect(APP).toMatch(/ready\.reason === 'broken'/);
    expect(APP).toMatch(/Still uploading \$\{ready\.left\}/);
    expect(APP).toMatch(/could not be uploaded\. Record it again\./);
  });

  /*
   * A PHONE WITH NO QUEUE IS NOT MADE TO WAIT FOR ONE. Private
   * browsing has no IndexedDB; the segments went straight up and
   * there is nothing to settle.
   */
  it('does not wait where there is no queue', () => {
    expect(DOOR).toMatch(/if \(!queue\) return \{ ok: true \}/);
  });

  /*
   * DELETE TAKES THE QUEUED SEGMENTS WITH IT, which makes the
   * brief's line literally true for the first time: "Take 3 doesn't
   * have to reach the server at all if they delete it locally." [T4]
   */
  it('deletes what has not gone up yet', () => {
    const drop = APP.slice(APP.indexOf('const drop = useCallback'));
    expect(drop).toMatch(/await queue\.forget\(one\.id\)/);
    expect(drop.indexOf('forget(one.id)')).toBeLessThan(drop.indexOf('dropTake('));
  });
});

describe('what the row says while it waits', () => {
  /*
   * A COUNT OF WHAT IS STILL GOING UP, WHERE THEY CAN SEE IT. A
   * performer told "still uploading 3 parts" has a fact; one told
   * nothing, who waits and presses again, has a broken button.
   */
  it('shows what is outstanding and what is lost', () => {
    expect(APP).toMatch(/data-testid="take-uploading"/);
    expect(APP).toMatch(/data-testid="take-broken"/);
  });

  /*
   * AND NOTHING ONCE IT IS SENT. A screenshot of the recovered
   * phone read "↑ 1  Sent" — a count of segments still on their
   * way beside a take that had arrived complete. The poll stops
   * when nothing is undecided, so its last snapshot was left on
   * screen next to the word contradicting it. A stale number is
   * worse than none: that one said the take was short.
   */
  it('shows no count beside a take that has been sent', () => {
    const row = APP.slice(APP.indexOf('data-testid="take-kept"'),
      APP.indexOf('data-testid="take-sent"'));
    const guards = row.match(/\(one\.state === 'kept' \|\| one\.state === 'sending'\)/g);
    expect(guards).toHaveLength(2);
  });

  /*
   * AND THE TIMER STOPS WITH THEM. A page left open on a finished
   * take should not read the disk every second for ever.
   */
  it('stops polling when nothing is undecided', () => {
    expect(APP).toMatch(/const undecided = kept\.some/);
    expect(APP).toMatch(/if \(!undecided\) return undefined/);
  });
});

describe('the background half', () => {
  /*
   * THE ONE THING THE WEB SURFACE COULD NOT DO BEFORE. Background
   * Sync wakes the worker when there is a connection again, with no
   * page open anywhere — which is the whole of T13a's argument for
   * a native client.
   */
  it('drains from a sync event with no page open', () => {
    expect(WORKER).toMatch(/addEventListener\('sync'/);
    expect(WORKER).toMatch(/event\.tag !== 'take-upload'/);
    expect(WORKER).toMatch(/event\.waitUntil\(self\.TakeQueue\.drain\(\)\)/);
  });

  /*
   * AND THE PAGE NEVER DEPENDS ON IT. Safari has no Background Sync,
   * so on an iPhone the queue drains while the page is open and
   * resumes next time it is — still the whole difference between a
   * segment that is retried and one that is gone.
   */
  it('drains from the page too, and does not require the worker', () => {
    expect(DOOR).toMatch(/if \(queue\) void queue\.drain\(\)/);
    const after = DOOR.slice(DOOR.indexOf('askToDrain'));
    expect(after).toMatch(/if \(sync\) await sync\.register\('take-upload'\)/);
    expect(after).toMatch(/catch \{/);
  });

  /*
   * A CRASH MID-SONG RESUMES, which is the failure U-06's rolling
   * segments exist to survive and which the original upload did not.
   * And a tunnel, which is commoner than a crash.
   */
  it('resumes on load and on regaining signal', () => {
    expect(APP).toMatch(/void installWorker\(\);\s*\n\s*void askToDrain\(\);/);
    expect(APP).toMatch(/addEventListener\('online', wake\)/);
  });

  /*
   * ONE QUEUE, READ BY BOTH. A worker with its own idea of what is
   * outstanding is a worker that deletes a segment the page is
   * waiting on. [D-19]
   */
  it('is the same queue in the worker and the page', () => {
    expect(WORKER).toMatch(/importScripts\('\/take-app\/queue\.js'\)/);
    expect(DOOR).toMatch(/tag\.src = '\/take-app\/queue\.js'/);
  });
});

describe('what the worker will and will not cache', () => {
  /*
   * NOT THE MASTER TRACK. It is a performer's reference for one
   * song, it is large, and caching somebody's unreleased recording
   * onto a phone indefinitely is a decision about their material.
   * Not the page either: a take link is a credential and a cached
   * reference under a rotated link is a cache deciding something it
   * must not. [D-03, D-25]
   */
  it('caches its own shell and nothing of anybody\'s production', () => {
    expect(WORKER).toMatch(/SHELL_URLS = \['\/take-app\/queue\.js'\]/);
    expect(WORKER).toMatch(/if \(!SHELL_URLS\.includes\(url\.pathname\)\) return/);
    expect(WORKER).toMatch(/if \(request\.method !== 'GET'\) return/);
    expect(WORKER).toMatch(/if \(url\.origin !== self\.location\.origin\) return/);
  });

  /* Network first: the cache is the fallback, never the answer. */
  it('asks the network before the cache', () => {
    const fetching = WORKER.slice(WORKER.indexOf("addEventListener('fetch'"));
    expect(fetching.indexOf('fetch(request)'))
      .toBeLessThan(fetching.indexOf('caches.match(request)'));
  });

  /* An old shell is deleted rather than served to somebody for ever. */
  it('sweeps the shell it has replaced', () => {
    expect(WORKER).toMatch(/name\.startsWith\('balancevid-take-shell-'\) && name !== SHELL/);
    expect(WORKER).toMatch(/caches\.delete\(name\)/);
  });
});

describe('installing it', () => {
  /*
   * PER LINK, AND THAT IS THE WHOLE DESIGN. One manifest at `/take/`
   * would install an icon that opens a page asking for a link, which
   * is worse than a bookmark. What a performer wants on their home
   * screen is THIS assignment.
   */
  it('installs the assignment, not the product', () => {
    expect(MANIFEST).toMatch(/start_url: at/);
    expect(MANIFEST).toMatch(/scope: at/);
    expect(MANIFEST).toMatch(/const at = `\/take\/\$\{encodeURIComponent\(link\)\}`/);
  });

  /* Refused for a link that is not open, exactly as the page is:
     an icon installed from a closed request opens a refusal. */
  it('is refused for a link that is not open', () => {
    expect(MANIFEST).toMatch(/const found = await requestForLink\(link,/);
    expect(MANIFEST).toMatch(/if \(!found\) return fail\(404/);
  });

  /*
   * AND NAMES NOTHING ABOUT THE PRODUCTION. Not the performance, not
   * the other performers, not the producer — the page's own rule,
   * and a manifest is more exposed than the page because the browser
   * keeps it. [D-03, D-25]
   */
  it('carries the ask and no part of the production', () => {
    /*
     * THE CLAIM IS ABOUT WHAT IT READS, not which words appear in
     * it: the first version of this test banned the string
     * "producer" and failed on the sentence shown to the PERFORMER
     * — "send it to the producer" — which is the manifest doing its
     * job. What must not happen is this route reaching into a
     * production at all.
     */
    expect(MANIFEST).not.toMatch(/loadPerformance|loadChannel|loadConversation/);
    expect(MANIFEST).not.toMatch(/found\.holder/);
    expect(MANIFEST).toMatch(/found\.assignment\?\.asks/);
    /* The only two fields of the request it names. */
    const fields = [...MANIFEST.matchAll(/found\.([A-Za-z.?]+)/g)].map((m) => m[1]);
    expect([...new Set(fields)].sort()).toEqual(['assignment?.asks']);
  });

  /* No browser chrome: on a phone the address bar is roughly the
     height of the Record button. [U-19] */
  it('opens without the browser around it', () => {
    expect(MANIFEST).toMatch(/display: 'standalone'/);
    expect(MANIFEST).toMatch(/background_color: '#0e0f11'/);
  });

  /* Android crops an installed icon to the launcher's shape. */
  it('ships an icon that survives being cropped', () => {
    expect(MANIFEST).toMatch(/purpose: 'maskable'/);
  });
});

const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) '
  + 'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';

describe('the chooser T2c was waiting for', () => {
  /*
   * "There is no app to open, so a chooser would offer one real door
   * and one that leads nowhere" — true, and it stopped being true
   * when the Take App became installable.
   */
  it('offers both doors', () => {
    expect(BAR).toMatch(/Open in Take App/);
    expect(BAR).toMatch(/Continue in browser/);
  });

  /*
   * AND NEITHER WHERE THERE IS NOTHING TO OPEN. Chromium fires
   * `beforeinstallprompt` only when the page actually qualifies, so
   * catching it is the honest test. An offer that does nothing is
   * worse than no offer. [U-19]
   */
  it('shows nothing where it cannot install', () => {
    expect(OFFER).toMatch(/addEventListener\('beforeinstallprompt', caught\)/);
    /*
     * `teach` IS NO LONGER IN THIS CONDITION, and the bar shows
     * MORE rather than less because of it. The iPhone sentence it
     * used to carry in its own voice is now three steps from
     * `installWay`, which also covers Android Firefox and every
     * chat app's browser — the browsers this bar rendered nothing
     * at all for, which is most of the ones invitations are
     * opened in. The condition still refuses a browser with
     * nothing to offer: no prompt and no way is still null.
     * [getTheApp.ts, install-by-hand.test.ts]
     */
    expect(BAR).toMatch(/if \(gone \|\| \(!offered && !way\)\) return null/);
  });

  /* And never to somebody already running it: offering to install
     the app you are inside is the product not knowing where it is. */
  it('shows nothing to somebody who has already installed it', () => {
    expect(OFFER).toMatch(/\(display-mode: standalone\)/);
    /*
     * THE EARLY RETURN IS WHAT MAKES THE BAR SHOW NOTHING: no
     * listener is registered, so `offered` and `teach` stay
     * false and `InstallBar` renders null.
     *
     * IT NOW REPORTS THE FACT AS WELL AS ACTING ON IT. A surface
     * that offers another WAY IN rather than an install — the
     * "Get the Take App" row, which must appear on the browsers
     * this hook can do nothing for — needs to know the app is
     * already here, and the alternative was a second copy of the
     * standalone check in a component, which `keeps the
     * machinery in one place` below forbids. [D-19, getTheApp]
     */
    expect(OFFER)
      .toMatch(/if \(standalone\) \{ setInstalled\(true\); return undefined; \}/);
  });

  /*
   * SAFARI FIRES NOTHING and is the likeliest phone a performer is
   * holding, so it is told rather than left out.
   */
  it('tells an iPhone what to do instead', () => {
    expect(OFFER).toMatch(/iPad\|iPhone\|iPod/);
    /*
     * THE WORDS MOVED AND THE CLAIM DID NOT. They were a literal
     * in this file; they are now the iOS answer of `installWay`,
     * which is also how an Android and a chat browser get theirs.
     * That the bar RENDERS them is asserted by rendering it, in
     * `install-by-hand.test.ts` — a search of this source could
     * not tell the difference between a surface that draws the
     * steps and one with the feature switched off at its call
     * site. [U-02]
     */
    expect(installWay(IPHONE_UA)?.steps.join(' ')).toMatch(/Add to Home Screen/);
    expect(BAR).toMatch(/way\.steps\.map/);
  });

  /*
   * AND THERE IS EXACTLY ONE COPY OF IT, which is the whole point
   * of the move and the thing that would quietly stop being true.
   * The standalone check and the Chromium event are the two lines
   * a second surface is most likely to re-derive; if either ever
   * appears in a component again, this fails rather than the two
   * drifting apart unnoticed. [D-19]
   */
  it('keeps the machinery in one place', () => {
    const copies = readdirSync(join(ROOT, 'app'),
      { recursive: true, encoding: 'utf8' })
      .filter((name) => name.endsWith('.tsx'))
      .filter((name) => {
        const body = code(join('app', name));
        return /\(display-mode: standalone\)/.test(body)
          || /beforeinstallprompt/.test(body);
      });
    expect(copies, 'use useInstallOffer').toEqual([]);
  });

  /*
   * THE TAKE APP'S BEHAVIOUR DID NOT CHANGE, with one fix taken in
   * passing: `appinstalled` was added and never removed, so a bar
   * that unmounted left a listener holding a dead setState.
   */
  it('removes every listener it added', () => {
    for (const one of ['beforeinstallprompt', 'appinstalled']) {
      expect(OFFER, one).toMatch(
        new RegExp(`removeEventListener\\('${one}'`));
    }
  });
});

describe('a performer has no account', () => {
  /*
   * WHICH IS THE WHOLE PREMISE, so every file the install needs must
   * be reachable without a session. A service worker that 302s to
   * the sign-in page is a registration that silently fails, and a
   * manifest behind a session is an install prompt that never
   * appears.
   */
  it('lets a signed-out phone reach what it needs', () => {
    expect(POLICY).toMatch(/\/\^\\\/take-sw\\\.js\$\//);
    expect(POLICY).toMatch(/\/\^\\\/take-app\\\/\[A-Za-z0-9_\.-\]\+\$\//);
    expect(POLICY).toMatch(/manifest\$\//);
  });

  /*
   * AND THE ICONS ARE NOT UNDER `/take/`. `/take/icon-192.png` has
   * exactly the shape of `/take/<id>.<secret>` — it would be served
   * only because static files are checked first, which is a thing
   * working by accident.
   */
  it('keeps the icons out of the link namespace', () => {
    expect(MANIFEST).toMatch(/'\/take-app\/icon-192\.png'/);
    expect(MANIFEST).not.toMatch(/'\/take\/icon/);
  });
});
