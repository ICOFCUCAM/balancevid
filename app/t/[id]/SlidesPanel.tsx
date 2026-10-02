'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../Icon.js';
import type { Channel, ProgrammeSource } from '../../../src/domain/channel.js';
import {
  type Deck, type House, type Slide,
  deckStanding, losingDeck, losingSlide, losingWriting,
  slideOnAir, slideSays, sourceForSlide, step, toCheck,
} from '../../../src/domain/deck.js';
import { useConfirm } from '../../Confirm.js';
import {
  ACTION_SAFE, BACKGROUNDS, SLIDE_HEIGHT, SLIDE_WIDTH, TITLE_SAFE,
  type Background, type Focus,
  type SlideSpec, slideHtml, slideProblems,
} from '../../../src/render/slideDesign.js';

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
  const [bed, setBed] = useState<Background>('black');
  const [focus, setFocus] = useState<Focus>('centre');
  /** The slide being corrected, if this is a correction. [C-26] */
  const [editing, setEditing] = useState<string | null>(null);
  /** Which rundown row has its actions open. One at a time. */
  const [opened, setOpened] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  /** Shown for a moment after a slide lands, so the press has an answer. */
  const [added, setAdded] = useState(false);
  const [help, setHelp] = useState(false);
  /*
   * OFF UNTIL ASKED FOR. The guides are a measuring instrument, not
   * part of the picture, and a preview permanently crossed with two
   * rectangles is a preview that no longer shows what goes out.
   * [§27, C-38]
   */
  const [guides, setGuides] = useState(false);
  const file = useRef<HTMLInputElement | null>(null);
  const modes = useRef<HTMLDivElement | null>(null);
  /*
   * THE PRODUCT'S OWN DIALOG, WHICH THIS PANEL NEVER USED.  [D-04, C-37]
   *
   * Nine surfaces ask before something irreversible. The one used
   * BETWEEN TWO CUES, with a Remove that deletes a picture out of the
   * library on a single press, asked nothing at all.
   */
  const { confirm, dialog: confirmDialog } = useConfirm();

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
   * AND WHAT IS WRONG WITH THE SLIDES THAT ARE ALREADY IN IT.  [C-36]
   *
   * The fault list under the writer has always judged the slide being
   * TYPED, and has never once judged a slide already in the deck. So
   * a heading four characters over its limit was said while it was
   * being written and never again, a picture deleted from the library
   * left its slide uncorrectable with nothing said until the button
   * failed, and a channel that changed colour left every slide
   * composed before it carrying the old one — a deck that transmits
   * two stations in order.
   *
   * THE HOUSE IS WHAT THE CHANNEL IS NOW, not what it was when the
   * slide was drawn, which is the entire point: the drift is the
   * difference between the two. The library list is the one this
   * panel is already given (there is no second fetch), so a picture
   * that is gone from that list is gone.
   */
  const house: House = useMemo(() => ({
    ...(ink ? { accent: ink } : {}),
    ...(channel.name ? { channel: channel.name } : {}),
    pictures: new Set(pictures.map((one) => one.assetId)),
  }), [ink, channel.name, pictures]);
  const standings = useMemo(
    () => (deck ? deckStanding(deck, house) : []), [deck, house]);
  const wanting = toCheck(standings);

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

  /*
   * WHAT THE OPERATOR IS ABOUT TO TRANSMIT, drawn by the renderer that
   * will transmit it.  [§21, C-26]
   *
   * `slideHtml` is the function the worker rasterises. The preview is
   * not a second stylesheet that looks similar: it is that output, in
   * an iframe, scaled down. A preview drawn separately is a preview
   * that lies, and the fault would only ever be found on air.
   *
   * The picture is the library's own path here and inlined bytes in
   * the worker, because the renderer there is forbidden the network
   * (D-06) and the operator's browser is already authenticated. The
   * composition is identical either way.
   */
  const draft: SlideSpec = {
    layout,
    ...(fields.heading && heading.trim() ? { heading: heading.trim() } : {}),
    ...(fields.body && text.trim() ? { body: text.trim() } : {}),
    ...(fields.footnote && footnote.trim() ? { footnote: footnote.trim() } : {}),
    ...(layout === 'picture' && picture ? { picture, fill } : {}),
    ...(focus === 'centre' ? {} : { focus }),
    ...(bed === 'black' ? {} : { background: bed }),
    ...(ink ? { accent: ink } : {}),
    ...(channel.name ? { channel: channel.name } : {}),
  };
  const pictureUrl = picture ? `/api/library/${picture}` : undefined;
  const faults = empty ? [] : slideProblems(draft);
  /*
   * A FAULT THAT WOULD TRANSMIT SOMETHING BROKEN STOPS THE SLIDE;
   * the rest are said and not enforced. An operator three minutes
   * into a live programme is better placed to judge a heading four
   * characters over its limit than this panel is, and a control room
   * that refuses to put anything up until it is perfect is a control
   * room somebody works around. [§5, D-04]
   */
  const blocked = faults.some((fault) => fault.blocking);

  /** Load a slide back into the writer, to correct or to copy. [C-26] */
  const take = (one: Slide, correcting: boolean) => {
    const was = one.spec;
    if (!was) return;
    setLayout(was.layout);
    setHeading(was.heading ?? '');
    setText(was.body ?? '');
    setFootnote(was.footnote ?? '');
    setPicture(was.picture ?? null);
    setFill(was.fill ?? false);
    setFocus(was.focus ?? 'centre');
    setBed(was.background ?? 'black');
    setEditing(correcting ? one.assetId : null);
    setWriting(true);
    setAdded(false);
    setOpened(null);
  };

  /** Put everything back, after a slide lands or an edit is abandoned. */
  const clear = () => {
    setHeading(''); setText(''); setFootnote('');
    setPicture(null); setFill(false); setFocus('centre');
    setEditing(null);
  };

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
    if (blocked) {
      setNote(faults.find((fault) => fault.blocking)!.says);
      return;
    }
    setBusy(true);
    setNote(editing ? 'Redrawing the slide\u2026' : 'Drawing the slide\u2026');
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
        body: JSON.stringify({
          layout, ...slide,
          ...(bed === 'black' ? {} : { background: bed }),
          ...(focus === 'centre' ? {} : { focus }),
          ...(ink ? { accent: ink } : {}),
          ...(channel.name ? { channel: channel.name } : {}),
          ...(editing ? { replaces: editing } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setNote(data.error ?? 'that slide was refused'); return; }

      /*
       * The worker is drawing it. Poll until the deck says it landed —
       * which is a longer count for a new slide, and the OLD ASSET
       * GONE for a correction, because correcting one leaves the
       * count exactly where it was. [C-26]
       */
      const before = deck?.slides.length ?? 0;
      const correcting = editing;
      for (let tries = 0; tries < 30; tries += 1) {
        await new Promise((resolve) => { setTimeout(resolve, 1500); });
        const check = await fetch(`/api/decks/${target}`, { cache: 'no-store' });
        if (!check.ok) continue;
        const now = (await check.json()).deck as Deck;
        const landed = correcting
          ? !now.slides.some((one) => one.assetId === correcting)
          : now.slides.length > before;
        if (landed) {
          await read();
          setChosen(now.id);
          clear();
          setAdded(true);
          window.setTimeout(() => setAdded(false), 2400);
          setNote(`${now.title} \u2014 ${now.slides.length} slides`);
          return;
        }
      }
      setNote('Still drawing it. It will appear when the worker has finished.');
    } finally { setBusy(false); }
  };

  /**
   * Reorder, copy or remove one.  [§20, C-26]
   *
   * EVERY ONE OF THESE WENT THROUGH A ROUTE THAT ALREADY EXISTED.
   * `PATCH … {action:'move'}` and `{action:'remove'}` have been there
   * since the deck was written and the panel called neither, so the
   * rundown is a door onto behaviour this product already had — which
   * is what D-19 asks to be checked before anything is built. Copying
   * is the write route again, with the stored definition and a
   * position one further on.
   */
  const shift = async (one: Slide, by: 1 | -1) => {
    if (!deck) return;
    const to = deck.slides.findIndex((it) => it.assetId === one.assetId) + by;
    if (to < 0 || to >= deck.slides.length) return;
    setBusy(true);
    try {
      await fetch(`/api/decks/${deck.id}/slides`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'move', assetId: one.assetId, to }),
      });
      await read();
    } finally { setBusy(false); }
  };

  const drop = async (one: Slide) => {
    if (!deck) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/decks/${deck.id}/slides`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'remove', assetId: one.assetId }),
      });
      /* A slide may be somebody's safe playlist, and the route says
         so rather than taking it. [D-23] */
      if (!response.ok) {
        setNote((await response.json().catch(() => ({}))).error
          ?? 'that slide could not be removed');
        return;
      }
      setOpened(null);
      await read();
    } finally { setBusy(false); }
  };

  const copy = async (one: Slide) => {
    if (!deck || !one.spec) return;
    const was = one.spec;
    const at = deck.slides.findIndex((it) => it.assetId === one.assetId) + 1;
    setBusy(true);
    setNote('Copying the slide\u2026');
    try {
      await fetch(`/api/decks/${deck.id}/slides`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          layout: was.layout, at,
          ...(was.heading ? { heading: was.heading } : {}),
          ...(was.body ? { text: was.body } : {}),
          ...(was.footnote ? { footnote: was.footnote } : {}),
          ...(was.picture ? { pictureAssetId: was.picture } : {}),
          ...(was.fill ? { fill: true } : {}),
          ...(was.focus ? { focus: was.focus } : {}),
          ...(was.background ? { background: was.background } : {}),
          ...(was.accent ? { accent: was.accent } : {}),
          ...(was.channel ? { channel: was.channel } : {}),
        }),
      });
      const want = deck.slides.length + 1;
      for (let tries = 0; tries < 30; tries += 1) {
        await new Promise((resolve) => { setTimeout(resolve, 1500); });
        const check = await fetch(`/api/decks/${deck.id}`, { cache: 'no-store' });
        if (!check.ok) continue;
        if (((await check.json()).deck as Deck).slides.length >= want) {
          setOpened(null);
          await read();
          setNote(null);
          return;
        }
      }
      setNote('Still copying it. It will appear when the worker has finished.');
    } finally { setBusy(false); }
  };

  /**
   * Throw a deck away.  [§19, D-04, C-37]
   *
   * THE ROUTE HAS BEEN THERE SINCE THE DECK STORE WAS WRITTEN AND
   * NOTHING CALLED IT. A deck could be made and never unmade, so
   * every upload and every mistaken one stayed for ever — and a
   * DELETE that no surface reaches is the same shape of gap as a
   * predicate nothing calls. Reached now, behind the dialog, because
   * this is the one deletion in the product that really does take
   * media with it.
   */
  const scrap = async (which: Deck) => {
    setBusy(true);
    try {
      const response = await fetch(`/api/decks/${which.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        /* A slide may be somebody's safe playlist, and the route says
           so rather than taking it. [D-23] */
        setNote((await response.json().catch(() => ({}))).error
          ?? 'that deck could not be thrown away');
        return;
      }
      setChosen(null);
      setOpened(null);
      setNote(null);
      await read();
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
      {confirmDialog}
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
        <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
          <select
            className="grow"
            data-testid="deck-choice" value={chosen ?? ''}
            onChange={(event) => setChosen(event.target.value)}
            style={{ fontSize: 'var(--text-sm)', padding: '6px 9px',
              minWidth: 0 }}
          >
            {decks.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.title} ({candidate.slides.length})
              </option>
            ))}
          </select>
          {/*
            * AND A WAY TO UNMAKE ONE, at last. A deck could be made and
            * never thrown away — the DELETE route has been there since
            * the store was written and no surface reached it, so every
            * upload and every mistaken one stayed for ever. [D-19, C-37]
            */}
          {deck && (
            <button
              type="button" className="small" disabled={busy}
              data-testid="deck-remove"
              onClick={() => confirm({
                ...losingDeck(deck), danger: true,
                go: () => { void scrap(deck); },
              })}
              style={{ flex: '0 0 auto', padding: '5px 9px',
                fontSize: 'var(--text-2xs)', color: 'var(--bad)' }}
            >Throw away</button>
          )}
        </div>
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

          {/* ---- what it will look like, and what it is drawn on --- */}
          <Stage
            label="PREVIEW" tone={empty ? 'idle' : 'preview'}
            empty="Write something and it appears here"
            guides={guides} onGuides={setGuides}
            {...(empty ? {} : { html: slideHtml(draft, pictureUrl) })}
          />

          {/*
            * FIVE BACKGROUNDS, and they are design assets rather than
            * decoration: the thing that made every authored slide look
            * unfinished was that all of them were black. Black stays
            * the default, because a control room is dark and a slide
            * that matches the programme's own black cuts cleanly.
            */}
          <div className="row" role="group" aria-label="Slide background"
               style={{ gap: 4, flexWrap: 'nowrap' }}>
            {BACKGROUNDS.map((preset) => {
              const on = bed === preset.id;
              return (
                <button
                  key={preset.id} type="button" className="small"
                  data-testid="slide-bed" data-bed={preset.id}
                  aria-pressed={on} title={preset.label}
                  onClick={() => setBed(preset.id)}
                  style={{
                    flex: '1 1 0', padding: 0, height: 22, cursor: 'pointer',
                    /* A swatch stands for the slide's own canvas, so
                       it is rounded like a screen and not like a
                       control. The console says which object this is
                       in one token. */
                    borderRadius: 'var(--radius-screen)',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
                    /* The swatch IS the preset's own colour, which is
                       the only label a background needs. */
                    background: preset.id === 'image'
                      ? 'var(--screen-bed)' : preset.base,
                    boxShadow: on ? 'inset 0 0 0 1px var(--accent)' : 'none',
                  }}
                >{preset.id === 'image'
                  ? <Icon name="library" size={10} /> : ''}</button>
              );
            })}
          </div>

          {/* ---- a picture, from the library ----------------------- */}
          {layout === 'picture' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {picture ? (
                <>
                  {/*
                    * A THUMBNAIL AND NOT A SECOND PREVIEW. Until C-26
                    * this was a 16:9 picture the width of the panel,
                    * which was the only way to see what had been
                    * chosen. The PREVIEW above now shows the whole
                    * composition with the picture in it, so a second
                    * big picture is the same thing twice and the
                    * panel's compact footprint paying for it.
                    */}
                  <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                    <img
                      alt="" src={`/api/library/${picture}`}
                      data-testid="slide-chosen"
                      style={{
                        width: 44, height: 25, flex: '0 0 auto',
                        objectFit: 'cover', display: 'block',
                        borderRadius: 'var(--radius-screen)',
                        background: 'var(--screen-bed)',
                      }}
                    />
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
                  {fill && (
                    /*
                      * WHICH PART SURVIVES THE CROP. Filling a 16:9
                      * frame with somebody's photograph takes something
                      * away, and the operator is the one who knows
                      * whether it is the sky or the feet. Three
                      * positions and no drag handle: a crop rectangle
                      * is a picture editor, and this panel is used
                      * between two cues.
                      */
                    <div className="row" role="group" aria-label="Picture focus"
                         style={{ gap: 4, flexWrap: 'nowrap' }}>
                      {(['top', 'centre', 'bottom'] as const).map((where) => (
                        <button
                          key={where} type="button" className="small"
                          data-testid="slide-focus" data-focus={where}
                          aria-pressed={focus === where}
                          onClick={() => setFocus(where)}
                          style={{
                            flex: '1 1 0', fontSize: 'var(--text-2xs)',
                            padding: '3px 6px', textTransform: 'capitalize',
                            border: `1px solid ${focus === where
                              ? 'var(--accent)' : 'var(--line)'}`,
                            background: focus === where
                              ? 'var(--accent-wash)' : 'transparent',
                          }}
                        >{where}</button>
                      ))}
                    </div>
                  )}
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
            {/*
              * DRAFT, READY, OR WHAT IS WRONG. The gate is the quality
              * check and not the operator's eye: a slide is READY when
              * nothing is wrong with it, and "needs attention" names
              * the one thing to change. Restrained on purpose — these
              * are words in a status line, not badges. [D-04]
              */}
            <span data-testid="slide-state" data-ready={
              empty ? 'empty' : faults.length ? 'faulty' : 'ready'
            } style={{
              fontWeight: faults.length ? 700 : 400,
              color: added ? 'var(--ok)'
                : faults.length ? 'var(--warn)' : 'var(--muted)',
            }}>
              {added ? '\u2713 Added'
                : empty ? 'Empty'
                  : faults.length ? '! Needs attention' : '\u2713 Ready'}
            </span>
            <span aria-hidden="true">·</span>
            <span>{editing ? 'Correcting' : 'New slide'}</span>
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

          {faults.length > 0 && (
            <ul data-testid="slide-faults" style={{
              margin: 0, paddingLeft: '1.1em', display: 'flex',
              flexDirection: 'column', gap: 3,
              fontSize: 'var(--text-2xs)', color: 'var(--warn)',
            }}>
              {faults.map((fault) => (
                <li key={fault.code} data-fault={fault.code}
                    data-blocking={fault.blocking ? 'true' : 'false'}
                    style={fault.blocking ? { color: 'var(--bad)' } : undefined}
                >{fault.says}</li>
              ))}
            </ul>
          )}

          <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
          {editing && (
            <button
              type="button" className="small" data-testid="slide-abandon"
              onClick={() => { clear(); setNote(null); }}
              style={{ flex: '0 0 auto', fontSize: 'var(--text-2xs)',
                padding: '6px 9px' }}
            >Cancel</button>
          )}
          <button
            className="ctl grow" data-testid="make-slide"
            disabled={busy || blocked}
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
                : editing ? <><Icon name="pencil" size={11} />Replace slide</>
                  : <><Icon name="plus" size={11} />
                    {deck ? 'Add to deck' : 'Start a deck'}</>}
          </button>
          </div>
        </div>
      )}

      {deck && (
        <>
          {/*
            * THE RUNDOWN.  [§20, §5, C-26]
            *
            * `Written here (2)` was a count, and a count is not a
            * rundown: an operator about to take a slide needs to know
            * WHICH slide, and the only way to know that is to see it.
            * So each row is a thumbnail, its number and its first
            * line — the same three things a paper running order has
            * had for sixty years.
            *
            * CLICKING A ROW TAKES IT, while live. That is the whole
            * point of the list and it is the existing `roll-in`
            * action, not a new one. The rest — up, down, copy,
            * correct, remove — opens under the row that asked for it,
            * one row at a time, because five buttons on every row is
            * a rundown nobody can read.
            */}
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <span className="muted grow" style={{
              fontSize: 'var(--text-2xs)', letterSpacing: 0.8, fontWeight: 700,
              textTransform: 'uppercase',
            }}>{deck.title} {'\u2014'} {deck.slides.length} slide{
              deck.slides.length === 1 ? '' : 's'}</span>
            {/*
              * SAID ONLY WHEN THERE IS SOMETHING TO SAY. A deck with
              * nothing wrong with it gets no badge at all: a count
              * that is always there is a count nobody reads, and the
              * uploaded pages of somebody's PowerPoint are not
              * counted because this product never composed them and
              * has no basis for an opinion. [§21, C-36]
              */}
            {wanting > 0 && (
              <span data-testid="deck-to-check" style={{
                flex: '0 0 auto', fontSize: 'var(--text-2xs)',
                fontWeight: 700, color: 'var(--state-armed)',
              }}>{wanting} to check</span>
            )}
          </div>
          <div data-testid="slide-rundown" style={{
            display: 'flex', flexDirection: 'column', gap: 2,
            maxHeight: 186, overflowY: 'auto',
          }}>
            {deck.slides.map((one, index) => {
              const live = index === at;
              const open = opened === one.assetId;
              const stands = standings[index];
              /* The same words the confirmation uses, so the person
                 checking which slide they are about to destroy is not
                 comparing two labels. [C-37] */
              const says = slideSays(one);
              return (
                <div key={one.assetId} style={{
                  display: 'flex', flexDirection: 'column', gap: 2,
                }}>
                  <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
                    <button
                      type="button" data-testid="rundown-row"
                      data-live={live ? 'true' : 'false'}
                      aria-current={live ? 'true' : undefined}
                      disabled={!onAir}
                      title={onAir ? 'Take this slide to programme'
                        : 'Only while you are live'}
                      onClick={() => onShow(sourceForSlide(one))}
                      style={{
                        flex: '1 1 auto', display: 'flex', alignItems: 'center',
                        gap: 6, padding: 3, cursor: onAir ? 'pointer' : 'default',
                        textAlign: 'left', minWidth: 0,
                        borderRadius: 'var(--radius-control)',
                        border: `1px solid ${live
                          ? 'var(--state-live)' : 'transparent'}`,
                        background: live
                          ? 'var(--state-live-wash)' : 'transparent',
                      }}
                    >
                      <img
                        alt="" src={`/api/library/${one.assetId}`}
                        style={{
                          width: 52, height: 29, flex: '0 0 auto',
                          objectFit: 'cover', display: 'block',
                          borderRadius: 'var(--radius-screen)',
                          background: 'var(--screen-bed)',
                        }}
                      />
                      <span className="mono" style={{
                        fontSize: 'var(--text-2xs)', opacity: 0.7,
                        flex: '0 0 auto',
                      }}>{String(index + 1).padStart(2, '0')}</span>
                      <span className="grow" style={{
                        fontSize: 'var(--text-2xs)', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        minWidth: 0,
                      }}>{says}</span>
                      {/*
                        * A MARK ONLY WHERE THERE IS SOMETHING TO
                        * MARK. `ready` and `as-is` both get nothing,
                        * and that is deliberate: a tick beside every
                        * clean row is forty ticks an operator reads
                        * past, and a mark beside a slide this
                        * product holds no definition for would be it
                        * grading work it cannot see. [§21, C-36]
                        */}
                      {stands && stands.standing !== 'ready'
                        && stands.standing !== 'as-is' && (
                        <span
                          data-testid="slide-standing"
                          data-standing={stands.standing}
                          title={stands.faults.map((f) => f.says).join(' ')}
                          style={{
                            flex: '0 0 auto', width: 6, height: 6,
                            borderRadius: '50%',
                            background: stands.standing === 'broken'
                              ? 'var(--state-bad)' : 'var(--state-armed)',
                          }}
                        />
                      )}
                    </button>
                    <button
                      type="button" className="small"
                      data-testid="rundown-more" aria-expanded={open}
                      aria-label={`What to do with slide ${index + 1}`}
                      onClick={() => setOpened(open ? null : one.assetId)}
                      style={{
                        flex: '0 0 auto', padding: '4px 7px', border: 0,
                        background: 'none', color: 'var(--muted)',
                        cursor: 'pointer', fontSize: 'var(--text-2xs)',
                      }}
                    >{'\u22ef'}</button>
                  </div>
                  {/*
                    * AND THE SENTENCES UNDER THE ROW THAT ASKED.
                    * The dot says there is something; this says what,
                    * in the same words the writer uses while a slide
                    * is being typed — one vocabulary for one
                    * judgement. [C-26, C-36]
                    */}
                  {open && stands && stands.faults.length > 0 && (
                    <ul data-testid="slide-row-faults" style={{
                      margin: '0 0 2px', padding: '5px 8px', listStyle: 'none',
                      display: 'flex', flexDirection: 'column', gap: 3,
                      borderRadius: 6, borderLeft: `2px solid ${
                        stands.standing === 'broken'
                          ? 'var(--state-bad)' : 'var(--state-armed)'}`,
                      background: 'var(--panel-2)',
                      fontSize: 'var(--text-2xs)', lineHeight: 1.45,
                      color: 'var(--muted)',
                    }}>
                      {stands.faults.map((fault) => (
                        <li key={fault.code} data-fault={fault.code}
                            data-blocking={fault.blocking ? 'true' : 'false'}
                            style={{ color: fault.blocking
                              ? 'var(--bad)' : undefined }}>{fault.says}</li>
                      ))}
                    </ul>
                  )}
                  {open && (
                    <div className="row" style={{
                      gap: 3, flexWrap: 'nowrap', paddingLeft: 3,
                      paddingBottom: 3,
                    }}>
                      <button
                        type="button" className="small" disabled={busy || index === 0}
                        data-testid="rundown-up" aria-label="Move up"
                        onClick={() => { void shift(one, -1); }}
                        style={{ padding: '3px 7px', lineHeight: 0 }}
                      ><Icon name="chevron" size={10} turn={270} /></button>
                      <button
                        type="button" className="small"
                        disabled={busy || index === deck.slides.length - 1}
                        data-testid="rundown-down" aria-label="Move down"
                        onClick={() => { void shift(one, 1); }}
                        style={{ padding: '3px 7px', lineHeight: 0 }}
                      ><Icon name="chevron" size={10} turn={90} /></button>
                      {/*
                        * CORRECT AND COPY EXIST WHERE A DEFINITION
                        * DOES, and a page of somebody's PowerPoint
                        * has none. Offering to edit an image this
                        * product never composed would be a button
                        * that cannot keep its promise. [§21]
                        */}
                      {one.spec && (
                        <>
                          <button
                            type="button" className="small" disabled={busy}
                            data-testid="rundown-edit"
                            /* CORRECT FILLS EVERY FIELD FROM THE STORED
                               DEFINITION, so a half-written slide in the
                               boxes goes with no press that said so.
                               Asked only where there is something to
                               lose. [C-37] */
                            onClick={() => {
                              if (empty || editing === one.assetId) {
                                take(one, true);
                                return;
                              }
                              confirm({
                                ...losingWriting(one), danger: true,
                                go: () => take(one, true),
                              });
                            }}
                            style={{ padding: '3px 8px',
                              fontSize: 'var(--text-2xs)' }}
                          >Correct</button>
                          <button
                            type="button" className="small" disabled={busy}
                            data-testid="rundown-copy"
                            onClick={() => { void copy(one); }}
                            style={{ padding: '3px 8px',
                              fontSize: 'var(--text-2xs)' }}
                          >Copy</button>
                        </>
                      )}
                      <span className="grow" />
                      <button
                        type="button" className="small" disabled={busy}
                        data-testid="rundown-remove"
                        /* THE PICTURE IS DELETED BY THE ROUTE AND THERE
                           IS NO TRASH. On air, it is deleted out from
                           under the transmitter. [D-04, C-37] */
                        onClick={() => confirm({
                          ...losingSlide(deck, one.assetId, live),
                          danger: true,
                          go: () => { void drop(one); },
                        })}
                        style={{ padding: '3px 8px',
                          fontSize: 'var(--text-2xs)', color: 'var(--bad)' }}
                      >Remove</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/*
            * WHAT THE AUDIENCE CAN SEE, and it says so. The same
            * component as the preview, in the other tally colour: a
            * gallery's two states are PREVIEW and PROGRAM, and a
            * control room that labels neither is one an operator has
            * to guess at. [§6, §7]
            *
            * Drawn from the library, because the slide on air IS a
            * library image — not re-rendered here, which would be a
            * second opinion about what went out. [D-22]
            */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
              <span data-testid="programme-label" style={{
                fontSize: 'var(--text-2xs)', letterSpacing: 1, fontWeight: 700,
                color: at >= 0 ? 'var(--state-live)' : 'var(--muted)',
              }}>{at >= 0 ? 'PROGRAM' : 'OFF'}</span>
              <span className="grow" />
              <span className="muted" style={{ fontSize: 'var(--text-2xs)' }}>
                16:9</span>
            </div>
            <div style={{
              position: 'relative', aspectRatio: '16 / 9',
              borderRadius: 'var(--radius-screen)',
              overflow: 'hidden', background: 'var(--screen-bed)',
              border: `1px solid ${at >= 0
                ? 'var(--state-live)' : 'var(--line)'}`,
            }}>
              {at >= 0 ? (
                <img alt="" src={`/api/library/${deck.slides[at]!.assetId}`}
                     style={{ width: '100%', height: '100%',
                       objectFit: 'contain' }} />
              ) : (
                <span className="muted" style={{
                  position: 'absolute', inset: 0, display: 'grid',
                  placeItems: 'center', fontSize: 'var(--text-xs)',
                }}>Not on air</span>
              )}
            </div>
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

/**
 * The slide at broadcast proportions, drawn by the broadcast renderer.
 * [§21, §7, C-26]
 *
 * AN IFRAME AND NOT A RE-IMPLEMENTATION. What is inside it is the
 * exact document the worker rasterises, at its real 1920 × 1080, scaled
 * to whatever width the panel happens to be. So "the preview matches
 * the programme" is not a thing anybody has to maintain: there is one
 * document and this is it, smaller.
 *
 * SCRIPTS OFF AND NO POINTER. A slide is untrusted text (D-06) and the
 * sandbox says so even though the renderer never emits a script; and
 * the operator is looking at it rather than using it, so a click must
 * reach the control underneath rather than the page inside.
 *
 * The label is the state, and the states are the two a gallery has:
 * PREVIEW is what you are making, PROGRAM is what the audience can
 * see. They are the house colours for exactly those (§6), so an
 * operator reads this the way they read every other tally here.
 */
function Stage({ html, label, tone, empty, guides, onGuides }: {
  html?: string;
  label: string;
  tone: 'preview' | 'program' | 'idle';
  empty?: string;
  /** Draw the two broadcast boxes over the picture. [§27, C-38] */
  guides?: boolean;
  onGuides?: (next: boolean) => void;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0);

  useEffect(() => {
    const frame = box.current;
    if (!frame) return undefined;
    const watch = new ResizeObserver(() => {
      setScale(frame.clientWidth / SLIDE_WIDTH);
    });
    watch.observe(frame);
    return () => watch.disconnect();
  }, []);

  const edge = tone === 'program' ? 'var(--state-live)'
    : tone === 'preview' ? 'var(--state-armed)' : 'var(--line)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div className="row" style={{ gap: 5, flexWrap: 'nowrap' }}>
        <span data-testid="stage-label" data-tone={tone} style={{
          fontSize: 'var(--text-2xs)', letterSpacing: 1, fontWeight: 700,
          color: tone === 'idle' ? 'var(--muted)' : edge,
        }}>{label}</span>
        <span className="grow" />
        {onGuides && (
          <button
            type="button" className="small" data-testid="stage-guides"
            aria-pressed={guides === true}
            title="Show the action-safe and title-safe boxes"
            onClick={() => onGuides(!guides)}
            style={{
              padding: '2px 6px', fontSize: 'var(--text-2xs)',
              border: `1px solid ${guides ? 'var(--accent)' : 'var(--line)'}`,
              background: guides ? 'var(--accent-wash)' : 'transparent',
              color: guides ? 'inherit' : 'var(--muted)',
            }}
          >Safe area</button>
        )}
        <span className="muted" style={{ fontSize: 'var(--text-2xs)' }}>16:9</span>
      </div>
      <div
        ref={box} data-testid="stage"
        style={{
          position: 'relative', aspectRatio: '16 / 9', overflow: 'hidden',
          borderRadius: 'var(--radius-screen)', background: 'var(--screen-bed)',
          border: `1px solid ${edge}`,
        }}
      >
        {html ? (
          <iframe
            title={label} srcDoc={html} sandbox="" scrolling="no"
            style={{
              width: SLIDE_WIDTH, height: SLIDE_HEIGHT, border: 0,
              transform: `scale(${scale})`, transformOrigin: 'top left',
              pointerEvents: 'none',
              /* Until the width is known, drawing it at 1920 would
                 flash a full-size slide across the control room. */
              visibility: scale > 0 ? 'visible' : 'hidden',
            }}
          />
        ) : (
          <span className="muted" style={{
            position: 'absolute', inset: 0, display: 'grid',
            placeItems: 'center', fontSize: 'var(--text-xs)',
          }}>{empty ?? 'Nothing yet'}</span>
        )}
        {/*
          * THE TWO BOXES, DRAWN HERE AND NEVER BY THE RENDERER.
          * [§27, C-38]
          *
          * This is the measuring instrument, not part of the
          * picture. It is a sibling of the iframe in the control
          * room's own document, so there is no path by which it can
          * reach `slideHtml` and therefore none by which it can
          * reach the wire — which is the whole safety property, and
          * the test that holds it is on the renderer rather than
          * here.
          *
          * AS PERCENTAGES, so they survive the scale. The stage is
          * the frame at whatever width the panel is; 5% of it is
          * action safe at any size, and a pixel inset computed from
          * 1920 would be wrong the moment the column moved.
          *
          * The words inside a slide are already clipped to title
          * safe and cannot leave it. WHAT THESE ARE FOR IS THE
          * PICTURE: a full-bleed photograph runs to the frame edge
          * by design, and the Top / Centre / Bottom control decides
          * which part of it survives — a choice nobody could make
          * well without seeing where the lines fall on the face.
          */}
        {guides && html && (
          <div data-testid="safe-guides" aria-hidden="true" style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
          }}>
            <div data-testid="guide-action" style={{
              position: 'absolute',
              inset: `${ACTION_SAFE * 100}%`,
              border: '1px dashed rgba(255,255,255,0.42)',
            }} />
            <div data-testid="guide-title" style={{
              position: 'absolute',
              inset: `${TITLE_SAFE * 100}%`,
              border: '1px solid rgba(255,255,255,0.62)',
            }} />
          </div>
        )}
      </div>
      {guides && html && (
        <p className="muted" style={{
          margin: 0, fontSize: 'var(--text-2xs)', lineHeight: 1.4,
        }}>
          {/* Said once, because two unlabelled rectangles are a
              puzzle rather than a guide. */}
          Dashed: action safe — nothing meaningful outside it. Solid:
          title safe — where text goes.
        </p>
      )}
    </div>
  );
}
