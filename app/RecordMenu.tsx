'use client';

import { useState } from 'react';

import { useConfirm } from './Confirm.js';
import type { MenuEntry } from './Menu.js';
import type { WorkRecord } from './Workspace.js';

/**
 * What can be done to something you made.  [Doctrine §19, D-19]
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
 *
 * THIS USED TO BE A COMPONENT WITH A `<details>` INSIDE IT, one per row,
 * each carrying its own dialog and its own copy of the refusal banner. It
 * is a hook now, and the surface owns one menu, one dialog and one banner
 * for the whole list — which is what made right-clicking a card possible
 * without writing the actions out a second time. [D-19]
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

const WATCH: Record<WorkRecord['kind'], (id: string) => string> = {
  conversation: (id) => `/c/${id}/watch`,
  performance: (id) => `/p/${id}/watch`,
  channel: (id) => `/t/${id}/watch`,
};

const OPEN_IN: Record<WorkRecord['kind'], string> = {
  conversation: 'Studio One', performance: 'Studio Two', channel: 'Online TV',
};

export function useRecordActions(onDeleted: (record: WorkRecord) => void) {
  const [busy, setBusy] = useState<string | null>(null);
  const [refused, setRefused] = useState<{ title: string; why: string } | null>(null);
  const { confirm, dialog } = useConfirm();

  const remove = async (record: WorkRecord) => {
    setBusy(record.id);
    setRefused(null);
    try {
      const response = await fetch(
        `/api/${ENDPOINT[record.kind]}/${record.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRefused({
          title: record.title,
          why: data.error ?? 'that could not be deleted',
        });
        return;
      }
      onDeleted(record);
    } catch {
      setRefused({
        title: record.title,
        why: 'that could not be deleted — the server did not answer',
      });
    } finally {
      setBusy(null);
    }
  };

  /*
   * THE MOST IRREVERSIBLE THING IN THE PRODUCT. A native confirm rendered
   * this as three paragraphs separated by blank lines in the operating
   * system's font, with OK and Cancel underneath — and "OK" is a word
   * somebody presses without reading. The verb here says the noun.
   */
  const askRemove = (record: WorkRecord) => confirm({
    question: `Delete “${record.title}”? This removes `
      + `${WHAT_GOES[record.kind]}, and it cannot be undone.`,
    verb: 'Delete it',
    danger: true,
    go: () => { void remove(record); },
  });

  /** The one list of what can be done to a record, wherever it is asked. */
  const itemsFor = (record: WorkRecord): MenuEntry[] => [
    { label: `Open in ${OPEN_IN[record.kind]}`, href: record.href },
    record.published
      ? {
        label: 'View as a visitor',
        href: WATCH[record.kind](record.id),
        external: true,
        hint: 'Opens the published page in a new tab',
      }
      : {
        label: 'View as a visitor',
        disabled: 'It is not published yet',
      },
    {
      label: busy === record.id ? 'Deleting…' : 'Delete…',
      danger: true,
      disabled: busy === record.id,
      onSelect: () => askRemove(record),
    },
  ];

  const banner = refused ? (
    /*
     * Shown as a panel rather than an alert: the message names channels
     * and programmes, and an `alert()` is not something anybody can copy
     * a name out of or read twice.
     */
    <div role="alert" data-testid="delete-refused" style={{
      position: 'fixed', left: '50%', bottom: 'var(--space-8)',
      transform: 'translateX(-50%)',
      zIndex: 90, maxWidth: 560,
      padding: 'var(--space-5) var(--space-6)',
      borderRadius: 'var(--radius-xl)',
      background: 'var(--surface-lift)',
      border: 'var(--border) solid var(--line-strong)',
      boxShadow: 'var(--elev-4), inset 3px 0 0 var(--state-bad)',
    }}>
      <div className="row" style={{
        gap: 'var(--space-4)', alignItems: 'flex-start',
      }}>
        <span className="grow" style={{
          fontSize: 'var(--text-base)', minWidth: 0,
        }}>
          <strong style={{
            display: 'block', marginBottom: 'var(--space-1)',
            color: 'var(--ink-on-bad)',
          }}>
            “{refused.title}” was not deleted
          </strong>
          <span style={{ color: 'var(--text-dim)' }}>{refused.why}</span>
        </span>
        <button type="button" onClick={() => setRefused(null)}
                style={{ flex: '0 0 auto', padding: '4px 9px', fontSize: 11 }}>
          Close
        </button>
      </div>
    </div>
  ) : null;

  return { itemsFor, dialog, banner };
}
