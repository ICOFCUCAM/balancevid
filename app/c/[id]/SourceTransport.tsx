'use client';

import { useEffect, useState } from 'react';

import Icon from '../../Icon.js';
import { HOUSE_FPS, formatTimecode, type Frames } from '../../../src/domain/time.js';

/**
 * The source's transport.  [Doctrine D-04, U-04, U-08, brief §12]
 *
 * WHAT IT REPLACES: `<video controls>`. The browser's own control bar,
 * across the bottom of the one surface in Studio One that matters, in
 * the operating system's typography, with the operating system's
 * scrubber, a three-dot menu offering "Download" and "Picture in
 * picture", and a grey progress line that is the brightest horizontal
 * element on the screen.
 *
 * It is the single least premium object a video product can ship, and
 * it is the one every video product ships, because it is free and it
 * works. It was also DUPLICATING a transport this studio already has:
 * the bar underneath already shows the state, the timecode and the
 * duration, so the frame carried a second clock disagreeing with the
 * first by a rounding error.
 *
 * WHAT A TRANSPORT ON A DESK HAS, and the native bar gets wrong:
 *
 *   A TIMECODE, NOT A CLOCK. `0:00 / 0:20` is how long a web page has
 *     been playing. `00:00:00:00` is a frame address, and a frame
 *     address is what every decision in this product is anchored to —
 *     the interrupt, the claim, the cut. [U-08, INV-02]
 *   A SCRUBBER YOU CAN LAND ON. The native one is 3px high with no
 *     hit area to speak of; this is a 20px band whose visible track is
 *     3px, which is how a fader works and why you can hit one.
 *   NOTHING THAT IS NOT NEEDED HERE. No download, no cast, no picture
 *     in picture. A menu offering to download somebody else's video
 *     from a product about answering it is worse than clutter.
 *
 * IT IS NOT A SECOND PLAYER. Every control here goes through the same
 * `player` handle Studio One already uses for the interrupt loop, so
 * space-to-interrupt, the claim anchor and the timeline all read the
 * same clock they always did. [D-19]
 */

export interface SourcePlayer {
  currentFrame(): number;
  pause(): void;
  play(): void;
  seek(frame: number): void;
  durationFrames(): number;
}

