'use client';

import React from 'react';

import Icon from '../../Icon.js';
import type { GuestReading } from '../../../src/domain/guestGrid.js';

/**
 * Four guests inside one tile, at the size of one tile.
 * [Doctrine CHANNEL §24, §29; ROOM §4]
 *
 *     ┌─────────┬─────────┐
 *     │ GUEST 1 │ GUEST 2 │
 *     ├─────────┼─────────┤
 *     │ GUEST 3 │ GUEST 4 │
 *     └─────────┴─────────┘
 *
 * *"the boxt must not be enlarge to deform the design but must rather devide
 *  into 4 halves of four guest cameras."*
 *
 * THE CONSTRAINT IS THE DESIGN. This draws into whatever box it is given and
 * has no size of its own — no minimum, no aspect ratio, no padding that
 * grows. The multi-view's grid is `repeat(3, minmax(0, 1fr))` by
 * `repeat(2, …)` and stays exactly that; tile 02's contents divide instead.
 *
 * WHAT FITS IN A QUARTER OF A TILE, which is about 70×45 device pixels on
 * the author's own screen, decided by what an operator triages in that
 * order:
 *
 *   the PICTURE            — the whole quarter, because that is the answer
 *   a MICRO-PLATE, G1..G4  — top left, where the tile's own number sits
 *   the MICROPHONE         — top right, one glyph, three states
 *   a VERTICAL METER       — the left edge, 3px, rising
 *   the WORD               — centred, only when the picture is not the answer
 *
 * THE LABELS ARE AT THE TOP and every other tile's are at the bottom, which
 * is not an inconsistency but the reason the rack survives: the tile's own
 * name plate is a scrim across its bottom edge, and the bottom two quarters
 * live under it. A quarter that labelled itself down there would be a label
 * inside a label.
 *
 * NAMES ARE NOT DRAWN HERE. "Sarah" does not fit in seventy pixels and
 * "Sar…" is not a name. The quarter says G1 and the title attribute says
 * who — which is the same decision the switcher makes about its inputs
 * being 01..24 rather than named.
 */

/** One glyph, three meanings, and none of them is decoration. */
function MicMark({ mic }: { mic: GuestReading['mic'] }) {
  if (mic === 'none') {
    return (
      <span aria-hidden="true" style={{
        fontSize: 'var(--text-2xs)', lineHeight: 1,
        color: 'rgba(255,255,255,0.3)',
      }}>{'\u2014'}</span>
    );
  }
  return (
    /* Amber rather than red: a muted guest is a state, not a fault, and
       red on a desk means the air. The colour is on the wrapper because
       `Icon` draws in `currentColor` — one ink for every glyph. */
    <span aria-hidden="true" style={{
      display: 'inline-flex', lineHeight: 0,
      color: mic === 'open'
        ? 'rgba(255,255,255,0.72)' : 'var(--state-mute-ink)',
    }}><Icon name={mic === 'open' ? 'mic' : 'muted'} size={9} /></span>
  );
}

