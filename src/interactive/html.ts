/**
 * The interactive page.  [Doctrine D-16, U-14, D-04, U-31]
 *
 * One self-contained document: the published video, an index of the exchanges,
 * and each exchange in full. Picking one seeks the video. Nothing loads from
 * anywhere, nothing is built, and the page is as valid saved to a disk as
 * served from here.
 *
 * THE RULE THIS FILE IS WRITTEN UNDER is that the script is an enhancement and
 * never a requirement. Without JavaScript every exchange is present as text
 * with its timecodes, the video still plays from the start with its captions,
 * and the index is a list of ordinary anchors that jump down the page. With
 * JavaScript those same anchors also seek. A page whose content appears only
 * after a script has run is not an accessible form of anything, and this
 * product already promised one (U-14).
 *
 * WHY IT SHARES THE ARTICLE'S INK. Same typography, same two-colour speaker
 * language (U-20), same dark mode. A reader who follows a link from the
 * article to this should be in the same document, differently arranged —
 * not in a second product with its own design.
 */

import { formatTimecode } from '../domain/time.js';
import type { ShareCard } from '../publish/card.js';
import type { Interactive, InteractiveExchange } from './generate.js';

export interface InteractiveHtmlOptions {
  /** What this page says about itself when somebody shares it. [U-31] */
  share?: { card: ShareCard; pageUrl: string; imageUrl?: string };
  /** The article, for a reader who wants it straight through. */
  articleHref?: string;
  /** A card per exchange, where they have been drawn. [U-30] */
  cardHref?: (index: number) => string;
}

export function renderInteractive(
  doc: Interactive, options: InteractiveHtmlOptions = {},
): string {
  const playable = doc.exchanges.some((exchange) => exchange.seekSeconds !== undefined);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.title)}</title>
<meta name="description" content="${esc(doc.attribution)}">
${options.share ? shareTags(options.share) : ''}<style>${STYLE}</style>
</head>
<body>
<main>
  <header>
    <h1>${esc(doc.title)}</h1>
    <p class="attribution">${esc(doc.attribution)}</p>
    <p class="stats">${esc(statsLine(doc))}</p>
  </header>

${doc.video ? videoHtml(doc.video) : noVideoHtml()}

  <nav aria-label="The exchanges">
    <h2>What is answered, and where</h2>
    <ol class="index">
${doc.exchanges.map((exchange) => indexItem(exchange)).join('\n')}
    </ol>
  </nav>

${doc.exchanges.map((exchange) => exchangeHtml(exchange, options)).join('\n')}

  <footer>
    <h2>How this was made</h2>
    ${doc.provenance.transcriptionEngine
      ? `<p>Transcribed with <code>${esc(doc.provenance.transcriptionEngine)}</code>${
          doc.provenance.transcriptionModel
            ? ` (${esc(doc.provenance.transcriptionModel)})` : ''
        }.</p>`
      : ''}
    <ul>${doc.provenance.notes.map((note) => `<li>${esc(note)}</li>`).join('')}</ul>
    ${options.articleHref
      ? `<p><a href="${esc(options.articleHref)}">Read it straight through</a> —
           the same conversation as a document, to cite or to print.</p>`
      : ''}
    <p class="meta">Generated ${esc(doc.generatedAt.slice(0, 10))} from conversation
      <code>${esc(doc.conversationId)}</code>.</p>
  </footer>
