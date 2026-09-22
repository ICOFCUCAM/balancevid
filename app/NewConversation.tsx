'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

/**
 * Adding a source requires a rights basis.  [Doctrine U-35 §2]
 *
 * "Rights attestation is a record, not a checkbox" -- the chosen basis is stored
 * with the source, shown on the project, and kept in the audit log. MVP is
 * Class A only (U-36): sources we hold the frames for.
 */
const BASES = [
  'I own this material',
  'Licensed',
  'Public domain',
  'Permission granted',
  'Institutional material (my organisation owns it)',
  'Fair use / fair dealing — transformative commentary',
];

export default function NewConversation() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'upload' | 'link'>('upload');
  const [providerUrl, setProviderUrl] = useState('');

  /**
   * Respond to a video you do not hold.  [Doctrine U-01]
   *
   * Nothing is downloaded. The video stays on its platform and plays through
   * its own embed; what we publish is a player that drives it, so the original
   * creator keeps their views and their revenue (D-08).
   */
  async function submitLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          providerUrl,
          sourceTitle: String(form.get('sourceTitle') ?? ''),
          creator: String(form.get('creator') ?? ''),
          rightsBasis: String(form.get('rightsBasis') ?? ''),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'could not add that link');
      router.push(`/c/${data.conversation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      const response = await fetch('/api/conversations', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'upload failed');
      router.push(`/c/${data.conversation.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  if (mode === 'link') {
    return (
      <form className="panel" onSubmit={submitLink}>
        <div className="row" style={{ gap: 0, marginBottom: 12 }}>
          <button type="button" onClick={() => setMode('upload')}
                  style={{ borderRadius: '8px 0 0 8px' }}>Upload</button>
          <button type="button" style={{ borderRadius: '0 8px 8px 0', background: '#2b5f8a' }}>
            Paste a link
          </button>
        </div>
        <div className="field">
          <label htmlFor="providerUrl">YouTube or Vimeo link</label>
          <input
            id="providerUrl" name="providerUrl" type="url" required
            placeholder="https://youtube.com/watch?v=…"
            value={providerUrl} onChange={(e) => setProviderUrl(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="sourceTitleLink">Source title</label>
          <input id="sourceTitleLink" name="sourceTitle" placeholder="The History of Europe" />
        </div>
        <div className="field">
          <label htmlFor="creatorLink">Original creator</label>
          <input id="creatorLink" name="creator" placeholder="Example Channel" />
        </div>
        <div className="field">
          <label htmlFor="rightsBasisLink">Rights basis</label>
          <select id="rightsBasisLink" name="rightsBasis" defaultValue={BASES[5]}>
            {BASES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>
          The video is never downloaded. It plays through its own official
          embed, and what you publish is a player that drives it — so the
          original creator keeps their views. A composed download is not
          offered for a source you do not hold.
        </p>
        {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Adding…' : 'Create conversation'}
        </button>
      </form>
    );
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="row" style={{ gap: 0, marginBottom: 12 }}>
        <button type="button" style={{ borderRadius: '8px 0 0 8px', background: '#2b5f8a' }}>
          Upload
        </button>
        <button type="button" onClick={() => setMode('link')}
                style={{ borderRadius: '0 8px 8px 0' }}>Paste a link</button>
      </div>
      <div className="field">
        <label htmlFor="file">Source video (Class A — you hold the frames)</label>
        <input id="file" name="file" type="file" accept="video/*" required />
      </div>
      <div className="field">
        <label htmlFor="sourceTitle">Source title</label>
        <input id="sourceTitle" name="sourceTitle" placeholder="The History of Europe" />
      </div>
      <div className="field">
        <label htmlFor="creator">Original creator (used in the attribution block)</label>
        <input id="creator" name="creator" placeholder="Example Channel" />
      </div>
      <div className="field">
        <label htmlFor="url">Original URL</label>
        <input id="url" name="url" type="url" placeholder="https://…" />
      </div>
      <div className="field">
        <label htmlFor="rightsBasis">Rights basis</label>
        <select id="rightsBasis" name="rightsBasis" required defaultValue={BASES[0]}>
          {BASES.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        Attribution is generated from these fields and appears on every export.
        It is not optional and cannot be removed.
      </p>
      {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}
      <button className="primary" type="submit" disabled={busy}>
        {busy ? 'Uploading…' : 'Create conversation'}
      </button>
    </form>
  );
}
