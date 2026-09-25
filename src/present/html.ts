/**
 * Presentation mode.  [Doctrine D-16, INV-00, U-08, D-04]
 *
 * TWO SURFACES, ONE RECORD. The STAGE is what the room sees: the source,
 * full-bleed on black, stopping at the frames the author interrupted. The
 * PRESENTER view is what the speaker sees on their own screen: the stop
 * coming up, the claim, the argument they made last time, the documents to
 * put on the wall, and a clock. They are the same page, opened twice, talking
 * to each other over a `BroadcastChannel` — no server, no socket, no state
 * that outlives the window.
 *
 * THE STOP IS THE PRODUCT. Everything else here is furniture. The source must
 * stop ON the frame the author interrupted, not a third of a second later, or
 * it stops after the sentence it is about to argue with. `timeupdate` fires
 * about four times a second, which is not good enough for that, so the frame
 * is watched with `requestAnimationFrame` and the pause is followed by an
 * exact seek. [U-08, INV-02]
 *
 * WITHOUT JAVASCRIPT THERE IS NO PRESENTATION, and unlike the article and the
 * interactive page this one does not pretend otherwise: it is a control
 * surface for a live performance, not a document. What it does instead is say
 * so and hand the reader the document, which exists. [D-04]
 */

import type { Presentation, PresentationStop } from './generate.js';

export interface PresentHtmlOptions {
  /** The article, for a reader who arrived here wanting to read. */
  articleHref?: string;
}

export function renderPresentation(
  doc: Presentation, options: PresentHtmlOptions = {},
): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)} — presenting</title>
<meta name="robots" content="noindex">
<style>${STYLE}</style>
</head>
<body data-role="stage">
<noscript>
  <div class="noscript">
    <h1>${esc(doc.title)}</h1>
    <p>Presentation mode is a live control surface — it needs JavaScript to
      stop the source where you interrupted it.</p>
    ${options.articleHref
      ? `<p><a href="${esc(options.articleHref)}">Read the conversation instead</a>
           — the whole argument, as a document.</p>`
      : ''}
    <ol>${doc.stops.map((stop) => `<li><code>${esc(stop.timecode)}</code>
      ${esc(stop.label)}${stop.claim ? ` — ${esc(stop.claim.text)}` : ''}</li>`).join('')}</ol>
  </div>
</noscript>

<main id="stage" hidden>
  ${doc.source.src
    ? /*
       * `src` on the element, and NO declared type.
       *
       * The source route decides the format: the editing proxy is WebM and
       * the mezzanine is MP4, and which one is served is the route's
       * business, not this page's. A `<source type="video/mp4">` here made
       * the browser reject a WebM proxy WITHOUT REQUESTING IT — no error, no
       * network entry, an element that simply never loaded. Letting the
       * server's own content type decide is both correct and the only version
       * that cannot go stale when the route changes.
       */
      `<video id="v" preload="auto" playsinline src="${esc(doc.source.src)}"></video>`
    : `<div class="nosource">The source is still being prepared.</div>`}

  <!-- What the room reads while the source is stopped. Typography over the
       frozen frame, which is what the composed video does at the same
       moment — the live form of the same thing. -->
  <div id="held" class="held" hidden>
    <p class="eyebrow" id="held-label"></p>
    <p class="claim" id="held-claim"></p>
  </div>

  <div id="docs" class="docs" hidden>
    <h2 id="docs-title"></h2>
    <ul id="docs-list"></ul>
  </div>

  <!-- Deliberately faint and always present: a room should be able to see
       whose source this is without the presenter saying it. [INV-07, U-21] -->
  <p class="credit">${esc(doc.attribution)}</p>

  <div class="bar" id="bar">
    <button data-act="back" title="Previous stop (←)">◀</button>
    <button data-act="play" id="play" title="Play / stop (space)">▶</button>
    <button data-act="next" title="Next stop (→)">▶|</button>
    <span class="at" id="at">—</span>
    <button data-act="docs" title="Show the documents (E)">Docs</button>
    <button data-act="presenter" title="Open the presenter view (P)">Presenter</button>
    <button data-act="full" title="Full screen (F)">⛶</button>
  </div>
