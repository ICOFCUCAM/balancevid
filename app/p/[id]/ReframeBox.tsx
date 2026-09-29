'use client';

import { useRef, useState } from 'react';

import type { Rect } from '../../../src/domain/presentation.js';
import { MIN_REFRAME_SPAN } from '../../../src/domain/focus.js';

/**
 * Drawing the part of a take's picture that is used.
 *   [MASTER-EDIT §2, §5, §15; U-15, U-19, D-19]
 *
 * THE THIRD OPERATION, AND THE ONE THAT CANNOT BE A LIST. The looks, the
 * cleanups and the stabilizers are named rows because an author knows
 * their take was handheld and does not know what `smoothing=30` is.
 * Nobody knows in advance which part of their own frame the performer is
 * standing in, and there is no list of four answers that could contain
 * it — so this one is drawn, over the picture it is about.
 *
 * TWO THINGS HAD TO BE RIGHT OR THE BOX WOULD LIE.
 *
 * THE MONITOR CROPS ALREADY. Every tile fits its video with `cover`, so
 * on any panel that is not exactly the source's shape part of the frame
 * is already off the edge of the tile — and a box drawn in tile
 * coordinates would be a box over a picture the author cannot fully
 * see. So while a reframe is being drawn the picture is shown
 * CONTAINED, whole, letterboxed inside the tile, and this component
 * works in the content box rather than the tile: `content()` is that
 * arithmetic and everything else goes through it.
 *
 * AND THE BOX KEEPS THE FRAME'S OWN SHAPE. The renderer fits a take
 * into its panel with `cover`; a box of some other shape would be cut
 * again on the way in and the author would not get what they drew.
 * Locked to the source's aspect, the crop is a pure zoom — whatever the
 * panel did to the whole frame it now does identically to the part of
 * it that was kept — so what is inside the box is exactly what the
 * master shows.
 *
 * NOTHING IS WRITTEN UNTIL THE POINTER COMES UP, and then once: a PATCH
 * per pointer move would be a hundred versions of one decision and a
 * hundred presses of undo to get back.
 */

/**
 * The box a drag makes, in fractions of the source frame.
 *
 * Exported for the tests, because this is the whole of the geometry and
 * a test that can only reach it through a pointer is a test of
 * Playwright.
 */
export function boxFrom(
  from: { x: number; y: number }, to: { x: number; y: number },
): Rect {
  const x1 = Math.min(from.x, to.x);
  const x2 = Math.max(from.x, to.x);
  const y1 = Math.min(from.y, to.y);
  const y2 = Math.max(from.y, to.y);

  /*
   * THE LARGER SPAN DECIDES, so the box follows the pointer rather than
   * fighting it: a drag mostly sideways sets the width and the height
   * follows, a drag mostly downwards the other way round. Both are in
   * fractions of a frame whose own shape is 1×1 in these units, which
   * is what makes "keep the frame's shape" this simple.
   */
  let w = Math.max(x2 - x1, MIN_REFRAME_SPAN);
  let h = Math.max(y2 - y1, MIN_REFRAME_SPAN);
  const span = Math.min(1, Math.max(w, h));
  w = span;
  h = span;

  /*
   * Slid back inside the frame rather than clipped, so a box drawn at
   * an edge keeps the size it was given — the same choice `focus.ts`
   * makes about a subject standing at the edge of shot. [D-19]
   */
  const x = Math.min(Math.max(0, x1), 1 - w);
  const y = Math.min(Math.max(0, y1), 1 - h);
  return { x, y, w, h };
}

/**
 * Where the contained picture sits inside the tile it is shown in.
 *
 * A frame wider than its tile letterboxes top and bottom; a narrower one
 * pillarboxes. Everything the pointer does is measured against this box
 * and not against the tile, or a click on the black bars would be a
 * point inside the picture.
 */
export function content(
  tile: { width: number; height: number }, sourceAspect: number,
): { left: number; top: number; width: number; height: number } {
  if (tile.width <= 0 || tile.height <= 0 || !(sourceAspect > 0)) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const tall = tile.height / tile.width > sourceAspect;
  const width = tall ? tile.width : tile.height / sourceAspect;
  const height = tall ? tile.width * sourceAspect : tile.height;
  return {
    left: (tile.width - width) / 2, top: (tile.height - height) / 2, width, height,
  };
}

