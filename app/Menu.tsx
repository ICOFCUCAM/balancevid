'use client';

import {
  createContext, useCallback, useContext, useEffect, useId,
  useLayoutEffect, useRef, useState,
} from 'react';

/**
 * What can be done to this thing, wherever you ask.  [Doctrine D-04, D-19]
 *
 * THERE WAS NO RIGHT-CLICK ANYWHERE IN THIS PRODUCT. Not one
 * `onContextMenu`, in a studio, a rail, a schedule or a library — so the
 * only way to reach an action on a take, a clip or a programme was to find
 * a three-pixel-wide `⋯` on the row and hit it. On a desk where somebody is
 * working fast that is the difference between a tool and a form.
 *
 * AND THERE WERE FOUR MENUS, not one. `RecordMenu`, the take menu, the
 * channel rail's row menu and the channel's settings menu are each a
 * `<details>` with its own panel, its own padding, its own idea of what a
 * destructive item looks like and its own keyboard behaviour — which is to
 * say the browser's, which for `<details>` is a disclosure triangle and not
 * a menu at all. Adding right-click to each of them separately would have
 * made eight. [D-19]
 *
 * SO THE ACTIONS ARE DEFINED ONCE AND REACHED TWO WAYS. A row declares what
 * can be done to it; the `⋯` button and the right-click open the same list,
 * in the same order, with the same words. The failure this prevents is the
 * ordinary one — a Delete added to the button menu and not to the context
 * menu, six months apart, by two people.
 *
 * WHAT A CONTEXT MENU MUST NOT DO, and most do:
 *
 *   TAKE THE BROWSER'S MENU AWAY FROM A FIELD. Right-clicking in a text
 *     input means Paste, Undo, Spelling, and no application-specific menu
 *     is worth losing those. Same for a selection: if the person has
 *     highlighted text they are reaching for Copy.
 *   OPEN OFF THE SCREEN. A menu raised near the right edge has to flip,
 *     not scroll the page sideways.
 *   TRAP A KEYBOARD. Escape closes, arrows move, Enter chooses, and focus
 *     goes back to where it came from — a menu that keeps focus after it
 *     closes loses somebody's place.
 *   MOVE WHEN THE PAGE DOES. It is positioned against the viewport, so a
 *     scroll closes it rather than leaving it hanging over the wrong row.
 *
 * DISABLED ITEMS SAY WHY. `disabled: 'the channel is on air'` renders the
 * item greyed with the reason beside it, rather than hiding it — a menu
 * whose contents change between visits is a menu nobody learns. Hiding is
 * for things that make no sense here at all; greying is for things that
 * make sense and cannot be done yet.
 */

export interface MenuItem {
  /** The verb, as on a button. "Delete…" if it will then ask. */
  label: string;
  /** Run when chosen. Omit with `href` for a link. */
  onSelect?: () => void;
  /** A link instead of an action. */
  href?: string;
  /** Opens in a new tab. Only meaningful with `href`. */
  external?: boolean;
  /** Destructive: coloured, and sits below a rule at the foot. */
  danger?: boolean;
  /** `true` to grey it out, or a sentence saying why it cannot be done. */
  disabled?: boolean | string;
  /** A one-line hint under the label. */
  hint?: string;
}

/** A separator, for callers that build lists conditionally. */
export type MenuEntry = MenuItem | null | false | undefined;

interface Raised {
  items: MenuItem[];
  /** What the menu is about, announced to a screen reader. */
  about: string;
  x: number;
  y: number;
  /** Right-clicks open at the pointer; a button opens under itself. */
  from: HTMLElement | null;
}

const clean = (entries: MenuEntry[]): MenuItem[] =>
  entries.filter((entry): entry is MenuItem => Boolean(entry));

/**
 * WHETHER THIS RIGHT-CLICK IS OURS.
 *
 * The browser's menu wins over ours in the two cases where it carries
 * something we cannot offer: inside anything editable, and over a
 * selection. Both are about text the person is working with, and both are
 * reached by reflex.
 */
function theirs(event: React.MouseEvent): boolean {
  const target = event.target as HTMLElement | null;
  if (target?.closest('input, textarea, select, [contenteditable="true"]')) {
    return true;
  }
  const selection = typeof window !== 'undefined' ? window.getSelection() : null;
  return Boolean(selection && !selection.isCollapsed
    && selection.toString().trim().length > 0);
}

