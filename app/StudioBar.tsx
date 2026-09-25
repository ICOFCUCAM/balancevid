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
  | 'conversations' | 'studio-one' | 'studio-two' | 'studio-three'
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
  current, studioOneId, studioTwoId, studioThreeId, extra, trailing,
}: {
  current: StudioTab;
  studioOneId?: string;
  studioTwoId?: string;
  studioThreeId?: string;
  /** A studio's own tab, such as Publish, which only it can scroll to. */
  extra?: BarTab[];
  /** What this room is, at the right-hand end. */
  trailing?: React.ReactNode;
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
    studioThreeId || current === 'studio-three'
      ? {
        id: 'studio-three', label: 'Studio Three', glyph: '◉',
        ...(current === 'studio-three' ? {} : { href: `/t/${studioThreeId}` }),
      }
      : {
        id: 'studio-three', label: 'Studio Three', glyph: '◉',
        hint: 'No channels yet — start one from the library',
      },
    { id: 'library', label: 'Library', glyph: '☷', href: '/#performances' },
    ...(extra ?? []),
  ];

  return (
    <header className="shell-bar" style={{ gap: 18, padding: '0 18px', minHeight: 52 }}>
      <a href="/" className="row" style={{
        gap: 9, textDecoration: 'none', color: 'inherit', flex: '0 0 auto',
      }}>
        <span aria-hidden="true" style={{
          width: 26, height: 26, borderRadius: 7, display: 'grid',
          placeItems: 'center', background: '#2f7fe0', color: '#fff',
          fontSize: 12, paddingLeft: 2,
        }}>&#9654;</span>
        <strong style={{ fontSize: 15, whiteSpace: 'nowrap' }}>Prof Class</strong>
      </a>

      <nav className="row" data-testid="studio-nav" style={{ gap: 2, flexWrap: 'nowrap' }}>
        {tabs.map((tab) => {
          const on = tab.id === current;
          const body = (
            <>
              <span aria-hidden="true" style={{ opacity: on ? 1 : 0.7 }}>{tab.glyph}</span>
              <span>{tab.label}</span>
            </>
          );
          const style = {
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '14px 12px', fontSize: 13,
            textDecoration: 'none', whiteSpace: 'nowrap' as const,
            background: 'none', border: 0, borderRadius: 0,
            borderBottom: `2px solid ${on ? '#2f7fe0' : 'transparent'}`,
            color: on ? '#6fa9ea' : 'var(--text)',
            fontWeight: on ? 700 : 500,
            opacity: on || tab.href || tab.onClick ? 1 : 0.4,
            cursor: tab.href || tab.onClick ? 'pointer' : 'default',
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
      {trailing}
      <a className="btn small" href="/" style={{ padding: '6px 12px', flex: '0 0 auto' }}>
        Leave
      </a>
    </header>
  );
}
