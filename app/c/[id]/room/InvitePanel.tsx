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
  conversationId, joinUrl, title, sourceTitle, onRotate, busy,
}: {
  conversationId: string;
  joinUrl: string;
  title: string;
  sourceTitle: string;
  onRotate: () => void;
  busy: boolean;
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
        letterSpacing: 0.8, fontSize: 11, marginBottom: 6 }}>
        Invite people to this conversation
      </div>

      <div className="row" style={{ gap: 6, flexWrap: 'nowrap', marginBottom: 8 }}>
        <input
          readOnly value={joinUrl} data-testid="invite-link"
          onFocus={(e) => e.currentTarget.select()}
          style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        />
        <button className="primary small" data-testid="invite-copy"
                onClick={() => void copy()} style={{ flex: '0 0 auto' }}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button className="small" data-testid="invite-share"
                  onClick={() => void share()}>Share…</button>
        )}
        {channels.map((channel) => (
          <a
            key={channel.label}
            className="btn small"
            data-testid={`invite-${channel.label.toLowerCase()}`}
            href={channel.href}
            target="_blank"
            rel="noreferrer noopener"
          >
            {channel.label}
          </a>
        ))}
        <button className="small" data-testid="invite-qr-toggle"
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
          <div style={{
            display: 'inline-block', padding: 12, borderRadius: 10, background: '#fff',
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

      <p className="small muted" style={{ marginTop: 12, marginBottom: 0, lineHeight: 1.4 }}>
        Anyone with this link can join and be seen. They do not need an
        account. If it reaches someone it should not have,{' '}
        <button
          data-testid="invite-rotate"
          disabled={busy}
          onClick={onRotate}
          style={{ background: 'none', border: 'none', padding: 0, color: 'var(--source-accent)',
            textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}
        >
          make a new link
        </button>
        {' '}— the old one stops working, and so does everyone who used it.
      </p>
    </div>
  );
}
