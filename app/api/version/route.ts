import { isOwner } from '../../../src/auth/request.js';
import { json } from '../../../src/web/http.js';
import { deployment } from '../../../src/web/deployment.js';

export const dynamic = 'force-dynamic';

/**
 * WHICH BUILD IS THIS?  [Doctrine D-13; DESIGN, the twelfth decision]
 *
 * The author looked at a deployed installation, saw the old front doors,
 * and asked whether features that had been written were reaching it at
 * all. That is a fair question and the product could not answer it:
 * `package.json` has said `0.1.0` through every release, nothing on any
 * page says what it was built from, and the only way to tell was to
 * request a file that only exists in the new build and see whether it
 * 404s.
 *
 * SO THE INSTALLATION SAYS WHAT IT IS. One request, one commit.
 *
 * READ AT REQUEST TIME, NOT BAKED IN. The platform sets these in the
 * container, and a value compiled into the bundle would be the commit
 * the IMAGE was built from rather than the one this container is
 * running — which is the same class of mistake as a stale build, told
 * confidently. `process.env` is read on every request and
 * `force-dynamic` is what keeps Next from answering from a cache built
 * at compile time.
 *
 * PUBLIC, LIKE THE HEALTH CHECK, AND FOR THE SAME SHAPE OF REASON: a
 * stranger gets the commit and nothing else. A hash is opaque — it
 * reveals no code — and it is the one fact this route exists to give,
 * so requiring a session would defeat the purpose from a phone or a
 * deploy probe. Which deployment, which environment and where it thinks
 * it is are operational detail, and detail is how somebody learns
 * whether an instance is worth attacking. [health/route.ts]
 */
export async function GET(request: Request): Promise<Response> {
  const owner = await isOwner(request);
  const now = deployment();
  if (!owner) return json({ ok: true, commit: now.commit });
  return json({ ok: true, ...now });
}
