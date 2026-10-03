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
  /* What this station is pointed at, by name. Never the link. [T-5] */
  let call: { origin: string; name: string } | null = null;

  const pointed = el('div', 'pointed');
  pointed.id = 'pointed';
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
      /*
       * RECORD FOR THIS, WHICH IS WHAT THIS APPLICATION IS FOR.
       * [T-5]
       *
       * Until T-5 the only thing CONNECT could do with an
       * invitation was hand it to the browser, because this
       * window could not record or send and pretending otherwise
       * would have been the worse half of a first release. It can
       * do both now, so the primary action is the one this
       * program exists for and the browser is the second door
       * rather than the only one.
       *
       * THE CREDENTIAL GOES OUT AND DOES NOT COME BACK. The
       * window hands over what somebody typed; from here on it
       * asks about the call by name. Every capture recorded
       * after this is stamped with where it goes, at the moment
       * it begins, by the main process. [D-21]
       */
      const useIt = document.createElement('button');
      useIt.type = 'button';
      useIt.className = 'go';
      useIt.dataset['testid'] = 'record-for-this';
      useIt.textContent = 'Record for this';
      useIt.addEventListener('click', () => {
        void (async () => {
          call = (await bridge?.chooseCall({
            origin: connection.origin, link, name: connection.name,
          })) ?? null;
          draw();
        })();
      });
      result.appendChild(useIt);

      const openIt = document.createElement('button');
      openIt.type = 'button';
      openIt.className = 'ctl';
      openIt.dataset['testid'] = 'open-invitation';
      openIt.textContent = 'Open it in a browser instead';
      /*
       * IN THE PERSON'S OWN BROWSER, AND THAT IS NOT A SHORTCUT.
       * The Take App at `/take/<link>` is a working recorder with
       * its own service worker and upload queue. Somebody who
       * was invited to sing, on a laptop with one camera, wants
       * that and not a capture station — and opening it inside
       * this window would be this application pretending to be
       * that one.
       */
      openIt.addEventListener('click', () => {
        void bridge?.openExternal(`${connection.origin}/take/${link}`);
      });
      result.appendChild(openIt);
    }
  }

  /**
   * What this station is pointed at, drawn where it can be read.
   *
   * BY NAME, NEVER BY CREDENTIAL. An operator in a hall needs to
   * know their work is going to the right studio before they
   * record four cameras of it; they do not need the secret that
   * authorises it on a screen behind them. [D-21]
   */
  function drawCall(): void {
    pointed.replaceChildren();
    if (!call) {
      pointed.appendChild(el('p', 'quiet',
        'Not recording for anything yet. Paste the link a studio sent you.'));
      return;
    }
    const line = el('p', 'good', `Recording for ${call.name}`);
    line.dataset['testid'] = 'recording-for';
    pointed.appendChild(line);
    pointed.appendChild(el('p', 'quiet', call.origin));
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'ctl';
    clear.dataset['testid'] = 'stop-recording-for';
    clear.textContent = 'Not this one';
    clear.addEventListener('click', () => {
      void (async () => {
        call = (await bridge?.chooseCall(null)) ?? null;
        draw();
      })();
    });
    pointed.appendChild(clear);
  }

  function draw(): void { drawCall(); drawRecent(); drawResult(); }

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
  root.append(pointed, recent);
  const field = el('div', 'field');
  field.append(box, go);
  root.append(field, hint, result);

  /*
   * THE QR IS STILL NOT HERE, AND ITS REASON HAS EXPIRED.
   *
   * T-2 wrote that reading one needs a camera and cameras were
   * T-3, which was true then. T-3 built the camera stack and
   * T-4 recorded with it, so that sentence stopped being the
   * reason three stages ago and the note under this box went on
   * giving it. A refusal whose stated reason is no longer true
   * is worse than no note: it tells a person the thing is
   * impossible here when it is merely unbuilt. [N-8, deletion 23]
   *
   * WHAT IS ACTUALLY MISSING IS A DECODER. `BarcodeDetector` is
   * not on every platform Electron ships to, and a scanner that
   * works on one operating system and silently does nothing on
   * another is worse than a box somebody types into. The note
   * says that instead, which is a thing a person can act on —
   * and a thing somebody could fix. [U-19]
   */
  root.appendChild(el('p', 'note',
    'There is no QR scanner yet — the camera is there, the decoder '
    + 'is not, and one that worked on only some machines would be '
    + 'worse than this box. Type the address or paste the link.'));

  void (async () => {
    [known, call] = await Promise.all([
      bridge?.connections().then((one) => one ?? []) ?? Promise.resolve([]),
      bridge?.call().then((one) => one ?? null) ?? Promise.resolve(null),
    ]);
    draw();
  })();

  /* Nothing to let go of: this screen holds no device and no
     timer. The shape matches `camerasScreen`, which does. */
  return null;
}
