'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatTimecode } from '../../../src/domain/time.js';

/**
 * Suggested claims.  [Doctrine §20, U-15, INV-06]
 *
 * Finding the sentence worth answering in forty minutes of video IS the work.
 * This makes it a list — and then gets out of the way, because everything
 * below is a proposal and none of it is in the conversation until the author
 * puts it there.
 *
 * Three things are kept visibly separate, which is the whole point:
 *
 *   what the SOURCE said        the quote, verbatim, never rewritten
 *   what the MACHINE suggested  and why, in words, next to what produced it
 *   what the AUTHOR chose       accepted, narrowed, or turned down
 */
export default function ClaimsPanel({
  conversationId, transcriptVersion, canRecord, onSeek, onRespond,
}: {
  conversationId: string;
  transcriptVersion?: number;
  canRecord: boolean;
  onSeek: (frame: number) => void;
  onRespond: (claim: any, by: string, editedQuote?: string) => void;
}) {
  const [data, setData] = useState<any>(null);
  const [by, setBy] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/conversations/${conversationId}/claims`);
    if (response.ok) setData(await response.json());
  }, [conversationId]);

  // Re-read when the transcript arrives: before that there is nothing to find.
  useEffect(() => { void load(); }, [load, transcriptVersion]);

  /**
   * Keep asking while the source is still being transcribed.
   *
   * Without this, opening Studio a second before transcription finishes left
   * the panel saying "not transcribed yet" until someone thought to reload —
   * and the thing it was waiting for had arrived seconds later. A Class B
   * source is different: it will never have a transcript, so there is nothing
   * to wait for and the panel says so once.
   */
  const waiting = typeof data?.unavailable === 'string'
    && /not been transcribed/i.test(data.unavailable);
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(() => { void load(); }, 2000);
    return () => clearInterval(timer);
  }, [waiting, load]);

  const decide = async (claim: any, status: string, editedQuote?: string) => {
    setError(null);
    if (!by.trim()) {
      // INV-06 is not satisfiable anonymously, and saying so is better than a
      // disabled button with no explanation.
      setError('Put your name in first — a decision about a suggestion records who made it.');
      return;
    }
    const response = await fetch(`/api/conversations/${conversationId}/claims`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key: claim.key, status, by, ...(editedQuote ? { editedQuote } : {}) }),
    });
    if (!response.ok) {
      setError((await response.json().catch(() => ({}))).error ?? 'could not record that');
      return;
    }
    setEditing(null);
    await load();
  };

  if (!data) return null;
  const claims: any[] = data.claims ?? [];

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 12 }}
         data-testid="claims-panel">
      <div className="row" style={{ marginBottom: 6 }}>
        <strong className="grow">Claims worth answering</strong>
        <span className="small muted mono">{claims.length}</span>
      </div>

      {data.unavailable ? (
        <p className="small muted" data-testid="claims-unavailable" style={{ margin: 0 }}>
          {data.unavailable}.
        </p>
      ) : (
        <>
          {/* What produced these, stated rather than implied. [U-03, U-15] */}
          {data.detector && (
            <p className="small muted" style={{ marginTop: 0 }}>
              <button className="small" onClick={() => setOpen(!open)}
                      style={{ padding: '0 4px', marginRight: 6 }}>
                {open ? '▾' : '▸'}
              </button>
              Suggested by {data.detector.label} (v{data.detector.version}).
              {open && <> {data.detector.characteristics.summary}{' '}
                {data.detector.characteristics.local
                  ? 'It runs on this machine; your source\'s words are not sent anywhere.'
                  : 'It runs remotely.'}{' '}
                Nothing here is in your conversation until you put it there.</>}
            </p>
          )}

          <div className="field" style={{ marginBottom: 8 }}>
            <label htmlFor="claims-by" className="small">Decisions recorded as</label>
            <input id="claims-by" value={by} placeholder="Your name"
                   data-testid="claims-by"
                   onChange={(e) => setBy(e.target.value)} />
          </div>
          {error && <p className="small" style={{ color: 'var(--bad)' }}>{error}</p>}

          {claims.length === 0 && (
            <p className="small muted" style={{ margin: 0 }}>
              Nothing stood out. That is a statement about the shapes this finder
              looks for, not about the video.
            </p>
          )}

          {claims.map((claim) => (
            <div key={claim.key} data-testid="claim" data-status={claim.status}
                 style={{
                   border: '1px solid var(--line)', borderRadius: 6,
                   padding: 8, marginBottom: 8,
                   opacity: claim.status === 'rejected' ? 0.55 : 1,
                 }}>
              <div className="row small" style={{ gap: 6, marginBottom: 4 }}>
                <button className="small" onClick={() => onSeek(claim.suggested.startFrame)}
                        title="Jump to the moment it was said">
                  {formatTimecode(claim.suggested.startFrame).slice(0, 8)}
                </button>
                <span className="grow muted">
                  {claim.status === 'suggested' ? 'suggested' : `you ${claim.status} this`}
                </span>
              </div>

              {editing === claim.key ? (
                <>
                  <textarea rows={3} value={draft} data-testid="claim-edit"
                            onChange={(e) => setDraft(e.target.value)}
                            style={{ width: '100%', fontSize: 13 }} />
                  <p className="small muted" style={{ margin: '2px 0 6px' }}>
                    Narrow it to the part that matters. It has to stay the
                    source's own words — your wording belongs in a note.
                  </p>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="small" onClick={() => void decide(claim, 'edited', draft)}>
                      Save the narrower claim
                    </button>
                    <button className="small" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div className="small" style={{ marginBottom: 4 }}>
                    “{claim.effectiveQuote}”
                  </div>
                  {claim.status === 'edited' && (
                    <div className="small muted" style={{ marginBottom: 4 }}>
                      Suggested as: “{claim.suggested.quote}”
                    </div>
                  )}
                  <div className="small muted" style={{ marginBottom: 6 }}>
                    Flagged because it {claim.suggested.reasons.join(', ')}.
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <button className="small" disabled={!canRecord}
                            data-testid="claim-respond"
                            onClick={() => {
                              // Checked here as well as server-side: otherwise
                              // recording starts and the intervention that was
                              // supposed to hold it is refused.
                              if (!by.trim()) {
                                setError('Put your name in first — answering a suggestion '
                                  + 'records who accepted it.');
                                return;
                              }
                              setError(null);
                              onRespond(claim, by,
                                claim.status === 'edited' ? claim.effectiveQuote : undefined);
                            }}>
                      Respond to this
                    </button>
                    <button className="small" data-testid="claim-edit-open"
                            onClick={() => { setEditing(claim.key); setDraft(claim.effectiveQuote); }}>
                      Narrow it
                    </button>
                    <button className="small" data-testid="claim-reject"
                            onClick={() => void decide(claim, 'rejected')}>
                      {claim.status === 'rejected' ? 'Rejected' : 'Not this one'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