export function useMenu() {
  const [raised, setRaised] = useState<Raised | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const id = useId();

  const close = useCallback(() => {
    setRaised(null);
    /* Focus goes back where it came from, or the page loses its place. */
    returnTo.current?.focus();
    returnTo.current = null;
  }, []);

  /**
   * Attach to anything right-clickable. `about` names the thing, so the
   * menu can be announced as "Actions for Take 3" rather than "menu".
   */
  const onRow = useCallback((
    about: string, entries: () => MenuEntry[],
  ) => ({
    onContextMenu: (event: React.MouseEvent) => {
      if (theirs(event)) return;
      const items = clean(entries());
      if (items.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      returnTo.current = document.activeElement as HTMLElement | null;
      setRaised({ items, about, x: event.clientX, y: event.clientY, from: null });
    },
  }), []);

  /** Open under a button — the `⋯` path to the same list. */
  const fromButton = useCallback((
    about: string, entries: () => MenuEntry[], button: HTMLElement,
  ) => {
    const items = clean(entries());
    if (items.length === 0) return;
    const box = button.getBoundingClientRect();
    returnTo.current = button;
    setRaised({ items, about, x: box.right, y: box.bottom + 2, from: button });
  }, []);

  /* Escape, an outside press, a scroll or a resize all mean no. */
  useEffect(() => {
    if (!raised) return undefined;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
    };
    const away = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node)) close();
    };
    const gone = () => close();
    document.addEventListener('keydown', key, true);
    document.addEventListener('pointerdown', away, true);
    /* Capture, because the scroll happens on a panel and not on window. */
    document.addEventListener('scroll', gone, true);
    window.addEventListener('resize', gone);
    window.addEventListener('blur', gone);
    return () => {
      document.removeEventListener('keydown', key, true);
      document.removeEventListener('pointerdown', away, true);
      document.removeEventListener('scroll', gone, true);
      window.removeEventListener('resize', gone);
      window.removeEventListener('blur', gone);
    };
  }, [raised, close]);

  /*
   * PLACED AFTER IT IS MEASURED, before the browser paints. A menu that
   * renders at the pointer and then jumps left when it turns out not to fit
   * is a menu that has already been misread once.
   */
  useLayoutEffect(() => {
    const node = panel.current;
    if (!node || !raised) return;
    const box = node.getBoundingClientRect();
    const pad = 8;
    let left = raised.from ? raised.x - box.width : raised.x;
    let top = raised.y;
    if (left + box.width > window.innerWidth - pad) {
      left = window.innerWidth - box.width - pad;
    }
    if (left < pad) left = pad;
    if (top + box.height > window.innerHeight - pad) {
      /* Flip above the pointer rather than clamping onto it. */
      top = Math.max(pad, raised.y - box.height
        - (raised.from ? raised.from.getBoundingClientRect().height + 4 : 0));
    }
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
    node.style.visibility = 'visible';
    const first = node.querySelector<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])');
    first?.focus();
  }, [raised]);

  const move = (event: React.KeyboardEvent, step: number) => {
    event.preventDefault();
    const all = [...(panel.current?.querySelectorAll<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    if (all.length === 0) return;
    const at = all.indexOf(document.activeElement as HTMLElement);
    const next = step === 0 ? 0
      : step === Infinity ? all.length - 1
        : (at + step + all.length) % all.length;
    all[next]?.focus();
  };

  const chose = (item: MenuItem) => {
    if (item.disabled) return;
    /*
     * CLOSED BEFORE THE ACTION RUNS. Most of these raise a confirmation,
     * and a menu still open behind a modal is the bug the take menu had.
     */
    close();
    item.onSelect?.();
  };

  const menu = raised ? (
    <div
      ref={panel}
      role="menu"
      aria-label={`Actions for ${raised.about}`}
      data-testid="context-menu"
      id={id}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown') move(event, 1);
        else if (event.key === 'ArrowUp') move(event, -1);
        else if (event.key === 'Home') move(event, 0);
        else if (event.key === 'End') move(event, Infinity);
        else if (event.key === 'Tab') { event.preventDefault(); close(); }
      }}
      style={{
        position: 'fixed', left: 0, top: 0, visibility: 'hidden', zIndex: 120,
        minWidth: 188, maxWidth: 300, padding: 'var(--space-2)',
        display: 'flex', flexDirection: 'column', gap: 1,
        background: 'var(--surface-lift)',
        border: 'var(--border) solid var(--line-strong)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--elev-4)',
      }}
    >
      {/*
        * The thing's name at the head, because a menu raised by
        * right-clicking the wrong row is otherwise indistinguishable from
        * one raised on the right row.
        */}
      <div aria-hidden="true" style={{
        padding: 'var(--space-2) var(--space-3) var(--space-1)',
        fontSize: 'var(--text-2xs)', color: 'var(--ink-400)',
        textTransform: 'uppercase', letterSpacing: '0.07em',
        fontWeight: 'var(--weight-bold)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{raised.about}</div>

      {raised.items.map((item, index) => {
        const why = typeof item.disabled === 'string' ? item.disabled : undefined;
        const off = Boolean(item.disabled);
        const first = item.danger && !raised.items[index - 1]?.danger;
        const look: React.CSSProperties = {
          display: 'block', width: '100%', textAlign: 'left',
          font: 'inherit', fontSize: 'var(--text-sm)',
          padding: 'var(--space-2) var(--space-3)',
          borderRadius: 'var(--radius-sm)',
          border: 0, background: 'none', textDecoration: 'none',
          cursor: off ? 'default' : 'pointer',
          color: off ? 'var(--ink-400)'
            : item.danger ? 'var(--ink-on-bad)' : 'var(--text)',
          ...(first ? {
            marginTop: 'var(--space-2)',
            paddingTop: 'var(--space-3)',
            borderTop: 'var(--border) solid var(--line)',
            borderRadius: 0,
          } : {}),
        };
        const body = (
          <>
            {item.label}
            {(why ?? item.hint) && (
              <span style={{
                display: 'block', fontSize: 'var(--text-2xs)',
                color: 'var(--ink-400)', marginTop: 1,
                whiteSpace: 'normal',
              }}>{why ?? item.hint}</span>
            )}
          </>
        );
        if (item.href && !off) {
          return (
            <a key={item.label} role="menuitem" href={item.href}
               data-testid="menu-item" style={look} onClick={close}
               {...(item.external
                 ? { target: '_blank', rel: 'noreferrer' } : {})}>
              {body}
            </a>
          );
        }
        return (
          <button
            key={item.label} type="button" role="menuitem"
            data-testid="menu-item"
            data-danger={item.danger ? 'true' : undefined}
            aria-disabled={off || undefined}
            onClick={() => chose(item)}
            style={look}
          >{body}</button>
        );
      })}
    </div>
  ) : null;

  return { menu, onRow, fromButton, closeMenu: close };
}

/**
 * THE `⋯` BUTTON, drawn once.
 *
 * Every rail in the product had its own, as a `<details>` whose summary was
 * a bare character — which means no `aria-haspopup`, no arrow keys, and a
 * disclosure widget pretending to be a menu. This is a button that says it
 * opens a menu, and it opens the same one the right-click does.
 */
export function MenuButton({
  about, items, open, small,
}: {
  about: string;
  items: () => MenuEntry[];
  open: (about: string, items: () => MenuEntry[], button: HTMLElement) => void;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      data-testid="menu-button"
      aria-haspopup="menu"
      aria-label={`Actions for ${about}`}
      onClick={(event) => open(about, items, event.currentTarget)}
      style={{
        flex: '0 0 auto', border: 0, background: 'none',
        color: 'var(--ink-300)', cursor: 'pointer', lineHeight: 1,
        padding: small ? '2px 5px' : '3px 7px',
        borderRadius: 'var(--radius-sm)',
        fontSize: small ? 'var(--text-sm)' : 'var(--text-md)',
      }}
    >&#8943;</button>
  );
}

/**
 * A HINT, ONCE PER SURFACE. Nobody discovers a right-click that is not
 * advertised, and advertising it on every row would be noise. One line at
 * the foot of a rail is how every file manager has done it.
 */
export function RightClickHint({ what }: { what: string }) {
  return (
    <p className="muted" data-testid="right-click-hint" style={{
      margin: 'var(--space-2) 0 0', fontSize: 'var(--text-2xs)',
      color: 'var(--ink-400)',
    }}>
      Right-click {what} for what can be done to it.
    </p>
  );
}

/* ------------------------------------------------------------------------ *
 *  The same menu, in a tree too deep to hand it down.
 * ------------------------------------------------------------------------ */

/**
 * WHY A CONTEXT AND NOT A PROP. The channel studio is one component and
 * four thousand lines, and the rows that want a menu — a rotation entry, a
 * schedule slot, a library item — are three components down from the one
 * that can own the menu's state. Passing the handlers through would mean
 * adding the same two props to every component in between, which is the
 * prop-drilling that makes people give up and write a second menu instead.
 *
 * It is a context rather than a module-level singleton because two studios
 * open in two tabs are two menus, and a singleton would be a shared one.
 */
type Handlers = Pick<ReturnType<typeof useMenu>, 'onRow' | 'fromButton'>;

const Rows = createContext<Handlers | null>(null);

/** Wrap a surface once; everything inside it can raise the menu. */
export function MenuHost({ children }: { children: React.ReactNode }) {
  const { menu, onRow, fromButton } = useMenu();
  return (
    <Rows.Provider value={{ onRow, fromButton }}>
      {menu}
      {children}
    </Rows.Provider>
  );
}

/**
 * Inside a `MenuHost`, this is the menu. Outside one it is a no-op rather
 * than a crash: a row rendered in a test or a story should not need the
 * host, and a right-click that does nothing is a better failure than a
 * blank screen.
 */
export function useRowMenu(): Handlers {
  const found = useContext(Rows);
  const none = useRef<Handlers>({
    onRow: () => ({ onContextMenu: () => undefined }),
    fromButton: () => undefined,
  });
  return found ?? none.current;
}
