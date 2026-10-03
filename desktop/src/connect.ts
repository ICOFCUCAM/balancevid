/**
 * CONNECT, as a decision rather than a screen.
 *   [TAKE-DESKTOP T-2; TAKE-PLATFORM P24]
 *
 * > *"The brief's CONNECT screen: QR, typed invitation code,
 * > pasted link, typed address, recently connected."*
 *
 * FOUR WAYS IN AND ONE OF THEM IS NOT HERE. The QR path needs a
 * camera, and cameras are T-3 — the stage that reads
 * `guestGrid.ts` and `SwitchingStage.tsx` before deciding
 * anything about device discovery. Building a second camera path
 * in T-2 would be the *"no third multiview"* mistake one stage
 * early, so the QR is deferred with a reason rather than drawn
 * as a button that cannot act. [U-19]
 *
 * THREE OF THE FOUR ARE THE SAME TYPING. A pasted link, a typed
 * address and an invitation code all arrive as one string, and
 * the brief's own mechanism is why: *"a link is an origin plus a
 * credential."* So this takes a string and says what kind of
 * thing it is, rather than asking a person to choose a tab first
 * and then be told they chose wrong.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

import { asOrigin } from '../../shared/src/connections.js';

export type Typed =
  /** Nothing to go on yet. */
  | { kind: 'empty' }
  /** An installation to ask about: `studio.example`. */
  | { kind: 'origin'; origin: string }
  /**
   * A participation link: an origin AND the credential on it.
   * `https://studio.example/take/abc.def`
   */
  | { kind: 'link'; origin: string; link: string }
  /** Something that is not either. */
  | { kind: 'no'; because: string };

/**
 * A Take link's path, as the installation already serves it.
 *
 * `/take/<id>.<secret>` — the shape `policy.ts` matches and the
 * shape `requestForLink` reads. Matched here rather than
 * guessed, so a pasted station page or a watch URL is not
 * mistaken for an invitation.
 */
const LINK = /^\/take\/([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\/?$/;

/**
 * What somebody just typed or pasted.
 *
 * A LINK IS RECOGNISED BEFORE AN ORIGIN, because every link is
 * also an origin and answering "origin" would throw the
 * credential away — which is the whole of the invitation. The
 * person would be connected to the right studio and shown none
 * of the work they were invited to.
 *
 * AND THE ORIGIN IN A LINK IS THE PARSED ONE, never the text
 * before the first slash. `https://studio.example@evil.example/take/a.b`
 * is a link to `evil.example`, and a reader scanning left to
 * right sees `studio.example`. [shared `asOrigin`]
 */
export function readTyped(text: string): Typed {
  const trimmed = text.trim();
  if (!trimmed) return { kind: 'empty' };

  const origin = asOrigin(trimmed);
  if (!origin) {
    return {
      kind: 'no',
      because: 'That is not an address. A studio looks like '
        + 'studio.example, or a link they sent you.',
    };
  }

  /*
   * THE PATH IS READ OFF THE SAME PARSE THE ORIGIN CAME FROM, so
   * there is one opinion about where the host ends. Re-parsing to
   * find the path is how the two come to disagree.
   */
  const whole = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let path = '';
  try {
    path = new URL(whole).pathname;
  } catch {
    /* Unreachable: `asOrigin` parsed the same string a moment
       ago. Typed as a path of nothing rather than guarded, so
       there is nothing here a test cannot reach. */
    path = '';
  }

  const link = LINK.exec(path);
  if (link) return { kind: 'link', origin, link: link[1]! };

  /*
   * A PATH THAT IS NOT A LINK IS NOT AN ERROR. Somebody pastes
   * `https://studio.example/t/chan_abc/watch` because that is
   * what was in their browser, and what they mean is "this
   * studio". The origin is the useful half; the rest is dropped
   * rather than refused.
   */
  return { kind: 'origin', origin };
}

/** What to show under the box as somebody types. */
export function says(typed: Typed): string {
  switch (typed.kind) {
    case 'empty': return '';
    case 'no': return typed.because;
    case 'link': return `An invitation at ${typed.origin}`;
    case 'origin': return typed.origin;
  }
}
