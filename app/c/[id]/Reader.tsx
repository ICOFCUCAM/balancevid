'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Reading from the screen while you speak.  [Doctrine U-06, U-33, D-07]
 *
 * A lecture is delivered from notes and a deck. Live shows the source, the
 * camera and one key — correctly, because everything else is something
 * between a person and the sentence they want to answer — but a teacher
 * needs their page in front of them, and alt-tabbing to another window is
 * the one thing they must not do.
 *
 * WHY IT IS SAFE. Recording is a MediaRecorder over the camera stream:
 * nothing in the document enters it, so opening this panel, scrolling it or
 * resizing the window cannot alter a single frame of what is captured.
 *
 * WHY IT IS IN THE APP AND NOT ANOTHER WINDOW. The take is made crash-safe
 * by rotating a new recording segment every few seconds (U-06), and that
 * rotation is a timer — which browsers throttle in a background tab. Reading
 * from another application risks the thing that protects the recording.
 * Reading here does not.
 *
 * WHY IT TAKES THE KEYBOARD. Space scrolls a document and space also ends a
 * take. While this is open the page keys belong to the reader, and the one
 * key that runs the conversation is said plainly on its own button.
 */
export default function Reader({
  pages, pageCount, page, onPage, title, note, onClose,
}: {
  /** A URL per page, 1-based by position. Empty for a notes-only reader. */
  pages: (n: number) => string;
  pageCount: number;
  page: number;
  onPage: (n: number) => void;
  title: string;
  /** The author's own written note, when there is one. */
  note?: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  /*
   * The reader owns the page keys while it is open, so scrolling a document
   * cannot end a recording. Escape closes it and gives them back.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const box = scrollRef.current;
      if (event.key === 'Escape') { event.preventDefault(); onClose(); return; }
      if (event.code === 'Space' || event.key === 'PageDown' || event.key === 'PageUp') {
        event.preventDefault();
        event.stopPropagation();
        const by = (event.key === 'PageUp' || event.shiftKey) ? -1 : 1;
        box?.scrollBy({ top: by * (box.clientHeight * 0.85), behavior: 'smooth' });
        return;
      }
      if (pageCount > 1 && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault();
        event.stopPropagation();
        const next = page + (event.key === 'ArrowRight' ? 1 : -1);
        if (next >= 1 && next <= pageCount) onPage(next);
      }
    };
    // Capture, so it runs before the conversation's own space handler.
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, onPage, page, pageCount]);

  return (
    <aside
      data-testid="reader"
      aria-label="Your notes"
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(46%, 620px)',
        background: 'rgba(8,9,11,0.96)', borderLeft: '1px solid var(--line)',
        display: 'grid', gridTemplateRows: 'auto 1fr auto', zIndex: 5,
      }}
    >
      <header className="row" style={{ gap: 8, padding: '10px 14px',
        borderBottom: '1px solid var(--line)', flexWrap: 'nowrap' }}>
        <strong className="grow" style={{ fontSize: 14, whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</strong>
        <button className="small" onClick={() => setZoom((z) => Math.max(0.6, z - 0.2))}
                aria-label="Smaller">−</button>
        <button className="small" onClick={() => setZoom((z) => Math.min(2.6, z + 0.2))}
                aria-label="Larger">+</button>
        <button className="small" data-testid="reader-close" onClick={onClose}>Close</button>
      </header>

      <div ref={scrollRef} style={{ overflowY: 'auto', padding: 14 }}>
        {pageCount > 0 && (
          <img
            src={pages(page)} alt={`Page ${page}`}
            data-testid="reader-page"
            style={{ width: `${zoom * 100}%`, borderRadius: 4, background: '#fff' }}
          />
        )}
        {note && (
          <p data-testid="reader-note" style={{
            fontSize: `${Math.round(15 * zoom)}px`, lineHeight: 1.6,
            whiteSpace: 'pre-wrap', marginTop: pageCount > 0 ? 16 : 0,
          }}>
            {note}
          </p>
        )}
        {pageCount === 0 && !note && (
          <p className="small muted">
            Nothing to read yet. Attach a PDF or a deck to this response, or
            write yourself a note, and it appears here.
          </p>
        )}
      </div>

      <footer className="row small" style={{ gap: 8, padding: '8px 14px',
        borderTop: '1px solid var(--line)', flexWrap: 'nowrap' }}>
        {pageCount > 1 ? (
          <>
            <button className="small" data-testid="reader-prev" disabled={page <= 1}
                    onClick={() => onPage(page - 1)}>←</button>
            <span className="grow mono" style={{ textAlign: 'center' }}>
              {page} / {pageCount}
            </span>
            <button className="small" data-testid="reader-next" disabled={page >= pageCount}
                    onClick={() => onPage(page + 1)}>→</button>
          </>
        ) : <span className="grow muted">Space scrolls · Escape closes</span>}
      </footer>
    </aside>
  );
}
