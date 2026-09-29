'use client';

import { useState } from 'react';

/**
 * Inviting people.  [Doctrine ROOM §6, §7]
 *
 * "You don't necessarily need to build a WhatsApp integration. The easiest
 *  first implementation is: Generate invitation URL → Share URL through
 *  WhatsApp."
 *
 * So this owns no messaging platform and asks for no API key. Each button is
 * a link that hands the URL to an app the person already has — and on a phone
 * the native share sheet is better than any of them, so that is offered first
 * where the browser has it.
 *
 * The QR comes from the server as SVG (ROOM §7): the code encodes the invite
 * token, and a page that drew its own square would have to be handed the
 * credential to do it.
 */
export default function InvitePanel({
  conversationId, joinUrl, title, sourceTitle, onRotate, busy, heading,
}: {
  conversationId: string;
  joinUrl: string;
  title: string;
  sourceTitle: string;
  onRotate: () => void;
  busy: boolean;
  /**
   * What the panel is called where it is standing.
   *
   * The room and the control room invite people to the same place and mean
   * different things by it — "this conversation" is right in Studio One and
   * wrong in a gallery, where the person being invited is joining a
   * broadcast. A prop rather than a second copy of the panel: the join URL
   * is composed in exactly one place and stays that way. [D-19]
   */
  heading?: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);

  /*
   * What the recipient sees before they tap. The brief writes it out:
   * who invited them, what the conversation is, and the way in.
   */
  const message = `You're invited to a conversation about “${sourceTitle}”.\n\n`
    + `${title}\n\nJoin the room: ${joinUrl}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
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
    // this panel has never heard of.
    try {
      await navigator.share({ title, text: message });
    } catch { /* dismissed, or unsupported. Neither is an error. */ }
  };

  const channels = [
    { label: 'WhatsApp', href: `https://wa.me/?text=${encodeURIComponent(message)}` },
    { label: 'Messenger', href: `https://www.facebook.com/dialog/send?link=${
      encodeURIComponent(joinUrl)}&app_id=0&redirect_uri=${encodeURIComponent(joinUrl)}` },
    { label: 'SMS', href: `sms:?&body=${encodeURIComponent(message)}` },
    { label: 'Email', href: `mailto:?subject=${encodeURIComponent(title)}&body=${
      encodeURIComponent(message)}` },
  ];

  return (
    <div data-testid="invite-panel">
      <div className="small muted" style={{ textTransform: 'uppercase',
        letterSpacing: '0.1em', fontSize: 'var(--text-2xs)', marginBottom: 6 }}>
        {heading ?? 'Invite people to this conversation'}
      </div>

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
          readOnly value={joinUrl} data-testid="invite-link"
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
        <button className="ctl" data-testid="invite-copy"
                onClick={() => void copy()}
                style={{ flex: '0 0 auto', minWidth: 86 }}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      {/*
        * THE WAYS TO SEND IT ARE PEERS, and none of them is the
        * recommended one — which one is right depends entirely on who
        * the guest is. So they are all quiet buttons of the same size,
        * and the only emphasised control in this panel is the one that
        * puts the link on the clipboard. [ROOM §7]
        */}
      <div className="row" style={{ gap: 'var(--space-3)', flexWrap: 'wrap' }}>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button className="quiet sm" data-testid="invite-share"
                  onClick={() => void share()}>Share…</button>
        )}
        {channels.map((channel) => (
          <a
            key={channel.label}
            className="btn quiet sm"
            data-testid={`invite-${channel.label.toLowerCase()}`}
            href={channel.href}
            target="_blank"
            rel="noreferrer noopener"
          >
            {channel.label}
          </a>
        ))}
        <button className="quiet sm" data-testid="invite-qr-toggle"
                aria-pressed={showQr}
                onClick={() => setShowQr(!showQr)}>
          {showQr ? 'Hide code' : 'QR code'}
        </button>
      </div>

      {/*
        For a room that is physically together: a seminar, a lecture, a
        workshop. Put it on the wall and everyone scans it. [ROOM §7]
      */}
      {showQr && (
        <div data-testid="invite-qr" style={{ marginTop: 12, textAlign: 'center' }}>
          {/*
            * A QR CODE MUST BE WHITE AND MUST HAVE A QUIET ZONE. The
            * white is not a style choice — scanners look for a light
            * ground, and a dark-themed code fails on a lot of phones.
            * The padding is the quiet zone the spec requires, and
            * without it a code printed and stuck on a wall reads at
            * half the distance.
            */}
          <div style={{
            display: 'inline-block', padding: 'var(--space-5)',
            borderRadius: 'var(--radius-module)', background: '#fff',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt="Scan to join this conversation"
              src={`/api/conversations/${conversationId}/room/qr`}
              style={{ width: 220, height: 220, display: 'block' }}
            />
          </div>
          <div className="small muted" style={{ marginTop: 6 }}>
            Scan to join this conversation
          </div>
        </div>
      )}

      {/*
        * A BUTTON, NOT A PARAGRAPH.
        *
        * This used to explain who the link lets in and what resetting it
        * costs. Three lines of text above a control that does one thing:
        * the explanation belongs on the control, where somebody reads it at
        * the moment they are deciding, rather than every time they open the
        * panel to send an invitation. The consequence is in the title.
        */}
      <button
        className="small"
        data-testid="invite-rotate"
        disabled={busy}
        onClick={onRotate}
        title={'Replaces the invite link. The old one stops working and '
          + 'everybody who joined with it is signed out.'}
        style={{ marginTop: 12, width: '100%' }}
      >
        Guest Reset Link
      </button>
    </div>
  );
}