</main>
${playable && doc.video ? `<script>${SCRIPT}</script>` : ''}
</body>
</html>
`;
}

/**
 * Timecodes without their milliseconds.
 *
 * The canonical form carries them because a frame is the unit this product
 * cuts in, and the article prints them because it is a citable document. A
 * reader choosing where to jump does not need a thousandth of a second, and
 * three digits of noise on every line of an index is what stops it being
 * scannable. The frame is still in the markup, on `data-at`.
 */
function clock(timecode: string): string {
  return timecode.slice(0, 8);
}

function statsLine(doc: Interactive): string {
  const n = doc.stats.exchanges;
  return `${n} exchange${n === 1 ? '' : 's'}`
    + ` · source runs ${clock(formatTimecode(doc.source.durationFrames))}`
    + ` · ${Math.round(doc.stats.sourceRatio * 100)}% of the finished video is source material`;
}

/**
 * The player.
 *
 * `preload="metadata"` and no autoplay: this page is often opened to be read
 * rather than watched, and a video that starts talking is a page people close.
 */
function videoHtml(video: NonNullable<Interactive['video']>): string {
  return `  <div class="player">
    <video id="v" controls preload="metadata" playsinline>
      <source src="${esc(video.src)}" type="video/mp4">
      ${video.captions
        ? `<track kind="captions" srclang="en" label="Captions" default
             src="${esc(video.captions)}">`
        : ''}
    </video>
    <p class="meta playing" id="now">Pick a moment below, or press play.</p>
  </div>`;
}

/**
 * What the page says when there is no video to play.
 *
 * Not an error and not an empty frame: a draft, or a conversation published
 * before it had a render, is still a readable argument. Saying so is better
 * than a player that fails to load. [D-03]
 */
function noVideoHtml(): string {
  return `  <p class="novideo">This conversation has not published a video yet.
    Everything said is below.</p>`;
}

function indexItem(exchange: InteractiveExchange): string {
  /*
   * WHERE IT PLAYS, not where it was said. The index exists to get a reader
   * to a moment in the video, and a list of source timecodes next to a
   * player showing output time is a list that sends people to the wrong
   * place. The source moment is on the exchange itself, where it is a
   * citation rather than a destination. [U-08]
   */
  const stamp = exchange.outputTimecode ?? exchange.timecode;
  const what = exchange.claim
    ? exchange.claim.text
    : exchange.context ?? `At ${clock(exchange.timecode)} in the source`;
  return `      <li><a href="#e${exchange.index}"${
    exchange.seekSeconds !== undefined ? ` data-at="${exchange.seekSeconds}"` : ''
  }><span class="stamp">${esc(clock(stamp))}</span>
        <span class="kind">${esc(exchange.typeLabel)}</span>
        <span class="what">${esc(clip(what, 90))}</span></a></li>`;
}

function exchangeHtml(
  exchange: InteractiveExchange, options: InteractiveHtmlOptions,
): string {
  const seek = exchange.seekSeconds !== undefined
    ? `<button type="button" class="seek" data-at="${exchange.seekSeconds}">Play this</button>`
    : '';

  /*
   * The claim is quoted only when the author bound one; otherwise the page
   * gives the sentence the source was on, labelled as context rather than as
   * a quotation. The same distinction the article draws, and for the same
   * reason: a hash-backed sentence and an inferred one are different claims
   * about the world. [INV-05]
   */
  const claim = exchange.claim
    ? `<blockquote class="claim"><p>${esc(exchange.claim.text)}</p>
         <cite>Source at <time>${esc(clock(exchange.claim.timecode))}</time></cite></blockquote>`
    : exchange.context
      ? `<blockquote class="context"><p>${esc(exchange.context)}</p>
           <cite>At this point in the source</cite></blockquote>`
      : '';

  const response = exchange.response.text
    ? `<div class="response"><p>${esc(exchange.response.text)}</p></div>`
    : `<div class="response empty"><p>${
        esc(clock(formatTimecode(exchange.response.durationFrames)))
      } of spoken response; no transcript available.</p></div>`;

  /*
   * The marks are SAID rather than shown. They are drawn on the video, which
   * this page plays; repeating them as a picture would be a second rendering
   * of the same thing, and the one place they are authoritative is the frame.
   * Saying how many there are tells a reader watching without sound that
   * something on screen is being pointed at. [U-12, D-04]
   */
  const marks = exchange.marks > 0
    ? `<p class="meta marks">${exchange.marks === 1
        ? 'One mark on the frame' : `${exchange.marks} marks on the frame`} in this response.</p>`
    : '';

  const citations = exchange.citations?.length
    ? `<section class="citations"><h3>Evidence</h3><ol>${
        exchange.citations.map((citation) => {
          const name = citation.url
            ? `<a href="${esc(citation.url)}" rel="nofollow noreferrer">${esc(citation.title)}</a>`
            : esc(citation.title);
          const meta = [
            citation.page !== undefined ? `p.&nbsp;${citation.page}` : '',
            `retrieved <time>${esc(citation.retrievedAt.slice(0, 10))}</time>`,
            citation.contentHash ? `<code>${esc(citation.contentHash.slice(0, 12))}</code>` : '',
            citation.archived ? '' : '<strong>not archived</strong>',
          ].filter(Boolean).join(' · ');
          const quote = citation.quote ? `<q>${esc(citation.quote)}</q>` : '';
          return `<li>${name}<div class="meta">${meta}</div>${quote}</li>`;
        }).join('')
      }</ol></section>`
    : '';

  const card = options.cardHref
    ? `<p class="meta"><a href="${esc(options.cardHref(exchange.index))}">
         This exchange as a card</a></p>`
    : '';

  /*
   * The heading carries the VIDEO position, beside the button that goes
   * there. The source moment is under the quotation, as `Source at …`, where
   * it is what it actually is: the citation for the sentence above it. The
   * first version printed the source time in both places, which read as one
   * number rendered twice rather than as two different facts.
   */
  const at = exchange.outputTimecode
    ? `<span class="stamp" title="Where this plays in the video">${
        esc(clock(exchange.outputTimecode))}</span>`
    : `<span class="stamp muted" title="Not in the finished video">—</span>`;

  return `  <article id="e${exchange.index}">
    <h2><span class="kind">${esc(exchange.typeLabel)}</span>
      ${at} ${seek}</h2>
    ${claim}
    ${response}
    ${marks}
    ${citations}
    ${card}
  </article>`;
}

function shareTags(
  share: { card: ShareCard; pageUrl: string; imageUrl?: string },
): string {
  const { card } = share;
  return [
    `<meta property="og:type" content="video.other">`,
    `<meta property="og:title" content="${esc(card.title)}">`,
    `<meta property="og:description" content="${esc(card.description)}">`,
    `<meta property="og:url" content="${esc(share.pageUrl)}">`,
    ...(share.imageUrl ? [
      `<meta property="og:image" content="${esc(share.imageUrl)}">`,
      `<meta property="og:image:width" content="${card.image.width}">`,
      `<meta property="og:image:height" content="${card.image.height}">`,
      `<meta property="og:image:alt" content="${esc(card.image.alt)}">`,
      `<meta name="twitter:card" content="summary_large_image">`,
    ] : [`<meta name="twitter:card" content="summary">`]),
  ].join('\n') + '\n';
}

function clip(text: string, limit: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit - 1);
  const space = cut.lastIndexOf(' ');
  return `${space > limit * 0.6 ? cut.slice(0, space) : cut}…`;
}

/** Everything that reaches the document is escaped. It is all user or engine text. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * The only script on the page, and everything it does is optional.
 *
 * It reads the seek point out of the markup rather than being handed a table
 * of its own: one source of truth for where each exchange starts, and it is
 * the same attribute a reader's browser can see. No strings are built from
 * document content, so there is nothing here that can be made to run.
 */
const SCRIPT = `
(function () {
  var video = document.getElementById('v');
  var now = document.getElementById('now');
  if (!video) return;

  /*
   * What the player actually occupies, rather than what it is allowed to.
   * Re-measured on resize and once the video knows its own shape, because a
   * 16:9 video in a narrow column is half the height the CSS fallback assumes
   * and the difference is a screen of empty space above every heading.
   */
  var player = document.querySelector('.player');
  function measure() {
    if (!player) return;
    document.documentElement.style.setProperty(
      '--player', (player.getBoundingClientRect().height + 12) + 'px');
  }
  measure();
  window.addEventListener('resize', measure);
  video.addEventListener('loadedmetadata', measure);

  function go(seconds, label) {
    video.currentTime = seconds;
    var playing = video.play();
    if (playing && playing.catch) playing.catch(function () {});
    if (now && label) now.textContent = 'Playing: ' + label;
  }

  document.addEventListener('click', function (event) {
    var target = event.target.closest('[data-at]');
    if (!target) return;
    var at = parseFloat(target.getAttribute('data-at'));
    if (isNaN(at)) return;
    // The anchor still moves the page; this only adds the seek, so a reader
    // who lands on an exchange sees it and hears it.
    go(at, (target.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 80));
  });
})();
`;

const STYLE = `
:root {
  --ink: #17191c; --muted: #5d646d; --line: #d9dde2; --bg: #ffffff;
  --source: #3c5a73; --user: #a35a34; --panel: #f6f7f9;
}
@media (prefers-color-scheme: dark) {
  :root { --ink: #e8eaed; --muted: #9aa1aa; --line: #2a2e33; --bg: #0e0f11;
          --source: #7f9bb5; --user: #c2794f; --panel: #17191c; }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font: 17px/1.65 Georgia, "Iowan Old Style", "Times New Roman", serif; }
main { max-width: 46rem; margin: 0 auto; padding: 2.5rem 1.25rem 5rem; }
h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 .5rem; }
h2 { font-size: 1.05rem; margin: 2.25rem 0 .75rem;
  font-family: ui-sans-serif, system-ui, sans-serif; letter-spacing: .01em; }
.attribution, .stats, .meta { font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: .82rem; color: var(--muted); margin: .25rem 0; }
header { border-bottom: 1px solid var(--line); padding-bottom: 1.25rem; }

/* The player stays put while the argument scrolls past it: picking an
   exchange is pointless if it seeks a video that has scrolled away. */
.player { position: sticky; top: 0; z-index: 2; background: var(--bg);
  padding: .75rem 0; border-bottom: 1px solid var(--line); }
.player video { width: 100%; max-height: 52vh; background: #000; border-radius: 4px;
  display: block; }
.playing { margin: .4rem 0 0; }
.novideo { font-family: ui-sans-serif, system-ui, sans-serif; font-size: .9rem;
  color: var(--muted); padding: 1rem; background: var(--panel); border-radius: 4px; }

nav .index { list-style: none; margin: 0; padding: 0;
  font-family: ui-sans-serif, system-ui, sans-serif; font-size: .9rem; }
nav .index li { border-bottom: 1px solid var(--line); }
nav .index a { display: flex; gap: .6rem; align-items: baseline; padding: .55rem .2rem;
  color: inherit; text-decoration: none; }
nav .index a:hover, nav .index a:focus { background: var(--panel); }
nav .index .what { color: var(--muted); }

.kind { display: inline-block; font-size: .7rem; letter-spacing: .08em;
  padding: .18rem .5rem; border-radius: 3px; color: var(--bg); background: var(--user);
  font-family: ui-sans-serif, system-ui, sans-serif; }
.stamp { font-family: ui-monospace, monospace; font-size: .8rem; color: var(--source); }
.stamp.muted { color: var(--muted); }
.seek { font-family: ui-sans-serif, system-ui, sans-serif; font-size: .75rem;
  padding: .2rem .55rem; border: 1px solid var(--line); border-radius: 3px;
  background: var(--panel); color: var(--ink); cursor: pointer; }
.seek:hover { border-color: var(--source); }

blockquote { margin: 0 0 1rem; padding: .85rem 1rem; background: var(--panel);
  border-left: 3px solid var(--source); }
blockquote p { margin: 0; font-style: italic; }
blockquote cite { display: block; margin-top: .5rem; font-style: normal;
  font-family: ui-sans-serif, system-ui, sans-serif; font-size: .78rem; color: var(--muted); }
.response { border-left: 3px solid var(--user); padding-left: 1rem; margin-bottom: .5rem; }
.response.empty p { color: var(--muted); font-style: italic; }
/* The player is sticky, so an anchor that jumps to an exchange would land it
   underneath one. The script measures the player and sets --player to its real
   height; this value is the fallback for a reader without one, chosen to clear
   the tallest the player is allowed to be rather than the height it usually
   has. Too much space above a heading is a worse read; being hidden behind a
   video is not a read at all. */
article { padding-bottom: 1.25rem; border-bottom: 1px solid var(--line);
  scroll-margin-top: var(--player, 58vh); }
.citations h3 { font-family: ui-sans-serif, system-ui, sans-serif; font-size: .78rem;
  letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: .75rem 0 .35rem; }
.citations ol { margin: 0; padding-left: 1.2rem; font-size: .92rem; }
.citations li { margin-bottom: .5rem; }
.citations q { display: block; margin-top: .2rem; font-style: italic; color: var(--muted); }
footer { margin-top: 2.5rem; padding-top: 1.5rem; border-top: 1px solid var(--line); }
footer ul { font-family: ui-sans-serif, system-ui, sans-serif; font-size: .82rem;
  color: var(--muted); padding-left: 1.1rem; }
code { font-family: ui-monospace, monospace; font-size: .85em; }
/* Printed, it is the article: the player is not a thing on paper. */
@media print {
  body { background: #fff; color: #000; }
  .player, nav, .seek { display: none; }
}
`;