export default function GuestGrid({
  readings, streamFor, onSelect, disabled,
}: {
  readings: GuestReading[];
  /** The picture for a guest, if the mesh has one. */
  streamFor: (id: string) => MediaStream | null;
  /** Put this guest alone on the programme bus, or take the solo off. */
  onSelect: (id: string) => void;
  /** Off air there is no programme bus to select onto. */
  disabled: boolean;
}) {
  return (
    <div
      data-testid="guest-grid"
      style={{
        position: 'absolute', inset: 0,
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
        /* A SEAM, NOT A GAP. One pixel of the chassis between quarters is
           what makes four pictures read as one instrument; a gap would make
           them four floating rectangles inside a fifth. */
        gap: 1, background: 'var(--console-seam)',
      }}
    >
      {readings.map((one) => {
        const stream = one.id ? streamFor(one.id) : null;
        const act = one.id && !disabled;
        return (
          <button
            key={one.slot}
            type="button"
            data-testid="guest-quarter"
            data-slot={one.slot}
            data-health={one.health}
            data-mic={one.mic}
            data-eye={one.eye}
            data-speaking={one.speaking ? 'true' : 'false'}
            data-soloed={one.soloed ? 'true' : 'false'}
            data-live={one.onAir ? 'true' : 'false'}
            disabled={!act}
            onClick={() => { if (one.id) onSelect(one.id); }}
            title={one.id
              ? `${one.label}${one.says ? ` — ${one.says}` : ''}`
                + (disabled ? '\nOnly while you are live'
                  : one.soloed ? '\nOn programme alone — click to release'
                    : '\nPut this guest on programme alone')
              : `Guest ${one.slot} — nobody here`}
            style={{
              position: 'relative', minWidth: 0, minHeight: 0,
              padding: 0, border: 0, overflow: 'hidden',
              background: 'var(--screen-bed)',
              font: 'inherit', color: 'inherit',
              cursor: act ? 'pointer' : 'default',
              /* An empty quarter is a well with nothing in it, not a
                 disabled control: it is dimmed, and it still reads. */
              opacity: one.id ? 1 : 0.55,
              /*
               * THE TALLY, INSIDE THE QUARTER. Red along the top when this
               * guest is part of what is going out; the accent when the
               * operator has selected them and nothing is transmitting yet.
               * The same two buses, the same two colours, one scale down.
               */
              boxShadow: one.onAir
                ? 'inset 0 2px 0 0 var(--state-live)'
                : one.soloed ? 'inset 0 0 0 1px var(--accent)' : 'none',
            }}
          >
            {stream && one.eye === 'live' ? (
              <video
                autoPlay muted playsInline
                ref={(element) => {
                  if (element && element.srcObject !== stream) {
                    element.srcObject = stream;
                  }
                }}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              /*
               * THE SAME HATCHING THE LIBRARY'S EMPTY SLOT USES, because it
               * means the same thing — no signal here — and broadcast racks
               * have drawn it that way for as long as there have been racks.
               */
              <span aria-hidden="true" style={{
                position: 'absolute', inset: 0, display: 'grid',
                placeItems: 'center',
                background: 'repeating-linear-gradient(45deg,'
                  + ' var(--ink-800) 0 3px, var(--ink-750) 3px 6px)',
              }} />
            )}

            {/*
              * THE WORD, WHEN THE PICTURE IS NOT THE ANSWER.
              *
              * NOT ON AN EMPTY QUARTER. A quarter is 48×40 device pixels on
              * the author's screen, and "NO GUEST" centred in it lands on
              * top of the G-plate — the browser proved it. An empty well
              * is already saying so with hatching and a dimmed mark, and
              * the title attribute says it in words. So the word is kept
              * for the four states an operator has to ACT on.
              *
              * ONE LINE, BELOW THE PLATE. Centred, it collides; wrapped,
              * it does not fit. Along the bottom edge it clears the mark
              * at the top and the microphone opposite it.
              */}
            {one.id && one.says && (
              <span
                data-testid="guest-says"
                style={{
                  position: 'absolute', left: 1, right: 1, bottom: 2,
                  textAlign: 'center',
                  whiteSpace: 'nowrap', overflow: 'hidden',
                  fontSize: 'var(--text-2xs)', lineHeight: 1.1,
                  fontWeight: 'var(--weight-bold)', letterSpacing: '-0.02em',
                  color: one.health === 'lost' ? 'var(--state-live-ink)'
                    : one.health === 'connecting' ? 'rgba(146, 194, 240, 0.95)'
                      : 'var(--ink-400)',
                  textShadow: '0 1px 2px rgba(0,0,0,0.9)',
                }}
              >{one.says}</span>
            )}

            {/* ---- the meter, on the left edge -------------------------- */}
            <span aria-hidden="true" style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
              background: 'rgba(0,0,0,0.55)',
            }}>
              <span style={{
                position: 'absolute', left: 0, right: 0, bottom: 0,
                /* 1.6× because a conversational voice sits around 0.4 and a
                   meter that never leaves its bottom third is an ornament.
                   The same multiple the desk's own VMeter uses. */
                height: `${Math.min(100, one.energy * 160)}%`,
                background: one.speaking
                  ? 'var(--state-ok)' : 'rgba(255,255,255,0.4)',
                transition: 'height 70ms linear',
              }} />
            </span>

            {/* ---- who, and the microphone ------------------------------ */}
            <span className="mono readout" style={{
              position: 'absolute', left: 3, top: 0,
              padding: '1px 3px',
              borderBottomRightRadius: 'var(--radius-xs)',
              background: 'rgba(0,0,0,0.72)',
              fontSize: 'var(--text-2xs)', lineHeight: 1.2,
              fontWeight: 'var(--weight-bold)', letterSpacing: '0.02em',
              /*
               * THE SPEAKING INDICATOR IS THE NAME LIGHTING UP, not a fifth
               * mark in a 70-pixel box. It is measured by the Room's own
               * thresholds, so it agrees with the speaker switching.
               */
              color: one.onAir ? 'var(--state-live-ink)'
                : one.speaking ? 'var(--state-ok)' : 'var(--ink-200)',
            }}>G{one.slot}</span>

            {one.id && (
              <span style={{
                position: 'absolute', right: 0, top: 0,
                padding: '1px 3px',
                borderBottomLeftRadius: 'var(--radius-xs)',
                background: 'rgba(0,0,0,0.72)',
                display: 'inline-flex', alignItems: 'center', lineHeight: 0,
              }}><MicMark mic={one.mic} /></span>
            )}
          </button>
        );
      })}
    </div>
  );
}
