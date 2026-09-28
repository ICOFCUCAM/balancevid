'use client';

/**
 * The application bar.  [Doctrine CHANNEL §13, STUDIO-TWO §13, benchmark]
 *
 * Brand, then the places, then who you are. Shared by every studio, because
 * it is the APPLICATION'S bar and not any room's — a second copy of it in the
 * third studio would be a second place the tabs go out of date, and the first
 * symptom would be one studio knowing about another that the others do not.
 *
 * A tab that goes nowhere is a menu that lies, so a studio with nothing to
 * point at is dimmed and says why. That is the same rule that keeps unmeasured
 * spaces out of Studio Two's environment picker (INV-16).
 */

export type StudioTab =
  | 'conversations' | 'studio-one' | 'studio-two' | 'online-tv'
  | 'library' | 'publish';

export interface BarTab {
  id: StudioTab;
  label: string;
  glyph: string;
  href?: string;
  onClick?: () => void;
  hint?: string;
}

export default function StudioBar({
  current, studioOneId, studioTwoId, studioThreeId, extra, trailing, lamp,
}: {
  current: StudioTab;
  studioOneId?: string;
  studioTwoId?: string;
  studioThreeId?: string;
  /** A studio's own tab, such as Publish, which only it can scroll to. */
  extra?: BarTab[];
  /** What this room is, at the right-hand end. */
  trailing?: React.ReactNode;
  /** Shown before the trailing text: a channel's on-air lamp and clock. */
  lamp?: React.ReactNode;
}) {
  const tabs: BarTab[] = [
    {
      id: 'conversations', label: 'Conversations', glyph: '▢',
      href: '/#conversations',
    },
    studioOneId
      ? { id: 'studio-one', label: 'Studio One', glyph: '▣', href: `/c/${studioOneId}` }
      : {
        id: 'studio-one', label: 'Studio One', glyph: '▣',
        hint: 'No conversations yet — start one from the library',
      },
    studioTwoId || current === 'studio-two'
      ? {
        id: 'studio-two', label: 'Studio Two', glyph: '♪',
        ...(current === 'studio-two' ? {} : { href: `/p/${studioTwoId}` }),
      }
      : {
        id: 'studio-two', label: 'Studio Two', glyph: '♪',
        hint: 'No performances yet — start one from the library',
      },
    /*
     * ONLINE TV, not "Studio Three". The other two are named for being
     * studios because that is what somebody working in them is doing; this
     * one is named for what a viewer sees, because a channel is the only one
     * of the three that exists while nobody is in it. [CHANNEL §1, D-18]
     */
    studioThreeId || current === 'online-tv'
      ? {
        id: 'online-tv', label: 'Online TV', glyph: '◉',
        ...(current === 'online-tv' ? {} : { href: `/t/${studioThreeId}` }),
      }
      : {
        id: 'online-tv', label: 'Online TV', glyph: '◉',
        hint: 'No channels yet — start one from the library',
      },
    { id: 'library', label: 'Library', glyph: '☷', href: '/#performances' },
    ...(extra ?? []),
  ];

  return (
    <header className="shell-bar" style={{
      gap: 'var(--space-7)', padding: '0 var(--space-6)', minHeight: 52,
    }}>
      {/*
        * THE MARK. A flat blue square was the placeholder every product
        * starts with. What makes a mark read as a mark rather than as a
        * coloured box is that it has its own light: a gradient from the
        * top, a hairline of white on the upper edge, and a shadow tinted
        * with its own hue rather than with black — a coloured object casts
        * a coloured shadow, and a grey one under a blue mark is the single
        * commonest tell of a logo pasted onto a page.
        */}
      <a href="/" className="row" style={{
        gap: 'var(--space-3)', textDecoration: 'none', color: 'inherit',
        flex: '0 0 auto',
      }}>
        <span aria-hidden="true" style={{
          width: 26, height: 26, borderRadius: 'var(--radius-md)',
          display: 'grid', placeItems: 'center',
          background: 'linear-gradient(180deg, #3f8ee8 0%, #2a6fcc 100%)',
          color: '#fff', fontSize: 11, paddingLeft: 2,
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3),'
            + ' 0 1px 3px rgba(26, 78, 150, 0.5)',
        }}>&#9654;</span>
        <strong style={{
          fontSize: 'var(--text-md)', whiteSpace: 'nowrap',
          fontWeight: 'var(--weight-bold)',
          letterSpacing: 'var(--tracking-tight)',
        }}>BalanceVid</strong>
      </a>

      <nav className="row" data-testid="studio-nav" style={{ gap: 2, flexWrap: 'nowrap' }}>
        {tabs.map((tab) => {
          const on = tab.id === current;
          const body = (
            <>
              <span aria-hidden="true" style={{
                opacity: on ? 1 : 0.55, fontSize: 'var(--text-sm)',
              }}>{tab.glyph}</span>
              {/*
                * The bold width is reserved by an invisible copy of the
                * label, so switching tabs changes no width and the row
                * beside it does not move. [D-04]
                */}
              <span style={{ display: 'grid' }}>
                <span style={{
                  gridArea: '1 / 1', visibility: 'hidden', height: 0,
                  fontWeight: 'var(--weight-bold)', pointerEvents: 'none',
                }} aria-hidden="true">{tab.label}</span>
                <span style={{ gridArea: '1 / 1' }}>{tab.label}</span>
              </span>
            </>
          );
          /*
           * A TAB IS NOT A BUTTON AND MUST NOT LOOK LIKE ONE. It has no
           * fill and no border: what marks the current place is a rule
           * under it and a change of weight, which is how a tab has read
           * since before any of this was on a screen.
           *
           * THE WEIGHT CHANGE IS WHY THE ROW USED TO JUDDER. Going from
           * 500 to 700 makes the word wider, so every tab after the
           * current one shifted when the current one changed. The label
           * now reserves its own bold width whatever weight it is drawn
           * at, and the row is still.
           */
          const style = {
            display: 'flex', alignItems: 'center', gap: 'var(--space-3)',
            padding: '14px var(--space-5)', fontSize: 'var(--text-base)',
            textDecoration: 'none', whiteSpace: 'nowrap' as const,
            background: 'none', border: 0, borderRadius: 0,
            borderBottom: `2px solid ${on ? '#3f8ee8' : 'transparent'}`,
            color: on ? '#7fb4ee' : 'var(--text-dim)',
            fontWeight: on ? 'var(--weight-bold)' : 'var(--weight-medium)',
            opacity: on || tab.href || tab.onClick ? 1 : 0.38,
            cursor: tab.href || tab.onClick ? 'pointer' : 'default',
            transition: 'color var(--motion-fast) var(--ease-out),'
              + ' border-color var(--motion-fast) var(--ease-out)',
          };
          if (on) {
            return (
              <span key={tab.id} data-testid={`tab-${tab.id}`} aria-current="page"
                    style={style}>{body}</span>
            );
          }
          if (tab.href) {
            return (
              <a key={tab.id} data-testid={`tab-${tab.id}`} href={tab.href}
                 style={style}>{body}</a>
            );
          }
          return (
            <button key={tab.id} data-testid={`tab-${tab.id}`} type="button"
                    disabled={!tab.onClick} onClick={tab.onClick}
                    title={tab.hint} style={style}>{body}</button>
          );
        })}
      </nav>

      <span className="grow" />
      {lamp}
      {trailing}
      <a className="btn small" href="/" style={{ padding: '6px 12px', flex: '0 0 auto' }}>
        Leave
      </a>
    </header>
  );
}
