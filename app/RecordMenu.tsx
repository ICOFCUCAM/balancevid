'use client';

import { useState } from 'react';
import type { WorkRecord } from './Workspace.js';

/**
 * The ⋯ menu, and the only thing behind it that matters.  [Doctrine §19]
 *
 * DELETING IS NOT A TOGGLE, so it is not one click. It asks, and the
 * question names what actually goes: a performance takes the song somebody
 * performed over, which is the one file in this product a person may not
 * have another copy of. A confirmation that says "are you sure?" has told
 * them nothing they did not already know.
 *
 * THE REFUSAL IS THE INTERESTING CASE. A channel schedules by reference
 * (D-18), so deleting a performance can take a programme off the air
 * tonight, and nothing on the performance's own card would hint at it. The
 * server checks every channel and answers with the channel and the slot; it
 * is shown here in full rather than collapsed to "in use", because "in use"
 * is the message that makes somebody open six channels by hand.
 *
 * It refuses rather than cascading. Unscheduling somebody's evening of
 * television is a decision, not a side effect of tidying up.
 */

const WHAT_GOES: Record<WorkRecord['kind'], string> = {
  conversation: 'the video you brought in, every take you recorded against '
    + 'it, and every render made from them',
  performance: 'the song, every take, and every render — including the master',
  channel: 'the schedule and any live sessions you saved. Nothing it '
    + 'scheduled is touched: a channel holds references, not copies',
};

const ENDPOINT: Record<WorkRecord['kind'], string> = {
  conversation: 'conversations', performance: 'performances', channel: 'channels',
};

export default function RecordMenu({
  record, onDeleted,
}: { record: WorkRecord; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const remove = async () => {
    if (!window.confirm(
      `Delete “${record.title}”?\n\nThis removes ${WHAT_GOES[record.kind]}.\n\n`
      + 'It cannot be undone.')) return;
    setBusy(true);
    setRefused(null);
    try {
      const response = await fetch(
        `/api/${ENDPOINT[record.kind]}/${record.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRefused(data.error ?? 'that could not be deleted');
        return;
      }
      onDeleted();
    } catch {
      setRefused('that could not be deleted — the server did not answer');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/*
        * `name` groups them, so opening one closes the others — the browser
        * doing what a menu manager would otherwise have to. The same
        * mechanism Studio Two's take menu and the channel rail's use.
        */}
      <details name="record-menu" data-testid="record-menu"
               style={{ position: 'relative', flex: '0 0 auto' }}>
        <summary aria-label={`Actions for ${record.title}`} style={{
          listStyle: 'none', cursor: 'pointer', padding: '0 5px',
          color: 'var(--muted)', fontSize: 15, lineHeight: 1,
        }}>&#8943;</summary>
        <div className="panel" style={{
          position: 'absolute', right: 0, top: '100%', zIndex: 40, padding: 5,
          width: 190, display: 'flex', flexDirection: 'column', gap: 2,
          boxShadow: '0 12px 30px rgba(0,0,0,0.55)',
        }}>
          <a href={record.href} style={{
            padding: '6px 8px', borderRadius: 6, fontSize: 12,
            textDecoration: 'none', color: 'inherit',
          }}>Open</a>
          {record.published && (
            <a href={record.kind === 'channel'
              ? `/t/${record.id}/watch`
              : `/${record.kind === 'performance' ? 'p' : 'c'}/${record.id}/watch`}
               target="_blank" rel="noreferrer"
               style={{
                 padding: '6px 8px', borderRadius: 6, fontSize: 12,
                 textDecoration: 'none', color: 'inherit',
               }}>
              View as a visitor
            </a>
          )}
          <button
            type="button" data-testid="delete-record" disabled={busy}
            onClick={() => { void remove(); }}
            style={{
              border: 0, background: 'none', textAlign: 'left', font: 'inherit',
              fontSize: 12, padding: '6px 8px', borderRadius: 6,
              cursor: 'pointer', color: 'var(--bad)',
              borderTop: '1px solid var(--line)', marginTop: 2,
            }}
          >
            {busy ? 'Deleting…' : 'Delete…'}
          </button>
        </div>
      </details>

      {refused && (
        /*
         * Shown as a panel rather than an alert: the message names channels
         * and programmes, and an `alert()` is not something anybody can copy
         * a name out of or read twice.
         */
        <div role="alert" data-testid="delete-refused" style={{
          position: 'fixed', left: '50%', bottom: 22, transform: 'translateX(-50%)',
          zIndex: 90, maxWidth: 560, padding: '12px 15px', borderRadius: 10,
          background: 'var(--panel)', border: '1px solid #8e2f24',
          boxShadow: '0 14px 40px rgba(0,0,0,0.6)',
        }}>
          <div className="row" style={{ gap: 10, alignItems: 'flex-start' }}>
            <span className="grow" style={{ fontSize: 12.5, minWidth: 0 }}>
              <strong style={{ display: 'block', marginBottom: 2 }}>
                “{record.title}” was not deleted
              </strong>
              <span className="muted">{refused}</span>
            </span>
            <button type="button" onClick={() => setRefused(null)}
                    style={{ flex: '0 0 auto', padding: '4px 9px', fontSize: 11 }}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
