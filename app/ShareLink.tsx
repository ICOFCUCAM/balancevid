'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A link, and every way there is of sending it.  [D-19; ROOM §7; TAKE-APP T2b]
 *
 * THIS IS THE ROOM'S INVITE PANEL WITH THE CONVERSATION TAKEN OUT OF IT.
 * The panel already knew how to hand a URL to WhatsApp, to a native share
 * sheet, to a mail client, to a clipboard and to a square on a wall — and
 * it knew all of that about a conversation, so the Take App could not use
 * a line of it and shipped a bare read-only input instead. "Sendable by
 * anything" was PARTIAL for exactly as long as the knowledge was welded to
 * one caller.
 *
 * SO THE WELD IS CUT RATHER THAN THE PANEL COPIED. What is generic about
 * sending a link is here; what `InvitePanel` knows that this cannot — who
 * arrives as what, until when, and the button that withdraws the link —
 * stays there, wrapped around this. One place composes a share row, and a
 * second surface that wants one asks for it instead of growing its own.
 *
 * THE QR IS A URL THIS IS GIVEN, NEVER A SQUARE THIS DRAWS. Both existing
 * codes are rendered on the server and owner-only, because the thing
 * encoded is a credential and a page that drew its own would have to be
 * handed the token to do it. A caller with nowhere to fetch one simply
 * passes no `qrSrc`, and the button is not there — rather than there and
 * dead. [U-19]
 */
