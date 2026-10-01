'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../../Icon.js';
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

type Layout = 'title' | 'text' | 'picture' | 'quote';

/**
 * The four, each with the one word that says when to reach for it.
 *
 * ICONS BESIDE THE WORDS because four words of the same length in a row
 * is a thing an operator reads rather than recognises, and reading is
 * what there is no time for between two cues. The picture one is the
 * LIBRARY icon on purpose: a picture slide names a library asset, and
 * the icon says where to go and get one.
 */
const LAYOUTS: {
  id: Layout; label: string; icon: 'pencil' | 'list' | 'library' | 'conversation';
  says: string;
}[] = [
  { id: 'title', label: 'Title', icon: 'pencil',
    says: 'A title card: one big line, centred' },
  { id: 'text', label: 'Text', icon: 'list',
    says: 'Words: paragraphs, bullets or numbered points' },
  { id: 'picture', label: 'Picture', icon: 'library',
    says: 'A picture from the Library, with a caption' },
  { id: 'quote', label: 'Quote', icon: 'conversation',
    says: 'A quotation, with who said it underneath' },
];

/**
 * WHICH FIELDS EACH LAYOUT HAS, and what to call them.
 *
 * The same two boxes were shown for all four, which is why Picture had
 * nowhere to put a picture and Quote had nowhere to put the person who
 * said it — both of which the route behind this has accepted since it
 * was written. Absent means the field is not drawn at all, rather than
 * drawn and ignored. [C-25]
 */
const FIELDS: Record<Layout, {
  heading?: string; body?: string; footnote?: string;
}> = {
  title: { heading: 'The title', body: 'A line underneath (optional)' },
  text: { heading: 'Slide heading (optional)', body: 'Write the text for this slide…' },
  picture: { heading: 'Heading (optional)', body: 'Caption (optional)' },
  /* A quotation's words are the BODY, because that is where the
     renderer looks for them, and the attribution is the footnote it
     draws the dash in front of. */
  quote: { body: 'The quotation', footnote: 'Who said it' },
};

