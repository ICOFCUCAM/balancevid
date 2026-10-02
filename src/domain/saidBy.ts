/**
 * What a person is told when a request fails.
 *   [Doctrine D-04, D-19, D-21, U-20, C-14, C-49]
 *
 *     JSON.parse: unexpected end of data at line 1 column 1 of the JSON data
 *
 * THAT SENTENCE WAS SHOWN TO THE AUTHOR, under a thirteen-megabyte
 * video they had just chosen, on the first screen of Studio One. It
 * is the browser's JSON parser complaining about a body, and the
 * person reading it had not asked for any JSON. There is nothing in
 * it they can act on: not what failed, not whether to try again, not
 * whether their file was too big.
 *
 * TWO FAULTS, AND THE SECOND IS THE ONE THAT MATTERS.
 *
 * The first is an unguarded `.json()`. The second is that it was
 * called BEFORE `response.ok` was checked — so a server that
 * answered with a status and an empty body, which is what a refused
 * upload, a gateway timeout and a crashed route all look like,
 * could only ever produce the parser's complaint. **The status was
 * sitting right there, unread.**
 *
 * SEVENTY-EIGHT PLACES ASK A SERVER SOMETHING AND FIFTY-ONE OF THEM
 * GUARD IT. The pattern was known and applied two times in three,
 * which is C-14's finding in a third place: the answer was not
 * wrong, it was written seventy-eight times.
 *
 * Nothing here touches the filesystem, the network or a clock.
 */

/**
 * WHAT EACH STATUS MEANS TO SOMEBODY WHO IS NOT A PROGRAMMER.
 *
 * Said as the thing that happened, not as the code. "413" and
 * "Payload Too Large" are both the machine's words for a sentence
 * the person can act on: their file is too big for this server.
 */
const SAYS: Record<number, string> = {
  400: 'the server could not use that',
  401: 'you are not signed in any more — sign in and try again',
  403: 'you are not allowed to do that',
  404: 'that is not there any more',
  408: 'the server took too long and gave up',
  409: 'something else is using that right now',
  413: 'that file is larger than this server will accept',
  415: 'the server will not take that kind of file',
  422: 'the server could not use what was sent',
  429: 'too many requests at once — wait a moment and try again',
  500: 'the server failed on that',
  502: 'the server is not answering',
  503: 'the server is busy or restarting',
  504: 'the server took too long to answer',
};

/**
 * A body that is a web page, not an answer.
 *
 * A PROXY IN FRONT OF THE APP ANSWERS IN HTML — nginx's "413
 * Request Entity Too Large", a gateway's error page — and showing
 * that to a person is showing them somebody else's markup. The
 * status is the honest part of such a response, so it is the part
 * that is used.
 */
function isMarkup(body: string): boolean {
  /*
   * ANYTHING STARTING WITH `<`, which is blunter than listing the
   * openings and is the rule that holds. The list was `<!doctype`,
   * `<html` and `<?xml`, and a proxy that answers with a bare
   * `<h1>413 Request Entity Too Large</h1>` — which several do —
   * walked straight past all three and became somebody's error
   * message. No sentence meant for a person begins with an angle
   * bracket.
   */
  return body.trimStart().startsWith('<');
}

/** The longest a server's own sentence may be before it is not one. */
export const MOST_SAID = 300;

/**
 * The server's own sentence, when it gave one.
 *
 * SEPARATE FROM THE STATUS FALLBACK BECAUSE A CALLER NEEDS TO
 * KNOW WHICH IT GOT. A route that says *"it is on the air:
 * REdemption TV (the filler)"* needs no further explanation and
 * must not be prefixed with a caller's guess at what it was
 * doing; a bare 502 needs exactly that context. One function
 * cannot answer both without being asked which happened.
 */
/**
 * The sentence to show, from the status and whatever came back.
 *
 * THE SERVER'S OWN WORDS WIN WHEN IT GAVE ANY, because this product
 * writes them on purpose — *"it is on the air: REdemption TV (the
 * filler). Take it off the schedule first"* is worth more than
 * anything a status code could say. Everything else falls back to
 * the status, and the status always says something.
 */
export function serverSaid(body: string): string | null {
  const said = body.trim();
  if (!said || isMarkup(said)) return null;
  try {
    const read: unknown = JSON.parse(said);
    if (read && typeof read === 'object') {
      const error = (read as { error?: unknown }).error;
      if (typeof error === 'string' && error.trim()) return error.trim();
    }
  } catch {
    /*
     * NOT JSON, WHICH IS NOT AN ERROR TO REPORT. It is a plain
     * sentence from something in the path, and a short one is
     * more use than a status. Long ones are a stack trace or a
     * log dump and are the machine talking to itself.
     */
    if (said.length <= MOST_SAID && !said.includes('\n')) return said;
  }
  return null;
}

export function saysFor(status: number, body = ''): string {
  const own = serverSaid(body);
  if (own) return own;
  /*
   * AND A STATUS OF ZERO IS NOT A STATUS. `fetch` rejects on a
   * network failure rather than resolving, so a caller that
   * constructs one of these has nothing from the wire at all.
   */
  if (!status) return 'that did not reach the server';
  return SAYS[status] ?? `the server refused that (${status})`;
}

/**
 * The JSON in a body, or nothing — never a thrown parser message.
 *
 * A SUCCESSFUL REQUEST WITH AN EMPTY BODY IS ORDINARY: a 204, a
 * route that returns nothing, a `DELETE` that simply worked. The
 * caller wants an object to read fields off, and the parser's
 * opinion about an empty string is not information.
 *
 * IT GIVES BACK WHAT `.json()` GAVE BACK, MINUS THE THROWING, and
 * that default is deliberate rather than lazy. Ten call sites read
 * fields off this that nobody has ever typed; narrowing them is a
 * real job and a separate one, and doing it here as a side effect
 * of a safety fix would mean inventing shapes for responses in
 * nine components without reading them. A caller that wants the
 * check passes a type — the six that were actually broken now do.
 */
/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
export function bodyOf<T = any>(body: string): T {
  try {
    const read: unknown = JSON.parse(body);
    return (read && typeof read === 'object' ? read : {}) as T;
  } catch {
    return {} as T;
  }
}
