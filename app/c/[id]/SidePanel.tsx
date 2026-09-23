'use client';

import { useState, type ReactNode } from 'react';
import { formatTimecode } from '../../../src/domain/time.js';
import { forDisplay, type Transcript } from '../../../src/transcribe/types.js';

/**
 * Everything the conversation knows, beside the video rather than around it.
 *
 * Tabs rather than four stacked panels: an author is doing one of these things
 * at a time, and showing all four at once was the single biggest reason the
 * screen read as a dashboard.
 */
type Tab = 'transcript' | 'statements' | 'evidence' | 'notes';

export default function SidePanel({
  transcript, transcriptReady, currentFrame, selected, onSelect,
  statements, evidence, notes, onSeek, search, height,
}: {
  height?: string;
  transcript: Transcript | null;
  transcriptReady: boolean;
  currentFrame: number;
  /** The sentence the author has picked to answer, if any. */
  selected: { text: string; startFrame: number; endFrame: number } | null;
  onSelect: (sentence: { text: string; startFrame: number; endFrame: number } | null) => void;
  statements: ReactNode;
  evidence: { id: string; title: string; tSourceFrame: number }[];
  notes: { id: string; text: string; tSourceFrame: number }[];
  onSeek: (frame: number) => void;
  search: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>('transcript');
  const [expanded, setExpanded] = useState(true);

  const TabButton = ({ id, label, count }: { id: Tab; label: string; count?: number }) => (
    <button
      role="tab"
      aria-selected={tab === id}
      data-testid={`tab-${id}`}
      onClick={() => setTab(id)}
      className="small"
      style={{
        background: 'transparent', border: 'none', padding: '8px 2px', marginRight: 16,
        borderBottom: `2px solid ${tab === id ? 'var(--user-accent, #6fb3e0)' : 'transparent'}`,
        color: tab === id ? 'inherit' : 'var(--muted)', cursor: 'pointer',
      }}
    >
      {label}
      {count ? (
        <span className="mono" style={{
          marginLeft: 6, padding: '1px 5px', borderRadius: 8, fontSize: 11,
          background: 'rgba(255,255,255,0.09)',
        }}>{count}</span>
      ) : null}
    </button>
  );

  return (
    <section className="panel" style={{
      padding: 12, display: 'flex', flexDirection: 'column',
      minHeight: 0, height, maxHeight: '86vh',
    }}>
      <div role="tablist" aria-label="Conversation details"
           style={{ borderBottom: '1px solid var(--line)', marginBottom: 10 }}>
        <TabButton id="transcript" label="Transcript" />
        <TabButton id="statements" label="Statements" />
        <TabButton id="evidence" label="Evidence" count={evidence.length} />
        <TabButton id="notes" label="Notes" count={notes.length} />
      </div>

      <div style={{ overflow: 'auto', flex: '1 1 auto', minHeight: 0 }}>
        {tab === 'transcript' && (
          <>
            {search}
            <button
              className="small"
              data-testid="toggle-transcript"
              onClick={() => setExpanded(!expanded)}
              style={{ background: 'transparent', border: 'none', color: 'var(--muted)',
                padding: '2px 0 6px', cursor: 'pointer' }}
            >
              {expanded ? '▾' : '▸'} {transcript?.sentences.length ?? 0} sentences
            </button>
            {expanded && (<>
            {!transcriptReady ? (
              <p className="small muted">
                {transcript === null
                  ? 'This video plays on its own platform, so we never hear its audio. '
                    + 'Interrupt whenever you have something to say.'
                  : 'Listening to the source — the transcript will appear here shortly.'}
              </p>
            ) : (
              transcript?.sentences.map((sentence) => {
                const text = forDisplay(sentence.text, transcript.characteristics);
                const live = currentFrame >= sentence.startFrame && currentFrame < sentence.endFrame;
                const picked = selected?.endFrame === sentence.endFrame;
                return (
                  <button
                    key={sentence.id}
                    data-testid="transcript-line"
                    data-selected={picked ? 'true' : 'false'}
                    /*
                     * Jumps to the END of the sentence, which is where a
                     * response is anchored: someone answering a claim wants
                     * the audience to have heard it first (U-09).
                     */
                    onClick={() => {
                      onSelect({
                        text,
                        startFrame: sentence.startFrame,
                        endFrame: sentence.endFrame,
                      });
                      onSeek(sentence.endFrame);
                    }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
                      background: picked ? 'rgba(111,179,224,0.16)' : live ? 'rgba(255,255,255,0.05)' : 'transparent',
                      border: 'none', borderRadius: 6, padding: '6px 8px', marginBottom: 2,
                      color: 'inherit',
                      borderLeft: `3px solid ${picked ? 'var(--source-accent, #6fb3e0)' : 'transparent'}`,
                    }}
                  >
                    <span className="small mono muted" style={{ marginRight: 8 }}>
                      {formatTimecode(sentence.startFrame).slice(3, 8)}
                    </span>
                    <span className="small">{text}</span>
                  </button>
                );
              })
            )}
            </>)}
          </>
        )}

        {tab === 'statements' && statements}

        {tab === 'evidence' && (
          evidence.length === 0
            ? <p className="small muted">Nothing attached yet. Attach a document to a response in Studio.</p>
            : evidence.map((e) => (
              <button key={e.id} className="small" data-testid="side-evidence"
                      onClick={() => onSeek(e.tSourceFrame)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                        border: 'none', color: 'inherit', padding: '6px 8px', cursor: 'pointer' }}>
                <span className="mono muted" style={{ marginRight: 8 }}>
                  {formatTimecode(e.tSourceFrame).slice(3, 8)}
                </span>
                {e.title}
              </button>
            ))
        )}

        {tab === 'notes' && (
          notes.length === 0
            ? <p className="small muted">No notes yet. Write one against a response in Studio.</p>
            : notes.map((n) => (
              <button key={n.id} className="small" data-testid="side-note"
                      onClick={() => onSeek(n.tSourceFrame)}
                      style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                        border: 'none', color: 'inherit', padding: '6px 8px', cursor: 'pointer' }}>
                <span className="mono muted" style={{ marginRight: 8 }}>
                  {formatTimecode(n.tSourceFrame).slice(3, 8)}
                </span>
                {n.text}
              </button>
            ))
        )}
      </div>

    </section>
  );
}
