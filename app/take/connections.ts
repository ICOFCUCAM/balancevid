'use client';

/**
 * The BalanceVid installations this device takes part in.
 *   [TAKE-PLATFORM U3, P13, P22, P23, P25; §10, §11, §12]
 *
 * *"Imagine you are a musician. Your Take app might have… each a separate
 * production environment. Yet you have one Take App."*
 *
 * THIS IS THAT LIST, AND IT LIVES ON THE DEVICE. Which production
 * companies somebody works with is exactly the kind of thing that must
 * not accumulate centrally — the same argument §12 makes about the
 * footage, turned on the participant. No installation is told which
 * others this person has, and there is no index above them to ask.
 *
 * WHICH IS ALSO WHY THERE IS NO REGISTRY. A directory of every
 * BalanceVid would be the universal library §12 rejects wearing a
 * different hat: a person adds an installation by having been to it,
 * and the home is the union of what those choose to list. [P24]
 *
 * AN ORIGIN IS THE WHOLE OF AN IDENTITY HERE. The brief's §6 mechanism
 * is already the shipped one — a link is an origin plus a credential,
 * and the origin is never written into any record — so a connection
 * needs nothing the link did not already carry. [T14, P15]
 */

export interface Connection {
  /** `https://studio.example`, with no path and no trailing slash. */
  origin: string;
  /** What that installation calls itself, as it answered. */
  name: string;
  addedAt: string;
}

const KEY = 'balancevid.take.instances';

/**
 * An origin, or nothing.
 *
 * REFUSED RATHER THAN REPAIRED, the way every id in this product is.
 * What is being stored is somewhere this device will later fetch from
 * and send somebody to, so a string that is nearly a URL is worse than
 * no string: `https://studio.example/take?x` normalises to something
 * the person did not type, and a `javascript:` URL is not an
 * installation at all.
 */
export function asOrigin(text: string): string | null {
  const trimmed = text.trim();
  /*
   * A BARE HOST IS WHAT SOMEBODY TYPES, so the safe scheme is assumed
   * — but only where there is no scheme at all.
   *
   * THE FIRST VERSION PREPENDED IT WHENEVER THE STRING DID NOT START
   * `http`, and a test caught what that does to anything else:
   * `ftp://studio.example` became `https://ftp://studio.example`,
   * whose HOST is `ftp`. A refused scheme silently turned into a
   * different, REACHABLE origin — the one outcome this function exists
   * to prevent, since what it returns is somewhere this device will
   * later fetch from and send a person to.
   */
  /*
   * A SCHEME IS NOT A PORT, and telling them apart is the whole of
   * this. `studio.example:8443` and `ftp://studio.example` both match
   * "word, colon" — and the first is a legitimate thing to type while
   * the second must be refused. A browser run caught it the other way
   * round: `localhost:3101` was rejected as though it were a scheme,
   * so a self-hosted installation on a port could not be added at all.
   *
   * WHAT SEPARATES THEM IS THE DIGIT. A port is digits; no scheme
   * begins with one. So a scheme is a word and a colon NOT followed
   * by a digit, and anything that is a scheme must be http or https
   * before it goes anywhere near the parser — because prepending
   * `https://` to `ftp://studio.example` yields a host of `ftp`,
   * which is a different and REACHABLE origin nobody typed.
   */
  const scheme = /^([a-z][a-z0-9+.-]*):(?!\d)/i.exec(trimmed);
  if (scheme && !/^https?$/i.test(scheme[1]!)) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  /*
   * THREE CHECKS STOOD HERE AND TWO OF THEM COULD NOT BE OBSERVED.
   *
   * A mutation sweep removed an empty-string guard, and an
   * `http`-only guard before the parse, and every test still passed —
   * because `new URL('https://')` throws and a refused scheme is
   * refused below anyway. This file's own store makes the point about
   * `requests.ts`: a guard nothing can observe is decoration, and
   * decoration in a security check is worse than nothing, because it
   * reads as though something is being enforced twice.
   *
   * WHAT IS LEFT IS WHAT ACTUALLY DECIDES: the scheme, after the URL
   * parser has had its say, and credentials — which are a way to make
   * one origin look like another in a string a person is reading.
   */
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  return url.origin;
}

export function readConnections(): Connection[] {
  try {
    const raw = window.localStorage.getItem(KEY);
    const found = raw ? JSON.parse(raw) as Connection[] : [];
    return Array.isArray(found) ? found.filter((one) => one && one.origin) : [];
  } catch {
    /* Private browsing, or storage refused. One installation still
       works — the one serving this page. [U-19] */
    return [];
  }
}

function write(list: Connection[]): Connection[] {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, 20)));
  } catch { /* as above. */ }
  return list;
}

/**
 * Remember an installation, or update what it is called.
 *
 * KEYED ON THE ORIGIN, so adding one twice is not two of them and a
 * renamed installation is the same one under a new name rather than a
 * duplicate nobody can tell apart.
 */
export function addConnection(one: Connection): Connection[] {
  const kept = readConnections().filter((was) => was.origin !== one.origin);
  return write([...kept, one].sort((a, b) => a.name.localeCompare(b.name)));
}

export function removeConnection(origin: string): Connection[] {
  return write(readConnections().filter((one) => one.origin !== origin));
}

/** What an installation says about itself, asked of it directly. */
export interface Instance { name: string; origin: string }

/**
 * Ask an installation what it offers.
 *
 * NO CREDENTIALS, EVER, and that is not only a default: this is a
 * cross-origin read of a public listing, and a cookie could only make
 * the answer vary by who is asking — which it must not, because the
 * same listing is served to the owner and to a stranger. `omit` says
 * so where somebody reading this would otherwise have to check.
 */
export async function askInstance(
  origin: string, send: typeof fetch = fetch,
): Promise<{ instance: Instance; rows: unknown[] } | null> {
  try {
    const response = await send(`${origin}/api/participate`, {
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = await response.json() as {
      instance?: Instance; participate?: unknown[];
    };
    if (!data.instance?.name) return null;
    /*
     * WHAT IT CALLS ITSELF IS ITS OWN BUSINESS; WHERE IT IS, IS NOT.
     *
     * The origin stored is the one this device actually reached, never
     * the one in the answer. An installation that could name its own
     * origin could name somebody else's, and a connection list is a
     * list of places this device will later send a person to.
     */
    return {
      instance: { name: String(data.instance.name).slice(0, 80), origin },
      rows: data.participate ?? [],
    };
  } catch {
    /* Unreachable, refused by CORS, or not a BalanceVid. A connection
       that cannot be read is shown as such rather than dropped: a
       self-hosted installation on a laptop is often simply asleep. */
    return null;
  }
}