export default function ShareLink({
  url, title, message, qrSrc, qrCaption, heading, note, testId = 'share',
}: {
  /** The thing being sent. Shown, selectable, copyable, encodable. */
  url: string;
  /** What it is called — the share sheet's title and the mail subject. */
  title: string;
  /**
   * What travels with it.
   *
   * The caller writes this because only the caller knows what the
   * recipient is being asked for: a conversation about something, or a
   * song to sing on. A generic sentence here would be worse than either.
   */
  message: string;
  /** Where the server draws the square. No button without one. */
  qrSrc?: string;
  qrCaption?: string;
  heading?: string;
  /** A line above the field, for a caller with a warning to give. */
  note?: string;
  /**
   * The prefix every handle in here is found by.
   *
   * Two of these can be on screen at once — a control room invites
   * guests and performers from panels a tab apart — and a test that
   * asked for `share-copy` would get whichever the DOM offered first.
   */
  testId?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  /** Full screen, for the square to actually be scannable. */
  const [bigQr, setBigQr] = useState(false);
  const square = useRef<HTMLDivElement | null>(null);
  /*
   * A PORTAL, BECAUSE `position: fixed` DOES NOT ESCAPE A MASK.
   *
   * The first full-screen code was drawn inside the takes rail, a
   * fifth of the screen wide, and the reason took a browser run to
   * find: `.shell-scroll` carries a `mask-image` for its edge fade,
   * and a mask makes the element a CONTAINING BLOCK for everything
   * fixed inside it. The overlay was fixed — to the rail.
   *
   * There is no arrangement of z-index that fixes that, so the
   * overlay leaves the subtree instead. Mounted state gates it
   * because `document` does not exist while this renders on the
   * server.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  /*
   * A CODE YOU HAVE TO SCROLL TO IS A CODE NOBODY SCANS.
   *
   * The Room's panel is tall enough to hold a 220px square below the
   * channel buttons; the takes rail is not, and its scroll viewport
   * cut the first one off a third of the way down — the producer
   * pressed "QR code" and got the top edge of one. Revealing it
   * brings it into view, which is what pressing the button meant.
   */
  useEffect(() => {
    if (!showQr) return;
    square.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [showQr]);

  /* Escape leaves the full-screen code, as it leaves every overlay. */
  useEffect(() => {
    if (!bigQr) return undefined;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBigQr(false);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [bigQr]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can be refused. The link is on screen and
      // selectable, which is the fallback that always works.
      setCopied(false);
    }
  };

  const share = async () => {
    // The native sheet reaches every app on the device, including the ones
    // this component has never heard of.
    try {
      await navigator.share({ title, text: message });
    } catch { /* dismissed, or unsupported. Neither is an error. */ }
  };

  const channels = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(message)}` },
    { label: 'Messenger', href: `https://www.facebook.com/dialog/send?link=${
      encodeURIComponent(url)}&app_id=0&redirect_uri=${encodeURIComponent(url)}` },
    { label: 'SMS', href: `sms:?&body=${encodeURIComponent(message)}` },
    { label: 'Email', href: `mailto:?subject=${encodeURIComponent(title)}&body=${
      encodeURIComponent(message)}` },
  ];

  return (
    <div data-testid={`${testId}-share-row`}>
      {heading && (
        <div className="small muted" style={{ textTransform: 'uppercase',
          letterSpacing: '0.1em', fontSize: 'var(--text-2xs)', marginBottom: 6 }}>
          {heading}
        </div>
      )}

      {note && (
        <div className="small muted" style={{ marginBottom: 4 }}>{note}</div>
      )}

      <div className="row" style={{ gap: 6, flexWrap: 'nowrap', marginBottom: 8 }}>
        {/*
          * A LINK YOU ARE ABOUT TO SEND IS NOT AN INPUT YOU ARE ABOUT TO
          * EDIT, and it was drawn as one. Read-only, so it keeps the
          * well's recess to say "this holds a value" but loses the caret
          * colour and the focus lightening, which promise typing. The
          * monospace is right and stays: a URL somebody may read aloud
          * or copy by hand needs its characters distinguishable.
          */}
        <input
          readOnly value={url} data-testid={`${testId}-url`}
          onFocus={(e) => e.currentTarget.select()}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-dim)',
            caretColor: 'transparent',
            cursor: 'text',
          }}
        />
        {/*
          * THE CONFIRMATION IS THE BUTTON, not a message beside it. A
          * toast somewhere else asks the eye to leave the thing it just
          * pressed; the control saying "Copied" is read without moving.
          * It stays the same width as "Copy link" so the row does not
          * twitch on press — a control that resizes when you use it is
          * the smallest possible way to feel cheap.
          */}
        <button className="ctl" data-testid={`${testId}-copy`}
                onClick={() => void copy()}
                style={{ flex: '0 0 auto', minWidth: 86 }}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      {/*
        * THE WAYS TO SEND IT ARE PEERS, and none of them is the
        * recommended one — which one is right depends entirely on who
        * the recipient is. So they are all quiet buttons of the same
        * size, and the only emphasised control here is the one that
        * puts the link on the clipboard. [ROOM §7]
        */}
      <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button className="quiet sm" data-testid={`${testId}-share`}
                  onClick={() => void share()}>Share…</button>
        )}
        {channels.map((channel) => (
          <a
            key={channel.label}
            className="btn quiet sm"
            data-testid={`${testId}-${channel.label.toLowerCase()}`}
            href={channel.href}
            target="_blank"
            rel="noreferrer noopener"
          >
            {channel.label}
          </a>
        ))}
        {qrSrc && (
          <button className="quiet sm" data-testid={`${testId}-qr-toggle`}
                  aria-pressed={showQr}
                  onClick={() => setShowQr(!showQr)}>
            {showQr ? 'Hide code' : 'QR code'}
          </button>
        )}
      </div>

      {/*
        For people who are physically together: a seminar, a lecture, a
        session in a live room. Put it on the wall and everyone scans
        it. [ROOM §7]
      */}
      {qrSrc && showQr && (
        <div ref={square} data-testid={`${testId}-qr`}
             style={{ marginTop: 12, textAlign: 'center' }}>
          {/*
            * A QR CODE MUST BE WHITE AND MUST HAVE A QUIET ZONE. The
            * white is not a style choice — scanners look for a light
            * ground, and a dark-themed code fails on a lot of phones.
            * The padding is the quiet zone the spec requires, and
            * without it a code printed and stuck on a wall reads at
            * half the distance.
            */}
          {/*
            * SIZED BY THE COLUMN IT IS IN, not by the panel it was
            * written for. 220px was the Room's side panel; the takes
            * rail is 290px wide and a fixed square overflowed it. A
            * percentage with a ceiling is right in both.
            */}
          <button
            type="button"
            data-testid={`${testId}-qr-big`}
            onClick={() => setBigQr(true)}
            title="Show it full screen"
            style={{
              display: 'inline-block', padding: 'var(--space-5)',
              borderRadius: 'var(--radius-module)', background: 'var(--qr-ground)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              border: 0, cursor: 'zoom-in', maxWidth: '100%', lineHeight: 0,
            }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={qrCaption ?? 'Scan this code'}
              src={qrSrc}
              style={{ width: 220, maxWidth: '100%', aspectRatio: '1 / 1',
                height: 'auto', display: 'block' }}
            />
          </button>
          <div className="small muted" style={{ marginTop: 6 }}>
            {qrCaption ?? 'Scan this code'} — tap it to show it full screen
          </div>
        </div>
      )}

      {/*
        * THE SQUARE AT THE SIZE IT IS FOR.  [ROOM §7; T2b]
        *
        * "Put it on the wall and everyone scans it" cannot be done
        * with 220 pixels in a rail. A phone reads a code from about
        * ten times its width away, so a band standing back from a
        * laptop needs the screen, not a corner of it — and the
        * producer should not have to screenshot and open an image
        * viewer to give it to them.
        *
        * WHITE TO THE EDGES. The ground is the page, not a card:
        * a dark border around a light code costs contrast at exactly
        * the distance this view exists for.
        */}
      {qrSrc && bigQr && mounted && createPortal((
        <div
          data-testid={`${testId}-qr-full`}
          role="dialog"
          aria-label={qrCaption ?? 'Scan this code'}
          onClick={() => setBigQr(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 9000, background: 'var(--qr-ground)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', gap: 20, cursor: 'zoom-out',
            padding: 'var(--space-5)',
          }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={qrCaption ?? 'Scan this code'}
            src={qrSrc}
            style={{
              width: 'min(78vh, 78vw)', height: 'min(78vh, 78vw)',
              display: 'block',
            }}
          />
          <div style={{ color: 'var(--qr-ink)', fontSize: 'var(--text-lg)',
            textAlign: 'center' }}>
            {qrCaption ?? 'Scan this code'}
          </div>
          <div style={{ color: 'var(--qr-note)', fontSize: 'var(--text-sm)' }}>
            Tap anywhere to close
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
