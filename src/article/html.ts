/**
 * The article as a self-contained HTML document.  [Doctrine U-14, D-04]
 *
 * "The article transcript is the accessible form of every conversation --
 *  full parity of content, not a summary." So this is a real document:
 * semantic headings, real <blockquote> for quoted claims, <time> for
 * timestamps, readable at any width, legible in both colour schemes, and
 * printable. No scripts, nothing to load.
 *
 * Speaker identity uses the one visual language (U-20) and carries it by shape
 * and position as well as colour, so it survives greyscale.
 */

import { formatTimecode, HOUSE_FPS } from '../domain/time.js';
import type { Article, ArticleExchange } from './types.js';

export interface HtmlOptions {
  /** Deep links back into the editor at the anchored frame. */
  conversationHref?: (frame: number) => string;
}

export function renderHtml(article: Article, options: HtmlOptions = {}): string {
  const body = article.exchanges.map((e) => exchangeHtml(e, options)).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(article.title)}</title>
<meta name="description" content="${esc(article.attribution)}">
<style>${STYLE}</style>
</head>
<body>
<main>
  <header>
    <h1>${esc(article.title)}</h1>
    <p class="attribution">${esc(article.attribution)}</p>
    <p class="stats">
      ${article.stats.exchanges} exchange${article.stats.exchanges === 1 ? '' : 's'}
      · source runs ${esc(formatTimecode(article.source.durationFrames))}
      · ${Math.round(article.stats.sourceRatio * 100)}% of the finished video is source material
    </p>
  </header>
${body}
  <footer>
    <h2>How this was made</h2>
    ${article.provenance.transcriptionEngine
      ? `<p>Transcribed with <code>${esc(article.provenance.transcriptionEngine)}</code>${
          article.provenance.transcriptionModel ? ` (${esc(article.provenance.transcriptionModel)})` : ''
        }${article.provenance.transcriptVersion ? `, transcript v${article.provenance.transcriptVersion}` : ''}.</p>`
      : ''}
    <ul>${article.provenance.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    <p class="meta">Generated ${esc(article.generatedAt.slice(0, 10))} from conversation
      <code>${esc(article.conversationId)}</code>.</p>
  </footer>
</main>
</body>
</html>
`;
}

function exchangeHtml(exchange: ArticleExchange, options: HtmlOptions): string {
  const href = options.conversationHref?.(exchange.tSourceFrame);
  const stamp = href
    ? `<a class="stamp" href="${esc(href)}">${esc(exchange.timecode)}</a>`
    : `<span class="stamp">${esc(exchange.timecode)}</span>`;

  const quoted = exchange.claim
    ? `<blockquote class="claim"><p>${esc(exchange.claim.text)}</p>
         <cite>Source at <time>${esc(exchange.claim.timecode)}</time></cite></blockquote>`
    : exchange.context
      ? `<blockquote class="context"><p>${esc(exchange.context)}</p>
           <cite>At this point in the source</cite></blockquote>`
      : '';

  const response = exchange.response.text
    ? `<div class="response"><p>${esc(exchange.response.text)}</p></div>`
    : `<div class="response empty"><p>${
        esc(formatTimecode(exchange.response.durationFrames))
      } of spoken response; no transcript available.</p></div>`;

  const inVideo = exchange.outputTimecode
    ? `<p class="meta">In the finished video at <time>${esc(exchange.outputTimecode)}</time></p>`
    : '';

  return `  <article id="e${exchange.index}">
    <h2><span class="kind">${esc(exchange.typeLabel)}</span> ${stamp}</h2>
    ${quoted}
    ${response}
    ${inVideo}
  </article>`;
}

/** Everything that reaches the document is escaped. It is all user or engine text. */
function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const ARTICLE_SECONDS_PER_FRAME = 1 / HOUSE_FPS;

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
main { max-width: 42rem; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
h1 { font-size: 1.9rem; line-height: 1.2; margin: 0 0 .5rem; }
h2 { font-size: 1.05rem; margin: 2.5rem 0 .75rem;
  font-family: ui-sans-serif, system-ui, sans-serif; letter-spacing: .01em; }
.attribution, .stats, .meta { font-family: ui-sans-serif, system-ui, sans-serif;
  font-size: .82rem; color: var(--muted); margin: .25rem 0; }
header { border-bottom: 1px solid var(--line); padding-bottom: 1.5rem; }
.kind { display: inline-block; font-size: .7rem; letter-spacing: .08em;
  padding: .18rem .5rem; border-radius: 3px; color: var(--bg); background: var(--user); }
.stamp { font-family: ui-monospace, monospace; font-size: .8rem;
  color: var(--source); text-decoration: none; margin-left: .5rem; }
.stamp:hover { text-decoration: underline; }
/* The source is quoted and set apart; the response is the body text.
   Shape and position carry the distinction, not colour alone. */
blockquote { margin: 0 0 1rem; padding: .85rem 1rem; background: var(--panel);
  border-left: 3px solid var(--source); }
blockquote p { margin: 0; font-style: italic; }
blockquote cite { display: block; margin-top: .5rem; font-style: normal;
  font-family: ui-sans-serif, system-ui, sans-serif; font-size: .78rem; color: var(--muted); }
.response { border-left: 3px solid var(--user); padding-left: 1rem; margin-bottom: .5rem; }
.response.empty p { color: var(--muted); font-style: italic; }
article { padding-bottom: 1.5rem; border-bottom: 1px solid var(--line); }
footer { margin-top: 3rem; padding-top: 1.5rem; border-top: 1px solid var(--line); }
footer ul { font-family: ui-sans-serif, system-ui, sans-serif; font-size: .82rem;
  color: var(--muted); padding-left: 1.1rem; }
code { font-family: ui-monospace, monospace; font-size: .85em; }
@media print { body { background: #fff; color: #000; } .stamp { color: #000; } }
`;