</main>

<section id="presenter" hidden>
  <header>
    <h1>${esc(doc.title)}</h1>
    <p class="meta">${esc(doc.attribution)}</p>
    <p class="meta" id="budget">${esc(budgetLine(doc))}</p>
  </header>
  <div class="now">
    <div class="pane">
      <h2>Now</h2>
      <div id="p-now" class="card"></div>
    </div>
    <div class="pane">
      <h2>Next</h2>
      <div id="p-next" class="card next"></div>
    </div>
  </div>
  <div class="pane">
    <h2>Every stop</h2>
    <ol class="stops" id="p-stops">
${doc.stops.map((stop) => stopRow(stop)).join('\n')}
    </ol>
  </div>
  <p class="meta keys">space play/stop · ← → between stops · E documents
    · R play the recording · F full screen</p>
</section>

<script id="data" type="application/json">${
  // Serialised rather than interpolated into code: the only way a title
  // containing a quotation mark reaches the script without being able to end
  // it. `</script>` inside the JSON is escaped for the same reason.
  JSON.stringify(doc).replace(/</g, '\\u003c')
}</script>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

function budgetLine(doc: Presentation): string {
  /*
   * Rounded to minutes, EXCEPT when that rounds to nothing. A presenter
   * planning a lecture wants "42 min", not "42 min 17 s" — but a short
   * source rounded to minutes reads "source runs 0 min", which is not a
   * shorter way of saying twenty seconds, it is wrong.
   */
  const clock = (seconds: number) => seconds < 90
    ? `${Math.round(seconds)} sec`
    : `${Math.round(seconds / 60)} min`;
  const parts = [
    `${doc.budget.stops} stop${doc.budget.stops === 1 ? '' : 's'}`,
    `source runs ${clock(doc.budget.sourceSeconds)}`,
  ];
  /*
   * What it took last time, which is the number a person planning a fifty
   * minute lecture actually needs. Said as "last time" rather than as an
   * estimate: it is a measurement of the recording, not a prediction of the
   * room.
   */
  if (doc.budget.recordedSeconds > 0) {
    parts.push(`you spoke for ${clock(doc.budget.recordedSeconds)} of it last time`);
  }
  return parts.join(' · ');
}

function stopRow(stop: PresentationStop): string {
  const what = stop.claim
    ? (stop.claim.quoted ? `“${stop.claim.text}”` : stop.claim.text)
    : 'At this point in the source';
  return `      <li data-index="${stop.index}" data-at="${stop.atSeconds}">
        <button type="button" data-act="goto" data-index="${stop.index}">
          <span class="stamp">${esc(stop.timecode)}</span>
          <span class="kind">${esc(stop.label)}</span>
          <span class="what">${esc(clip(what, 80))}</span>
        </button>
      </li>`;
}

