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

  return (
    <form className="panel" onSubmit={submit}>
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