export default function SlidesPanel({
  channel, onAir, onShow, onRollOut, pictures = [], ink,
}: {
  channel: Channel;
  onAir: boolean;
  onShow: (source: ProgrammeSource) => void;
  onRollOut: () => void;
  /**
   * The library's images, for a picture slide.  [§3, D-18, C-25]
   *
   * PASSED IN, NOT FETCHED. The studio already holds the library and
   * polls it; a second fetch here would be a second copy of the same
   * list disagreeing with the first one about what exists. And a
   * picture slide NAMES a library asset rather than uploading one,
   * which is the route's own rule: a photograph can be on two slides
   * without a second copy of it.
   */
  pictures?: { assetId: string; title: string }[];
  /** The channel's own colour, so an authored slide looks like it. */
  ink?: string;
}) {
  const [decks, setDecks] = useState<Deck[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [layout, setLayout] = useState<Layout>('text');
  const [heading, setHeading] = useState('');
  const [text, setText] = useState('');
  const [footnote, setFootnote] = useState('');
  const [picture, setPicture] = useState<string | null>(null);
  const [fill, setFill] = useState(false);
  const [picking, setPicking] = useState(false);
  /** Shown for a moment after a slide lands, so the press has an answer. */
  const [added, setAdded] = useState(false);
  const [help, setHelp] = useState(false);
  const file = useRef<HTMLInputElement | null>(null);
  const modes = useRef<HTMLDivElement | null>(null);

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

  /*
   * WHAT THIS SLIDE IS, worked out ONCE.  [C-25]
   *
   * The fields outlive the mode that showed them: type a heading, switch
   * to Quote — which has no heading — and the text is still in the box
   * that is no longer drawn. Three things read that state and they must
   * not disagree: the "a slide needs something" guard, the request, and
   * the word under the fields.
   *
   * So only the fields THIS layout has are read, and the first version
   * got it wrong in both visible directions: a picture chosen and then
   * abandoned for Text left the panel saying "Draft" over four empty
   * boxes, and a heading typed under Text would have arrived as the
   * words of a quotation, because the renderer falls back to the
   * heading when a quote has no body.
   */
  const fields = FIELDS[layout];
  const slide = {
    ...(fields.heading && heading.trim() ? { heading: heading.trim() } : {}),
    ...(fields.body && text.trim() ? { text: text.trim() } : {}),
    ...(fields.footnote && footnote.trim() ? { footnote: footnote.trim() } : {}),
    ...(layout === 'picture' && picture
      ? { pictureAssetId: picture, fill } : {}),
  };
  const empty = Object.keys(slide).length === 0;

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
    if (empty) {
      setNote('A slide needs a heading, some words or a picture.');
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
        /*
         * EVERYTHING THE ROUTE ALREADY TOOK. `footnote`, `pictureAssetId`
         * and `ink` have been accepted since the route was written and
         * this panel sent none of them — so a picture slide said "no
         * picture", a quotation had nobody's name under it, and an
         * authored slide was white where the channel is not. [C-25]
         */
        body: JSON.stringify({ layout, ...slide, ...(ink ? { ink } : {}) }),
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
          setFootnote('');
          setPicture(null);
          setFill(false);
          setAdded(true);
          window.setTimeout(() => setAdded(false), 2400);
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
          fontSize: 'var(--text-2xs)', letterSpacing: 0.8, fontWeight: 700,
        }}>SLIDES</span>
        <button
          className="small" data-testid="write-slide" disabled={busy}
          onClick={() => setWriting((open) => !open)}
          style={{
            border: 0, background: 'none', padding: 0, fontSize: 'var(--text-xs)',
            color: 'var(--accent-soft)', cursor: 'pointer', marginRight: 9,
          }}
        >+ Write</button>
        <button
          className="small" data-testid="add-deck" disabled={busy}
          onClick={() => file.current?.click()}
          style={{
            border: 0, background: 'none', padding: 0, fontSize: 'var(--text-xs)',
            color: 'var(--accent-soft)', cursor: 'pointer',
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
        <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-xs)' }}>
          Upload a PowerPoint, a PDF or a Word document and each page becomes
          a slide you can put on air.
        </p>
      ) : (
        <select
          data-testid="deck-choice" value={chosen ?? ''}
          onChange={(event) => setChosen(event.target.value)}
          style={{ fontSize: 'var(--text-sm)', padding: '6px 9px' }}
        >
          {decks.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title} ({candidate.slides.length})
            </option>
          ))}
        </select>
      )}

      {/*
        * WRITING ONE.  [§21, §20, C-25]
        *
        * Four layouts and no formatting controls. A slide editor with
        * thirty of them is a slide editor somebody uses to make an ugly
        * slide; these four are each hard to make look bad, and "diverse"
        * is served by their being different from each other rather than
        * by each being adjustable. Bold, italics, alignment and line
        * spacing are exactly the controls that would undo that, so the
        * upgrade here is HIERARCHY and STATE, not more knobs.
        *
        * WHAT CHANGED IS WHICH FIELDS EXIST. The same two boxes were
        * shown for all four layouts, so Picture had nowhere to put a
        * picture and Quote had nowhere to put the person who said it —
        * while the route behind this has accepted both since it was
        * written. The fields now follow the layout.
        */}
      {writing && (
        <div data-testid="slide-writer" style={{
          display: 'flex', flexDirection: 'column', gap: 7, padding: 8,
          borderRadius: 'var(--radius-module)', background: 'var(--panel-2)',
          border: '1px solid var(--line)',
        }}>
          {/* ---- which kind of slide ------------------------------- */}
          <div
            className="row" role="tablist" aria-label="Slide layout"
            ref={modes}
            style={{
              gap: 3, flexWrap: 'nowrap', padding: 2,
              background: 'var(--panel)', borderRadius: 6,
              border: '1px solid var(--line)',
            }}
            /* ARROW KEYS MOVE BETWEEN THEM, which is what a radiogroup
               promises and what an operator's hands expect of a row of
               modes on a desk. */
            onKeyDown={(event) => {
              const by = event.key === 'ArrowRight' ? 1
                : event.key === 'ArrowLeft' ? -1 : 0;
              if (!by) return;
              event.preventDefault();
              const order = LAYOUTS.map((one) => one.id);
              const next = order[
                (order.indexOf(layout) + by + order.length) % order.length]!;
              setLayout(next);
              modes.current?.querySelector<HTMLButtonElement>(
                `[data-layout="${next}"]`)?.focus();
            }}
          >
            {LAYOUTS.map((option) => {
              const on = layout === option.id;
              return (
                <button
                  key={option.id} type="button" data-testid="slide-layout"
                  data-layout={option.id}
                  data-chosen={on ? 'true' : 'false'}
                  role="tab" aria-selected={on}
                  tabIndex={on ? 0 : -1}
                  title={option.says}
                  onClick={() => setLayout(option.id)}
                  style={{
                    flex: '1 1 0', display: 'inline-flex', alignItems: 'center',
                    justifyContent: 'center', gap: 4,
                    padding: '5px 4px', fontSize: 'var(--text-2xs)',
                    borderRadius: 4, border: 0, cursor: 'pointer',
                    /* The selected one is a RAISED TAB rather than a
                       tinted outline: an operator reads a filled shape
                       across a room and an outline they do not. */
                    background: on ? 'var(--panel-2)' : 'transparent',
                    boxShadow: on
                      ? 'inset 0 0 0 1px var(--accent), 0 1px 2px rgba(0,0,0,0.35)'
                      : 'none',
                    color: on ? 'inherit' : 'var(--muted)',
                    fontWeight: on ? 700 : 400,
                  }}
                >
                  <Icon name={option.icon} size={11} />
                  {option.label}
                </button>
              );
            })}
          </div>

          {/* ---- a picture, from the library ----------------------- */}
          {layout === 'picture' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {picture ? (
                <>
                  <div style={{
                    position: 'relative', aspectRatio: '16 / 9',
                    borderRadius: 'var(--radius-screen)', overflow: 'hidden',
                    background: 'var(--screen-bed)',
                    border: '1px solid var(--line)',
                  }}>
                    <img alt="" src={`/api/library/${picture}`} style={{
                      width: '100%', height: '100%',
                      objectFit: fill ? 'cover' : 'contain',
                    }} />
                  </div>
                  <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    {/* FIT OR FILL AND NO CROP HANDLE. The two honest
                        things to do with somebody else's photograph;
                        a crop rectangle is a picture editor, and this
                        panel is used between two cues. */}
                    {([['Fit', false], ['Fill', true]] as const).map(
                      ([label, want]) => (
                        <button
                          key={label} type="button" className="small"
                          data-testid="slide-fit" data-fit={label.toLowerCase()}
                          aria-pressed={fill === want}
                          onClick={() => setFill(want)}
                          style={{
                            flex: '1 1 0', fontSize: 'var(--text-2xs)',
                            padding: '4px 6px',
                            border: `1px solid ${
                              fill === want ? 'var(--accent)' : 'var(--line)'}`,
                            background: fill === want
                              ? 'var(--accent-wash)' : 'transparent',
                          }}
                        >{label}</button>
                      ))}
                    <button
                      type="button" className="small" data-testid="slide-unpick"
                      onClick={() => { setPicture(null); setPicking(false); }}
                      style={{
                        flex: '0 0 auto', fontSize: 'var(--text-2xs)',
                        padding: '4px 8px',
                      }}
                    >Remove</button>
                  </div>
                </>
              ) : (
                <button
                  type="button" data-testid="slide-pick"
                  onClick={() => setPicking((open) => !open)}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    justifyContent: 'center', gap: 4, padding: '18px 10px',
                    borderRadius: 'var(--radius-control)',
                    border: '1px dashed var(--line)', background: 'transparent',
                    color: 'var(--muted)', cursor: 'pointer',
                    fontSize: 'var(--text-xs)',
                  }}
                >
                  <Icon name="library" size={15} />
                  {pictures.length > 0
                    ? 'Choose a picture from the Library'
                    : 'No pictures in the Library yet'}
                </button>
              )}

              {picking && pictures.length > 0 && (
                <div data-testid="slide-library" style={{
                  display: 'grid', gap: 4, maxHeight: 132, overflowY: 'auto',
                  gridTemplateColumns: 'repeat(3, 1fr)', padding: 2,
                }}>
                  {pictures.map((one) => (
                    <button
                      key={one.assetId} type="button" title={one.title}
                      data-testid="slide-library-item"
                      onClick={() => { setPicture(one.assetId); setPicking(false); }}
                      style={{
                        padding: 0, border: '1px solid var(--line)',
                        /* A PICTURE TAKES THE SCREEN RADIUS, not a card's.
                           A monitor and a card are different objects and
                           the console says so in one token. */
                        borderRadius: 'var(--radius-screen)',
                        overflow: 'hidden', cursor: 'pointer',
                        aspectRatio: '16 / 9', background: 'var(--screen-bed)',
                      }}
                    >
                      <img alt="" src={`/api/library/${one.assetId}`} style={{
                        width: '100%', height: '100%', objectFit: 'cover',
                        display: 'block',
                      }} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ---- the words ----------------------------------------- */}
          {FIELDS[layout].heading && (
            <input
              data-testid="slide-heading" value={heading}
              onChange={(event) => setHeading(event.target.value)}
              placeholder={FIELDS[layout].heading}
              style={{ fontSize: 'var(--text-sm)', padding: '6px 9px' }}
            />
          )}
          {FIELDS[layout].body && (
            <textarea
              data-testid="slide-text" value={text}
              rows={layout === 'picture' ? 2 : 3}
              onChange={(event) => setText(event.target.value)}
              placeholder={FIELDS[layout].body}
              style={{
                fontSize: 'var(--text-sm)', padding: '6px 9px', width: '100%',
                resize: 'vertical', font: 'inherit', background: 'var(--panel)',
                border: '1px solid var(--line)',
                borderRadius: 'var(--radius-control)', color: 'inherit',
              }}
            />
          )}
          {FIELDS[layout].footnote && (
            <input
              data-testid="slide-footnote" value={footnote}
              onChange={(event) => setFootnote(event.target.value)}
              placeholder={FIELDS[layout].footnote}
              style={{ fontSize: 'var(--text-sm)', padding: '6px 9px' }}
            />
          )}

          {/* ---- what this slide is, and how to write one ----------- *
            *
            * THE SYNTAX WAS IN THE PLACEHOLDER, where it read as
            * developer documentation and vanished the moment anybody
            * typed. It is a hint now: out of the way, and still there
            * after the first character. */}
          <div className="row" style={{
            gap: 6, flexWrap: 'nowrap', alignItems: 'center',
            fontSize: 'var(--text-2xs)', color: 'var(--muted)',
          }}>
            <span data-testid="slide-state">
              {added ? 'Added' : empty ? 'Empty' : 'Draft'}
            </span>
            <span aria-hidden="true">·</span>
            <span>16:9</span>
            <span className="grow" />
            {FIELDS[layout].body && (
              <button
                type="button" data-testid="slide-help"
                aria-expanded={help}
                onClick={() => setHelp((open) => !open)}
                style={{
                  border: 0, background: 'none', padding: 0, cursor: 'pointer',
                  color: 'var(--muted)', fontSize: 'var(--text-2xs)',
                  textDecoration: 'underline dotted',
                }}
              >Writing help</button>
            )}
          </div>
          {help && (
            <p className="small muted" data-testid="slide-help-text" style={{
              margin: 0, fontSize: 'var(--text-2xs)', lineHeight: 1.5,
            }}>
              A blank line starts a new paragraph. A line beginning
              {' '}<code>- </code> is a bullet, and one beginning
              {' '}<code>1. </code> is a numbered point — the numbering
              starts wherever you do.
            </p>
          )}

          <button
            className="ctl" data-testid="make-slide" disabled={busy}
            onClick={() => { void write(); }}
            style={{
              display: 'inline-flex', alignItems: 'center',
              justifyContent: 'center', gap: 5, fontWeight: 700,
              /* A PRIMARY ACTION LOOKS LIKE ONE. It is the only thing in
                 this card that commits anything. */
              border: `1px solid ${added ? 'var(--ok)' : 'var(--accent)'}`,
              background: added ? 'transparent' : 'var(--accent-wash)',
              color: added ? 'var(--ok)' : 'inherit',
            }}
          >
            {busy ? 'Drawing\u2026'
              : added ? '\u2713 Added to deck'
                : <><Icon name="plus" size={11} />
                  {deck ? 'Add to deck' : 'Start a deck'}</>}
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
            position: 'relative', aspectRatio: '16 / 9',
            borderRadius: 'var(--radius-screen)',
            overflow: 'hidden', background: 'var(--screen-bed)',
            border: `1px solid ${at >= 0 ? 'var(--accent)' : 'var(--line)'}`,
          }}>
            {at >= 0 ? (
              <img alt="" src={`/api/library/${deck.slides[at]!.assetId}`}
                   style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span className="muted" style={{
                position: 'absolute', inset: 0, display: 'grid',
                placeItems: 'center', fontSize: 'var(--text-xs)',
              }}>Not on air</span>
            )}
          </div>

          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <button
              className="small" data-testid="slide-back"
              disabled={!onAir || !step(deck, at, -1)}
              onClick={() => go(-1)}
              style={{ flex: '0 0 auto', padding: '7px 11px', lineHeight: 0 }}
            ><Icon name="chevron" size={12} turn={180} /></button>
            <span className="mono grow" data-testid="slide-position" style={{
              textAlign: 'center', fontSize: 'var(--text-sm)', fontWeight: 700,
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
              style={{ flex: '0 0 auto', padding: '7px 11px', lineHeight: 0 }}
            ><Icon name="chevron" size={12} /></button>
            <button
              className="small" data-testid="slide-blank" disabled={at < 0}
              title="Take the slides down and go back to the room"
              onClick={onRollOut}
              style={{ flex: '0 0 auto', padding: '7px 10px', fontSize: 'var(--text-xs)' }}
            >Blank</button>
          </div>
        </>
      )}

      {note && (
        <p className="small muted" data-testid="slides-note"
           style={{ margin: 0, fontSize: 'var(--text-xs)' }}>{note}</p>
      )}
    </div>
  );
}
