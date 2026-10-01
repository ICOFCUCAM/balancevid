/**
 * The slide, drawn.  [Doctrine CHANNEL §21, §20, §27, D-06, C-26]
 *
 *     slide definition (domain/graphic.ts)
 *                   |
 *              slideHtml()          <- ONE layout calculation
 *               /        \
 *           preview    programme
 *           (iframe)   (Chromium -> library PNG -> the wire)
 *
 * WHY THIS EXISTS AT ALL, when `slide.ts` already drew slides. It drew
 * them *correctly* and it drew them like an application: centred text
 * on black, the same composition four times, the channel's colour on
 * every word. That is a slide with text on it rather than a graphic
 * that happens to be made in a slide editor, and the difference is the
 * whole of this work.
 *
 * AND IT IS SEPARATE FROM `slide.ts` FOR ONE MECHANICAL REASON: that
 * module opens a browser, so it imports `node:fs`. A control room that
 * wants to SHOW the operator what they are about to transmit cannot.
 * Splitting the pure part out is what makes the preview and the
 * transmission the same calculation instead of two stylesheets that
 * agree today. Nothing here touches the filesystem, the network, or a
 * clock.
 */

import {
  type Focus, type SlideSpec, SLIDE_HEIGHT, SLIDE_WIDTH, TITLE_SAFE,
  colourOr, presetFor,
} from '../domain/graphic.js';

/* Every caller wants the model and the drawing together, and one
   import is one source of truth. */
export * from '../domain/graphic.js';

/**
 * One face, named rather than inherited.
 *
 * `system-ui` would be the operator's font in the preview and the
 * renderer's font on the wire, and the two are not the same machine.
 * Liberation Sans is on the render image and metric-compatible with
 * Arial, so a line that fits in the preview fits on air. A deterministic
 * renderer starts with a deterministic font.
 */
export const FACE = '"Liberation Sans","DejaVu Sans",Arial,Helvetica,sans-serif';

/**
 * The type scale, in pixels on the 1920 × 1080 master.
 *
 * SIX SIZES AND NO SLIDER. Every ratio here is roughly 1.4 off its
 * neighbour, which is what makes two sizes read as a hierarchy rather
 * than as a mistake. The smallest is 26px — at 1080 lines that is the
 * floor for something a viewer reads on a phone, and nothing in this
 * file is allowed below it.
 */
export const TYPE = {
  /** Small, uppercase, tracked out. The channel, above the content. */
  eyebrow: 28,
  /** The one big line on a title card. */
  title: 104,
  /** Under a title: a sentence, not a paragraph. */
  subtitle: 44,
  /** The line that opens an information slide or captions a picture. */
  heading: 62,
  /** Paragraphs and bullets. */
  body: 44,
  /** Under a picture, and the quieter half of a split. */
  caption: 32,
  /** A quotation, which is the content rather than a label. */
  quote: 70,
  /** A credit, a source, a date. The smallest thing allowed. */
  source: 26,
} as const;

/** The vertical rhythm. Nothing is spaced by a number typed in place. */
export const STEP = { tight: 14, near: 24, apart: 40, far: 64 } as const;
/* ------------------------------------------------------------------------ *
 *  The page a slide is.  [§21, C-26]
 * ------------------------------------------------------------------------ */

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Text becomes paragraphs, bullets and numbered points.
 *
 * AND NOTHING ELSE IS INTERPRETED, which is a decision and not an
 * omission. The four compositions exist so that a slide is hard to
 * make ugly; bold, italics, alignment and line spacing are the
 * controls that make it easy. A numbered list is the one addition that
 * is STRUCTURE rather than decoration — the same kind of thing a
 * bullet is — so it is here and the rest is not. [C-25]
 */
export function bodyHtml(body: string): string {
  const blocks = body.split(/\n\s*\n/).filter((block) => block.trim());
  return blocks.map((block) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.every((line) => line.startsWith('- '))) {
      return `<ul>${lines.map(
        (line) => `<li>${escape(line.slice(2))}</li>`).join('')}</ul>`;
    }
    /* `1. `, `2. ` — and the numbers are the AUTHOR'S, started from
       whatever they typed, because a list continuing from six in a
       previous slide is a real thing a presenter does. */
    if (lines.every((line) => /^\d+[.)]\s/.test(line))) {
      const first = Number(/^(\d+)/.exec(lines[0] ?? '')?.[1] ?? 1);
      return `<ol start="${first}">${lines.map(
        (line) => `<li>${escape(line.replace(/^\d+[.)]\s+/, ''))}</li>`,
      ).join('')}</ol>`;
    }
    return `<p>${escape(lines.join(' '))}</p>`;
  }).join('');
}

const SAFE_X = Math.round(SLIDE_WIDTH * TITLE_SAFE);
const SAFE_Y = Math.round(SLIDE_HEIGHT * TITLE_SAFE);