export default function SourceTransport({
  video, player, currentFrame, durationFrames, onSeek,
}: {
  /** The element, for the two things a player handle does not carry. */
  video: HTMLVideoElement | null;
  player: SourcePlayer | null;
  currentFrame: number;
  durationFrames: number;
  onSeek: (frame: Frames) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  /*
   * THE BUTTON FOLLOWS THE MEDIA, not the other way round. A play
   * button whose state is set when it is pressed is wrong the moment
   * anything else starts or stops the video — and in this studio the
   * interrupt does exactly that, on the space bar, several times a
   * minute. [U-04]
   */
  useEffect(() => {
    if (!video) return undefined;
    const sync = () => {
      setPlaying(!video.paused && !video.ended);
      setMuted(video.muted);
      setVolume(video.volume);
    };
    sync();
    for (const event of ['play', 'pause', 'ended', 'volumechange']) {
      video.addEventListener(event, sync);
    }
    return () => {
      for (const event of ['play', 'pause', 'ended', 'volumechange']) {
        video.removeEventListener(event, sync);
      }
    };
  }, [video]);

  const total = durationFrames > 0 ? durationFrames : 1;
  const through = Math.min(1, Math.max(0, currentFrame / total));

  return (
    <div
      data-testid="source-transport"
      className="row"
      style={{
        gap: 'var(--space-4)', flexWrap: 'nowrap', padding: '6px 10px',
        background: 'var(--console-chassis)',
        borderTop: 'var(--border) solid var(--console-edge)',
        boxShadow: 'var(--console-bevel)',
      }}
    >
      <button
        type="button" className="ctl" data-testid="source-play"
        aria-label={playing ? 'Pause the source' : 'Play the source'}
        title={playing ? 'Pause' : 'Play'}
        onClick={() => { if (playing) player?.pause(); else player?.play(); }}
        style={{ padding: '5px 9px', lineHeight: 0 }}
      >
        {playing
          ? (
            <span aria-hidden="true" style={{
              display: 'block', width: 11, height: 11,
              borderLeft: '3px solid currentColor',
              borderRight: '3px solid currentColor',
            }} />
          )
          : <Icon name="play" size={11} />}
      </button>

      {/*
        * THE FRAME ADDRESS, and the one thing on this bar allowed to be
        * bright. Everything in this product is anchored to a frame; the
        * number that says which one should not be dimmer than the mute
        * button beside it. [INV-02]
        */}
      <span className="mono readout" data-testid="source-timecode" style={{
        flex: '0 0 auto', fontSize: 'var(--text-xs)', color: 'var(--ink-050)',
        letterSpacing: '0.02em',
      }}>{formatTimecode(currentFrame as Frames)}</span>
      <span className="mono readout" style={{
        flex: '0 0 auto', fontSize: 'var(--text-2xs)', color: 'var(--ink-400)',
      }}>/ {formatTimecode(durationFrames as Frames)}</span>

      {/*
        * A BAND YOU CAN HIT, with a hairline in it. The native scrubber
        * is three pixels tall and the pointer has to find it; this is
        * twenty pixels of target around a three-pixel track, which is
        * how a fader is built and why a fader can be grabbed.
        */}
      <label className="grow" style={{
        position: 'relative', minWidth: 60, height: 20, margin: 0,
        display: 'flex', alignItems: 'center', cursor: 'pointer',
      }}>
        <span className="visually-hidden" style={{
          position: 'absolute', width: 1, height: 1, overflow: 'hidden',
          clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap',
        }}>Position in the source</span>
        {/*
          * THE UNPLAYED PART HAS TO BE VISIBLE. `--console-inset` on the
          * `--console-chassis` the strip is made of is a 1.03:1 step —
          * the filled part showed and the track it was filling did not,
          * so the bar read as a line that stops rather than as a
          * position in a length. A scrubber whose extent is invisible
          * cannot be aimed at.
          */}
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
          type="range" data-testid="source-scrub"
          min={0} max={total} step={1} value={Math.min(currentFrame, total)}
          onChange={(event) => {
            const frame = Number(event.target.value) as Frames;
            player?.seek(frame);
            onSeek(frame);
          }}
          style={{
            position: 'relative', width: '100%', height: 20, margin: 0,
            padding: 0, opacity: 0, cursor: 'pointer',
          }}
        />
      </label>

      <button
        type="button" className="ctl" data-testid="source-mute"
        aria-pressed={muted}
        aria-label={muted ? 'Unmute the source' : 'Mute the source'}
        title={muted ? 'Unmute' : 'Mute'}
        onClick={() => { if (video) video.muted = !video.muted; }}
        style={{ padding: '5px 9px', lineHeight: 0 }}
      >
        <Icon name={muted || volume === 0 ? 'muted' : 'sound'} size={13} />
      </button>

      <button
        type="button" className="ctl" data-testid="source-fullscreen"
        aria-label="Full screen"
        title="Full screen"
        onClick={() => {
          const frame = video?.parentElement ?? video;
          if (document.fullscreenElement) void document.exitFullscreen();
          else void frame?.requestFullscreen?.().catch(() => undefined);
        }}
        style={{ padding: '5px 9px', lineHeight: 0 }}
      >
        <Icon name="expand" size={13} />
      </button>

      {/*
        * THE FRAME RATE, because a timecode without one is ambiguous.
        * 00:00:12:14 means a different instant at 25 than at 30, and
        * this product cuts on frames. It is the quietest thing here and
        * it never changes, which is exactly what a technical legend on
        * a piece of equipment does. [U-08]
        */}
      <span className="unit" style={{ flex: '0 0 auto' }}>{HOUSE_FPS} fps</span>
    </div>
  );
}
