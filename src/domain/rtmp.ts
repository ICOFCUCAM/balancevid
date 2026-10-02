/**
 * Pushing the programme somewhere else.  [Doctrine CHANNEL §15, §11,
 * D-21, D-06, D-20, U-22]
 *
 *     the engine's own segments  →  ffmpeg -c copy  →  rtmp://…/key
 *                 │
 *          one master output, several audiences
 *
 * THE AUDIT PUT THIS FIRST OF THE THINGS NOT YET BUILT:
 *
 *   *"`PLATFORMS.rtmp` is already modelled with `needsReview: false` —
 *   'anything that takes a server URL and a stream key'. YouTube,
 *   Facebook and X all accept exactly that today… This unlocks three
 *   of the four platform cards without anybody's permission, and it
 *   is the single highest-value piece of work on this list."*
 *
 * IT IS NOT A SECOND OUTPUT PATH, which is the thing this product has
 * been told repeatedly not to grow. The sender reads the HLS the
 * playout engine has already written — the same bytes the viewer gets
 * — and copies them to a socket. It renders nothing, decides nothing
 * about what is on air, and if it dies the channel does not notice.
 * That is D-21's *"one master broadcast output, and destinations
 * receive that output"* taken literally.
 *
 * AND IT COPIES RATHER THAN RE-ENCODES, which is why it can run
 * beside the engine on the same box: the house format is already
 * H.264/AAC in MPEG-TS at the shape a 16:9 platform wants, so the
 * sender is a remux. A destination that wants a different SHAPE needs
 * a different COMPOSITION — D-21 and U-22 both say a vertical output
 * is a different edit and not a crop — and that is a second encode
 * this stage deliberately does not write. Such a destination is
 * refused, with the reason, rather than quietly cropped.
 *
 * NOTHING HERE TOUCHES A KEY WITHOUT HIDING IT. A stream key is a
 * credential that lets anybody broadcast as the account that owns it,
 * and the two places credentials escape are logs and error messages.
 * Every function below that can see one has a counterpart that
 * redacts it, and the redaction is tested harder than the sending.
 */

import type { Destination } from './distribution.js';

/**
 * Where a sender may push.
 *
 * TWO SCHEMES AND NO OTHERS. ffmpeg will happily write its output to
 * `file:`, `http:`, `tcp:` or a pipe, and an output URL that arrives
 * from a form is a string somebody typed: `file:///` plus a path is a
 * sender that overwrites whatever it is pointed at, with the
 * engine's own privileges. An allowlist of exactly the two schemes
 * this feature is for is the whole defence, and it is at the door
 * rather than deep inside. [D-06]
 */
const SCHEMES = ['rtmp:', 'rtmps:'];

export interface Target {
  /** `rtmp://live.example.com/app` — no key in it. */
  server: string;
  /** The credential. Never logged, never returned by an API. */
  key: string;
}

/** Is this somewhere a programme may be pushed? */
export function isSendable(server: string): boolean {
  let url;
  try {
    url = new URL(server.trim());
  } catch {
    return false;
  }
  if (!SCHEMES.includes(url.protocol)) return false;
  /* A server with no host is a URL that parses and goes nowhere. */
  return url.hostname.length > 0;
}

/**
 * The URL ffmpeg is given: the server with the key as the last path
 * element, which is what every RTMP ingest in the world expects.
 *
 * THE JOIN IS THE PART THAT GOES WRONG. Operators paste a server with
 * a trailing slash about half the time, and `…/app/` + `key` with a
 * naive concatenation produces `…/app//key` — which some ingests
 * accept, some reject, and one or two accept and then drop ten
 * minutes later. One slash, always.
 */
export function targetUrl({ server, key }: Target): string {
  return `${server.trim().replace(/\/+$/, '')}/${key.trim()}`;
}

/**
 * The same URL with the credential taken out.
 *
 * FOR EVERY PLACE A URL IS WRITTEN DOWN: a log line, an error note, a
 * state record, the control room. There is no path in this feature
 * that prints a target without going through here, which is a rule
 * rather than a habit — `senderArgs` is the only function that builds
 * the real one, and the thing it returns is handed straight to a
 * process and never to a string.
 */