function clip(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > limit * 0.6 ? cut.slice(0, space) : cut}…`;
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * The whole of presentation mode, and none of it decides anything.
 *
 * Every number it uses — where to stop, what to say, which document — comes
 * out of the JSON the page was served with, which came from the Conversation.
 * The script's job is a video element, a keyboard and two windows. [INV-00]
 */
const SCRIPT = String.raw`
(function () {
  var doc = JSON.parse(document.getElementById('data').textContent);
  var params = new URLSearchParams(location.search);
  var isPresenter = params.get('presenter') === '1';

  document.body.dataset.role = isPresenter ? 'presenter' : 'stage';
  document.getElementById(isPresenter ? 'presenter' : 'stage').hidden = false;

  /*
   * The two windows talk over a channel scoped to this conversation, so two
   * presentations open at once do not drive each other. Same origin, no
   * server: closing the window ends it, which is the right lifetime for a
   * thing that exists while somebody is standing up.
   */
  var channel = null;
  try { channel = new BroadcastChannel('bv-present-' + doc.conversationId); }
  catch (e) { channel = null; }

  var video = document.getElementById('v');
  var stops = doc.stops;
  var armed = null;     // the stop we are currently running towards
  var held = null;      // the stop we are stopped AT

  /* ---- the stage ------------------------------------------------------ */

  function nextStopAfter(seconds) {
    for (var i = 0; i < stops.length; i++) {
      // A hair of tolerance, because seeking lands within a frame and a stop
      // we have just released must not immediately re-arm itself.
      if (stops[i].atSeconds > seconds + 0.05) return stops[i];
    }
    return null;
  }

  /*
   * Watch the clock at frame rate, not at the video element's convenience.
   *
   * 'timeupdate' fires about four times a second: at 30fps that is up to
   * seven frames of overshoot, which lands the pause after the sentence being
   * argued with. rAF runs with the compositor, and the exact seek afterwards
   * makes the held frame the author's frame rather than whichever one the
   * pause happened to catch. [U-08, INV-02]
   */
  function watch() {
    if (video && !video.paused && armed && video.currentTime >= armed.atSeconds) {
      stopAt(armed);
    }
    requestAnimationFrame(watch);
  }

  function stopAt(stop) {
    if (!video) return;
    video.pause();
    // The MIDDLE of the author's frame, not its edge: seeking to the boundary
    // lands in the frame before it at any precision the player rounds at.
    video.currentTime = stop.holdSeconds;
    held = stop;
    armed = null;
    show(stop);
    broadcast();
  }

  function show(stop) {
    var panel = document.getElementById('held');
    if (!panel) return;
    if (!stop || !stop.claim) { panel.hidden = true; return; }
    document.getElementById('held-label').textContent = stop.label.toUpperCase();
    // Quotation marks only for a statement the author BOUND. An inferred
    // sentence is context for the presenter, never a quotation on a wall.
    document.getElementById('held-claim').textContent = stop.claim.quoted
      ? '“' + stop.claim.text + '”'
      : stop.claim.text;
    panel.hidden = false;
  }

  function resume() {
    if (!video) return;
    document.getElementById('held').hidden = true;
    document.getElementById('docs').hidden = true;
    held = null;
    armed = nextStopAfter(video.currentTime);
    video.play().catch(function () {});
    broadcast();
  }

  function toggle() {
    if (!video) return;
    if (video.paused) resume();
    else { video.pause(); broadcast(); }
  }

  function goto_(index) {
    var stop = stops[index - 1];
    if (!stop || !video) return;
    stopAt(stop);
  }

  function step(delta) {
    var at = video ? video.currentTime : 0;
    var current = held ? held.index : 0;
    if (!current) {
      for (var i = 0; i < stops.length; i++) {
        if (stops[i].atSeconds <= at + 0.05) current = stops[i].index;
      }
    }
    var target = Math.min(stops.length, Math.max(1, current + delta));
    if (target >= 1 && stops.length) goto_(target);
  }

  function documents() {
    var panel = document.getElementById('docs');
    if (!panel) return;
    var stop = held || null;
    if (!stop || !stop.evidence.length) { panel.hidden = true; return; }
    if (!panel.hidden) { panel.hidden = true; return; }
    document.getElementById('docs-title').textContent =
      stop.evidence.length === 1 ? 'The document' : 'The documents';
    var list = document.getElementById('docs-list');
    list.textContent = '';
    stop.evidence.forEach(function (item) {
      var li = document.createElement('li');
      var title = document.createElement('strong');
      title.textContent = item.title;
      li.appendChild(title);
      if (item.quote) {
        var q = document.createElement('q');
        q.textContent = item.quote;
        li.appendChild(q);
      }
      var meta = document.createElement('span');
      meta.className = 'meta';
      // Said on the wall, because a citation with no retrieval date is not a
      // citation, and one that failed to archive must say so. [U-33 §4]
      meta.textContent = (item.page !== undefined ? 'p. ' + item.page + ' · ' : '')
        + 'retrieved ' + item.retrievedAt.slice(0, 10)
        + (item.archived ? '' : ' · not archived');
      li.appendChild(meta);
      list.appendChild(li);
    });
    panel.hidden = false;
  }

  /*
   * Play what was recorded, rather than saying it again.
   *
   * A guest who cannot be in the room, a take the author is happy with, a
   * demonstration. The source is left exactly where it was stopped, so the
   * presentation continues afterwards from the same frame.
   */
  var playback = null;
  function playRecording() {
    if (!held || !held.takeSrc) return;
    if (playback) { playback.pause(); playback.remove(); playback = null; return; }
    playback = document.createElement('video');
    playback.src = held.takeSrc;
    playback.className = 'playback';
    playback.controls = true;
    playback.autoplay = true;
    playback.onended = function () {
      if (playback) { playback.remove(); playback = null; }
    };
    document.getElementById('stage').appendChild(playback);
  }

  function fullscreen() {
    var el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
  }

  function openPresenter() {
    window.open(location.pathname + '?presenter=1', 'bv-presenter',
      'width=980,height=760');
  }

  /* ---- what the presenter sees ---------------------------------------- */

  function card(stop, into) {
    into.textContent = '';
    if (!stop) {
      into.textContent = 'Nothing — the source runs to the end.';
      return;
    }
    var head = document.createElement('p');
    head.className = 'meta';
    head.textContent = stop.timecode + ' · ' + stop.label
      + (stop.recordedSeconds ? ' · you took ' + Math.round(stop.recordedSeconds) + 's' : '')
      + (stop.marks ? ' · ' + stop.marks + ' mark' + (stop.marks === 1 ? '' : 's') : '');
    into.appendChild(head);

    if (stop.claim) {
      var claim = document.createElement('blockquote');
      claim.textContent = stop.claim.quoted
        ? '“' + stop.claim.text + '”' : stop.claim.text;
      if (!stop.claim.quoted) claim.className = 'context';
      into.appendChild(claim);
    }
    if (stop.prompt) {
      var prompt = document.createElement('p');
      prompt.className = 'prompt';
      prompt.textContent = stop.prompt;
      into.appendChild(prompt);
    } else {
      var none = document.createElement('p');
      none.className = 'prompt muted';
      // Honest rather than blank: the stop is the anchor, not the note.
      none.textContent = stop.recordedSeconds
        ? 'Recorded, not transcribed — no prompt for this one.'
        : 'Nothing recorded here yet. The source still stops.';
      into.appendChild(none);
    }
    if (stop.evidence.length) {
      var ul = document.createElement('ul');
      ul.className = 'ev';
      stop.evidence.forEach(function (item) {
        var li = document.createElement('li');
        li.textContent = item.title + (item.page !== undefined ? ' (p. ' + item.page + ')' : '');
        ul.appendChild(li);
      });
      into.appendChild(ul);
    }
  }

  function paintPresenter(state) {
    if (!isPresenter) return;
    var nowStop = state.heldIndex ? stops[state.heldIndex - 1] : null;
    card(nowStop, document.getElementById('p-now'));
    var upcoming = null;
    for (var i = 0; i < stops.length; i++) {
      if (stops[i].atSeconds > (state.at || 0) + 0.05) { upcoming = stops[i]; break; }
    }
    card(upcoming, document.getElementById('p-next'));

    var rows = document.querySelectorAll('#p-stops li');
    for (var j = 0; j < rows.length; j++) {
      var index = Number(rows[j].dataset.index);
      rows[j].dataset.state = state.heldIndex === index ? 'held'
        : (upcoming && upcoming.index === index) ? 'next' : '';
    }
  }

  /* ---- the two windows ------------------------------------------------ */

  function broadcast() {
    if (!channel || isPresenter) return;
    channel.postMessage({
      kind: 'state',
      at: video ? video.currentTime : 0,
      paused: video ? video.paused : true,
      heldIndex: held ? held.index : 0,
    });
    var at = document.getElementById('at');
    if (at) {
      at.textContent = held
        ? 'stopped at ' + held.timecode + ' (' + held.index + ' of ' + stops.length + ')'
        : (video && !video.paused ? 'playing' : 'paused');
    }
    var play = document.getElementById('play');
    if (play) play.textContent = (video && video.paused) ? '▶' : '‖';
  }

  if (channel) {
    channel.onmessage = function (event) {
      var message = event.data || {};
      if (message.kind === 'state' && isPresenter) paintPresenter(message);
      if (message.kind === 'act' && !isPresenter) act(message.act, message.index);
      // A presenter window opened mid-talk needs the current state; the stage
      // answers rather than the presenter guessing.
      if (message.kind === 'hello' && !isPresenter) broadcast();
    };
    if (isPresenter) channel.postMessage({ kind: 'hello' });
  }

  function act(name, index) {
    if (isPresenter) {
      // The presenter window never drives a video of its own; it asks.
      if (channel) channel.postMessage({ kind: 'act', act: name, index: index });
      return;
    }
    if (name === 'play') toggle();
    else if (name === 'next') step(1);
    else if (name === 'back') step(-1);
    else if (name === 'goto') goto_(index);
    else if (name === 'docs') documents();
    else if (name === 'recording') playRecording();
    else if (name === 'full') fullscreen();
    else if (name === 'presenter') openPresenter();
  }

  document.addEventListener('click', function (event) {
    var target = event.target.closest('[data-act]');
    if (!target) return;
    event.preventDefault();
    act(target.dataset.act, Number(target.dataset.index || 0));
  });

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var key = event.key;
    var map = { ' ': 'play', ArrowRight: 'next', ArrowLeft: 'back',
      e: 'docs', E: 'docs', r: 'recording', R: 'recording',
      f: 'full', F: 'full', p: 'presenter', P: 'presenter' };
    if (!map[key]) return;
    // Presenter and stage share the keyboard, and only one of them owns a
    // video: 'act' routes it. The default is prevented so space does not also
    // scroll the page out from under the person presenting.
    event.preventDefault();
    act(map[key], 0);
  });

  if (video) {
    armed = stops.length ? stops[0] : null;
    video.addEventListener('play', broadcast);
    video.addEventListener('pause', broadcast);
    video.addEventListener('seeked', broadcast);
    requestAnimationFrame(watch);
    broadcast();
  }
  if (isPresenter) paintPresenter({ at: 0, paused: true, heldIndex: 0 });
})();
`;

const STYLE = `
:root { --ink:#f2f3f5; --muted:#9aa1aa; --line:#2a2e33; --bg:#08090b;
        --source:#7f9bb5; --user:#c2794f; --panel:#15171a; --gold:#c8a24a; }
* { box-sizing: border-box; }
/*
 * The "hidden" attribute must actually hide.
 *
 * "#stage { display:flex }" is more specific than the user agent's
 * "[hidden] { display:none }", so the presenter window rendered the stage as
 * well — a second copy of the source, playing its audio into the room from
 * the speaker's own laptop. Only visible by opening the window and looking.
 */
[hidden] { display: none !important; }
html, body { height: 100%; }
body { margin:0; background:var(--bg); color:var(--ink);
  font: 16px/1.6 ui-sans-serif, system-ui, sans-serif; }

/* ---- the stage: black, and the picture is the point ------------------- */
#stage { position:relative; height:100%; display:flex; align-items:center;
  justify-content:center; background:#000; }
#stage video#v { width:100%; height:100%; object-fit:contain; background:#000; }
.nosource { color:var(--muted); }

/* Typography over the frozen frame — the live form of what the composed
   video burns in at the same moment. */
.held { position:absolute; inset:0; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:1rem; padding:6vw;
  background:rgba(8,9,11,.82); text-align:center; }
.held .eyebrow { margin:0; color:var(--gold); letter-spacing:.14em;
  font-size:clamp(.7rem,1.4vw,1rem); font-weight:700; }
.held .claim { margin:0; font-size:clamp(1.4rem,4.2vw,3.4rem); line-height:1.25;
  font-style:italic; max-width:22ch; }

.docs { position:absolute; right:3vw; bottom:12vh; max-width:min(46ch,44vw);
  background:var(--panel); border:1px solid var(--line); border-radius:6px;
  padding:1rem 1.15rem; }
.docs h2 { margin:0 0 .5rem; font-size:.75rem; letter-spacing:.1em;
  text-transform:uppercase; color:var(--muted); }
.docs ul { margin:0; padding:0; list-style:none; font-size:.95rem; }
.docs li { padding:.4rem 0; border-top:1px solid var(--line); }
.docs li:first-child { border-top:0; }
.docs q { display:block; font-style:italic; color:var(--muted); margin:.2rem 0; }
.docs .meta { display:block; font-size:.75rem; color:var(--muted); }

.playback { position:absolute; right:3vw; bottom:12vh; width:min(40vw,520px);
  border-radius:6px; background:#000; }

.credit { position:absolute; left:2vw; bottom:1.2vh; margin:0;
  font-size:.7rem; color:rgba(242,243,245,.42); max-width:60vw; }

/* The bar fades out of a running presentation and comes back on a mouse. */
.bar { position:absolute; left:50%; transform:translateX(-50%); bottom:2vh;
  display:flex; gap:.4rem; align-items:center; padding:.4rem .5rem;
  background:rgba(21,23,26,.9); border:1px solid var(--line); border-radius:8px;
  opacity:0; transition:opacity .25s; }
#stage:hover .bar, .bar:focus-within { opacity:1; }
.bar button { background:transparent; color:var(--ink); border:1px solid transparent;
  border-radius:5px; padding:.25rem .5rem; font-size:.85rem; cursor:pointer; }
.bar button:hover { border-color:var(--line); background:var(--panel); }
.bar .at { color:var(--muted); font-size:.78rem; padding:0 .5rem;
  font-family:ui-monospace,monospace; }

/* ---- the presenter's own screen --------------------------------------- */
#presenter { max-width:64rem; margin:0 auto; padding:1.5rem 1.25rem 3rem; }
#presenter h1 { font-size:1.4rem; margin:0 0 .25rem; }
#presenter h2 { font-size:.72rem; letter-spacing:.1em; text-transform:uppercase;
  color:var(--muted); margin:0 0 .5rem; }
.meta { color:var(--muted); font-size:.8rem; margin:.15rem 0; }
.now { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin:1.25rem 0; }
@media (max-width:820px) { .now { grid-template-columns:1fr; } }
.card { background:var(--panel); border:1px solid var(--line); border-radius:6px;
  padding:1rem; min-height:9rem; }
.card.next { opacity:.72; }
.card blockquote { margin:.5rem 0; padding-left:.8rem; font-style:italic;
  border-left:3px solid var(--source); }
.card blockquote.context { border-left-style:dashed; color:var(--muted); }
/* The prompt is set large: it is read at a glance, by someone standing up,
   from a laptop a metre away. */
.card .prompt { font-size:1.05rem; line-height:1.55; margin:.5rem 0 0;
  border-left:3px solid var(--user); padding-left:.8rem; }
.card .prompt.muted { color:var(--muted); font-style:italic; font-size:.92rem; }
.card .ev { margin:.6rem 0 0; padding-left:1.1rem; font-size:.85rem; color:var(--muted); }
.pane { min-width:0; }
.stops { list-style:none; margin:0; padding:0; }
.stops li { border-top:1px solid var(--line); }
.stops button { display:flex; gap:.7rem; align-items:baseline; width:100%;
  text-align:left; background:transparent; border:0; color:inherit;
  padding:.5rem .3rem; cursor:pointer; font:inherit; }
.stops button:hover { background:var(--panel); }
.stops li[data-state="held"] button { background:rgba(200,162,74,.14); }
.stops li[data-state="next"] button { background:rgba(127,155,181,.10); }
.stops .stamp { font-family:ui-monospace,monospace; font-size:.8rem; color:var(--source); }
.stops .kind { font-size:.65rem; letter-spacing:.08em; padding:.1rem .4rem;
  border-radius:3px; background:var(--user); color:#0e0f11; }
.stops .what { color:var(--muted); font-size:.9rem; }
.keys { margin-top:1.5rem; font-family:ui-monospace,monospace; font-size:.72rem; }

.noscript { max-width:42rem; margin:0 auto; padding:3rem 1.25rem; }
.noscript ol { color:var(--muted); font-size:.9rem; }
`;
