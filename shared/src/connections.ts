/**
 * The installations a device takes part in.
 *   [TAKE-PLATFORM U3, P13, P22, P23, P24, P25; TAKE-DESKTOP T-2]
 *
 * > *"The model is already written and is not rewritten —
 * > `app/take/connections.ts` holds origin-keyed installations and
 * > the rule against a registry. The desktop application
 * > implements the same rules against its own storage, from the
 * > same shared definition."*
 *
 * THIS IS THAT SHARED DEFINITION, AND IT IS THE HALF WITH THE
 * SCARS ON IT. `asOrigin` below carries two bugs found the hard
 * way — one by a test and one in a browser — and a desktop
 * application with its own origin parser would make both again:
 *
 *   `ftp://studio.example`  became a REACHABLE host called `ftp`
 *   `localhost:3101`        was refused as though a port were a scheme
 *
 * What it returns is somewhere a device will later fetch from and
 * send a person to. One parser.
 *
 * STORAGE IS NOT HERE, and that is the division the two
 * applications need. A browser keeps this list in `localStorage`;
 * a desktop application keeps it in a file beside its own
 * settings, written by a process the window cannot reach. The
 * rules about what a list may contain are the same on both, so
 * they are here, taking a list and answering a list.
 *
 * AND THERE IS STILL NO REGISTRY. *"A directory of every
 * BalanceVid would be the universal library §12 rejects wearing a
 * different hat."* Nothing here asks anything about any
 * installation but the one it was handed. [P24]
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

/** One installation this device takes part in. */
export interface Connection {
  /** `https://studio.example`, with no path and no trailing slash. */
  origin: string;
  /** What that installation calls itself, as it answered. */
  name: string;
  addedAt: string;
}

/** What an installation says about itself, asked of it directly. */
export interface Instance { name: string; origin: string }

/**
 * How many a device remembers.
 *
 * A bound on a value that comes out of storage, where another tab
 * or a hand-edited file can put anything — not a limit anybody
 * will reach. Twenty is what the browser's store already wrote.
 */
export const MOST_CONNECTIONS = 20;

/** The longest name an installation may call itself. */
export const NAME_LONGEST = 80;

/**
 * An origin, or nothing.
 *
 * REFUSED RATHER THAN REPAIRED, the way every id in this product
 * is. A string that is nearly a URL is worse than no string:
 * `https://studio.example/take?x` normalises to something the
 * person did not type, and a `javascript:` URL is not an
 * installation at all.
 */
