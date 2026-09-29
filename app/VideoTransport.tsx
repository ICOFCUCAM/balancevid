'use client';

import { useEffect, useRef, useState } from 'react';

import Icon from './Icon.js';

/**
 * What a viewer gets instead of the browser's control bar.  [D-04, U-01]
 *
 * WHAT IT REPLACES: `<video controls>`, on the two pages a STRANGER
 * lands on. Studio One's operator stopped seeing the native bar in
 * commit 12 of the art-direction pass, over an essay about it being
 * "the single least premium object a video product can ship" — and
 * the audience kept it: the channel's watch page, the performance's,
 * and every vertical clip on it.
 *
 * On a viewer page it is worse than on a desk, for two reasons the
 * desk did not have. It is the product's public face, and it is the
 * one surface where the operating system's typography, the OS
 * scrubber and a three-dot menu offering **Download** are what a
 * stranger concludes the product is made of. Offering to download
 * somebody's published work from the page that publishes it is not
 * a neutral default.
 *
 * WHY NOT `SourceTransport`, WHICH ALREADY EXISTS. That one is built
 * on a frame address: it takes a `SourcePlayer` handle, reads
 * `currentFrame`, prints `00:00:12:14` and legends the house rate,
 * because every decision in Studio One is anchored to a frame and
 * the interrupt loop owns the clock. [INV-02, U-08]
 *
 * A viewer does not cut. They watch, scrub and leave, and their clock
 * is seconds. Printing a frame address at somebody who is watching a
 * song is precision theatre, and threading Studio One's player handle
 * through a published page would couple the audience to the editor.
 *
 * So: two transports, two clocks, two jobs — and everything they
 * genuinely share (the chassis, the bevel, `.ctl`, `.readout`, the
 * hit-band scrubber) lives in `console.css`, which is where the
 * sharing belongs. If a third one appears, that is the signal to
 * merge rather than this.
 */

