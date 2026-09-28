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
