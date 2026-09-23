'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Bringing a video into a conversation.
 *
 * This used to be a form: fields for the title, the creator, the rights
 * basis, the URL, all at once, before the person had seen anything. That is a
 * database record being filled in, and it set the tone for everything after.
 *
 * It is a journey now, and the middle step is the point of it:
 *
 *   CHOOSE   upload, or paste a link
 *   PREPARE  here is what you are about to have a conversation with —
 *            the picture, the title, who made it, how long it runs
 *   ENTER    the workspace
 *
 * Provenance has not gone anywhere. The creator, the source URL and the
 * rights basis still reach the attribution block on every export (U-21,
 * INV-07), and they are still asked for — under "Source information", where
 * someone who cares can open them, rather than as the first thing anyone
 * meets. What the first screen asks is what the product is about.
 */
type Step = 'choose' | 'ready';

interface Preview {
  kind: 'link' | 'file';
  title: string;
  author: string;
  thumbnailUrl?: string;
  providerLabel?: string;
  canonicalUrl?: string;
  durationSeconds?: number;
  fileName?: string;
  fileSizeMb?: number;
  unverified?: boolean;
}

export default function StartConversation() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('choose');
  const [mode, setMode] = useState<'link' | 'upload'>('link');
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [sourceTitle, setSourceTitle] = useState('');
  const [creator, setCreator] = useState('');
  const [rights, setRights] = useState('own');
  const [details, setDetails] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const lookUp = async () => {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/sources/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'could not read that link');
      const found: Preview = {
        kind: 'link',
        title: data.title || 'Untitled video',
        author: data.author ?? '',
        thumbnailUrl: data.thumbnailUrl || undefined,
        providerLabel: data.providerLabel,
        canonicalUrl: data.canonicalUrl,
        durationSeconds: data.durationSeconds,
        unverified: data.unverified,
      };
      setPreview(found);
      setSourceTitle(found.title);
      setTitle(`My response to “${found.title}”`);
      setCreator(found.author ?? '');
      setRights('permission');
      setStep('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  /** A local file can describe itself without anything leaving the machine. */
  const takeFile = (chosen: File) => {
    setFile(chosen);
    const name = chosen.name.replace(/\.[^.]+$/, '');
    const local: Preview = {
      kind: 'file',
      title: name,
      author: '',
      fileName: chosen.name,
      fileSizeMb: Math.round(chosen.size / 1_000_000),
    };
    /*
     * A picture of the file, drawn from the file.
     *
     * A black rectangle where the video should be is the difference between
     * "here is what you are about to answer" and "a file was accepted". The
     * browser can decode one frame without anything leaving the machine, so
     * there is no reason to show nothing.
     */
    const video = document.createElement('video');
    // 'auto', not 'metadata': seeking needs frames, and metadata is only the
    // header. With 'metadata' the seek never completes and the picture never
    // arrives.
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    const objectUrl = URL.createObjectURL(chosen);
    let drawn = false;
    const draw = () => {
      if (drawn || !video.videoWidth) return;
      drawn = true;
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
        const url = canvas.toDataURL('image/jpeg', 0.75);
        setPreview((p) => (p && p.kind === 'file' ? { ...p, thumbnailUrl: url } : p));
      } catch { /* a frame we cannot read is not a reason to stop. */ }
      URL.revokeObjectURL(objectUrl);
    };
    video.onloadedmetadata = () => {
      setPreview((p) => (p && p.kind === 'file'
        ? { ...p, durationSeconds: Math.round(video.duration) } : p));
      // A second in, where a title card or a black lead-in has usually ended.
      video.currentTime = Math.min(1, Math.max(0, video.duration - 0.1));
    };
    video.onseeked = draw;
    // Some containers report a seek complete without firing `seeked`; the
    // first decoded frame is just as good a moment to take the picture.
    video.oncanplay = () => { window.setTimeout(draw, 250); };
    video.src = objectUrl;
    setPreview(local);
    setSourceTitle(name);
    setTitle(`My response to “${name}”`);
    setRights('own');
    setStep('ready');
  };

  const enter = async () => {
    setBusy(true);
    setError(null);
    try {
      let response: Response;
      if (preview?.kind === 'file' && file) {
        const form = new FormData();
        form.set('file', file);
        form.set('sourceTitle', sourceTitle || preview.title);
        form.set('creator', creator);
        form.set('rightsBasis', rights);
        form.set('url', '');
        form.set('title', title);
        response = await fetch('/api/conversations', { method: 'POST', body: form });
      } else {
        response = await fetch('/api/conversations', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            providerUrl: url,
            sourceTitle: sourceTitle || (preview?.title ?? ''),
            creator,
            rightsBasis: rights,
            title,
          }),
        });
      }
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'could not start the conversation');
      router.push(`/c/${data.conversation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const minutes = (seconds?: number) => {
    if (!seconds) return null;
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  };

  /*
   * The file input lives outside the steps, always mounted.
   *
   * Unmounting it releases the File it is holding, and the object URL made
   * from that File stops resolving — which is why the preparation screen
   * showed a black rectangle where the first frame should be.
   */
  const filePicker = (
    <input
      ref={fileRef} id="file" type="file" accept="video/*"
      style={{ display: 'none' }}
      onChange={(e) => { const f = e.target.files?.[0]; if (f) takeFile(f); }}
    />
  );

  /* ---- step one: bring something in -------------------------------- */
  if (step === 'choose') {
    return (
      <div data-testid="start-choose">
        {filePicker}
        <h2 style={{ fontSize: 26, marginBottom: 4 }}>Bring a video into the conversation</h2>
        <p className="muted" style={{ marginTop: 0, maxWidth: 560 }}>
          Upload a video or paste a link, then respond to it throughout —
          interrupting wherever you have something to say.
        </p>

        <div className="row" style={{ gap: 12, margin: '20px 0 16px', alignItems: 'stretch' }}>
          <button
            data-testid="choose-link"
            onClick={() => setMode('link')}
            style={{
              flex: 1, textAlign: 'left', padding: '14px 16px',
              background: mode === 'link' ? 'rgba(43,95,138,0.35)' : 'transparent',
              border: `1px solid ${mode === 'link' ? 'var(--user-accent, #6fb3e0)' : 'var(--line)'}`,
            }}
          >
            <div style={{ fontWeight: 600 }}>Paste a video link</div>
            <div className="small muted">YouTube or Vimeo — it plays on its own platform</div>
          </button>
          <button
            data-testid="choose-upload"
            onClick={() => { setMode('upload'); fileRef.current?.click(); }}
            style={{
              flex: 1, textAlign: 'left', padding: '14px 16px',
              background: mode === 'upload' ? 'rgba(43,95,138,0.35)' : 'transparent',
              border: `1px solid ${mode === 'upload' ? 'var(--user-accent, #6fb3e0)' : 'var(--line)'}`,
            }}
          >
            <div style={{ fontWeight: 600 }}>Upload a video</div>
            <div className="small muted">From your computer — cut into one finished film</div>
          </button>
        </div>

        {mode === 'link' && (
          <div className="row" style={{ gap: 8 }}>
            <input
              className="grow" id="providerUrl" value={url} placeholder="https://www.youtube.com/watch?v=…"
              data-testid="source-url"
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && url.trim()) void lookUp(); }}
            />
            <button className="primary" data-testid="load-video"
                    disabled={busy || !url.trim()} onClick={() => void lookUp()}>
              {busy ? 'Looking…' : 'Load video'}
            </button>
          </div>
        )}

        {error && <p className="small" style={{ color: 'var(--bad)' }} data-testid="start-error">{error}</p>}
      </div>
    );
  }

  /* ---- step two: see what you are about to enter -------------------- */
  return (
    <div data-testid="start-ready" style={{ position: 'relative' }}>
      {filePicker}
      {/* The source's own picture, blurred behind its own setup screen. */}
      {preview?.thumbnailUrl && (
        <div aria-hidden style={{
          position: 'absolute', inset: -40, zIndex: 0, borderRadius: 16, overflow: 'hidden',
          backgroundImage: `url(${preview.thumbnailUrl})`,
          backgroundSize: 'cover', backgroundPosition: 'center',
          filter: 'blur(48px) saturate(1.25)', opacity: 0.30,
        }} />
      )}

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div className="small muted" style={{ textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 11 }}>
          New conversation
        </div>
        <h2 style={{ fontSize: 26, margin: '2px 0 16px' }}>Start a conversation</h2>

        <div className="row" style={{ gap: 16, alignItems: 'flex-start', marginBottom: 18 }}>
          <div style={{
            width: 280, aspectRatio: '16 / 9', borderRadius: 10, overflow: 'hidden',
            background: '#000', border: '1px solid var(--line)', flex: '0 0 auto',
            display: 'grid', placeItems: 'center',
          }}>
            {preview?.thumbnailUrl
              ? <img alt="" src={preview.thumbnailUrl} data-testid="preview-thumb"
                     style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <span className="small muted">{preview?.fileName ?? 'No preview'}</span>}
          </div>

          <div className="grow" style={{ minWidth: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 600, lineHeight: 1.25 }} data-testid="preview-title">
              {sourceTitle || preview?.title}
            </div>
            {preview?.author && <div className="muted" style={{ marginTop: 2 }}>{preview.author}</div>}
            <div className="small muted" style={{ marginTop: 8 }}>
              {[
                minutes(preview?.durationSeconds),
                preview?.providerLabel,
                preview?.fileSizeMb ? `${preview.fileSizeMb} MB` : null,
              ].filter(Boolean).join('  ·  ')}
            </div>
            {preview?.unverified && (
              <div className="small muted" style={{ marginTop: 8 }}>
                We could not reach {preview.providerLabel} for the details. The link
                still works — the title fills in once it plays.
              </div>
            )}
            <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
              {preview?.kind === 'file'
                ? 'Your responses and this video will be cut into one finished film.'
                : 'This video stays on its own platform. Your responses publish alongside '
                  + 'it, as a player that drives the original.'}
            </p>
          </div>
        </div>

        <div className="field">
          <label htmlFor="conversationTitle">What would you like to call this conversation?</label>
          <input id="conversationTitle" value={title} data-testid="conversation-title"
                 onChange={(e) => setTitle(e.target.value)} />
          <div className="small muted">You can change this later.</div>
        </div>

        {/*
          Provenance, kept and not foregrounded. The attribution block is
          generated from these and appears on every export (U-21, INV-07);
          what changes is that nobody has to answer them before they have
          seen the video.
        */}
        <button
          className="small" data-testid="toggle-source-details"
          onClick={() => setDetails(!details)}
          style={{ background: 'transparent', border: 'none', color: 'var(--muted)',
            padding: '6px 0', cursor: 'pointer' }}
        >
          {details ? '▾' : '▸'} Source information — creator, link, rights and attribution
        </button>

        {details && (
          <div style={{ borderLeft: '2px solid var(--line)', paddingLeft: 12, marginBottom: 12 }}>
            <div className="field">
              <label htmlFor="sourceTitle">What the video is called</label>
              <input id="sourceTitle" value={sourceTitle} data-testid="source-title"
                     onChange={(e) => setSourceTitle(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="creator">Original creator</label>
              <input id="creator" value={creator} data-testid="creator"
                     onChange={(e) => setCreator(e.target.value)} />
            </div>
            {preview?.canonicalUrl && (
              <div className="field">
                <label htmlFor="sourceLink">Original link</label>
                <input id="sourceLink" readOnly value={preview.canonicalUrl} />
              </div>
            )}
            <div className="field">
              <label htmlFor="rightsBasis">Rights basis</label>
              <select id="rightsBasis" value={rights} onChange={(e) => setRights(e.target.value)}>
                <option value="own">I own this material</option>
                <option value="permission">I have permission, or it is quoted fairly</option>
                <option value="public_domain">Public domain or open licence</option>
              </select>
            </div>
            <p className="small muted" style={{ marginBottom: 0 }}>
              A credit to the original is generated from these and appears on every
              export. It cannot be removed.
            </p>
          </div>
        )}

        {error && <p className="small" style={{ color: 'var(--bad)' }} data-testid="start-error">{error}</p>}

        <div className="row" style={{ gap: 10, marginTop: 8 }}>
          <button data-testid="start-back" onClick={() => { setStep('choose'); setPreview(null); }}>
            Back
          </button>
          <span className="grow" />
          <button className="primary" data-testid="enter-conversation"
                  disabled={busy || !title.trim()} onClick={() => void enter()}>
            {busy ? 'Preparing…' : 'Enter conversation →'}
          </button>
        </div>
      </div>
    </div>
  );
}
