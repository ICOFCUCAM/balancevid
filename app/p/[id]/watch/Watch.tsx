'use client';

import { useState } from 'react';
import VideoTransport from '../../../VideoTransport.js';
import Brand from '../../../Brand.js';

/**
 * Watching a performance somebody sent you.  [Doctrine STUDIO-TWO §14, U-31]
 *
 * The published artefact and nothing else: the video, who made it, and what
 * the music is. No timeline, no takes, no scenes — those are the author's
 * working material, and a viewer who can see them is being shown a draft
 * rather than a performance.
 *
 * THE CREDIT IS NOT OPTIONAL AND NOT COLLAPSIBLE. INV-07 requires every export
 * to carry its attribution; a page that carries it behind a disclosure
 * triangle is carrying it the way a contract carries small print.
 */
export default function Watch({
  title, videoUrl, attribution, clips, author,
}: {
  title: string;
  videoUrl: string;
  attribution: string;
  author?: string;
  clips: { url: string; label: string }[];
}) {
  const [failed, setFailed] = useState(false);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);

  return (
    <div className="shell">
      {/*
        * THE MARK, because the channel's watch page has one and this
        * does not. Three pages a stranger can be sent — a
        * conversation, a performance, a channel — were built at
        * three different times and agreed on nothing: one had the
        * mark, one had a bare `<h1>`, one was flush left. A person
        * sent two of them should be able to tell they came from the
        * same place. [D-14]
        */}
      <header className="shell-bar" style={{ gap: 'var(--space-5)' }}>
        <Brand wordmark={false} />
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 'var(--text-lg)', margin: 0, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
          {author && <div className="small muted">by {author}</div>}
        </div>
      </header>

      {/*
        * A PUBLISHED PAGE IS READ, SO IT HAS A MEASURE. Everything
        * here was flush left against a `maxWidth: 960` video, which
        * on a 1440px window left a third of the page as dead air to
        * the right of a line of attribution text. A column that is
        * centred is not decoration; it is what stops the eye
        * travelling to the end of a 1200px line.
        */}
      <div className="shell-body shell-scroll" style={{ padding: '16px 20px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/*
          * The picture and its transport are one object: the bar is
          * seated inside the frame, where the native control bar was
          * drawn over the bottom of the picture.
          */}
        <div style={{
          border: 'var(--border) solid var(--line)',
          borderRadius: 'var(--radius-screen)', overflow: 'hidden',
          background: 'var(--screen-bed)',
        }}>
          <video
            data-testid="published-video"
            src={videoUrl}
            playsInline
            ref={setVideo}
            onError={() => setFailed(true)}
            style={{
              /*
                * A RESERVED SHAPE, so the page does not jump. With no
                * aspect ratio the frame is a few pixels tall until
                * metadata arrives and then shoves everything below it
                * down the page — and stays a few pixels tall for ever
                * if the video fails, which turns "could not be
                * loaded" into a sliver with a transport under it.
                */
              width: '100%', aspectRatio: '16 / 9',
              background: 'var(--screen-bed)', objectFit: 'contain',
              borderRadius: 0, border: 0, display: 'block',
            }}
          />
          <VideoTransport video={video} />
        </div>
        {failed && (
          <p className="small" style={{ color: 'var(--bad)' }}>
            This video could not be loaded.
          </p>
        )}

        {/* INV-07, U-21: generated from the record, never typed. */}
        <p className="small muted" data-testid="published-attribution"
           style={{ marginTop: 10, maxWidth: 720 }}>
          {attribution}
        </p>

        {clips.length > 0 && (
          <section style={{ marginTop: 18 }} data-testid="published-clips">
            <h2 style={{ fontSize: 'var(--text-base)', marginBottom: 6 }}>Clips</h2>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              {clips.map((clip) => (
                <Clip key={clip.url} url={clip.url} />
              ))}
            </div>
          </section>
        )}
        </div>
      </div>
    </div>
  );
}

/**
 * One vertical clip. Its own component because each needs its own
 * element in state for its own transport, and a hook cannot be
 * called inside a `.map`.
 */
function Clip({ url }: { url: string }) {
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);
  return (
    <div style={{
      width: 180, border: 'var(--border) solid var(--line)',
      borderRadius: 'var(--radius-screen)', overflow: 'hidden',
      background: 'var(--screen-bed)', flex: '0 0 auto',
    }}>
      <video
        data-testid="published-clip" src={url} playsInline ref={setVideo}
        style={{
          width: '100%', aspectRatio: '9 / 16', objectFit: 'cover',
          borderRadius: 0, border: 0, display: 'block', background: 'var(--screen-bed)',
        }}
      />
      {/* No clock and no scrub on a 180px-wide clip: play and mute is
          the whole of what fits, and the whole of what is wanted. */}
      <VideoTransport video={video} compact />
    </div>
  );
}
