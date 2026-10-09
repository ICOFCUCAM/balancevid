import {
  assetLinks, fingerprintProblem, readFingerprint,
} from '../../../src/domain/androidApp.js';

export const dynamic = 'force-dynamic';

/**
 * The document that takes the browser bar off the Android app.
 *   [TAKE-APP T13a; D-13, D-21, U-19]
 *
 * AN INSTALLED APP THAT OPENS A WEBSITE IS A BROWSER UNTIL THE
 * SITE SAYS OTHERWISE. Android shows an address bar across the
 * top of it — correctly, because it has no way to know the app
 * and the site are the same people. This is how it finds out:
 * Digital Asset Links, fetched once on first launch, naming the
 * package and the fingerprint of the certificate it was signed
 * with.
 *
 * PUBLIC AND UNAUTHENTICATED, WHICH IS THE POINT. Android fetches
 * it with no session, before anybody has signed in, so it is in
 * the policy's allow-list beside the other things a stranger may
 * read. It contains a package name and a public certificate hash
 * — both of which are in the APK anybody can download, so there
 * is nothing here to protect. [policy.ts]
 *
 * ABSENT RATHER THAN EMPTY WHEN UNCONFIGURED. An empty `[]` is a
 * VALID asset-links document that says "no app speaks for this
 * site", which is a different claim from "nobody has set this up
 * yet" — and the first one is cached. A 404 is the honest answer
 * and the one that stops being wrong the moment the fingerprint
 * is set. [D-21]
 *
 * WHY THE FINGERPRINT IS CONFIGURATION AND NOT A CONSTANT: it is
 * the hash of a signing key that belongs to whoever publishes the
 * build. A self-hosted customer signs their own APK and their
 * fingerprint is not ours. Baking one in would make every
 * installation vouch for one publisher's binary. [V-8, D-18]
 */
export function GET(): Response {
  /*
   * A LIST, because a release build and a debug build are signed
   * differently and an operator testing on their own phone should
   * not have to choose between them. Comma- or space-separated,
   * since both are what somebody types.
   */
  const said = process.env['ANDROID_CERT_SHA256'] ?? '';
  const fingerprints = said.split(/[\s,]+/)
    .map((one) => readFingerprint(one))
    .filter((one): one is string => one !== null);

  if (fingerprints.length === 0) {
    /*
     * AND IT SAYS WHY, in the one place an operator who set the
     * variable will look. A typo here is otherwise invisible: the
     * app simply keeps its address bar and nothing anywhere
     * mentions it. [D-21, U-19]
     */
    const problem = fingerprintProblem(said);
    return new Response(JSON.stringify({
      error: 'no Android app is registered for this installation',
      ...(problem ? { because: problem } : {}),
    }, null, 2), {
      status: 404,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  return new Response(JSON.stringify(assetLinks(fingerprints), null, 2), {
    headers: {
      /*
       * THE TYPE ANDROID INSISTS ON. It fetches this and checks
       * the content type; served as `text/plain` the verification
       * fails with — again — no error anywhere.
       */
      'content-type': 'application/json; charset=utf-8',
      /* Short, so a corrected fingerprint takes effect the same
         day rather than whenever a cache feels like it. */
      'cache-control': 'public, max-age=300',
    },
  });
}
