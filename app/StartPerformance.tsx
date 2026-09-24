'use client';

import { useState } from 'react';
import { MASTER_CLASSES } from '../src/domain/performance.js';

/**
 * Step 1 — choose the music.  [Doctrine STUDIO-TWO §3, §13, S-9]
 *
 * The way into Studio Two, and deliberately a different door from Studio One's.
 * The brief's §13 asks for the two studios to stay apart, and the clearest
 * place to honour that is at the beginning: one asks for something to respond
 * to, the other asks for something to perform against.
 *
 * WHAT MAY BE DONE WITH THE MUSIC IS ASKED HERE, at the door, and not later.
 * Not as a warning — as the first question, because the honest answer changes
 * what the studio will let you do at the end and somebody should learn that
 * before they record five takes rather than after. [S-9, INV-15]
 */

const CHOICES: { id: string; label: string; hint: string }[] = [
  { id: 'own', label: 'I made this', hint: 'Your own recording or composition.' },
  { id: 'licensed', label: 'I have a licence', hint: 'A sync licence, or a licensed library track.' },
  { id: 'open', label: 'Openly licensed', hint: 'Public domain, or a licence that permits this.' },
  {
    id: 'third_party', label: "Somebody else's",
    hint: 'You can perform, export and keep it privately. Publishing needs rights you have.',
  },
];

export default function StartPerformance() {
  const [file, setFile] = useState<File | null>(null);
  const [masterClass, setMasterClass] = useState('own');
  const [licence, setLicence] = useState('');
  const [artist, setArtist] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsLicence = masterClass === 'licensed' || masterClass === 'open';

  const begin = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('masterClass', masterClass);
      form.set('masterTitle', file.name.replace(/\.[^.]+$/, ''));
      if (artist.trim()) form.set('artist', artist.trim());
      if (licence.trim()) form.set('licence', licence.trim());

      const response = await fetch('/api/performances', { method: 'POST', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? 'that did not work');
      window.location.href = `/p/${data.performance.id}`;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div data-testid="start-performance">
      <div className="small muted" style={{ textTransform: 'uppercase',
        letterSpacing: 0.8, fontSize: 11 }}>
        Performance Studio
      </div>
      <h2 style={{ fontSize: 20, margin: '4px 0 6px' }}>Perform against a song</h2>
      <p className="small muted" style={{ marginTop: 0, maxWidth: 460 }}>
        One song, many performances, all on the same clock. Record yourself as
        often as you like and cut between them afterwards.
      </p>

      <div className="field">
        <label htmlFor="master-file">The song, instrumental or backing track</label>
        <input
          id="master-file" type="file" accept="audio/*,video/*"
          data-testid="master-file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {file && (
        <>
          <div className="field">
            <label htmlFor="master-artist">Who it is by (optional)</label>
            <input id="master-artist" data-testid="master-artist" value={artist}
                   placeholder="Artist" onChange={(e) => setArtist(e.target.value)} />
          </div>

          <div className="field">
            <label>What is this music?</label>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {CHOICES.map((choice) => (
                <button
                  key={choice.id}
                  className="small"
                  data-testid="master-class-choice"
                  data-class={choice.id}
                  data-chosen={masterClass === choice.id ? 'true' : 'false'}
                  onClick={() => setMasterClass(choice.id)}
                  style={{
                    padding: '5px 10px', fontSize: 12,
                    background: masterClass === choice.id ? 'rgba(43,95,138,0.30)' : undefined,
                    borderColor: masterClass === choice.id ? '#6fb3e0' : undefined,
                  }}
                >
                  {choice.label}
                </button>
              ))}
            </div>
            <span className="small muted" data-testid="master-class-hint" style={{ fontSize: 11 }}>
              {CHOICES.find((c) => c.id === masterClass)!.hint}
            </span>
          </div>

          {needsLicence && (
            <div className="field">
              <label htmlFor="master-licence">What permits it</label>
              <input id="master-licence" data-testid="master-licence" value={licence}
                     placeholder="CC BY 4.0, or a licence reference"
                     onChange={(e) => setLicence(e.target.value)} />
            </div>
          )}
        </>
      )}

      {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}

      <button
        className="primary" data-testid="start-performance-go"
        disabled={busy || !file || (needsLicence && !licence.trim())}
        onClick={() => void begin()}
      >
        {busy ? 'Preparing…' : 'Open the Performance Studio'}
      </button>
      <p className="small muted" style={{ marginTop: 10, marginBottom: 0 }}>
        {/* The one place MASTER_CLASSES is counted, so adding one cannot leave
            this sentence stale. */}
        {MASTER_CLASSES.length} answers, and the honest one is the useful one.
      </p>
    </div>
  );
}
