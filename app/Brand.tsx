import Icon from './Icon.js';

/**
 * The mark.  [Doctrine D-14, D-19]
 *
 * Called `Brand` rather than `Mark` because `app/c/[id]/Mark.tsx`
 * already exists and is a different thing entirely — an annotation
 * drawn over a video. Two components with one name in one product is
 * a bug waiting for whoever autocompletes the wrong import.
 *
 * ONE COPY, because there were four. `StudioBar`, the sign-in page,
 * the watch page and Studio One's own bar each carried the same
 * twelve lines of gradient, bevel and tinted shadow — hand-copied,
 * already diverging in size (26 in three places, 34 in one) and
 * padding, and every one of them drawing the play triangle with
 * `&#9654;`.
 *
 * That is the exact failure `StudioBar`'s own doc comment warns
 * about for tabs: "a second copy of it would be a second place the
 * tabs go out of date". A mark is worse, because the first symptom
 * of a diverged logo is nobody noticing.
 *
 * THE TRIANGLE IS DRAWN. It was U+25B6, which is a different weight,
 * a different optical centre and a different vertical alignment in
 * every font — inside a 26px square with a hand-tuned `paddingLeft:
 * 2` compensating for whichever font the author happened to have.
 * The `play` icon is already in the set, already on the 24-unit grid
 * and already centred, so the nudge goes away with it.
 *
 * The gradient, the inner light and the shadow stay exactly as they
 * were: a mark reads as a mark rather than as a coloured box because
 * it has its own light, and a grey shadow under a blue mark is the
 * commonest tell of a logo pasted onto a page.
 */
export default function Brand({
  size = 26, wordmark = true, href = '/',
}: {
  size?: number;
  /** The sign-in page sets the name in the `<h1>` beside it. */
  wordmark?: boolean;
  /**
   * `null` for the one place the mark is not a way out: the sign-in
   * page, where there is nowhere to go until you are in.
   */
  href?: string | null;
}) {
  const badge = (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: 'var(--radius-md)',
      display: 'grid', placeItems: 'center', flex: '0 0 auto',
      background: 'linear-gradient(180deg, #3f8ee8 0%, #2a6fcc 100%)',
      color: '#fff',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3),'
        + ' 0 1px 3px rgba(26, 78, 150, 0.5)',
    }}>
      {/* Optically centred by the grid, not by a hand-tuned nudge. */}
      <Icon name="play" size={Math.round(size * 0.42)} />
    </span>
  );

  if (href === null) return badge;

  return (
    <a href={href} aria-label="BalanceVid" className="row" style={{
      gap: 'var(--space-3)', textDecoration: 'none', color: 'inherit',
      flex: '0 0 auto',
    }}>
      {badge}
      {wordmark && (
        <strong style={{
          fontSize: 'var(--text-md)', whiteSpace: 'nowrap',
          fontWeight: 'var(--weight-bold)',
          letterSpacing: 'var(--tracking-tight)',
        }}>BalanceVid</strong>
      )}
    </a>
  );
}
