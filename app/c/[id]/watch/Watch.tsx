'use client';

/**
 * The companion player.  [Doctrine U-01, D-08]
 *
 * Plays the source up to each interruption, pauses it, plays the response, and
 * resumes the source at exactly the frame it stopped on — the same contract as
 * the composed video, except that nothing is composed.
 *
 * For an embedded source this is the whole export: the viewer watches the
 * original on the provider's own player, so the original creator keeps their
 * views, their analytics and their revenue. "The product's answer to rights
 * concerns is not minimal compliance — it is an architecture that makes
 * responding beneficial to the person being responded to." (D-08)
 *
 * For a governed source it is a companion to the composed video, which is why
 * this player can be built and tested without depending on a third party.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { HOUSE_FPS, formatTimecode } from '../../../../src/domain/time.js';

type Manifest = any;

interface SourcePlayer {
  seek(frame: number): void;
  play(): void;
  pause(): void;
  currentFrame(): number;
  durationFrames(): number;
}

export default function Watch({ conversationId }: { conversationId: string }) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caption, setCaption] = useState<string | null>(null);

  const sourceVideoRef = useRef<HTMLVideoElement | null>(null);
  const responseRef = useRef<HTMLVideoElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const playerRef = useRef<SourcePlayer | null>(null);
  const indexRef = useRef(0);
  const playingRef = useRef(false);
  const ytRef = useRef<any>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch(
        `/api/conversations/${conversationId}/representations?id=manifest.json`,
        { cache: 'no-store' },
      );
      if (!response.ok) { setError('could not load this conversation'); return; }
      setManifest(await response.json());
    })();
  }, [conversationId]);

  const isEmbedded = manifest?.source?.class === 'B';

  // --- the source player ----------------------------------------------------

  useEffect(() => {
    if (!manifest || isEmbedded) return;
    const video = sourceVideoRef.current;
    if (!video) return;
    playerRef.current = {
      seek: (frame) => { video.currentTime = frame / HOUSE_FPS; },
      play: () => { void video.play().catch(() => undefined); },
      pause: () => video.pause(),
      currentFrame: () => Math.floor(video.currentTime * HOUSE_FPS),
      durationFrames: () => Math.floor((video.duration || 0) * HOUSE_FPS),
    };
  }, [manifest, isEmbedded]);

  // The provider's own player, driven through the provider's own API. We never
  // touch the media; we only ask their player to play and to pause.
  useEffect(() => {
    if (!manifest || !isEmbedded || manifest.source.provider !== 'youtube') return;
    const win = window as any;

    const attach = () => {
      if (!frameRef.current) return;
      ytRef.current = new win.YT.Player(frameRef.current, {
        events: {
          onReady: () => {
            playerRef.current = {
              seek: (frame) => ytRef.current?.seekTo(frame / HOUSE_FPS, true),
              play: () => ytRef.current?.playVideo(),
              pause: () => ytRef.current?.pauseVideo(),
              currentFrame: () => Math.floor((ytRef.current?.getCurrentTime() ?? 0) * HOUSE_FPS),
              durationFrames: () => Math.floor((ytRef.current?.getDuration() ?? 0) * HOUSE_FPS),
            };
            // Only the provider's player knows how long the video is; report it
            // once so the conversation's timeline is complete.
            const duration = playerRef.current.durationFrames();
            if (duration > 0 && !(manifest.source.durationFrames > 0)) {
              void fetch(`/api/conversations/${conversationId}/source-meta`, {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ durationFrames: duration }),
              });
            }
          },
        },
      });
    };

    if (win.YT?.Player) { attach(); return; }
    const previous = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => { previous?.(); attach(); };
    if (!document.querySelector('script[data-yt-api]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.dataset['ytApi'] = '1';
      script.onerror = () => setError(
        'the provider’s player could not be loaded from this network');
      document.head.append(script);
    }
  }, [manifest, isEmbedded, conversationId]);

  // --- the sequence ---------------------------------------------------------

  const segments: any[] = manifest?.segments ?? [];

  const outputFrameOf = useCallback((segmentIndex: number, offset: number): number => {
    let total = 0;
    for (let i = 0; i < segmentIndex; i++) total += segments[i]?.durationFrames ?? 0;
    return total + offset;
  }, [segments]);

  const showCaptionAt = useCallback((outputFrame: number) => {
    const cue = (manifest?.captions ?? []).find(
      (c: any) => outputFrame >= c.startFrame && outputFrame < c.endFrame);
    setCaption(cue ? `${cue.speaker === 'user' ? 'YOU' : 'SOURCE'}: ${cue.text}` : null);
  }, [manifest]);

  const runSegment = useCallback((at: number) => {
    const segment = segments[at];
    if (!segment) { setPlaying(false); playingRef.current = false; return; }
    indexRef.current = at;
    setIndex(at);

    if (segment.kind === 'source') {
      const player = playerRef.current;
      if (!player) return;
      player.seek(segment.sourceInFrame);
      player.play();
      return;
    }

    playerRef.current?.pause();
    const video = responseRef.current;
    if (!video) return;
    // Pick what this browser can actually decode. H.264 is the better choice
    // where it exists; a browser without it still plays the conversation.
    const canMp4 = video.canPlayType('video/mp4; codecs="avc1.640028, mp4a.40.2"') !== '';
    video.src = canMp4 ? segment.mediaUrl : segment.mediaUrlWebm;
    const start = () => {
      video.currentTime = segment.mediaInFrame / HOUSE_FPS;
      void video.play().catch(() => undefined);
    };
    if (video.readyState >= 1) start();
    else video.addEventListener('loadedmetadata', start, { once: true });
  }, [segments]);

  // Watch the source's position and hand over at the cut. The next source
  // segment resumes at exactly the frame this one ended on. [U-07]
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      const segment = segments[indexRef.current];
      if (!segment || segment.kind !== 'source') return;
      const player = playerRef.current;
      if (!player) return;
      const frame = player.currentFrame();
      showCaptionAt(outputFrameOf(indexRef.current, Math.max(0, frame - segment.sourceInFrame)));
      if (frame >= segment.sourceOutFrame) {
        player.pause();
        runSegment(indexRef.current + 1);
      }
    }, 80);
    return () => clearInterval(timer);
  }, [playing, segments, runSegment, outputFrameOf, showCaptionAt]);

  const onResponseTime = useCallback(() => {
    const segment = segments[indexRef.current];
    const video = responseRef.current;
    if (!segment || segment.kind !== 'response' || !video) return;
    const mediaFrame = Math.floor(video.currentTime * HOUSE_FPS);
    showCaptionAt(outputFrameOf(indexRef.current, mediaFrame - segment.mediaInFrame));
    if (mediaFrame >= segment.mediaOutFrame) {
      video.pause();
      runSegment(indexRef.current + 1);
    }
  }, [segments, runSegment, outputFrameOf, showCaptionAt]);

  const start = useCallback(() => {
    setError(null);
    setPlaying(true);
    playingRef.current = true;
    runSegment(0);
  }, [runSegment]);

  const stop = useCallback(() => {
    setPlaying(false);
    playingRef.current = false;
    playerRef.current?.pause();
    responseRef.current?.pause();
  }, []);

  if (error) return <div className="wrap"><div className="panel">{error}</div></div>;
  if (!manifest) return <div className="wrap"><div className="panel muted">Loading…</div></div>;

  const current = segments[index];
  const inResponse = current?.kind === 'response';

  return (
    <div className="wrap" style={{ maxWidth: 900 }}>
      <h1 style={{ marginBottom: 2 }}>{manifest.title}</h1>
      <p className="small muted" style={{ marginTop: 0 }}>{manifest.attribution}</p>

      <div className="panel" style={{ padding: 10, position: 'relative' }}>
        <div style={{ position: 'relative', aspectRatio: '16 / 9', background: '#000' }}>
          {isEmbedded ? (
            <iframe
              ref={frameRef}
              src={manifest.source.embedUrl}
              title={manifest.source.title}
              allow="accelerometer; encrypted-media; picture-in-picture"
              allowFullScreen
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                border: 0, visibility: inResponse ? 'hidden' : 'visible',
              }}
            />
          ) : (
            <video
              ref={sourceVideoRef}
              src={manifest.source.playbackUrl}
              playsInline
              style={{
                position: 'absolute', inset: 0, width: '100%', height: '100%',
                visibility: inResponse ? 'hidden' : 'visible',
              }}
            />
          )}
          <video
            ref={responseRef}
            playsInline
            onTimeUpdate={onResponseTime}
            onEnded={() => runSegment(indexRef.current + 1)}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover', visibility: inResponse ? 'visible' : 'hidden',
            }}
          />
          {inResponse && current?.claim && (
            <div style={{
              position: 'absolute', top: 12, left: 12, right: 12,
              padding: '8px 12px', borderRadius: 6, fontStyle: 'italic',
              background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 15,
            }}>
              “{current.claim}”
            </div>
          )}
          {caption && (
            <div style={{
              position: 'absolute', bottom: 14, left: 24, right: 24, textAlign: 'center',
              color: '#fff', fontWeight: 600, textShadow: '0 2px 6px #000',
              background: 'rgba(0,0,0,.45)', borderRadius: 6, padding: '6px 10px',
            }}>
              {caption}
            </div>
          )}
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <button className="primary" onClick={playing ? stop : start}>
            {playing ? 'Pause' : 'Play the conversation'}
          </button>
          <span className="small muted grow">
            {inResponse
              ? `Response — ${current.typeLabel}`
              : current
                ? `Source ${current.fromTimecode} → ${current.toTimecode}`
                : 'Ready'}
          </span>
          <span className="small mono muted">
            {formatTimecode(manifest.totalOutputFrames)}
          </span>
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <strong>The conversation</strong>
        <div className="small muted" style={{ marginBottom: 8 }}>
          {isEmbedded
            ? 'The original plays on its own platform. Only the responses are ours.'
            : 'The source and the responses, in order.'}
        </div>
        {segments.map((segment: any, i: number) => (
          <div
            key={i}
            className="row small"
            style={{
              borderTop: '1px solid var(--line)', padding: '6px 0',
              opacity: i === index ? 1 : 0.62,
            }}
          >
            {segment.kind === 'source' ? (
              <>
                <span className="mono" style={{ color: 'var(--source-accent)', minWidth: 190 }}>
                  {segment.fromTimecode} → {segment.toTimecode}
                </span>
                <span className="grow">{manifest.source.title}</span>
              </>
            ) : (
              <>
                <span style={{ color: 'var(--user-accent)', minWidth: 190 }}>
                  {segment.typeLabel}
                </span>
                <span className="grow" style={{ fontStyle: segment.claim ? 'italic' : 'normal' }}>
                  {segment.claim ? `“${segment.claim}”` : 'your response'}
                </span>
              </>
            )}
            <button className="small" onClick={() => { setPlaying(true); playingRef.current = true; runSegment(i); }}>
              play
            </button>
          </div>
        ))}
      </div>

      {manifest.source.canonicalUrl && (
        <p className="small muted" style={{ marginTop: 12 }}>
          Watch the original on{' '}
          <a href={manifest.source.canonicalUrl} target="_blank" rel="noreferrer">
            its own platform
          </a>.
        </p>
      )}
    </div>
  );
}
