'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatTimecode } from '../../../src/domain/time.js';

/**
 * Publishing.  [Doctrine U-31]
 *
 * The consent question is asked here, once, and it is not pre-answered: the
 * author decides whether anyone may respond to what they made. It cannot be
 * added later, because by then there would be responses made under an
 * assumption nobody stated.
 */
/**
 * Everything required to publish, already written.  [Doctrine U-30, §39]
 *
 * The end of an edit is the most fatiguing moment of the whole process, and it
 * is exactly where every other tool hands the author a blank description box.
 * The document already knows the chapters, the claims and the attribution, so
 * none of it is retyped here — it is copied.
 */
export default function BundlePanel({ conversationId, ready }: { conversationId: string; ready: boolean }) {
  const [data, setData] = useState<any>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/conversations/${conversationId}/bundle`);
    if (response.ok) setData(await response.json());
  }, [conversationId]);

  useEffect(() => { void load(); }, [load, ready]);

  // Thumbnails arrive from the worker after the export finishes, so the panel
  // waits for them rather than showing dashed boxes until someone reloads.
  const pending = data?.bundle
    && (data.renderedThumbnails?.length ?? 0) < data.bundle.thumbnails.length
    && data.thumbnailJob?.state !== 'failed';
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setInterval(() => { void load(); }, 1500);
    return () => clearInterval(timer);
  }, [pending, load]);

  const bundle = data?.bundle;
  if (!bundle) return null;
  const rendered: string[] = data.renderedThumbnails ?? [];

  const copy = async (what: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      // Clipboard permission is not guaranteed. Every field below is also a
      // selectable text box, so a refusal here costs a keystroke, not the work.
      setCopied(null);
    }
  };

  const chapterText = bundle.chapters
    .map((c: any) => `${c.timecode.slice(0, 8)} ${c.title}`).join('\n');

  return (
    <div className="panel" style={{ marginTop: 12 }} data-testid="bundle-panel">
      <strong>Ready to publish</strong>
      <p className="small muted" style={{ marginTop: 2 }}>
        Written from the conversation itself. Nothing here was invented — the
        titles are claims you bound, the chapters are your own cuts.
      </p>

      <div className="field">
        <label htmlFor="bundle-description">Description</label>
        <textarea id="bundle-description" readOnly rows={8} value={bundle.description}
                  data-testid="bundle-description"
                  style={{ width: '100%', fontSize: 13, fontFamily: 'inherit' }} />
        <button className="small" onClick={() => void copy('description', bundle.description)}>
          {copied === 'description' ? 'Copied' : 'Copy description'}
        </button>
      </div>

      <div className="field">
        <label>Chapters</label>
        {bundle.chapters.length > 0 ? (
          <>
            <pre className="small mono" data-testid="bundle-chapters"
                 style={{ margin: '0 0 6px', whiteSpace: 'pre-wrap' }}>{chapterText}</pre>
            <button className="small" onClick={() => void copy('chapters', chapterText)}>
              {copied === 'chapters' ? 'Copied' : 'Copy chapters'}
            </button>
          </>
        ) : (
          /* An ignored chapter list is worse than none, so we say why. */
          <p className="small muted" data-testid="bundle-chapters-note" style={{ margin: 0 }}>
            No chapter list: {bundle.chaptersNote}.
          </p>
        )}
      </div>

      <div className="field">
        <label>Suggested titles</label>
        <div className="small" data-testid="bundle-titles">
          {bundle.suggestedTitles.map((title: string) => (
            <div key={title} className="row" style={{ gap: 8, marginBottom: 4 }}>
              <span className="grow">{title}</span>
              <button className="small" onClick={() => void copy(title, title)}>
                {copied === title ? 'Copied' : 'Copy'}
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Thumbnails</label>
        {bundle.thumbnails.length === 0 ? (
          <p className="small muted" style={{ margin: 0 }}>
            Respond somewhere in the video and its thumbnails appear here.
          </p>
        ) : (
          <div data-testid="bundle-thumbnails"
               style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {bundle.thumbnails.map((candidate: any) => (
              <figure key={candidate.id} style={{ margin: 0 }}>
                {rendered.includes(candidate.id) ? (
                  <a href={`/api/conversations/${conversationId}/bundle?thumbnail=${candidate.id}`}
                     target="_blank" rel="noreferrer">
                    <img alt={candidate.label} data-testid={`thumb-${candidate.kind}`}
                         src={`/api/conversations/${conversationId}/bundle?thumbnail=${candidate.id}`}
                         style={{ width: '100%', borderRadius: 4, display: 'block' }} />
                  </a>
                ) : (
                  <div className="small muted" style={{
                    aspectRatio: '16 / 9', border: '1px dashed var(--line)', borderRadius: 4,
                    display: 'grid', placeItems: 'center', textAlign: 'center', padding: 4,
                  }}>{data.thumbnailJob?.state === 'failed'
                    ? 'could not be drawn'
                    : pending ? 'drawing…' : 'rendered with the export'}</div>
                )}
                <figcaption className="small muted">{candidate.label}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <a className="btn small"
           href={`/api/conversations/${conversationId}/representations?id=bundle.json`}
           target="_blank" rel="noreferrer">Whole bundle (JSON)</a>
        <a className="btn small" href={bundle.links.article} target="_blank" rel="noreferrer">
          Article
        </a>
        {/* The same document, arranged to be moved around in. [D-16] */}
        <a className="btn small" data-testid="open-interactive"
           href={`/c/${conversationId}/explore`} target="_blank" rel="noreferrer">
          Interactive
        </a>
        <a className="btn small"
           href={`/api/conversations/${conversationId}/representations?id=captions.srt`}
           target="_blank" rel="noreferrer">Captions</a>
      </div>
    </div>
  );
}
