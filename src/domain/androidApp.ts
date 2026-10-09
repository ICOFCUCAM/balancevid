/**
 * The Android app, installed from the internet and not from a store.
 *   [TAKE-APP T13a, TAKE-PLATFORM P1, P6; D-13, D-19, D-21, U-02]
 *
 * *"TAKE MOBILE SHOULD BE ANDROID SO SOMEONE WITH ANDROID PHONE
 * CAN DOWNLOAD FROM THE INTERNET EVEN WITHOUT THE PLAYSTORE."*
 *
 * AND THE ROW THAT SAID THIS WAS OUT OF REACH WAS ANSWERING A
 * DIFFERENT QUESTION. T13a records *"what is genuinely still out
 * of reach is a SIGNED BINARY IN TWO STORES: accounts,
 * certificates and a release pipeline"* — which is true of the
 * Play Store and the App Store, and true of neither of the things
 * actually being asked for. **A sideloaded APK needs no store
 * account, no review, and no certificate anybody else issues.**
 * It needs a keystore the publisher generates themselves and a
 * URL to put the file at, and this product has had the URL since
 * the download centre existed: `take-<version>-android.apk` in
 * `var/downloads` is already recognised, already listed and
 * already served. The gap was never the distribution.
 *
 * WHAT IS ACTUALLY MISSING IS THIS FILE'S SUBJECT. An installed
 * Android app that opens a website shows a browser address bar
 * across the top of it — it looks like a browser, because it is
 * one — unless the SITE vouches for the app. That is Digital
 * Asset Links: a document at `/.well-known/assetlinks.json`
 * naming the app's package and the SHA-256 fingerprint of the
 * certificate it was signed with. Android fetches it on first
 * launch and, if it matches, takes the chrome away.
 *
 * SO THE HALF THAT BELONGS TO THE SERVER IS BUILT HERE, and the
 * half that belongs to a build machine is not pretended at. The
 * fingerprint cannot be invented: it is the hash of a keystore
 * that does not exist yet, so it is configuration, and absent it
 * the route says nothing rather than serving a document that
 * authorises nobody.
 *
 * Pure. No file, no network, no clock.
 */

/**
 * WHAT THE APP IS CALLED TO ANDROID.
 *
 * ONE NAME FOR EVER, AND THAT IS THE WHOLE WEIGHT OF IT. An
 * Android package name is the app's identity: change it and every
 * phone that installed the old one has a second, unrelated app
 * and no upgrade path. It is reversed-domain by convention and
 * `balancevid.com` is the domain, so this is not a choice so much
 * as a transcription.
 *
 * `take` and not `app`, because this product has four clients and
 * naming one of them "the app" is how the other three become hard
 * to talk about. [D-19]
 */
export const ANDROID_PACKAGE = 'com.balancevid.take';

/**
 * A certificate fingerprint, or nothing.
 *
 * THE SHAPE IS CHECKED BECAUSE NOTHING ELSE WILL CHECK IT.
 * Android fetches this document once, silently, and on a mismatch
 * simply leaves the address bar there — no error, no log, nothing
 * on any screen in this product. A fingerprint with a typo in it
 * therefore produces an app that looks slightly wrong for ever
 * and tells nobody why. Thirty-two uppercase hex pairs separated
 * by colons is exactly what `keytool -list` prints; anything else
 * is a mistake worth refusing at the door. [D-21, U-19]
 */
const FINGERPRINT = /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function readFingerprint(said: string | undefined): string | null {
  const trimmed = (said ?? '').trim().toUpperCase();
  if (trimmed === '') return null;
  return FINGERPRINT.test(trimmed) ? trimmed : null;
}

/** Why a fingerprint was refused, for the operator who set it. */
export function fingerprintProblem(said: string | undefined): string | null {
  const trimmed = (said ?? '').trim();
  if (trimmed === '') return null;
  if (readFingerprint(trimmed)) return null;
  return 'ANDROID_CERT_SHA256 must be the SHA-256 fingerprint as '
    + '`keytool -list` prints it: 32 hex pairs separated by colons. '
    + `Got ${trimmed.length} characters. Until it parses, the app will `
    + 'open with a browser address bar across it and nothing will say why.';
}

/**
 * THE DOCUMENT ANDROID FETCHES.  [Digital Asset Links]
 *
 * `delegate_permission/common.handle_all_urls` is the one
 * statement that matters: it says this site agrees that this app,
 * signed with this certificate, speaks for it. The shape is
 * Google's and not ours, so it is written out literally rather
 * than built from a helper — a reader checking it against the
 * specification should be able to see the specification.
 *
 * SEVERAL FINGERPRINTS, because a release build and a debug build
 * are signed differently and an operator testing on their own
 * phone should not have to choose. Android accepts a list.
 */
export function assetLinks(
  fingerprints: readonly string[], packageName = ANDROID_PACKAGE,
): unknown[] {
  if (fingerprints.length === 0) return [];
  return [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: packageName,
      sha256_cert_fingerprints: [...fingerprints],
    },
  }];
}

/**
 * What to tell somebody who has just downloaded the file.
 *
 * SAID, BECAUSE ANDROID WILL FRIGHTEN THEM. A sideloaded APK
 * raises a warning about unknown sources that is designed to stop
 * people installing malware, and it does not distinguish between
 * malware and a church's own broadcast app. An operator who sends
 * this link to a congregation needs the sentence that goes with
 * it, or half of them will stop at the warning and conclude the
 * app is unsafe. [D-21, GO-VIRAL]
 */
export const SIDELOAD_SAYS =
  'Open the file on the phone and Android will ask whether to allow '
  + 'installing from this source — say yes for the browser you downloaded '
  + 'it with. That warning appears for every app not installed from the '
  + 'Play Store; it is about where the file came from, not what is in it.';
