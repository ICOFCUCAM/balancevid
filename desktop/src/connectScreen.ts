/**
 * The CONNECT screen.  [TAKE-DESKTOP T-2]
 *
 * ONE BOX, NOT FOUR TABS. A pasted link, a typed address and an
 * invitation code all arrive as one string — *"a link is an
 * origin plus a credential"* — so the box takes whatever somebody
 * has and `readTyped` says what it is. Asking a person to choose
 * a tab first and then telling them they chose wrong is the shape
 * of a form that does not know what it wants.
 *
 * AND THE RECENTLY CONNECTED ARE ABOVE IT, because on the second
 * day that is the whole screen: a studio this machine already
 * knows, one press away.
 *
 * THE WINDOW HAS NO NETWORK AND NO DISK. Everything here goes
 * through the four named functions in `preload.ts`. [T-1, T-2]
 */

import type { Connection } from '../../shared/src/connections.js';
import type { TakeBridge } from './preload.js';
import { readTyped, says } from './connect.js';

declare global {
  interface Window { take?: TakeBridge }
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** What the screen is doing, so it never says two things at once. */
type Doing =
  | { kind: 'idle' }
  | { kind: 'asking'; origin: string }
  | { kind: 'reached'; connection: Connection; rows: number; link?: string }
  | { kind: 'unreachable'; origin: string };

export function connectScreen(root: HTMLElement): (() => void) | null {
  const bridge = window.take;
  let known: Connection[] = [];
  let doing: Doing = { kind: 'idle' };

  const recent = el('div', 'recent');
  recent.id = 'recent';
  const box = document.createElement('input');
  box.type = 'text';
  box.id = 'typed';
  box.className = 'typed';
  box.placeholder = 'studio.example, or the link they sent you';
  box.spellcheck = false;
  box.autocapitalize = 'off';
  const hint = el('p', 'hint');
  hint.id = 'hint';
  const go = document.createElement('button');
  go.type = 'button';
  go.id = 'connect';
  go.className = 'go';
  go.textContent = 'Connect';
  const result = el('div', 'result');
  result.id = 'result';

  function drawRecent(): void {
    recent.replaceChildren();
    if (known.length === 0) return;
    recent.appendChild(el('p', 'label', 'Recently connected'));
    for (const one of known) {
      const row = el('div', 'known');
      row.dataset['origin'] = one.origin;
      const open = document.createElement('button');
      open.type = 'button';
      open.className = 'known-go';
      open.dataset['testid'] = 'known-go';
      open.appendChild(el('span', 'known-name', one.name || one.origin));
      open.appendChild(el('span', 'known-origin', one.origin));
      open.addEventListener('click', () => { box.value = one.origin; void ask(); });
      const forget = document.createElement('button');
      forget.type = 'button';
      forget.className = 'known-forget';
      forget.dataset['testid'] = 'known-forget';
      forget.textContent = 'Forget';
      forget.addEventListener('click', () => { void drop(one.origin); });
      row.append(open, forget);
      recent.appendChild(row);
    }
  }

  function drawResult(): void {
    result.replaceChildren();
    result.dataset['kind'] = doing.kind;
    if (doing.kind === 'idle') return;
    if (doing.kind === 'asking') {
      result.appendChild(el('p', 'asking', `Asking ${doing.origin}…`));
      return;
    }
    if (doing.kind === 'unreachable') {
      /*
       * ONE ANSWER FOR EVERY WAY OF NOT ARRIVING — refused, timed
       * out, not a BalanceVid — because the person can do the
       * same thing about all of them, and a self-hosted studio is
       * usually simply asleep.
       */
      result.appendChild(el('p', 'bad',
        `Could not reach ${doing.origin}. It may be asleep, or that may `
        + 'not be a BalanceVid.'));
      return;
    }
    const { connection, rows, link } = doing;
    result.appendChild(el('p', 'good', connection.name || connection.origin));
    result.appendChild(el('p', 'quiet', connection.origin));
    /*
     * WHAT IT OFFERS, COUNTED RATHER THAN LISTED. T-2 is judged on
     * showing the participation request it was invited to; the
     * open listing is how many there are, and the invitation is
     * the one thing named. Drawing the whole listing here would
     * be the Take App's home screen built a second time in a
     * window that has a different job. [D-19]
     */
    result.appendChild(el('p', 'quiet', link
      ? 'Invited to one piece of work here.'
      : rows === 1 ? 'One thing open to take part in.'
        : `${rows} things open to take part in.`));
    if (link) {
      const openIt = document.createElement('button');
      openIt.type = 'button';
      openIt.className = 'go';
      openIt.dataset['testid'] = 'open-invitation';
      openIt.textContent = 'Open the invitation';
      /*
       * IN THE PERSON'S OWN BROWSER, AND THAT IS NOT A SHORTCUT.
       * The Take App at `/take/<link>` is a working recorder with
       * its own service worker and upload queue, and opening it
       * inside this window would be this application pretending
       * to be that one. Recording here is T-3 and T-4; until
       * then the honest thing is to hand the invitation to the
       * client that already works. [T-5]
       */
      openIt.addEventListener('click', () => {
        void bridge?.openExternal(`${connection.origin}/take/${link}`);
      });
      result.appendChild(openIt);
    }
  }

  function draw(): void { drawRecent(); drawResult(); }

  async function remember(one: Connection): Promise<void> {
    known = (await bridge?.remember(
      [...known.filter((was) => was.origin !== one.origin), one])) ?? known;
  }

  async function drop(origin: string): Promise<void> {
    known = (await bridge?.remember(
      known.filter((one) => one.origin !== origin))) ?? known;
    draw();
  }

  async function ask(): Promise<void> {
    const typed = readTyped(box.value);
    hint.textContent = says(typed);
    if (typed.kind !== 'origin' && typed.kind !== 'link') return;
    doing = { kind: 'asking', origin: typed.origin };
    drawResult();
    const answer = await bridge?.ask(typed.origin);
    if (!answer) {
      doing = { kind: 'unreachable', origin: typed.origin };
      drawResult();
      return;
    }
    const connection: Connection = {
      origin: answer.instance.origin,
      name: answer.instance.name,
      addedAt: new Date().toISOString(),
    };
    await remember(connection);
    doing = {
      kind: 'reached',
      connection,
      rows: answer.rows.length,
      ...(typed.kind === 'link' ? { link: typed.link } : {}),
    };
    draw();
  }

  box.addEventListener('input', () => {
    hint.textContent = says(readTyped(box.value));
  });
  box.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') void ask();
  });
  go.addEventListener('click', () => { void ask(); });

  root.replaceChildren();
  root.appendChild(el('h1', 'mark', 'Take'));
  root.appendChild(el('p', 'sub', 'Connect to the studio that invited you.'));
  root.appendChild(recent);
  const field = el('div', 'field');
  field.append(box, go);
  root.append(field, hint, result);

  /*
   * THE QR IS NOT HERE, AND IT IS NOT FORGOTTEN. Reading one
   * needs a camera, and cameras are T-3 — the stage that reads
   * `guestGrid.ts` and `SwitchingStage.tsx` before deciding
   * anything about device discovery. A second camera path built
   * in T-2 would be the "no third multiview" mistake one stage
   * early, and a QR button that cannot act looks like a fault.
   * [U-19]
   */
  root.appendChild(el('p', 'note',
    'Scanning a QR code needs the camera, which this build does not '
    + 'have yet. Type the address or paste the link.'));

  void (async () => {
    known = (await bridge?.connections()) ?? [];
    draw();
  })();

  /* Nothing to let go of: this screen holds no device and no
     timer. The shape matches `camerasScreen`, which does. */
  return null;
}