export function redact({ server, key }: Target): string {
  const shown = server.trim().replace(/\/+$/, '');
  /*
   * THE LENGTH IS NOT A HINT. Showing the last four characters is the
   * convention for card numbers, where the rest is already known; a
   * stream key is uniformly secret and its tail is as useful to an
   * attacker as its head. The placeholder is fixed-width on purpose,
   * so the log does not leak how long the key was either.
   */
  return key.trim() ? `${shown}/••••••••` : shown;
}

/**
 * Why this destination cannot be sent to, or nothing.
 *
 * THE REASONS ARE THE PRODUCT'S HONESTY. D-21: *"A destination
 * showing 'on' with nothing arriving is the screen that loses a
 * broadcast"* — so a destination that cannot work says which of the
 * four things is wrong with it, and the control room shows the
 * sentence rather than a lamp.
 */
export function refusalFor(
  destination: Destination, target: Target | null,
): string | null {
  if (destination.kind !== 'rtmp' && destination.kind !== 'own') {
    /* The reviewed platforms. Their own connectors, not this one. */
    return `${destination.label} needs an approved app before it can `
      + 'receive a stream. Use a plain RTMP destination with that '
      + 'platform’s own server URL and key instead.';
  }
  if (destination.kind === 'own') {
    return 'This is the channel’s own output. It is already going out.';
  }
  if (!target || !target.key.trim()) {
    return 'No stream key yet. Paste the server URL and key the platform '
      + 'gave you.';
  }
  if (!isSendable(target.server)) {
    return 'That server address is not an RTMP URL. It should begin '
      + 'rtmp:// or rtmps://.';
  }
  /*
   * A SHAPE THAT IS NOT THE HOUSE SHAPE IS A DIFFERENT EDIT, not a
   * crop, and this sender copies rather than composes. Refusing is
   * the honest answer: cropping the television channel is the one
   * thing D-21 and U-22 both forbid by name, and a vertical output
   * that silently arrived as a cropped 16:9 would be the product
   * doing it anyway.
   */
  if (destination.shape !== '16:9') {
    return `A ${destination.shape} destination is a different composition, `
      + 'not a crop of this one — it needs its own encode, which is '
      + 'not built yet. A 16:9 destination can send today.';
  }
  return null;
}

/**
 * What to run.
 *
 * `-re` IS ABSENT ON PURPOSE. It paces input at its native rate and is
 * right for pushing a FILE; the input here is a live HLS playlist that
 * is already arriving in real time, and pacing a live source a second
 * time is how a sender drifts further behind every hour until the
 * ingest drops it.
 *
 * `-c copy` because the house format is already what a 16:9 ingest
 * wants. No filter, no scale, no re-encode: the sender is a remux and
 * the box it shares with the encoder notices nothing.
 *
 * `-f flv` because that is the container RTMP carries, whatever the
 * platform.
 */
export function senderArgs(
  { playlist, target }: { playlist: string; target: Target },
): string[] {
  return [
    '-hide_banner', '-loglevel', 'warning',
    /* Follow the playlist as it grows rather than reading it once. */
    '-live_start_index', '-1',
    '-i', playlist,
    '-c', 'copy',
    /* Timestamps restart at every segment boundary otherwise, and an
       ingest that sees them go backwards closes the connection. */
    '-fflags', '+genpts',
    '-f', 'flv',
    targetUrl(target),
  ];
}

/**
 * How long to wait before trying a dead sender again.
 *
 * AN INGEST THAT REFUSED ONCE WILL REFUSE AGAIN. Platforms rate-limit
 * reconnection and some ban an address that hammers them, so the
 * delay doubles — but it is capped, because the other reason a sender
 * dies is a network blip, and a broadcast that waited an hour to
 * retry after one of those is a broadcast nobody was watching.
 */
export const RETRY_FROM_MS = 2_000;
export const RETRY_CAP_MS = 60_000;

export function retryAfter(failures: number): number {
  if (failures <= 0) return 0;
  return Math.min(RETRY_CAP_MS, RETRY_FROM_MS * 2 ** (failures - 1));
}
