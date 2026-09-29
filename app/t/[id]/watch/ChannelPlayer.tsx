'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Watching the channel.  [Doctrine CHANNEL §17, §11, U-31]
 *
 *     /playlist  →  ...stream/4291.ts  →  a picture
 *
 * The last link. Everything upstream of this was built and tested without
 * it: the schedule, the loop, the live buffer, the failover, the marks and
 * the segments on disk. What was missing was somebody able to watch them —
 * the playlist and the segments answered 404 to everyone but the owner, and
 * no player in the product could read an `.m3u8` anyway.
 *
 * WHY A LIBRARY AT ALL. Safari plays HLS natively; nothing else does. A
 * `<video src="…m3u8">` is a black rectangle in Chrome and Firefox, which is
 * most viewers. `hls.js` is the one dependency that turns the segments the
 * playout engine has been writing all along into a channel somebody can
 * actually watch, and it is loaded ONLY where the browser has no native
 * support — on an iPhone it never arrives at all.
 *
 * IT IS NOT THE STUDIO'S MONITOR. The control room shows the operator their
 * own picture, undelayed, because a presenter watching the transmission
 * talks over themselves (§7). This is the transmission: twelve seconds
 * behind, segment-aligned, and the same bytes every other viewer is getting.
 *
 * LIVE MEANS THE LIVE EDGE. A player that buffers politely drifts further
 * behind every stall until it is a minute late to its own channel, so a
 * player that has fallen behind the last segment is pushed back to it — the
 * one thing a live player must do that an on-demand one must not.
 */

/** How far behind the edge is too far, before it is nudged forward. */
const DRIFT_S = 12;

export default function ChannelPlayer({
  channelId, poster,
}: {
  channelId: string;
  poster?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const url = `/api/channels/${channelId}/playlist`;
    let destroy: (() => void) | undefined;
    let cancelled = false;

    /*
     * Native first. Safari and every iOS browser play HLS in the video
     * element, and handing those a JavaScript player would be shipping a
     * megabyte to re-implement something already in the operating system.
     */
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      setReady(true);
    } else {
      void (async () => {
        try {
          const { default: Hls } = await import('hls.js');
          if (cancelled) return;
          if (!Hls.isSupported()) {
            setError('This browser cannot play the channel.');
            return;
          }
          const hls = new Hls({
            /*
             * A live window of six four-second segments (playout.ts). Asking
             * to start three from the end is asking to start at the edge
             * with one segment of slack, which is what a channel wants: any
             * more is a viewer watching the past, any less is a viewer
             * stalling on every hiccup.
             */
            liveSyncDurationCount: 3,
            lowLatencyMode: false,
            enableWorker: true,
          });
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => setReady(true));
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (!data.fatal) return;
            /*
             * A fatal network or media error on a LIVE stream is usually the
             * channel between segments, not the end of it — so it recovers
             * rather than giving up, which is what the playout engine's own
             * black-segment fallback assumes the viewer will do. [§11, §9]
             */
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
            else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
            else { hls.destroy(); setError('The channel could not be loaded.'); }
          });
          destroy = () => hls.destroy();
        } catch {
          if (!cancelled) setError('The channel could not be loaded.');
        }
      })();
    }

    /* Back to the edge, whenever it has drifted off it. */
    const chase = setInterval(() => {
      if (!video.duration || Number.isNaN(video.duration)) return;
      const end = video.seekable.length > 0
        ? video.seekable.end(video.seekable.length - 1) : video.duration;
      if (end - video.currentTime > DRIFT_S) video.currentTime = end - 1;
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(chase);
      destroy?.();
    };
  }, [channelId]);

  return (
    <>
      <video
        ref={videoRef}
        data-testid="channel-player"
        controls autoPlay playsInline muted
        {...(poster ? { poster } : {})}
        style={{
          width: '100%', aspectRatio: '16 / 9', borderRadius: 'var(--radius-screen)',
          background: '#08090b', border: '1px solid var(--line)',
          display: 'block',
        }}
      />
      {error && (
        <p className="small" data-testid="player-error"
           style={{ color: 'var(--bad)', marginTop: 8 }}>
          {error}
        </p>
      )}
      {!ready && !error && (
        <p className="small muted" data-testid="player-waiting"
           style={{ marginTop: 8 }}>
          {/* Honest about which of the two it is. A channel whose engine is
              not running has segments nobody is writing, and "loading" for
              ever is the least useful thing a page can say. */}
          Tuning in&hellip; if this does not start, the channel&rsquo;s playout
          engine may not be running.
        </p>
      )}
    </>
  );
}