const FOCUS: Record<Focus, string> = {
  top: '50% 18%', centre: '50% 50%', bottom: '50% 82%',
};

/**
 * The page a slide is — the ONE layout calculation.  [§21, C-26]
 *
 * Exported and pure so that three callers share it and cannot drift:
 * the worker rasterises it, the control room shows it in an iframe,
 * and a test reads it without launching a browser. A preview drawn by
 * a second stylesheet is a preview that lies, and the fault would only
 * ever be found on air.
 *
 * The picture arrives as a URL the caller chooses: the worker inlines
 * bytes as `data:` because the render page is forbidden the network
 * (D-06), and the control room passes the library's own path because
 * the operator's browser is already authenticated to it. Same HTML.
 */
export function slideHtml(spec: SlideSpec, pictureUrl?: string): string {
  const preset = presetFor(spec.background);
  const ink = preset.ink;
  const accent = colourOr(spec.accent, ink);
  const heading = spec.heading ? escape(spec.heading) : '';
  const body = spec.body ? bodyHtml(spec.body) : '';
  const footnote = spec.footnote ? escape(spec.footnote) : '';
  const channel = spec.channel ? escape(spec.channel) : '';
  const rule = '<div class="rule"></div>';

  /*
   * A FILLED PICTURE IS THE BACKGROUND, not an element inside the
   * composition — which is what makes "full bleed" mean anything. The
   * `image` preset is the same statement made by the background
   * control instead of by the Fit/Fill one, so the two resolve to one
   * plate and one scrim.
   */
  const bleeding = Boolean(pictureUrl)
    && (spec.background === 'image'
      || (spec.layout === 'picture' && spec.fill === true));
  const splitting = spec.layout === 'picture' && !bleeding;
  const focus = FOCUS[spec.focus ?? 'centre'];

  /*
   * THE CHANNEL IS NAMED ONCE, and the composition decides where.
   *
   * An eyebrow is the top line of a composition that has one, and it
   * is the right place for the station: small, tracked out, in the
   * station's own colour, above the content rather than across it.
   * Two of the four have no room for one — a quotation opens with its
   * quote mark, and a full-bleed photograph opens with the
   * photograph — so on those the name goes quietly into the foot.
   *
   * Never both. A name in two corners of the same graphic is a
   * station that does not trust the viewer to have seen it, and it is
   * the difference between identity and branding. [D-04]
   */
  const topped = spec.layout === 'title' || spec.layout === 'text'
    || (spec.layout === 'picture' && !bleeding);
  const eyebrow = channel && topped
    ? `<div class="eyebrow">${channel}</div>` : '';

  /*
   * THE SCRIM GOES WHERE THE WORDS ARE.  [§27, C-26]
   *
   * A picture slide anchors its caption to the bottom, so a gradient
   * rising from the foot is exactly right. A TITLE over the same
   * photograph does not: its words sit in the middle of the frame,
   * and the first version put the darkening under their feet and
   * left the headline on the bright part of the picture. Rendering
   * it and looking is what found that; reasoning about it had not.
   *
   * So there are two, chosen by where the composition puts its
   * content, and never by a setting.
   */
  const plate = bleeding
    ? `<img class="plate" alt="" src="${pictureUrl}">`
      + `<div class="scrim ${spec.layout === 'picture' ? 'foot' : 'side'}">`
      + '</div>'
    : '';

  const inner = spec.layout === 'title'
    ? `<div class="col mid">${eyebrow}
         <h1 class="title">${heading}</h1>${rule}
         ${body ? `<div class="sub">${body}</div>` : ''}</div>`
    : spec.layout === 'quote'
      ? `<div class="col mid quoting">
           <div class="qm" aria-hidden="true">“</div>
           <blockquote>${body || heading}</blockquote>${rule}
           ${footnote ? `<div class="by">— ${footnote}</div>` : ''}</div>`
      : splitting
        ? `<div class="split">
             <div class="plate-box">${pictureUrl
               ? `<img alt="" src="${pictureUrl}">`
               : '<div class="hole">no picture</div>'}</div>
             <div class="col mid">${eyebrow}
               ${heading ? `<h2 class="heading">${heading}</h2>${rule}` : ''}
               ${body ? `<div class="cap">${body}</div>` : ''}</div>
           </div>`
        : spec.layout === 'picture'
          ? `<div class="col low">
               ${heading ? `<h2 class="heading">${heading}</h2>${rule}` : ''}
               ${body ? `<div class="cap">${body}</div>` : ''}</div>`
          : `<div class="col top">${eyebrow}
               ${heading ? `<h2 class="heading">${heading}</h2>${rule}` : ''}
               <div class="words">${body}</div></div>`;

  /* The one row that is identity rather than content, and it is the
     smallest thing on the slide on purpose: a professional graphics
     system uses its identity consistently and quietly. */
  /* A credit on the left, the station on the right where the
     composition had no room for it above. The smallest things on the
     slide, which is the point of them. */
  const quoting = spec.layout === 'quote';
  const foot = `<div class="foot">
      <span>${quoting ? '' : footnote}</span>
      <span class="mark">${topped ? '' : channel}</span></div>`;

  return `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  html,body{width:${SLIDE_WIDTH}px;height:${SLIDE_HEIGHT}px;overflow:hidden}
  body{background:${preset.base};color:${ink};font:400 ${TYPE.body}px/1.35 ${FACE}}
  .wash,.plate,.scrim,.safe{position:absolute;inset:0}
  .plate{width:100%;height:100%;object-fit:cover;object-position:${focus}}
  /* The scrim is what makes words on a photograph legible, and it is
     the one place a gradient earns its place: it is doing the job a
     camera operator does by lighting the background down. */
  .scrim.foot{background:linear-gradient(to top,rgba(4,6,9,0.90) 0%,
    rgba(4,6,9,0.58) 26%,rgba(4,6,9,0.05) 58%)}
  .scrim.side{background:linear-gradient(100deg,rgba(4,6,9,0.93) 0%,
    rgba(4,6,9,0.80) 34%,rgba(4,6,9,0.30) 68%,rgba(4,6,9,0.10) 100%)}
  .safe{inset:${SAFE_Y}px ${SAFE_X}px;display:flex;flex-direction:column;
    overflow:hidden}
  .col{display:flex;flex-direction:column;gap:${STEP.near}px;
    max-width:${Math.round((SLIDE_WIDTH - 2 * SAFE_X) * 0.78)}px}
  .mid{margin:auto 0}
  .top{margin-bottom:auto}
  .low{margin-top:auto;padding-bottom:${STEP.far}px}
  .eyebrow{font-size:${TYPE.eyebrow}px;font-weight:700;letter-spacing:0.22em;
    text-transform:uppercase;color:${accent}}
  .title{font-size:${TYPE.title}px;line-height:1.04;font-weight:700;
    letter-spacing:-0.02em}
  .heading{font-size:${TYPE.heading}px;line-height:1.12;font-weight:700;
    letter-spacing:-0.01em}
  .sub{font-size:${TYPE.subtitle}px;opacity:0.78}
  .words{font-size:${TYPE.body}px;display:flex;flex-direction:column;
    gap:${STEP.near}px}
  .cap{font-size:${TYPE.caption}px;opacity:0.82}
  /* The rule is the accent doing structural work rather than
     colouring the words: it separates without shouting, and it is the
     same object on all four compositions. */
  .rule{width:132px;height:6px;border-radius:3px;background:${accent};
    flex:0 0 auto}
  .quoting{max-width:${Math.round((SLIDE_WIDTH - 2 * SAFE_X) * 0.72)}px}
  .qm{font-size:170px;line-height:0.6;height:92px;color:${accent};
    opacity:0.5;font-weight:700}
  blockquote{font-size:${TYPE.quote}px;line-height:1.26;font-style:italic;
    font-weight:300}
  .by{font-size:${TYPE.subtitle}px;opacity:0.72}
  p{margin:0}
  ul,ol{margin:0;padding-left:1.1em;display:flex;flex-direction:column;
    gap:${STEP.tight}px}
  .split{flex:1;min-height:0;display:grid;gap:${STEP.far}px;
    grid-template-columns:1.12fr 1fr;align-items:center}
  /* THE BED IS THE PICTURE'S SIZE, not the column's. Held at full
     height it drew a tall grey panel round a landscape photograph,
     which is a letterbox with a border — the thing fitting is
     supposed to avoid. */
  .plate-box{align-self:center;justify-self:center;max-height:100%;
    border-radius:10px;overflow:hidden;display:grid;place-items:center;
    background:rgba(127,127,127,0.10)}
  /* CONTAIN, AND THAT IS WHAT FIT MEANS. The split exists so the
     picture arrives WHOLE — a chart with its edge cropped off is the
     fault this composition is the answer to — so there is no
     object-position here either: choosing which part survives is a
     question only the full-bleed crop can ask. */
  .plate-box img{display:block;max-width:100%;
    max-height:${SLIDE_HEIGHT - 2 * SAFE_Y}px;object-fit:contain}
  .hole{opacity:0.4;font-size:${TYPE.caption}px}
  .foot{position:absolute;left:${SAFE_X}px;right:${SAFE_X}px;
    bottom:${Math.round(SAFE_Y * 0.56)}px;display:flex;
    justify-content:space-between;gap:${STEP.apart}px;
    font-size:${TYPE.source}px;opacity:0.55;letter-spacing:0.04em}
  .mark{text-transform:uppercase;letter-spacing:0.18em;font-weight:700}
  </style><body>${preset.wash
    ? `<div class="wash" style="background:${preset.wash}"></div>` : ''
  }${plate}<div class="safe">${inner}</div>${foot}</body>`;
}

