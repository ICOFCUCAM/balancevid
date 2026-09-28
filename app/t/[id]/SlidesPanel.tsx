'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Channel, ProgrammeSource } from '../../../src/domain/channel.js';
import { type Deck, slideOnAir, sourceForSlide, step } from '../../../src/domain/deck.js';

/**
 * Slides, on air.  [Doctrine CHANNEL §20, §5, U-33 §2, D-19]
 *
 *     ◀  3 / 12  ▶        BLANK
 *
 * A DECK IS AN ORDER OVER LIBRARY IMAGES, and advancing a slide is `roll-in`
 * of the next one — the action the Screens tab has had since it was written.
 * So this panel adds no way of putting anything on air: it decides WHICH
 * reference, and the existing door does the rest. The playout engine has
 * been able to broadcast a still since `segment.ts` was written (`-loop 1`),
 * the monitor already draws one, and the schedule can already hold one.
 *
 * THERE IS NO CURSOR. Which slide is showing is read from
 * `channel.live.segment` — the thing actually on air — so the number in the
 * middle of the two arrows is the transmission's own answer rather than a
 * counter that could disagree with it. Press NEXT twice quickly and the
 * second press works from what went out, not from what a variable hoped
 * went out. [D-22]
 *
 * AND IT DOES NOT WRAP. Running out of slides is information: a deck that
 * looped would put the title card back up in front of an audience waiting
 * for the presenter to finish, and the operator pressing NEXT would have no
 * way to tell that from a deck with one more slide.
 */

