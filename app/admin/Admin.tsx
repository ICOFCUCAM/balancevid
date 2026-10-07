'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';

import Notice from '../Notice.js';
import { useConfirm } from '../Confirm.js';
import {
  type Holding, type Holds, mayRetire, maySuspend,
} from '../../src/domain/operations.js';

/** Where each kind is operated, and which route acts on it. */
const WHERE: Record<Holds, { room: string; api: string; noun: string }> = {
  channel: { room: '/t', api: '/api/channels', noun: 'channel' },
  conversation: { room: '/c', api: '/api/conversations', noun: 'conversation' },
  performance: { room: '/p', api: '/api/performances', noun: 'performance' },
};

const WEIGHS = (bytes: number) => (bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB`
  : bytes >= 1e6 ? `${Math.round(bytes / 1e6)} MB`
    : bytes > 0 ? `${Math.round(bytes / 1e3)} kB` : '—');

const WHEN = (at: string) => {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return '—';
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(ms).toLocaleDateString('en-GB',
    { year: 'numeric', month: 'short', day: 'numeric' });
};

/**
 * The operations desk.  [§19, D-04, D-13, D-19, D-21]
 *
 * A LEDGER WITH VERBS ON IT, and the verbs are the routes that
 * already existed. Nothing here is a second way to delete
 * anything: `DELETE /api/channels/<id>` is the same request the
 * channel's own room sends, and this page simply makes it
 * reachable from a list instead of from seventeen pages. [D-19]
 *
 * WHAT IS ON AIR IS NOT DELETED FROM A TABLE. `mayRetire` refuses
 * it, and says why in a sentence rather than greying a button:
 * ending a broadcast is a decision that belongs in the room where
 * the words IT IS ON AIR RIGHT NOW are on the screen.
 */
export default function Admin({
  holdings, says, space,
}: {
  holdings: Holding[];
  says: string;
  space: { used: string; free: string; total: string } | null;
}) {
  const { confirm, dialog } = useConfirm();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [gone, setGone] = useState<string[]>([]);
  const [only, setOnly] = useState<Holds | 'all'>('all');

  const rows = useMemo(
    () => holdings.filter((one) => !gone.includes(one.id))
      .filter((one) => only === 'all' || one.kind === only),
    [holdings, gone, only]);

  /**
   * ACTED THROUGH THE EXISTING ROUTE, and the page is not
   * reloaded to find out whether it worked. A desk that refreshes
   * the whole installation after every action is a desk that
   * walks every directory again for one row. [U-16]
   */
  const act = useCallback(async (
    holding: Holding, how: 'retire' | 'suspend',
  ) => {
    const where = WHERE[holding.kind];
    setBusy(holding.id);
    setError(null);
    try {
      const response = how === 'retire'
        ? await fetch(`${where.api}/${holding.id}`, { method: 'DELETE' })
        : await fetch(`${where.api}/${holding.id}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'unpublish' }),
        });
      if (!response.ok) {
        const said = await response.json().catch(() => ({}));
        setError(said.error ?? `that ${where.noun} could not be changed`);
        return;
      }
      if (how === 'retire') setGone((was) => [...was, holding.id]);
      else window.location.reload();
    } catch {
      setError('the request did not reach the server');
    } finally {
      setBusy(null);
    }
  }, []);

  const retire = (holding: Holding) => {
    const { may, because } = mayRetire(holding);
    if (!may) { setError(because); return; }
    const where = WHERE[holding.kind];
    confirm({
      question: `Retire “${holding.name}”? This deletes the ${where.noun} `
        + `and the ${WEIGHS(holding.bytes)} it owns on the volume. Anything `
        + 'it merely points at is untouched. This cannot be undone.',
      field: { label: 'Type its name to confirm', initial: '' },
      verb: 'Retire it',
      danger: true,
      go: (typed) => {
        if ((typed ?? '').trim() !== holding.name.trim()) {
          setError('That is not its name — nothing was deleted.');
          return;
        }
        void act(holding, 'retire');
      },
    });
  };

  const suspend = (holding: Holding) => {
    const { may, because } = maySuspend(holding);
    if (!may) { setError(because); return; }
    confirm({
      question: `Take “${holding.name}” off the air for viewers? It keeps `
        + 'running — the public link simply stops working, and you can '
        + 'publish it again at any time.',
      verb: 'Suspend it',
      danger: true,
      go: () => void act(holding, 'suspend'),
    });
  };

  return (
    <main className="room" style={{ maxWidth: 1100, margin: '0 auto', padding: 20 }}>
      <header style={{ marginBottom: 14 }}>
        <h1 style={{ margin: 0, fontSize: 'var(--text-xl)' }}>Admin</h1>
        <p className="muted" data-testid="ledger-says" style={{ margin: '6px 0 0' }}>
          {says}
          {space && ` ${space.used} used of ${space.total}, ${space.free} free.`}
        </p>
      </header>

      {error && <Notice kind="error" testid="admin-error">{error}</Notice>}

      {/*
        * ONE FILTER AND NO SEARCH. Three kinds and a list this
        * short does not need a search box; a control that exists
        * because control panels usually have one is the kind of
        * decoration `app/settings` already refuses. [D-04]
        */}
      <div className="row" data-testid="admin-filter" style={{ gap: 6, marginBottom: 10 }}>
        {(['all', 'channel', 'conversation', 'performance'] as const).map((one) => (
          <button
            key={one} type="button" className={`ctl${only === one ? ' is-on' : ''}`}
            data-kind={one} aria-pressed={only === one}
            onClick={() => setOnly(one)}
            style={{ padding: '4px 10px', fontSize: 'var(--text-xs)' }}
          >
            {one === 'all' ? 'Everything' : `${one}s`}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="muted" data-testid="admin-empty">Nothing of that kind.</p>
      ) : (
        <table data-testid="admin-ledger" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', fontSize: 'var(--text-xs)' }} className="muted">
              <th style={{ padding: '6px 8px' }}>Name</th>
              <th style={{ padding: '6px 8px' }}>Kind</th>
              <th style={{ padding: '6px 8px' }}>Doing</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Weighs</th>
              <th style={{ padding: '6px 8px', textAlign: 'right' }}>Changes</th>
              <th style={{ padding: '6px 8px' }}>Last change</th>
              <th style={{ padding: '6px 8px' }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((one) => (
              <tr key={one.id} data-testid="admin-row" data-kind={one.kind}
                  data-doing={one.doing}
                  style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ padding: '7px 8px' }}>
                  <Link href={`${WHERE[one.kind].room}/${one.id}`}>{one.name}</Link>
                </td>
                <td className="muted" style={{ padding: '7px 8px', fontSize: 'var(--text-xs)' }}>
                  {one.kind}
                </td>
                <td style={{ padding: '7px 8px', fontSize: 'var(--text-xs)' }}>
                  <span data-testid="admin-doing" style={{
                    color: one.doing === 'live' ? 'var(--state-live)'
                      : one.doing === 'published' ? 'var(--state-ok)'
                        : 'var(--text-faint)',
                  }}>
                    {one.doing === 'live' ? 'ON AIR'
                      : one.doing === 'published' ? 'published' : 'draft'}
                  </span>
                </td>
                <td className="mono" style={{
                  padding: '7px 8px', textAlign: 'right', fontSize: 'var(--text-xs)',
                }}>{WEIGHS(one.bytes)}</td>
                {/*
                  * THE AUDIT TRAIL, COUNTED, AND THE FIRST TIME
                  * ANYTHING IN THIS PRODUCT HAS READ IT. [D-13]
                  */}
                <td className="mono" style={{
                  padding: '7px 8px', textAlign: 'right', fontSize: 'var(--text-xs)',
                }} title="Entries in its audit trail">{one.changes || '—'}</td>
                <td className="muted" style={{ padding: '7px 8px', fontSize: 'var(--text-xs)' }}>
                  {WHEN(one.at)}
                </td>
                <td style={{ padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <button
                    className="small" data-testid="admin-suspend"
                    disabled={busy === one.id || !maySuspend(one).may}
                    title={maySuspend(one).because || 'Stop the public link'}
                    onClick={() => suspend(one)}
                    style={{ fontSize: 'var(--text-xs)', marginRight: 6 }}
                  >Suspend</button>
                  <button
                    className="small" data-testid="admin-retire"
                    disabled={busy === one.id || !mayRetire(one).may}
                    title={mayRetire(one).because || 'Delete it and what it owns'}
                    onClick={() => retire(one)}
                    style={{
                      fontSize: 'var(--text-xs)',
                      borderColor: 'var(--state-bad)', color: 'var(--state-bad)',
                    }}
                  >Retire…</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="muted" style={{ marginTop: 14, fontSize: 'var(--text-xs)' }}>
        {/*
          * SAID ON THE PAGE, not only in a comment. An operator
          * looking for "pause" must find out here that it does not
          * exist and why, rather than concluding the product is
          * broken. [D-21, operations.ts NOT_BUILT]
          */}
        A channel cannot be paused: it is a clock, so holding it still would
        put every viewer on a different programme when it resumed. Suspend
        stops the public link; Emergency, in the channel’s own room, cuts to
        a slide and says why.
      </p>
      {dialog}
    </main>
  );
}
