'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Research Mode.  [Doctrine §43, §16, U-09]
 *
 * "Show me every time the speaker mentions Norway" — and then jump to each
 * one, and interrupt there. The jump and the interruption are the point: a
 * search result you can only read is a worse transcript, while one you can
 * answer is a way into the conversation.
 *
 * Results are ranked by what kind of thing matched, not just by position: a
 * claim the author deliberately bound outranks a passing mention in the
 * source's narration, because they already decided that one mattered.
 */
const KIND_LABEL: Record<string, string> = {
  source: 'the source said',
  response: 'you said',
  claim: 'a claim you bound',
  evidence: 'evidence',
  note: 'your note',
};

interface Hit {
  kind: string;
  text: string;
  highlights: { start: number; end: number }[];
  tSourceFrame: number;
  timecode: string;
  interventionId?: string;
}

export default function SearchPanel({
  conversationId, canRecord, onSeek, onRespond,
}: {
  conversationId: string;
  canRecord: boolean;
  onSeek: (frame: number) => void;
  onRespond: (frame: number, quote?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async (text: string) => {
    if (!text.trim()) { setHits(null); setTotal(0); return; }
    setBusy(true);
    try {
      const response = await fetch(
        `/api/search?conversation=${conversationId}&q=${encodeURIComponent(text)}`);
      if (!response.ok) { setHits([]); setTotal(0); return; }
      const data = await response.json();
      setHits(data.results?.[0]?.hits ?? []);
      setTotal(data.results?.[0]?.total ?? 0);
    } finally {
      setBusy(false);
    }
  }, [conversationId]);

  // Typing is the query. Debounced, because the budget is 200 ms per search
  // and a keystroke is faster than that. [D-05]
  useEffect(() => {
    const timer = setTimeout(() => { void run(query); }, 180);
    return () => clearTimeout(timer);
  }, [query, run]);

  return (
    <div style={{ marginBottom: 10 }} data-testid="search-panel">
      <input
        type="search"
        value={query}
        placeholder='Search this conversation — or "an exact phrase"'
        data-testid="search-input"
        onChange={(e) => setQuery(e.target.value)}
        style={{ width: '100%' }}
      />

      {hits !== null && (
        <div className="small muted" style={{ margin: '6px 0' }} data-testid="search-count">
          {busy ? 'searching…'
            : total === 0 ? 'nothing found'
              : `${total} ${total === 1 ? 'result' : 'results'}${
                hits.length < total ? `, showing ${hits.length}` : ''}`}
        </div>
      )}

      {hits?.map((hit, index) => (
        <div key={`${hit.kind}-${hit.tSourceFrame}-${index}`} data-testid="search-hit"
             style={{ border: '1px solid var(--line)', borderRadius: 6, padding: 6, marginBottom: 6 }}>
          <div className="row small" style={{ gap: 6, marginBottom: 2 }}>
            <button className="small" onClick={() => onSeek(hit.tSourceFrame)}
                    data-testid="search-jump" title="Jump to this moment">
              {hit.timecode.slice(0, 8)}
            </button>
            <span className="grow muted">{KIND_LABEL[hit.kind] ?? hit.kind}</span>
            {/* Searching and answering are one motion, not two. */}
            <button className="small" disabled={!canRecord}
                    data-testid="search-respond"
                    onClick={() => onRespond(hit.tSourceFrame,
                      hit.kind === 'source' ? hit.text : undefined)}>
              Respond here
            </button>
          </div>
          <div className="small">{mark(hit.text, hit.highlights)}</div>
        </div>
      ))}
    </div>
  );
}

/** The matching words, marked. Built from ranges the server computed. */
function mark(text: string, highlights: { start: number; end: number }[]) {
  if (highlights.length === 0) return text;
  const pieces: React.ReactNode[] = [];
  let at = 0;
  highlights.forEach((range, index) => {
    if (range.start > at) pieces.push(text.slice(at, range.start));
    pieces.push(
      <mark key={index} style={{ background: 'var(--user-accent, #2b5f8a)', color: 'inherit' }}>
        {text.slice(range.start, range.end)}
      </mark>,
    );
    at = range.end;
  });
  if (at < text.length) pieces.push(text.slice(at));
  return pieces;
}
