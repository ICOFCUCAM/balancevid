'use client';

import { formatTimecode } from '../../../src/domain/time.js';

/**
 * The statement being answered.
 *
 * Selecting a sentence is not a neutral highlight — it is the author saying
 * "this is the thing I am responding to", and the interface should change
 * shape to say it back. Ordinary transcript browsing becomes a response in
 * progress, with the statement lifted out of the running text and placed at
 * the head of the answer.
 *
 * WHAT THIS CARD MUST NOT LOOK LIKE is a verdict. The product does not decide
 * that a statement is wrong; the author decides that a statement is worth
 * answering. So there is no flag, no warning colour, no score, and no
 * language that judges the sentence — only the source's own words, when they
 * were said, and a way to answer them. The author's agency is the whole asset
 * here, and a card that pre-judges the source quietly takes it away.
 *
 * Nothing here is a second claim system. The text, its frame and its hash are
 * the ones the document already stores against the response; this is a
 * different way of looking at them.
 */
export default function ClaimCard({
  quote, startFrame, anchorFrame, boundTo, canRecord, onWatch, onRespond, onClear,
}: {
  quote: string;
  /** When the statement was said — its identity and where Watch goes. */
  startFrame: number;
  /** Where a response to it cuts in: after the statement has been heard. */
  anchorFrame: number;
  /** Set once a response carries this statement. */
  boundTo?: { interventionId: string; label: string } | null;
  canRecord: boolean;
  onWatch: () => void;
  onRespond: () => void;
  onClear: () => void;
}) {
  const bound = Boolean(boundTo);

  return (
    <div
      data-testid="claim-card"
      data-bound={bound ? 'true' : 'false'}
      data-anchor-frame={anchorFrame}
      className="panel"
      style={{
        marginTop: 12,
        borderColor: bound ? 'var(--user-accent, #6fb3e0)' : 'rgba(111,179,224,0.55)',
        borderLeftWidth: 3,
        borderLeftStyle: 'solid',
        borderLeftColor: 'var(--source-accent, #6fb3e0)',
      }}
    >
      {/* ---- what the source said --------------------------------------- */}
      <div className="row small muted" style={{ marginBottom: 6, letterSpacing: 0.6 }}>
        <span className="grow" style={{ textTransform: 'uppercase', fontSize: 11 }}>
          Source statement
        </span>
        <span className="mono" data-testid="claim-card-time">
          {formatTimecode(startFrame).slice(0, 8)}
        </span>
      </div>

      <blockquote
        data-testid="claim-card-quote"
        style={{
          margin: 0, fontSize: 17, lineHeight: 1.4,
          // Their words, set as their words. No emphasis that reads as doubt.
          fontStyle: 'normal',
        }}
      >
        “{quote}”
      </blockquote>

      <div className="row" style={{ gap: 8, marginTop: 10 }}>
        <button className="small" data-testid="claim-card-watch" onClick={onWatch}>
          Watch this moment
        </button>
        <span className="grow" />
        <button className="small" data-testid="claim-card-clear" onClick={onClear}>
          {bound ? 'Close' : 'Remove'}
        </button>
      </div>

      {/* ---- and what you are doing about it ---------------------------- */}
      <div aria-hidden style={{
        textAlign: 'center', color: 'var(--muted)', margin: '10px 0 8px', fontSize: 18,
      }}>
        ↓
      </div>

      <div style={{
        borderTop: '1px solid var(--line)', paddingTop: 10,
      }}>
        <div className="small muted" style={{
          textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.6, marginBottom: 6,
        }}>
          Your response
        </div>

        {bound ? (
          <div className="row small" data-testid="claim-card-bound">
            <span className="grow">
              Answered by your {boundTo!.label.toLocaleLowerCase()}. This statement
              stays attached to it, and appears on screen in the finished video.
            </span>
          </div>
        ) : (
          <div className="row" style={{ gap: 10 }}>
            <kbd style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid var(--line)',
              background: 'rgba(255,255,255,0.06)', fontSize: 13, letterSpacing: 1,
            }}>SPACE</kbd>
            <span className="grow small muted">
              {canRecord
                ? 'to record your answer — the video resumes right after this sentence'
                : 'enable your camera to answer'}
            </span>
            <button
              className="primary"
              data-testid="claim-card-respond"
              disabled={!canRecord}
              onClick={onRespond}
            >
              Respond to this
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