export default function SlidesPanel({
  channel, onAir, onShow, onRollOut,
}: {
  channel: Channel;
  onAir: boolean;
  onShow: (source: ProgrammeSource) => void;
  onRollOut: () => void;
}) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [layout, setLayout] = useState<'title' | 'text' | 'picture' | 'quote'>('text');
  const [heading, setHeading] = useState('');
  const [text, setText] = useState('');
  const file = useRef<HTMLInputElement | null>(null);

  const read = useCallback(async () => {
    try {
      const response = await fetch('/api/decks', { cache: 'no-store' });
      if (!response.ok) return;
      const found = ((await response.json()).decks ?? []) as Deck[];
      setDecks(found);
      setChosen((was) => was ?? found[0]?.id ?? null);
    } catch { /* momentarily unreachable; keep what is on screen. */ }
  }, []);

  useEffect(() => { void read(); }, [read]);

  const deck = decks.find((candidate) => candidate.id === chosen) ?? null;
  const at = deck ? slideOnAir(deck, channel.live?.segment) : -1;

  const upload = async (chosenFile: File) => {
    setBusy(true);
    setNote(`Turning ${chosenFile.name} into slides…`);
    try {
      const body = new FormData();
      body.append('file', chosenFile);
      const response = await fetch('/api/decks', { method: 'POST', body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setNote(data.error ?? 'that could not be uploaded'); return; }
      /*
       * The worker is rasterising it. Polling rather than waiting: a
       * forty-page deck takes a while and the operator has a broadcast to
       * run in the meantime.
       */
      const deckId = String(data.deckId);
      for (let tries = 0; tries < 60; tries += 1) {
        await new Promise((resolve) => { setTimeout(resolve, 2000); });
        const check = await fetch(`/api/decks/${deckId}`, { cache: 'no-store' });
        if (check.ok) {
          const made = (await check.json()).deck as Deck;
          await read();
          setChosen(made.id);
          setNote(`${made.title} — ${made.slides.length} slides`);
          return;
        }
      }
      setNote('Still working on it. It will appear here when the worker '
        + 'has finished.');
    } finally { setBusy(false); }
  };

  /**
   * Write one.
   *
   * With no deck yet, it starts one — because "+ Write" with nothing to
   * write into would be a button that explains why it cannot work, and
   * making an empty deck costs a file.
   */
  const write = async () => {
    if (!heading.trim() && !text.trim()) {
      setNote('A slide needs a heading or some words.');
      return;
    }
    setBusy(true);
    setNote('Drawing the slide\u2026');
    try {
      let target = deck?.id;
      if (!target) {
        const made = await fetch('/api/decks', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ title: heading.trim() || 'Slides' }),
        });
        if (!made.ok) { setNote('that deck could not be started'); return; }
        target = ((await made.json()).deck as Deck).id;
      }
      const response = await fetch(`/api/decks/${target}/slides`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ layout, heading, text }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setNote(data.error ?? 'that slide was refused'); return; }

      /* The worker is drawing it. Poll until the page count moves. */
      const before = deck?.slides.length ?? 0;
      for (let tries = 0; tries < 30; tries += 1) {
        await new Promise((resolve) => { setTimeout(resolve, 1500); });
        const check = await fetch(`/api/decks/${target}`, { cache: 'no-store' });
        if (!check.ok) continue;
        const now = (await check.json()).deck as Deck;
        if (now.slides.length > before) {
          await read();
          setChosen(now.id);
          setHeading('');
          setText('');
          setNote(`${now.title} \u2014 ${now.slides.length} slides`);
          return;
        }
      }
      setNote('Still drawing it. It will appear when the worker has finished.');
    } finally { setBusy(false); }
  };

  const go = (by: 1 | -1) => {
    if (!deck) return;
    const wanted = step(deck, at, by);
    if (wanted) onShow(sourceForSlide(wanted));
  };

  return (
    <div data-testid="slides-panel" style={{
      display: 'flex', flexDirection: 'column', gap: 7,
      borderTop: '1px solid var(--line)', paddingTop: 9, marginTop: 2,
    }}>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <span className="muted grow" style={{
          fontSize: 9, letterSpacing: 0.8, fontWeight: 700,
        }}>SLIDES</span>
        <button
          className="small" data-testid="write-slide" disabled={busy}
          onClick={() => setWriting((open) => !open)}
          style={{
            border: 0, background: 'none', padding: 0, fontSize: 11,
            color: '#5c9ee0', cursor: 'pointer', marginRight: 9,
          }}
        >+ Write</button>
        <button
          className="small" data-testid="add-deck" disabled={busy}
          onClick={() => file.current?.click()}
          style={{
            border: 0, background: 'none', padding: 0, fontSize: 11,
            color: '#5c9ee0', cursor: 'pointer',
          }}
        >+ Upload</button>
        <input
          ref={file} type="file" hidden data-testid="deck-file"
          accept=".pdf,.pptx,.ppt,.odp,.docx,.doc,.odt,.rtf,.xlsx,.ods"
          onChange={(event) => {
            const picked = event.target.files?.[0];
            if (picked) void upload(picked);
            event.target.value = '';
          }}
        />
      </div>

      {decks.length === 0 ? (
        <p className="small muted" style={{ margin: 0, fontSize: 11 }}>
          Upload a PowerPoint, a PDF or a Word document and each page becomes
          a slide you can put on air.
        </p>
      ) : (
        <select
          data-testid="deck-choice" value={chosen ?? ''}
          onChange={(event) => setChosen(event.target.value)}
          style={{ fontSize: 12, padding: '6px 9px' }}
        >
          {decks.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title} ({candidate.slides.length})
            </option>
          ))}
        </select>
      )}

      {/*
        * WRITING ONE.  [§21]
        *
        * Four layouts and three fields. A slide editor with thirty controls
        * is a slide editor somebody uses to make an ugly slide; these four
        * are each hard to make look bad, and "diverse" is served by their
        * being different from each other rather than by each being
        * adjustable.
        */}
      {writing && (
        <div data-testid="slide-writer" style={{
          display: 'flex', flexDirection: 'column', gap: 6, padding: 8,
          borderRadius: 8, background: 'var(--panel-2)',
          border: '1px solid var(--line)',
        }}>
          <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
            {(['title', 'text', 'picture', 'quote'] as const).map((option) => (
              <button
                key={option} type="button" data-testid="slide-layout"
                data-layout={option}
                data-chosen={layout === option ? 'true' : 'false'}
                onClick={() => setLayout(option)}
                style={{
                  padding: '3px 8px', fontSize: 10, borderRadius: 5,
                  border: `1px solid ${layout === option ? '#3d7fd6' : 'var(--line)'}`,
                  background: layout === option
                    ? 'rgba(45,110,200,0.22)' : 'transparent',
                }}
              >{option}</button>
            ))}
          </div>
          <input
            data-testid="slide-heading" value={heading}
            onChange={(event) => setHeading(event.target.value)}
            placeholder={layout === 'quote' ? 'Who said it (optional)' : 'Heading'}
            style={{ fontSize: 12, padding: '6px 9px' }}
          />
          <textarea
            data-testid="slide-text" value={text} rows={3}
            onChange={(event) => setText(event.target.value)}
            placeholder={layout === 'quote'
              ? 'The quotation'
              : 'Words. A blank line starts a paragraph; \u201c- \u201d starts a bullet.'}
            style={{
              fontSize: 12, padding: '6px 9px', width: '100%', resize: 'vertical',
              font: 'inherit', background: 'var(--panel)',
              border: '1px solid var(--line)', borderRadius: 8, color: 'inherit',
            }}
          />
          <button
            className="primary small" data-testid="make-slide" disabled={busy}
            onClick={() => { void write(); }}
          >
            {busy ? 'Drawing\u2026' : deck ? 'Add to this deck' : 'Start a deck'}
          </button>
        </div>
      )}

      {deck && (
        <>
          {/*
            * The page that is on air, at the size it can be read at. Drawn
            * from the library like any other image, which is exactly what
            * it is.
            */}
          <div style={{
            position: 'relative', aspectRatio: '16 / 9', borderRadius: 7,
            overflow: 'hidden', background: '#05070a',
            border: `1px solid ${at >= 0 ? '#3d7fd6' : 'var(--line)'}`,
          }}>
            {at >= 0 ? (
              <img alt="" src={`/api/library/${deck.slides[at]!.assetId}`}
                   style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span className="muted" style={{
                position: 'absolute', inset: 0, display: 'grid',
                placeItems: 'center', fontSize: 11,
              }}>Not on air</span>
            )}
          </div>

          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <button
              className="small" data-testid="slide-back"
              disabled={!onAir || !step(deck, at, -1)}
              onClick={() => go(-1)}
              style={{ flex: '0 0 auto', padding: '7px 11px' }}
            >&#9664;</button>
            <span className="mono grow" data-testid="slide-position" style={{
              textAlign: 'center', fontSize: 12, fontWeight: 700,
            }}>
              {at >= 0 ? `${at + 1} / ${deck.slides.length}`
                : `— / ${deck.slides.length}`}
            </span>
            <button
              className="small" data-testid="slide-next"
              disabled={!onAir || !step(deck, at, 1)}
              title={onAir
                ? (step(deck, at, 1) ? 'Put the next slide on air'
                  : 'That is the last slide')
                : 'Only while you are live'}
              onClick={() => go(1)}
              style={{ flex: '0 0 auto', padding: '7px 11px' }}
            >&#9654;</button>
            <button
              className="small" data-testid="slide-blank" disabled={at < 0}
              title="Take the slides down and go back to the room"
              onClick={onRollOut}
              style={{ flex: '0 0 auto', padding: '7px 10px', fontSize: 11 }}
            >Blank</button>
          </div>
        </>
      )}

      {note && (
        <p className="small muted" data-testid="slides-note"
           style={{ margin: 0, fontSize: 11 }}>{note}</p>
      )}
    </div>
  );
}
