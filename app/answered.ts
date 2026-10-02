/**
 * Reading what a server said.  [D-04, D-19, D-21, U-20, C-14, C-49]
 *
 *     const data = await response.json();            ← the fault
 *     if (!response.ok) throw new Error(data.error);
 *
 * THE SECOND LINE NEVER RAN. `.json()` on a status with an empty
 * body throws, so a refused upload, a gateway timeout and a crashed
 * route could only ever produce the parser's complaint — and the
 * status, which says exactly what happened, was sitting one line
 * below, unread.
 *
 * That is what put *"JSON.parse: unexpected end of data at line 1
 * column 1 of the JSON data"* under a thirteen-megabyte video on the
 * first screen of Studio One.
 *
 * ONE FUNCTION, BECAUSE SEVENTY-EIGHT PLACES ASK A SERVER SOMETHING
 * AND FIFTY-ONE OF THEM GUARDED IT. The pattern was known and
 * applied two times in three, which is C-14's finding again: the
 * answer was not wrong, it was written seventy-eight times.
 *
 * The judgement — what a person is told — is in the domain, where it
 * is tested without a network. This is only the reading.
 */

import { bodyOf, saysFor, serverSaid } from '../src/domain/saidBy.js';

/**
 * The body of a good answer, or a throw a person can read.
 *
 * READ AS TEXT FIRST, ALWAYS, because a body can only be read once
 * and the status alone does not say whether it holds JSON. Text
 * cannot fail the way `.json()` can.
 */
export async function answered<T = Record<string, unknown>>(
  response: Response, doing?: string,
): Promise<T> {
  const body = await response.text().catch(() => '');
  if (!response.ok) throw new Error(because(response.status, body, doing));
  return bodyOf(body) as T;
}

/**
 * THE CALLER'S CONTEXT, KEPT, AND ONLY WHERE IT ADDS ANYTHING.
 *
 * Each of these sites already had a sentence — *"could not start
 * the conversation"* — as a fallback behind `data.error`, and
 * throwing it away to gain a status would be trading one half of
 * the answer for the other. A bare 502 becomes *"could not start
 * the conversation — the server is not answering"*, which is both.
 *
 * But a server that explained itself needs no prefix: the route
 * that refuses a deletion already says what is on the air and
 * what to do about it, and *"could not delete it — it is on the
 * air: …"* is the caller talking over it.
 */
function because(status: number, body: string, doing?: string): string {
  const own = serverSaid(body);
  if (own) return own;
  const said = saysFor(status, body);
  return doing ? `${doing} — ${said}` : said;
}

/**
 * The same, without throwing: `{ ok, data, says }`.
 *
 * For the callers that set an error into state rather than unwinding
 * — most of this product — because turning a value into an exception
 * and catching it one line later is a detour, and the detour is
 * where the original fault hid.
 */
export async function asked<T = Record<string, unknown>>(
  response: Response, doing?: string,
): Promise<{ ok: boolean; data: T; says: string | null }> {
  const body = await response.text().catch(() => '');
  return {
    ok: response.ok,
    data: bodyOf(body) as T,
    says: response.ok ? null : because(response.status, body, doing),
  };
}