export default function ReframeBox({
  sourceAspect, reframe, busy, onDrawn, onDone,
}: {
  /** The source frame's height over its width, as the media reports it. */
  sourceAspect: number;
  /** What is already cropped, drawn while nothing is being dragged. */
  reframe?: Rect | undefined;
  busy?: boolean;
  onDrawn: (rect: Rect) => void;
  onDone: () => void;
}) {
  const [drag, setDrag] = useState<{ from: { x: number; y: number }; box: Rect } | null>(null);
  const pad = useRef<HTMLDivElement | null>(null);

  const box = () => {
    const tile = pad.current?.getBoundingClientRect();
    if (!tile) return null;
    return { tile, inner: content(tile, sourceAspect) };
  };

  /** A pointer, as a fraction of the SOURCE FRAME. */
  const at = (event: React.PointerEvent): { x: number; y: number } => {
    const here = box();
    if (!here || here.inner.width <= 0) return { x: 0, y: 0 };
    const { tile, inner } = here;
    return {
      x: Math.min(1, Math.max(0,
        (event.clientX - tile.left - inner.left) / inner.width)),
      y: Math.min(1, Math.max(0,
        (event.clientY - tile.top - inner.top) / inner.height)),
    };
  };

  const shown = drag?.box ?? reframe;
  const here = box();
  const inner = here?.inner ?? { left: 0, top: 0, width: 0, height: 0 };
  /* A fraction of the source, as a position inside the tile. */
  const px = (n: number, along: 'x' | 'y') => (along === 'x'
    ? inner.left + n * inner.width
    : inner.top + n * inner.height);

  return (
    <div ref={pad} data-testid="reframe-pad"
         onPointerDown={(event) => {
           if (busy) return;
           /*
            * NOT A DRAG IF IT STARTED ON THE TOOL'S OWN BUTTONS, and
            * this is not a nicety — it is what makes them work at all.
            *
            * Capturing the pointer sends every later event for it to
            * the PAD, including the one the browser turns into a
            * click, so `Done` and `Whole frame` were pressed and
            * nothing happened: the click was dispatched to the
            * capturing element instead of the button under the finger.
            * Found by a browser refusing to leave the crop tool.
            */
           if ((event.target as HTMLElement)
             .closest('[data-testid="reframe-bar"]')) return;
           event.currentTarget.setPointerCapture(event.pointerId);
           const from = at(event);
           setDrag({ from, box: boxFrom(from, from) });
         }}
         onPointerMove={(event) => {
           if (!drag) return;
           setDrag({ from: drag.from, box: boxFrom(drag.from, at(event)) });
         }}
         onPointerUp={(event) => {
           event.currentTarget.releasePointerCapture(event.pointerId);
           const drawn = drag?.box;
           setDrag(null);
           if (drawn) onDrawn(drawn);
         }}
         onPointerCancel={() => setDrag(null)}
         style={{
           position: 'absolute', inset: 0, cursor: 'crosshair',
           touchAction: 'none', zIndex: 3,
         }}>
      {/*
        * WHAT IS OUTSIDE THE BOX IS DIMMED, not outlined, because the
        * question being answered is "what will be in the picture" and
        * that is easier to see as the part still bright. Four panes,
        * which also darken the letterbox bars — they are outside the
        * kept region too, and they are not part of the frame at all.
        */}
      {shown && here && [
        { left: 0, top: 0, width: '100%', height: px(shown.y, 'y') },
        { left: 0, top: px(shown.y + shown.h, 'y'), width: '100%',
          height: `calc(100% - ${px(shown.y + shown.h, 'y')}px)` },
        { left: 0, top: px(shown.y, 'y'),
          width: px(shown.x, 'x'), height: shown.h * inner.height },
        { left: px(shown.x + shown.w, 'x'), top: px(shown.y, 'y'),
          width: `calc(100% - ${px(shown.x + shown.w, 'x')}px)`,
          height: shown.h * inner.height },
      ].map((pane, index) => (
        <div key={index} aria-hidden="true" style={{
          position: 'absolute', background: 'rgba(0,0,0,0.6)',
          /* Decoration does not take pointers: the browser found this
             by refusing to press Done, which a dimming pane over the
             bottom of the frame was swallowing. The pad handles every
             pointer here; nothing drawn on it should. */
          pointerEvents: 'none',
          ...pane,
        }} />
      ))}
      {shown && here && (
        <div data-testid="reframe-rect" style={{
          position: 'absolute',
          left: px(shown.x, 'x'), top: px(shown.y, 'y'),
          width: shown.w * inner.width, height: shown.h * inner.height,
          border: '1px solid rgba(255,255,255,0.9)',
          boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
          pointerEvents: 'none',
        }} />
      )}
      {/*
        * AND WHAT TO DO ABOUT IT, ON THE PICTURE. A crop tool with no
        * stated way out is a trap, and one whose instructions live in a
        * panel elsewhere is one you have to look away from to use.
        */}
      <div className="row" data-testid="reframe-bar" style={{
        /*
          * CENTRED, because bottom-left is where the take's own name
          * plate lives and the screenshot showed this sitting on top of
          * it. Two OSD plates in one corner is one of them unreadable.
          */
        position: 'absolute', left: '50%', transform: 'translateX(-50%)',
        bottom: 10, gap: 6, alignItems: 'center', whiteSpace: 'nowrap',
        /* Above the panes whatever order they end up in. */
        zIndex: 1,
        padding: '4px 6px', borderRadius: 'var(--radius-screen)',
        background: 'rgba(0,0,0,0.72)',
        border: '1px solid rgba(255,255,255,0.16)',
      }}>
        <span className="small" style={{
          fontSize: 'var(--text-2xs)', color: 'rgba(255,255,255,0.86)',
        }}>
          {shown
            ? `keeping ${Math.round(shown.w * 100)}% of the frame`
            : 'Drag a box over the part to keep'}
        </span>
        {reframe && (
          <button className="ctl sm" data-testid="reframe-clear" disabled={busy}
                  onClick={() => onDrawn({ x: 0, y: 0, w: 1, h: 1 })}>
            Whole frame
          </button>
        )}
        <button className="ctl sm" data-testid="reframe-done" disabled={busy}
                onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}
