'use client';

import React, { useEffect, useRef, useState } from 'react';

import Icon from '../../Icon.js';
import {
  type PlayableItem, type PlayerState, clock, may, search,
} from '../../../src/domain/mediaPlayer.js';

/**
 * The media player.  [Doctrine CHANNEL §25, §28, C-14; D-18, D-19]
 *
 *     LIBRARY → (VIDEO | AUDIO) → MEDIA PLAYER → (PREVIEW | PROGRAMME)
 *
 * *"I would NOT create a separate music-loading system. BalanceVid already
 *  has Library."* — so this holds no files. It shows the rows
 * `/api/channels/library` already returns, and the one it is pointed at
 * becomes a reference the channel's own roll-in takes to air. **No media is
 * copied into Online TV.** [D-18]
 *
 * WHAT WAS THERE BEFORE. Tile 05 mirrored the schedule, so *"Idle"* meant
 * *"nothing is scheduled"* on a tile whose name promised a player, and the
 * only route to a file was the left rail. C-14 states it as the brief did:
 * the path `Library → Media Player → Programme` had no middle.
 */

/* ------------------------------------------------------------------------ *
 *  The preview surface.
 * ------------------------------------------------------------------------ */

/**
 * A REAL METER, NOT A DRAWN WAVEFORM.
 *
 * The brief asks for a waveform under an audio-only item, and the honest
 * reading of that is the one thing a drawn squiggle cannot do: say whether
 * the sound is there. A sine wave painted under a song that is silent
 * because the file is broken is the decorative answer this whole brief
 * rejects — *"Don't add more decorative background buttons"* is the same
 * argument one section up.
 *
 * So these bars are the file's own spectrum, read through an
 * `AnalyserNode` on the element that is playing. A silent song shows a
 * flat row, which is the truth and is what an operator needs at the moment
 * before they take it.
 */
const BARS = 28;

function useSpectrum(
  element: HTMLMediaElement | null, running: boolean,
): number[] {
  const [bars, setBars] = useState<number[]>(() => Array(BARS).fill(0));
  const rig = useRef<{
    context: AudioContext; analyser: AnalyserNode;
    tap: MediaElementAudioSourceNode;
  } | null>(null);

  useEffect(() => {
    if (!element) return;
    /*
     * ONE TAP PER ELEMENT, FOR EVER. `createMediaElementSource` may be
     * called once on a given element; a second call throws and — worse —
     * the first call has already rerouted the element's output, so a
     * failure here is a player that has gone silent. The rig is built on
     * the first element we see and torn down with it.
     */
    let rigged = rig.current;
    if (!rigged) {
      try {
        const context = new AudioContext();
        const tap = context.createMediaElementSource(element);
        const analyser = context.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.72;
        tap.connect(analyser);
        /* And on to the speakers: an analyser is a tee, not a sink, and
           forgetting this is how a preview goes mute. */
        analyser.connect(context.destination);
        rigged = { context, analyser, tap };
        rig.current = rigged;
      } catch {
        /* No Web Audio, or the element is already tapped. The player
           still plays; it simply has no meter. */
        return;
      }
    }
    return () => { /* kept for the element's lifetime. */ };
  }, [element]);

  useEffect(() => {
    const rigged = rig.current;
    if (!rigged || !running) {
      setBars(Array(BARS).fill(0));
      return;
    }
    void rigged.context.resume().catch(() => undefined);
    const bins = new Uint8Array(rigged.analyser.frequencyBinCount);
    let stopped = false;
    const step = () => {
      if (stopped) return;
      rigged.analyser.getByteFrequencyData(bins);
      const out: number[] = [];
      const width = Math.max(1, Math.floor(bins.length / BARS));
      for (let i = 0; i < BARS; i += 1) {
        let sum = 0;
        for (let j = 0; j < width; j += 1) sum += bins[i * width + j] ?? 0;
        /*
         * SQUARE-ROOTED, because hearing is not linear and a linear bar
         * row is a wall of bass with a flat dotted line beside it — which
         * is what the browser showed on the first run. The root lifts the
         * mid and high bands to where an ear puts them, and a meter
         * nobody can read is a meter that is decoration. [U-19]
         */
        out.push(Math.min(1, Math.sqrt((sum / width) / 200)));
      }
      setBars(out);
      window.setTimeout(step, 60);
    };
    step();
    return () => { stopped = true; };
  }, [running]);

  return bars;
}

/**
 * What the operator sees while a thing is cued.
 *
 * VIDEO IS ITS OWN PICTURE. Audio has none, so it gets the channel's —
 * *"ALBUM ART / CHANNEL GRAPHIC, Song Title, Artist, audio waveform"* —
 * which is the same treatment the station wears on air, so the preview
 * and the transmission are not two different-looking things. [§25]
 */
