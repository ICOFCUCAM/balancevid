'use client';

import { formatTimecode } from '../../../src/domain/time.js';

/**
 * The statement being answered, and the floor passing between two people.
 *
 * Selecting a sentence is not a neutral highlight — it is the author saying
 * "this is the thing I am responding to", and the interface should change
 * shape to say it back. The card has three states, and they are a sequence,
 * not a set of variants:
 *
 *   SELECTED    the source has the floor. Their statement, lifted out of the
 *               running text, with a way to hear it again and a way to answer.
 *   SPEAKING    the floor has passed. The statement recedes to a single line
 *               and the author's turn fills the card.
 *   ANSWERED    the exchange exists. The statement is attached to a response
 *               and will appear on screen beside it in the finished video.
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
export type ClaimCardState = 'selected' | 'speaking' | 'answered';

export default function ClaimCard({
  quote, startFrame, anchorFrame, boundTo, canRecord, speaking,
  onWatch, onRespond, onClear,
}: {
  quote: string;
  /** When the statement was said — its identity and where Watch goes. */
  startFrame: number;
  /** Where a response to it cuts in: after the statement has been heard. */
  anchorFrame: number;
  /** Set once a response carries this statement. */
  boundTo?: { interventionId: string; label: string } | null;
  canRecord: boolean;
  /** The author is recording their answer to this statement right now. */
  speaking?: boolean;
  onWatch: () => void;
  onRespond: () => void;
  onClear: () => void;
}) {
  const bound = Boolean(boundTo);
  /*
   * Speaking wins over answered, and the order matters.
   *
   * The response exists in the document from the instant the recording
   * starts — that is what makes the recording crash-safe (U-06). But the
   * author is still mid-sentence, and a card that flips to "answered by your
   * critique" while they are talking is describing a conversation that has
   * not finished happening. The floor decides what the card says.
   */
  const state: ClaimCardState = speaking ? 'speaking' : bound ? 'answered' : 'selected';

  /* ---- the floor has passed: the author's turn fills the card ---------- */
  if (state === 'speaking') {
    return (
      <div
        data-testid="claim-card"
        data-state="speaking"
        data-bound="false"
        data-anchor-frame={anchorFrame}
        className="panel"
        style={{
          padding: '10px 14px',
          borderColor: 'var(--user-accent, #c2794f)',
          borderLeft: '3px solid var(--user-accent, #c2794f)',
        }}
      >
        {/* The statement has not gone anywhere; it has stopped being the
            thing on the floor. One line, still exact, still quoted. */}
        <div className="row small muted" style={{ gap: 8, marginBottom: 8 }}>
          <span className="mono" data-testid="claim-card-time" style={{ flex: '0 0 auto' }}>
            {formatTimecode(startFrame).slice(0, 8)}
          </span>
          <span
            data-testid="claim-card-quote"
            className="grow"
            style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            “{quote}”
          </span>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <span aria-hidden style={{
            width: 10, height: 10, borderRadius: '50%',
            background: 'var(--user-accent, #c2794f)',
            boxShadow: '0 0 10px var(--user-accent, #c2794f)', flex: '0 0 auto',
          }} />
          <div className="grow">
            <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.15 }}>
              Your response
            </div>
            <div className="small muted">
              Press space when you are finished, and the video carries on right
              after that sentence.
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ---- the source has the floor, or the exchange is made --------------- */
  /*
   * Laid out across, not down.
   *
   * The card lives in the bottom bar, where height is the scarcest thing on
   * the screen: every row it adds is a row taken from the timeline, and the
   * timeline is where the same relationship is being drawn. Reading
   * left-to-right — what was said, then what you are doing about it — says
   * the same thing as reading top-to-bottom and costs half as much.
   */
  return (
    <div
      data-testid="claim-card"
      data-state={state}
      data-bound={bound ? 'true' : 'false'}
      data-anchor-frame={anchorFrame}
      className="panel"
      style={{
        padding: '10px 14px',
        display: 'flex', gap: 16, alignItems: 'center',
        borderColor: bound ? 'var(--user-accent, #6fb3e0)' : 'rgba(111,179,224,0.55)',
        borderLeftWidth: 3,
        borderLeftStyle: 'solid',
        borderLeftColor: 'var(--source-accent, #6fb3e0)',
      }}
    >
      {/* ---- what the source said --------------------------------------- */}
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <div className="row small muted" style={{ gap: 8, marginBottom: 2 }}>
          <span style={{ textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.6 }}>
            Source statement
          </span>
          <span className="mono" data-testid="claim-card-time">
            {formatTimecode(startFrame).slice(0, 8)}
          </span>
        </div>
        <blockquote
          data-testid="claim-card-quote"
          style={{
            margin: 0, fontSize: 16, lineHeight: 1.35,
            // Their words, set as their words. No emphasis that reads as doubt.
            fontStyle: 'normal',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          “{quote}”
        </blockquote>
      </div>

      <div aria-hidden style={{ color: 'var(--muted)', fontSize: 18, flex: '0 0 auto' }}>→</div>

      {/* ---- and what you are doing about it ---------------------------- */}
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <div className="small muted" style={{
          textTransform: 'uppercase', fontSize: 11, letterSpacing: 0.6, marginBottom: 2,
        }}>
          Your response
        </div>

        {bound ? (
          <div className="small" data-testid="claim-card-bound">
            Answered by your {boundTo!.label.toLocaleLowerCase()}. It stays attached,
            and appears on screen in the finished video.
          </div>
        ) : (
          <div className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <kbd style={{
              padding: '6px 14px', borderRadius: 6, border: '1px solid var(--line)',
              background: 'rgba(255,255,255,0.06)', fontSize: 13, letterSpacing: 1,
              flex: '0 0 auto',
            }}>SPACE</kbd>
            <span className="grow small muted">
              {canRecord
                ? 'to record your answer — the video resumes right after this sentence'
                : 'enable your camera to answer'}
            </span>
          </div>
        )}
      </div>

      <div className="row" style={{ gap: 8, flex: '0 0 auto', flexWrap: 'nowrap' }}>
        <button className="small" data-testid="claim-card-watch" onClick={onWatch}>
          Watch this moment
        </button>
        {!bound && (
          <button
            className="primary"
            data-testid="claim-card-respond"
            disabled={!canRecord}
            onClick={onRespond}
          >
            Respond to this
          </button>
        )}
        <button className="small" data-testid="claim-card-clear" onClick={onClear}>
          {bound ? 'Close' : 'Remove'}
        </button>
      </div>
    </div>
  );
}
