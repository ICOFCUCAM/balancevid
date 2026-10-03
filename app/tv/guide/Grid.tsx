'use client';

import Link from 'next/link';

import type { Listing } from '../Tv.js';

interface Placed {
  fromMs: number; toMs: number; title: string; left: number; width: number;
}

/**
 * The grid, drawn.  [TV-NETWORK N-5]
 *
 * THE COLUMN HEADINGS ARE FORMATTED HERE, in the browser, because
 * this is the only place that knows what time it is where the
 * viewer is. The server computed instants on purpose. [§2]
 *
 * A SLOT TOO NARROW FOR ITS NAME SHOWS NOTHING RATHER THAN A
 * FRAGMENT — the lesson the control room's own strip learned the
 * hard way, where a day of eight-pixel blocks read `2: 5: 4036 9:2:
 * 5:`. Noise with the shape of text is harder to look past than an
 * empty block. [C-46]
 */
export default function Grid(
  { rows, columns, from, to }: {
    rows: { channel: Listing; slots: Placed[] }[];
    columns: number[];
    from: number;
    to: number;
  },
) {
  const clock = (at: number) => new Date(at)
    .toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const NAMES = 150;

  return (
    <div data-testid="tv-guide" style={{ overflowX: 'auto' }}>
      <div style={{ minWidth: 720 }}>
        <div className="row" style={{ gap: 0, alignItems: 'stretch' }}>
          <span style={{ flex: `0 0 ${NAMES}px` }} />
          <div style={{
            position: 'relative', flex: 1, height: 20,
            borderBottom: '1px solid var(--line)',
          }}>
            {columns.map((at) => (
              <span key={at} className="mono readout" data-testid="guide-column"
                    style={{
                      position: 'absolute', top: 0,
                      left: `${((at - from) / (to - from)) * 100}%`,
                      fontSize: 'var(--text-2xs)', color: 'var(--ink-300)',
                    }}>{clock(at)}</span>
            ))}
          </div>
        </div>

        {rows.map((row) => (
          <div key={row.channel.slug} className="row" data-testid="guide-row"
               data-slug={row.channel.slug}
               style={{ gap: 0, alignItems: 'stretch' }}>
            <Link href={`/tv/channels/${row.channel.slug}`} style={{
              flex: `0 0 ${NAMES}px`, padding: '8px var(--space-4) 8px 0',
              textDecoration: 'none', color: 'inherit', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontSize: 'var(--text-sm)', fontWeight: 600,
            }}>
              {row.channel.number !== undefined && (
                <span className="mono readout" style={{
                  marginRight: 7, fontSize: 'var(--text-2xs)',
                  color: 'var(--ink-400)', fontWeight: 400,
                }}>{row.channel.number}</span>
              )}
              {row.channel.name}
            </Link>
            <div style={{
              position: 'relative', flex: 1, minHeight: 38,
              borderTop: '1px solid var(--console-rule)',
            }}>
              {row.slots.map((slot) => (
                <div key={slot.fromMs} data-testid="guide-slot"
                     title={`${slot.title} — ${clock(slot.fromMs)}`}
                     style={{
                       position: 'absolute', top: 4, bottom: 4,
                       left: `${slot.left * 100}%`,
                       width: `${slot.width * 100}%`,
                       minWidth: 3, padding: '2px 6px', borderRadius: 2,
                       overflow: 'hidden', whiteSpace: 'nowrap',
                       textOverflow: 'ellipsis', fontSize: 'var(--text-2xs)',
                       background: 'rgba(45,110,200,0.18)',
                       border: '1px solid var(--console-edge)',
                     }}>
                  {slot.width > 0.07 ? slot.title : ''}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