export function MediaPreview({
  item, url, playing, station, ink, onEnded, onTime,
}: {
  item: PlayableItem;
  url: string;
  playing: boolean;
  /** The channel's own name, which is the graphic an audio item wears. */
  station: string;
  ink?: string;
  onEnded: () => void;
  onTime: (ms: number) => void;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [element, setElement] = useState<HTMLMediaElement | null>(null);
  const bars = useSpectrum(element, playing && item.kind === 'audio');

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (playing) void node.play().catch(() => undefined);
    else node.pause();
  }, [playing, url]);

  const sound = item.kind === 'audio';
  return (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--screen-bed)' }}>
      {/*
        * ONE ELEMENT EITHER WAY. A <video> plays a song perfectly well and
        * shows nothing, which is exactly right: swapping to an <audio> tag
        * for the audio case would mean two code paths, two refs and two
        * places for "it is playing" to be wrong.
        */}
      <video
        ref={(node) => { ref.current = node; setElement(node); }}
        src={url} playsInline data-testid="media-preview"
        onEnded={onEnded}
        onTimeUpdate={(event) =>
          onTime(Math.round(event.currentTarget.currentTime * 1000))}
        style={{
          width: '100%', height: '100%', objectFit: 'contain',
          display: sound ? 'none' : 'block',
        }}
      />
      {sound && (
        <div data-testid="audio-treatment" style={{
          position: 'absolute', inset: 0,
          display: 'grid', alignContent: 'center', justifyItems: 'center',
          gap: 'var(--space-3)', padding: 'var(--space-5)', textAlign: 'center',
          /* The channel's own graphic: its name, set the way the bug is
             set on the outgoing frame. */
          background: 'radial-gradient(120% 90% at 50% 20%,'
            + ' rgba(255,255,255,0.06), transparent 70%)',
        }}>
          <span style={{
            fontSize: 'var(--text-2xs)', letterSpacing: '0.16em',
            fontWeight: 'var(--weight-bold)',
            color: ink ?? 'var(--ink-300)', opacity: 0.8,
          }}>{station.toUpperCase()}</span>
          <span style={{
            fontSize: 'var(--text-base)', fontWeight: 'var(--weight-semi)',
            color: 'var(--ink-000)', maxWidth: '90%',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{item.title}</span>
          {item.artist && (
            <span className="muted" style={{ fontSize: 'var(--text-xs)' }}>
              {item.artist}
            </span>
          )}
          {/*
            * MIRRORED ABOUT ITS OWN CENTRE, which is what makes a row of
            * bars read as a WAVEFORM rather than as a bar chart. Aligned
            * to the bottom it was a chart of the spectrum; centred, it is
            * the shape the brief drew. The bars at rest are a hairline
            * through the middle — an axis — rather than a row of dots.
            */}
          <span aria-hidden="true" className="row" data-testid="waveform" style={{
            gap: 2, alignItems: 'center', height: 24, marginTop: 2,
          }}>
            {bars.map((level, index) => (
              <span
                // eslint-disable-next-line react/no-array-index-key
                key={index}
                style={{
                  width: 3, borderRadius: 2,
                  height: `${Math.max(6, level * 100)}%`,
                  background: level > 0.06
                    ? 'var(--state-ok)' : 'rgba(255,255,255,0.22)',
                  transition: 'height 70ms linear',
                }}
              />
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ *
 *  The picker and the transport.
 * ------------------------------------------------------------------------ */

/**
 * *"Search Library… [ Song — Ancient Days 04:04 ] … [Load]"*
 *
 * A compact browser over the library that already exists, and four
 * controls under it. The rows are the same references the left rail's
 * Library tab lists — the same fetch, the same objects — so a thing cued
 * here and a thing scheduled there cannot be two different things.
 */
export default function MediaPlayerPanel({
  items, state, query, onQuery, onLoad, onPlay, onPause, onTake, onEject,
  onAir,
}: {
  items: PlayableItem[];
  state: PlayerState;
  query: string;
  onQuery: (value: string) => void;
  onLoad: (key: string) => void;
  onPlay: () => void;
  onPause: () => void;
  onTake: () => void;
  onEject: () => void;
  /** Off air there is no programme to take anything to. */
  onAir: boolean;
}) {
  const rows = search(items, query);
  const loaded = items.find((one) => one.key === state.key) ?? null;

  return (
    <div className="col" style={{ gap: 'var(--space-3)', minWidth: 0 }}>
      <p className="small muted" style={{ margin: 0, fontSize: 'var(--text-2xs)' }}>
        {/* The sentence D-18 is about, next to the thing it is about. */}
        Everything finished in either studio, and anything uploaded. Loading
        one points at it — nothing is copied into this channel.
      </p>

      <input
        type="search" data-testid="media-search"
        value={query} onChange={(event) => onQuery(event.target.value)}
        placeholder="Search Library…"
        aria-label="Search the library"
        style={{
          width: '100%', padding: '6px 8px',
          background: 'var(--console-inset)', color: 'inherit',
          border: '1px solid var(--line)', borderRadius: 'var(--radius-xs)',
          fontSize: 'var(--text-xs)', font: 'inherit',
        }}
      />

      <div data-testid="media-rows" style={{
        /*
         * A FIXED WELL, because this sits in a desk column beside a live
         * picture and a library of thirty renders must not push the
         * transport off the bottom of it. [§29]
         */
        maxHeight: 190, overflowY: 'auto', minWidth: 0,
        border: '1px solid var(--console-seam)',
        borderRadius: 'var(--radius-xs)',
        background: 'var(--console-inset)',
      }}>
        {rows.length === 0 ? (
          <p className="small muted" style={{
            margin: 0, padding: 'var(--space-4)', fontSize: 'var(--text-2xs)',
          }}>
            {items.length === 0
              ? 'Nothing finished yet. Make a video in Studio One or Studio '
                + 'Two, or upload a song, and it appears here.'
              : `Nothing matches “${query.trim()}”.`}
          </p>
        ) : rows.map((row) => {
          const cued = state.key === row.key;
          return (
            <button
              key={row.key} type="button"
              data-testid="media-row" data-key={row.key}
              data-cued={cued ? 'true' : 'false'}
              onClick={() => onLoad(row.key)}
              title={`Load ${row.title}`}
              className="row"
              style={{
                width: '100%', gap: 'var(--space-3)', minWidth: 0,
                padding: '5px 7px', textAlign: 'left', font: 'inherit',
                border: 0, borderBottom: '1px solid var(--console-rule)',
                background: cued ? 'var(--console-control)' : 'transparent',
                color: 'inherit', cursor: 'pointer',
              }}
            >
              <span aria-hidden="true" style={{
                flex: '0 0 auto', opacity: row.kind === 'audio' ? 0.9 : 0.55,
                lineHeight: 0,
              }}>
                <Icon name={row.kind === 'audio' ? 'music' : 'play'} size={11} />
              </span>
              <span className="grow col" style={{ minWidth: 0, gap: 1 }}>
                <span style={{
                  fontSize: 'var(--text-xs)', minWidth: 0,
                  overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>{row.title}</span>
                {row.artist && (
                  <span className="muted" style={{
                    fontSize: 'var(--text-2xs)', minWidth: 0,
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>{row.artist}</span>
                )}
              </span>
              <span className="mono muted" style={{
                flex: '0 0 auto', fontSize: 'var(--text-2xs)',
              }}>{row.kind === 'image' ? 'STILL' : clock(row.durationMs)}</span>
            </button>
          );
        })}
      </div>

      {/* ---- the transport ---------------------------------------------- */}
      <div className="col" data-testid="media-transport" style={{
        gap: 'var(--space-3)', padding: 'var(--space-3)',
        border: '1px solid var(--console-seam)',
        borderRadius: 'var(--radius-xs)',
      }}>
        <span className="row" style={{ gap: 'var(--space-3)', minWidth: 0 }}>
          <span className="grow" style={{
            minWidth: 0, fontSize: 'var(--text-xs)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: loaded ? 'var(--ink-000)' : 'var(--ink-400)',
          }}>{loaded?.title ?? 'Nothing loaded'}</span>
          {loaded && (
            <span className="mono muted" data-testid="media-at" style={{
              flex: '0 0 auto', fontSize: 'var(--text-2xs)',
            }}>{clock(state.atMs)} / {clock(loaded.durationMs)}</span>
          )}
        </span>

        <span className="row" style={{ gap: 5 }}>
          <button
            className="ctl" type="button" data-testid="media-play"
            disabled={!may(state, state.phase === 'playing' ? 'pause' : 'play')}
            onClick={state.phase === 'playing' ? onPause : onPlay}
            title={state.phase === 'playing'
              ? 'Pause the preview' : 'Play it in preview — nothing goes out'}
            style={{ flex: 1, padding: '6px 8px' }}
          >{state.phase === 'playing' ? 'Pause' : 'Play'}</button>
          {/*
            * TAKE LIVE IS THE ONE RED CONTROL HERE, because it is the one
            * that reaches the wire. Everything above it happens in this
            * browser. [§25, U-20]
            */}
          <button
            className={`ctl${onAir && may(state, 'take') ? ' is-live' : ''}`}
            type="button" data-testid="media-take"
            disabled={!onAir || !may(state, 'take')}
            onClick={onTake}
            title={onAir
              ? 'Roll it in over what is going out'
              : 'Only while you are live'}
            style={{ flex: 1, padding: '6px 8px' }}
          >Take live</button>
          <button
            className="ctl" type="button" data-testid="media-eject"
            disabled={!may(state, 'eject')} onClick={onEject}
            title="Clear the player"
            style={{ flex: '0 0 auto', padding: '6px 8px' }}
          >Eject</button>
        </span>
      </div>
    </div>
  );
}
