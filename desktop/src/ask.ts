/**
 * Asking an installation what it offers.  [TAKE-DESKTOP T-2]
 *
 * THE WINDOW HAS NO NETWORK AND THIS IS WHY IT DOES NOT NEED ONE.
 * The renderer's content policy is `connect-src 'none'`, and it
 * stays that way: a capture station that could be made to fetch
 * from anywhere is a capture station in a room with cameras in
 * it. The main process does the asking, over one named channel,
 * and the window gets an answer rather than a socket.
 *
 * AND ONLY TO AN ORIGIN `asOrigin` APPROVED. Nothing a person
 * types reaches `fetch` as typed: it is parsed into an origin
 * first, by the same parser the browser Take App uses, and a
 * string that is not one never becomes a request. [T-2, shared]
 *
 * NO CREDENTIALS, EVER, and that is not only a default: this is a
 * read of a public listing, and a cookie could only make the
 * answer vary by who is asking — which it must not, because the
 * same listing is served to the owner and to a stranger.
 *
 * A TIMEOUT, WHICH THE BROWSER'S VERSION DOES NOT NEED. A page
 * that hangs on a fetch is a page somebody closes; an application
 * that hangs on one is an application that is broken. A
 * self-hosted installation on a sleeping laptop is the ordinary
 * case, not the exception.
 */

import {
  type Instance, asOrigin, instanceFrom,
} from '../../shared/src/connections.js';

/** How long an installation has to answer before it is asleep. */
export const ASK_TIMEOUT_MS = 8_000;

export interface Asked {
  instance: Instance;
  rows: unknown[];
}

export async function askInstance(
  typed: string, timeoutMs = ASK_TIMEOUT_MS,
): Promise<Asked | null> {
  const origin = asOrigin(typed);
  if (!origin) return null;

  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), timeoutMs);
  try {
    const response = await fetch(`${origin}/api/participate`, {
      credentials: 'omit',
      cache: 'no-store',
      signal: stop.signal,
      redirect: 'follow',
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    const instance = instanceFrom(origin, body);
    if (!instance) return null;
    const rows = (body as { participate?: unknown[] }).participate;
    return { instance, rows: Array.isArray(rows) ? rows : [] };
  } catch {
    /*
     * Unreachable, refused, timed out, or not a BalanceVid. One
     * answer for all of them: the window says it could not reach
     * it, which is what a person can act on. A self-hosted
     * installation is often simply asleep.
     */
    return null;
  } finally {
    clearTimeout(timer);
  }
}
