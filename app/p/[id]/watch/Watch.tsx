'use client';

import { useState } from 'react';

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

  return (
    <div className="shell">
      <header className="shell-bar">
        <div className="grow" style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 17, margin: 0, whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</h1>
          {author && <div className="small muted">by {author}</div>}
        </div>
      </header>

      <div className="shell-body shell-scroll" style={{ padding: '16px 20px' }}>
        <video
          data-testid="published-video"
          src={videoUrl}
          controls
          playsInline
          onError={() => setFailed(true)}
          style={{
            width: '100%', maxWidth: 960, borderRadius: 10, background: '#08090b',
            border: '1px solid var(--line)',
          }}
        />
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
            <h2 style={{ fontSize: 14, marginBottom: 6 }}>Clips</h2>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              {clips.map((clip) => (
                <video
                  key={clip.url}
                  data-testid="published-clip"
                  src={clip.url}
                  controls
                  playsInline
                  style={{
                    width: 180, aspectRatio: '9 / 16', objectFit: 'cover',
                    borderRadius: 8, background: '#08090b',
                    border: '1px solid var(--line)',
                  }}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
