'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import ChannelPlayer from './watch/ChannelPlayer.js';
import {
  type Sample, confidenceSays, expectsPicture, keep, meanLuma, readPicture,
} from '../../../src/domain/confidence.js';
import type { OnAir } from '../../../src/domain/channel.js';
import type { EngineState, StreamState } from '../../../src/domain/health.js';
import { LIVE_DELAY_MS } from '../../../src/domain/playout.js';

/**
 * The transmission, in the corner of the desk.  [CHANNEL §18, §7, §11,
 * D-04, D-19, C-28]
 *
 *     the wire  →  /playlist  →  this  →  sampled  →  a sentence
 *
 * §7 SAYS THE DESK SHOWS THE OPERATOR'S OWN PICTURE and never the
 * transmission, *"so a presenter does not talk over themselves"*. That
 * rule is about the PROGRAM MONITOR — the big one somebody performs to
 * — and it survives here intact: this is a separate object, a sixth of
 * the size, permanently silent, labelled with its own delay, and OFF
 * until the operator asks for it. What §7 forbids is a presenter
 * watching themselves twelve seconds late. What it cannot be read to
 * forbid is the station ever looking at its own output, because the
 * alternative is C-24: a channel transmitting black for as long as it
 * took somebody to open the viewer page in another tab.
 *
 * MUTED IS NOT A DEFAULT HERE, IT IS A PROPERTY. There is no volume
 * control and no way to reach one: the desk's microphones are open in
 * the same room, and audio from a monitor playing the mix those
 * microphones feed is a feedback loop at twelve seconds' delay.
 *
 * IT WRITES NOTHING. It reads the published playlist — the artefact the
 * viewer already gets — which is what makes it the only instrument in
 * the product that tests the chain end to end. Everything else asks a
 * component whether it thinks it is working. [D-19]
 */

/** How often the picture is read. A second is plenty for a 12s window. */
const SAMPLE_MS = 1000;

/** The grid the frame is reduced to before it is measured. */
const GRID_W = 32;
const GRID_H = 18;

export default function ConfidenceMonitor({
  channelId, engine, stream, on, failing, onNote,
}: {
  channelId: string;
  engine: EngineState;
  stream: StreamState;
  /** What is going out, so black that is correct is not an alarm. */
  on: OnAir;
  failing?: { says: string } | null;
  /** The sentence, raised to the desk so it sits with the other one. */
  onNote?: (note: { says: string; tone: 'fault' | 'note' } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const video = useRef<HTMLVideoElement | null>(null);
  const paper = useRef<HTMLCanvasElement | null>(null);

  const take = useCallback(() => {
    const element = video.current;
    if (!element || element.readyState < 2) return;
    const slate = paper.current
      ?? (paper.current = document.createElement('canvas'));
    slate.width = GRID_W;
    slate.height = GRID_H;
    const ink = slate.getContext('2d', { willReadFrequently: true });
    if (!ink) return;
    try {
      ink.drawImage(element, 0, 0, GRID_W, GRID_H);
      const { data } = ink.getImageData(0, 0, GRID_W, GRID_H);
      /* The arithmetic is next door and tested; this is the glue. */
      const mean = meanLuma(data);
      const now = Date.now();
      setSamples((was) => keep([...was, { mean, at: now }], now));
    } catch {
      /*
       * A TAINTED CANVAS IS NOT A BLACK PICTURE. If the segments ever
       * became cross-origin, `getImageData` throws — and recording a
       * zero there would raise an alarm about the browser's security
       * model. Nothing is recorded, so the monitor says nothing.
       */
    }
  }, []);

  useEffect(() => {
    if (!open) { setSamples([]); return undefined; }
    const timer = setInterval(take, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [open, take]);

  const picture = readPicture(samples, Date.now());
  const note = open
    ? confidenceSays({
      engine, stream, picture, expected: expectsPicture(on),
      ...(failing ? { failing } : {}),
    })
    : null;

  useEffect(() => { onNote?.(note); },
    [onNote, note?.says, note?.tone]); // eslint-disable-line

  const behind = Math.round(LIVE_DELAY_MS / 1000);

  return (
    <div data-testid="confidence-monitor" data-open={open ? 'true' : 'false'}
      data-samples={samples.length}
      style={{
        /*
         * UNDER THE AIR PLATE, top left. Every corner of this monitor
         * is already spoken for — NOW PLAYING bottom left, the station
         * lockup bottom right, the clock top right and the ON AIR
         * plate top left — so the one place a second picture can go
         * without hiding one of the first picture's own captions is
         * directly beneath that plate. The first version sat on top of
         * it, which the first screenshot showed and no amount of
         * reading the file would have.
         */
        position: 'absolute', left: 10, top: 40, zIndex: 2,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        gap: 4,
      }}
    >
      <button
        type="button" className="small" data-testid="confidence-toggle"
        aria-pressed={open}
        title={open
          ? `The transmission, about ${behind}s behind. Silent, always.`
          : 'Show the transmission as a viewer gets it, about '
            + `${behind}s behind`}
        onClick={() => setOpen((was) => !was)}
        style={{
          fontSize: 'var(--text-2xs)', padding: '3px 7px',
          letterSpacing: '0.06em', fontWeight: 'var(--weight-bold)',
          background: 'rgba(0,0,0,0.72)',
          border: `1px solid ${picture.black
            ? 'var(--state-bad)' : 'var(--console-seam)'}`,
          color: picture.black ? 'var(--state-bad)' : 'var(--ink-200)',
        }}
      >
        {/* WHAT IT IS AND HOW LATE, in the label itself. A second
            picture on a desk that did not say which one it was would
            be worse than no second picture. */}
        {open ? `TX · ${behind}s BEHIND` : 'TX'}
      </button>
      {open && (
        <div
          data-testid="confidence-picture"
          data-black={picture.black ? 'true' : 'false'}
          style={{
            width: 168, borderRadius: 'var(--radius-screen)',
            overflow: 'hidden',
            /* A FAULT IS ON THE INSTRUMENT THAT FOUND IT. The desk's
               own sentence says it in words; the frame says it where
               the eye already is. */
            outline: picture.black
              ? '2px solid var(--state-bad)' : '1px solid var(--console-edge)',
            boxShadow: 'var(--console-well)',
          }}
        >
          <ChannelPlayer
            channelId={channelId} compact
            onVideo={(element) => { video.current = element; }}
          />
        </div>
      )}
    </div>
  );
}