function mmss(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export default function VideoTransport({
  video, continuous = false, onAir = false, compact = false,
}: {
  video: HTMLVideoElement | null;
  /**
   * A channel has no end to scrub to, so it gets a clock and no
   * scrubber. A published video gets both. [D-18]
   */
  continuous?: boolean;
  /**
   * WHETHER ANYTHING IS ACTUALLY ARRIVING — a different fact from
   * `continuous`, and the first draft of this component conflated
   * them under one `live` prop. The result was a red LIVE badge
   * sitting directly above the page's own notice that the channel
   * is not transmitting: the identical lie this same commit fixed
   * one block further down, reintroduced four lines higher up by
   * naming a layout fact after a broadcast one. [U-20]
   */
  onAir?: boolean;
  /** A 9:16 clip in a row of clips: play, mute, and nothing else. */
  compact?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [at, setAt] = useState(0);
  const [length, setLength] = useState(0);
  const scrubbing = useRef(false);

  /*
   * THE BAR FOLLOWS THE MEDIA. A play button whose state is set when
   * it is pressed is wrong the moment anything else starts or stops
   * the video — autoplay policy, the end of the file, the user's own
   * keyboard, a channel cutting to the next programme.
   */
  useEffect(() => {
    if (!video) return undefined;
    const sync = () => {
      setPlaying(!video.paused && !video.ended);
      setMuted(video.muted);
      if (!scrubbing.current) setAt(video.currentTime);
      setLength(Number.isFinite(video.duration) ? video.duration : 0);
    };
    sync();
    const events = ['play', 'pause', 'ended', 'volumechange',
      'timeupdate', 'loadedmetadata', 'durationchange'];
    for (const event of events) video.addEventListener(event, sync);
    return () => {
      for (const event of events) video.removeEventListener(event, sync);
    };
  }, [video]);

  const total = length > 0 ? length : 0;
  const through = total > 0 ? Math.min(1, Math.max(0, at / total)) : 0;

  return (
    <div
      data-testid="video-transport"
      className="row"
      style={{
        gap: 'var(--space-4)', flexWrap: 'nowrap',
        padding: compact ? '4px 7px' : '7px 11px',
        background: 'var(--console-chassis)',
        borderTop: 'var(--border) solid var(--console-edge)',
        boxShadow: 'var(--console-bevel)',
      }}
    >
      <button
        type="button" className="ctl" data-testid="viewer-play"
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
        onClick={() => { if (video) { if (playing) video.pause(); else void video.play(); } }}
        style={{ padding: compact ? '4px 7px' : '5px 9px', lineHeight: 0 }}
      >
        <Icon name={playing ? 'pause' : 'play'} size={compact ? 10 : 12} />
      </button>

      {!compact && (
        <span className="mono readout" data-testid="viewer-clock" style={{
          flex: '0 0 auto', fontSize: 'var(--text-xs)', color: 'var(--ink-050)',
        }}>
          {mmss(at)}
          {!continuous && total > 0 && (
            <span style={{ color: 'var(--ink-400)' }}> / {mmss(total)}</span>
          )}
        </span>
      )}

      {/*
        * A CHANNEL HAS NO SCRUBBER, because it has nowhere to scrub
        * to: the page says so in words underneath — "This channel
        * runs continuously. There is no beginning to go back to." A
        * disabled slider saying the same thing is a control that
        * lies about being a control. [D-18]
        */}
      {!compact && !continuous && total > 0 && (
        <label className="grow" style={{
          position: 'relative', minWidth: 60, height: 20, margin: 0,
          display: 'flex', alignItems: 'center', cursor: 'pointer',
        }}>
          <span style={{
            position: 'absolute', width: 1, height: 1, overflow: 'hidden',
            clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
          }}>Position</span>
          {/* A 20px band around a 3px track: how a fader is built, and
              why a fader can be grabbed. */}
          <span aria-hidden="true" style={{
            position: 'absolute', left: 0, right: 0, height: 3,
            borderRadius: 2, background: 'var(--ink-600)',
            boxShadow: 'var(--console-well)',
          }} />
          <span aria-hidden="true" style={{
            position: 'absolute', left: 0, width: `${through * 100}%`, height: 3,
            borderRadius: 2, background: 'var(--accent)',
          }} />
          <span aria-hidden="true" style={{
            position: 'absolute', left: `${through * 100}%`, width: 2, height: 11,
            marginLeft: -1, background: 'var(--ink-050)', borderRadius: 1,
          }} />
          <input
            type="range" data-testid="viewer-scrub"
            min={0} max={total} step={0.05} value={Math.min(at, total)}
            onPointerDown={() => { scrubbing.current = true; }}
            onPointerUp={() => { scrubbing.current = false; }}
            onChange={(event) => {
              const to = Number(event.target.value);
              setAt(to);
              if (video) video.currentTime = to;
            }}
            style={{
              position: 'relative', width: '100%', height: 20, margin: 0,
              padding: 0, opacity: 0, cursor: 'pointer',
            }}
          />
        </label>
      )}
      {(compact || continuous) && <span className="grow" />}

      {onAir && (
        <span className="state is-live" data-testid="viewer-live">Live</span>
      )}

      <button
        type="button" className="ctl" data-testid="viewer-mute"
        aria-pressed={muted}
        aria-label={muted ? 'Unmute' : 'Mute'}
        title={muted ? 'Unmute' : 'Mute'}
        onClick={() => { if (video) video.muted = !video.muted; }}
        style={{ padding: compact ? '4px 7px' : '5px 9px', lineHeight: 0 }}
      >
        <Icon name={muted ? 'muted' : 'sound'} size={compact ? 11 : 13} />
      </button>

      {!compact && (
        <button
          type="button" className="ctl" data-testid="viewer-fullscreen"
          aria-label="Full screen" title="Full screen"
          onClick={() => {
            const frame = video?.parentElement ?? video;
            if (document.fullscreenElement) void document.exitFullscreen();
            else void frame?.requestFullscreen?.().catch(() => undefined);
          }}
          style={{ padding: '5px 9px', lineHeight: 0 }}
        >
          <Icon name="expand" size={13} />
        </button>
      )}
    </div>
  );
}
