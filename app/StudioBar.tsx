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

import Icon, { type IconName } from './Icon.js';
import Brand from './Brand.js';
import type { StudioId } from '../src/domain/account.js';
/* Each studio's own front door, from the one place that names it,
   so the bar and the home page cannot point at different lists.
   [rooms.ts, D-19] */
import { roomFor } from '../src/domain/rooms.js';

export type StudioTab =
  | 'conversations' | 'studio-one' | 'studio-two' | 'online-tv'
  | 'library' | 'publish';

export interface BarTab {
  id: StudioTab;
  label: string;
  /*
   * A NAME FROM THE ONE ICON SET, not a character from the Unicode
   * miscellaneous blocks. This was `glyph: string` holding ▢ ▣ ♪ ◉ ☷ —
   * and `Icon.tsx` names those exact characters in its own opening
   * paragraph as the thing it was written to replace. The set arrived,
   * the building and the studios were converted, and the bar that sits
   * above every one of those screens kept the glyphs. [D-19]
   *
   * They are whatever font happens to be installed: ◉ is a different
   * weight on every platform, several render as emoji on macOS, and
   * none of them share a baseline or an optical size with the others.
   * A row of five is five different sizes pretending to be a set —
   * which is exactly what the top of every studio screen was.
   */
  icon: IconName;
  href?: string;
  onClick?: () => void;
  hint?: string;
}

export default function StudioBar({
  current, studioOneId, studioTwoId, studioThreeId, extra, trailing, lamp,
  owned,
}: {
  current: StudioTab;
  /**
   * The studios this account has, or absent for all of them.
   * [MASTER-EDIT §11]
   *
   * ABSENT MEANS ALL THREE, matching the record the answer comes from, so a
   * bar rendered by a surface that has not been taught about plans shows
   * what it always showed rather than an empty row. The boundary is
   * `isOwner`; this is the courtesy of not drawing a door that will not
   * open.
   */
  owned?: StudioId[];
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
  const has = (id: StudioId) => owned === undefined || owned.includes(id);
  const all: BarTab[] = [
    {
      id: 'conversations', label: 'Conversations', icon: 'list',
      href: '/#conversations',
    },
    studioOneId
      ? {
        id: 'studio-one', label: 'Studio One', icon: 'conversation',
        /* The same rule, for the same reason: inside one
           conversation, this goes to the list that can start
           another. [rooms.ts] */
        href: current === 'studio-one'
          ? roomFor('studio-one').href : `/c/${studioOneId}`,
      }
      : {
        id: 'studio-one', label: 'Studio One', icon: 'conversation',
        hint: 'No conversations yet — start one from the library',
      },
    studioTwoId || current === 'studio-two'
      ? {
        id: 'studio-two', label: 'Studio Two', icon: 'music',
        /*
         * AND IT STILL GOES SOMEWHERE WHILE YOU ARE IN IT.
         *   [rooms.ts, D-13, D-21]
         *
         * This was inert on the studio you were already in —
         * `current === 'studio-two' ? {} : …` — on the reasonable
         * sounding ground that a link to where you already are is
         * no link at all. But you are NOT where it goes: you are
         * inside ONE performance, and the tab's destination is the
         * LIST of them, which is where `StartPerformance` lives.
         *
         * So from inside a song there was no way to begin another
         * one, or to reach the others, without going out to the
         * home page first — reported as *"studio two suppose to
         * have add project or New project"*. The intake was built
         * and reachable from exactly one place that nothing on
         * this bar pointed at. [D-13]
         */
        href: current === 'studio-two'
          ? roomFor('studio-two').href : `/p/${studioTwoId}`,
      }
      : {
        id: 'studio-two', label: 'Studio Two', icon: 'music',
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
        id: 'online-tv', label: 'Online TV', icon: 'broadcast',
        /* And Online TV, whose list IS its control room — the one
           studio where this already worked, because `/t` is where
           `StartChannel` has always been. [rooms.ts] */
        href: current === 'online-tv'
          ? roomFor('online-tv').href : `/t/${studioThreeId}`,
      }
      : {
        id: 'online-tv', label: 'Online TV', icon: 'broadcast',
        hint: 'No channels yet — start one from the library',
      },
    { id: 'library', label: 'Library', icon: 'library', href: '/#performances' },
    ...(extra ?? []),
  ];
  const tabs: BarTab[] = all.filter((tab) => {
    /*
     * A tab for a studio this account does not have is removed, not dimmed.
     * The dimmed state above says "you have this and it is empty", which
     * invites; this is not an invitation, and there is nothing to sell it
     * with. Conversations and Library stay, because what an account holds
     * is still its own whatever it may open. [MASTER-EDIT §11]
     */
    if (tab.id === 'studio-one') return has('studio-one');
    if (tab.id === 'studio-two') return has('studio-two');
    if (tab.id === 'online-tv') return has('online-tv');
    return true;
  });

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
      <Brand />

      <nav className="row" data-testid="studio-nav" style={{ gap: 2, flexWrap: 'nowrap' }}>
        {tabs.map((tab) => {
          const on = tab.id === current;
          const body = (
            <>
              {/*
                * The icon inherits `currentColor` and the row's opacity,
                * so a chosen tab and a quiet one are the same drawing at
                * two tones rather than two different weights of glyph.
                */}
              <span aria-hidden="true" style={{
                opacity: on ? 1 : 0.55, lineHeight: 0, flex: '0 0 auto',
              }}><Icon name={tab.icon} size={14} /></span>
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
            /*
             * THE PLACES ARE SIGNAGE, like every other legend in the
             * product since 02. These are the six rooms of the
             * building; a person reads them once and then navigates by
             * position. Sentence case at 13px made them compete with
             * the title of whatever room you are actually in, two
             * centimetres to the left. [brief §13]
             */
            padding: '14px var(--space-4)', fontSize: 'var(--text-2xs)',
            letterSpacing: '0.09em', textTransform: 'uppercase',
            textDecoration: 'none', whiteSpace: 'nowrap' as const,
            background: 'none', border: 0, borderRadius: 0,
            borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`,
            color: on ? '#7fb4ee' : 'var(--text-dim)',
            fontWeight: on ? 'var(--weight-bold)' : 'var(--weight-medium)',
            opacity: on || tab.href || tab.onClick ? 1 : 0.38,
            cursor: tab.href || tab.onClick ? 'pointer' : 'default',
            transition: 'color var(--motion-fast) var(--ease-out),'
              + ' border-color var(--motion-fast) var(--ease-out)',
          };
          /*
           * THE CURRENT TAB IS STILL A LINK IF IT HAS ANYWHERE TO
           * GO. [D-13, D-21]
           *
           * This returned a `<span>` for the tab you were on,
           * before looking at whether it had an `href` — so
           * giving one to the current studio changed nothing on
           * the screen, which is how the first attempt at this
           * fix came to be inert and was caught by opening the
           * page rather than by the tests. [U-02]
           *
           * `aria-current="page"` stays either way: it says which
           * section you are in, which is true of a link as much
           * as of a label. What changes is that STUDIO TWO, while
           * you are inside a song, now reaches the list of songs
           * — where another one can be started.
           */
          if (on && !tab.href) {
            return (
              <span key={tab.id} data-testid={`tab-${tab.id}`} aria-current="page"
                    style={style}>{body}</span>
            );
          }
          if (on && tab.href) {
            return (
              <a key={tab.id} data-testid={`tab-${tab.id}`} href={tab.href}
                 aria-current="page" style={style}>{body}</a>
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