export function asOrigin(text: string): string | null {
  const trimmed = text.trim();
  /*
   * A BARE HOST IS WHAT SOMEBODY TYPES, so the safe scheme is
   * assumed — but only where there is no scheme at all.
   *
   * THE FIRST VERSION PREPENDED IT WHENEVER THE STRING DID NOT
   * START `http`, and a test caught what that does to anything
   * else: `ftp://studio.example` became
   * `https://ftp://studio.example`, whose HOST is `ftp`. A
   * refused scheme silently turned into a different, REACHABLE
   * origin — the one outcome this function exists to prevent.
   *
   * A SCHEME IS NOT A PORT, and telling them apart is the whole
   * of this. `studio.example:8443` and `ftp://studio.example`
   * both match "word, colon" — and the first is a legitimate
   * thing to type while the second must be refused. A browser run
   * caught it the other way round: `localhost:3101` was rejected
   * as though it were a scheme, so a self-hosted installation on
   * a port could not be added at all.
   *
   * WHAT SEPARATES THEM IS THE DIGIT. A port is digits; no scheme
   * begins with one.
   */
  const scheme = /^([a-z][a-z0-9+.-]*):(?!\d)/i.exec(trimmed);
  if (scheme && !/^https?$/i.test(scheme[1]!)) return null;
  /*
   * AND THE ASSUMED SCHEME IS HTTPS EXCEPT ON THIS MACHINE.
   *
   * Nobody runs TLS on their own laptop, so `localhost:3101`
   * assumed into `https://` is a self-hosted installation that
   * cannot be reached — which Take Software for desktop's own
   * acceptance criterion names: *"it connects to a cloud
   * installation, a self-hosted one and A LOCAL ONE."*
   *
   * THE PRODUCT ALREADY DECIDED THIS ELSEWHERE. `originFrom` in
   * `src/web/share.ts` has read loopback as plain HTTP since the
   * share cards were written — *"the proxy wins; localhost is
   * plain HTTP"* — and two places in one product disagreeing
   * about whether a laptop speaks TLS is two answers. [D-19]
   *
   * The browser loses nothing it had: a page served over https
   * cannot fetch `http://localhost` whatever this returns, and
   * `https://localhost:3101` was never going to answer either.
   */
  const loopback = /^(localhost|127\.0\.0\.1|\[::1\])(:|$|\/)/i.test(trimmed);
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed : `${loopback ? 'http' : 'https'}://${trimmed}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  /*
   * THREE CHECKS STOOD HERE AND TWO OF THEM COULD NOT BE
   * OBSERVED. A mutation sweep removed an empty-string guard and
   * an `http`-only guard before the parse, and every test still
   * passed — because `new URL('https://')` throws and a refused
   * scheme is refused below anyway. A guard nothing can observe
   * is decoration, and decoration in a security check is worse
   * than nothing, because it reads as though something is being
   * enforced twice.
   *
   * WHAT IS LEFT IS WHAT ACTUALLY DECIDES: the scheme, after the
   * URL parser has had its say, and credentials — which are a way
   * to make one origin look like another in a string a person is
   * reading.
   */
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  return url.origin;
}

/**
 * A stored list, whatever is actually stored.
 *
 * NEVER A THROW. Both applications read this on the way to their
 * first screen, and one that will not start because a JSON value
 * was truncated is worse than one that starts with no
 * connections in it. [D-21]
 *
 * AND EVERY ORIGIN GOES BACK THROUGH `asOrigin`, because a file
 * on disk is not a type — the lesson N-3 learned on the other
 * side of the product. A hand-edited list holding
 * `javascript:alert(1)` must not become a place this device
 * sends somebody.
 */
export function readConnectionList(raw: string | null | undefined): Connection[] {
  if (!raw) return [];
  let found: unknown;
  try {
    found = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(found)) return [];
  const out: Connection[] = [];
  for (const one of found) {
    if (!one || typeof one !== 'object') continue;
    const row = one as Partial<Connection>;
    const origin = typeof row.origin === 'string' ? asOrigin(row.origin) : null;
    if (!origin || out.some((was) => was.origin === origin)) continue;
    out.push({
      origin,
      name: String(row.name ?? '').slice(0, NAME_LONGEST),
      addedAt: typeof row.addedAt === 'string' ? row.addedAt : '',
    });
    if (out.length >= MOST_CONNECTIONS) break;
  }
  return out;
}

/**
 * The list with this installation in it.
 *
 * KEYED ON THE ORIGIN, so adding one twice is not two of them and
 * a renamed installation is the same one under a new name rather
 * than a duplicate nobody can tell apart.
 *
 * SORTED BY NAME, because this is a list a person reads to
 * recognise where they work. The order they were added in is not
 * an order anybody remembers.
 */
export function withConnection(
  list: readonly Connection[], one: Connection,
): Connection[] {
  const kept = list.filter((was) => was.origin !== one.origin);
  return [...kept, one]
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, MOST_CONNECTIONS);
}

export function withoutConnection(
  list: readonly Connection[], origin: string,
): Connection[] {
  return list.filter((one) => one.origin !== origin);
}

/**
 * What an installation told us about itself, read safely.
 *
 * WHAT IT CALLS ITSELF IS ITS OWN BUSINESS; WHERE IT IS, IS NOT.
 *
 * The origin kept is the one the device actually reached, never
 * the one in the answer. An installation that could name its own
 * origin could name somebody else's, and a connection list is a
 * list of places this device will later send a person to.
 *
 * SEPARATED FROM THE FETCH SO BOTH SIDES SHARE THE JUDGEMENT.
 * The browser asks with `fetch` from a page; the desktop
 * application asks from its main process, because its window has
 * no network at all. The transport differs and this does not.
 */
export function instanceFrom(reached: string, body: unknown): Instance | null {
  if (!body || typeof body !== 'object') return null;
  const said = (body as { instance?: { name?: unknown } }).instance;
  if (!said || typeof said.name !== 'string' || !said.name) return null;
  return { name: said.name.slice(0, NAME_LONGEST), origin: reached };
}
