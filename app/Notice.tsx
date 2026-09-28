/**
 * Something the product needs to say.  [Doctrine D-04, U-19]
 *
 * THIRTY-ONE PLACES SET AN ERROR AND ONE OF THEM ANNOUNCES IT. A count of
 * `setError`, `setNotice`, `setWarning` and `setRefused` across the app
 * finds thirty-one; a count of `role="alert"` finds one. Every other
 * failure in this product appears silently: the text arrives in the DOM,
 * a sighted person sees it, and somebody using a screen reader carries on
 * waiting for something that already went wrong.
 *
 * That is the defect this exists to fix, and the styling is the smaller
 * half of it.
 *
 * `role="alert"` FOR A FAILURE AND `aria-live="polite"` FOR EVERYTHING
 * ELSE, which is a real distinction rather than a tidy-looking one. An
 * alert interrupts whatever the reader was saying; polite waits for a
 * pause. A render that finished is worth mentioning at the next gap. A
 * take that failed to upload is worth interrupting for.
 *
 * THE COLOUR IS THE LAST CUE, NOT THE FIRST. Each kind carries a marker on
 * its leading edge and a word, so the three are distinguishable in
 * greyscale, in a photograph, and by the eight per cent of men who cannot
 * separate the red from the green. A notice that means something only in
 * colour is a notice that means nothing to some of the people reading it.
 */

export type NoticeKind = 'error' | 'warning' | 'done' | 'info';

const LOOK: Record<NoticeKind, { edge: string; wash: string; ink: string; word: string }> = {
  error: {
    edge: 'var(--state-bad)',
    wash: 'rgba(215,89,74,0.10)',
    ink: 'var(--ink-on-bad)',
    word: 'Failed',
  },
  warning: {
    edge: 'var(--state-armed)',
    wash: 'var(--state-armed-wash)',
    ink: 'var(--ink-on-armed)',
    word: 'Careful',
  },
  done: {
    edge: 'var(--state-ok)',
    wash: 'var(--state-ok-wash)',
    ink: 'var(--ink-on-ok)',
    word: 'Done',
  },
  info: {
    edge: 'var(--ink-450)',
    wash: 'rgba(86,93,103,0.12)',
    ink: 'var(--text-dim)',
    word: '',
  },
};

export default function Notice({
  kind = 'info', children, testid, word,
}: {
  kind?: NoticeKind;
  children: React.ReactNode;
  testid?: string;
  /** Overrides the default word, for a notice whose category has a name. */
  word?: string;
}) {
  const look = LOOK[kind];
  const label = word ?? look.word;
  return (
    <div
      {...(testid ? { 'data-testid': testid } : {})}
      data-kind={kind}
      /*
       * An error interrupts; anything else waits for a pause. `role` and
       * `aria-live` are set from the kind rather than passed in, because
       * a caller choosing them is a caller who will forget.
       */
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'error' ? 'assertive' : 'polite'}
      style={{
        display: 'flex', gap: 'var(--space-3)', alignItems: 'baseline',
        margin: 0, padding: 'var(--space-4) var(--space-5)',
        borderRadius: 'var(--radius-md)',
        background: look.wash,
        border: `var(--border) solid ${look.edge}33`,
        boxShadow: `inset 3px 0 0 ${look.edge}`,
        fontSize: 'var(--text-base)',
        lineHeight: 'var(--leading-snug)',
        color: look.ink,
      }}
    >
      {label && (
        <strong style={{
          flex: '0 0 auto', fontSize: 'var(--text-2xs)',
          fontWeight: 'var(--weight-bold)', letterSpacing: '0.08em',
          textTransform: 'uppercase', opacity: 0.85,
          /* Sits on the first line's baseline rather than above it. */
          position: 'relative', top: '-0.5px',
        }}>{label}</strong>
      )}
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  );
}
