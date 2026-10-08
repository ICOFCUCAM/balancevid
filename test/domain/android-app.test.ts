/**
 * An Android app installed from the internet, not from a store.
 *   [TAKE-APP T13a; TAKE-PLATFORM P1, P6; D-13, D-19, D-21, U-02]
 *
 * *"TAKE MOBILE SHOULD BE ANDROID SO SOMEONE WITH ANDROID PHONE
 * CAN DOWNLOAD FROM THE INTERNET EVEN WITHOUT THE PLAYSTORE."*
 *
 * AND THE ROW THAT CALLED THIS OUT OF REACH WAS ANSWERING A
 * DIFFERENT QUESTION. T13a records *"what is genuinely still out
 * of reach is a SIGNED BINARY IN TWO STORES: accounts,
 * certificates and a release pipeline"* — true of Play and the
 * App Store, and true of neither thing being asked for. A
 * sideloaded APK needs no store account, no review, and no
 * certificate anybody else issues: a keystore the publisher
 * makes themselves, and somewhere to put the file.
 *
 * AND THE SOMEWHERE HAS EXISTED ALL ALONG. `downloads.ts`'s
 * naming pattern already matches `android` and `apk`, so
 * `take-0.1.0-android.apk` in `var/downloads` is already listed
 * and already served. The distribution was never the gap.
 *
 * THE GAP IS THAT AN INSTALLED APP OPENING A WEBSITE IS A
 * BROWSER. Android puts an address bar across the top of it —
 * correctly, having no way to know the app and the site are the
 * same people — unless the site vouches for the app at
 * `/.well-known/assetlinks.json`. Nothing in this product served
 * that, and the failure is the quiet kind: no error, no log, no
 * line on any screen. Just an app that looks wrong for ever.
 */

import { describe, expect, it } from 'vitest';

import {
  ANDROID_PACKAGE, SIDELOAD_SAYS, assetLinks, fingerprintProblem,
  readFingerprint,
} from '../../src/domain/androidApp.js';
import { mayBePublic } from '../../src/auth/policy.js';
import { readName } from '../../src/domain/downloads.js';

/** A real one, from a keystore `keytool` actually made. */
const REAL = 'A6:7F:B5:B5:72:6C:56:F6:5C:5D:96:DA:09:C4:30:D6:2F:00:AB:F3'
  + ':25:CD:3F:7D:CD:E8:A9:EF:06:5B:08:98';

describe('the certificate fingerprint', () => {
  /*
   * EXACTLY WHAT `keytool -list` PRINTS, because that is what an
   * operator will paste. Anything that makes them reformat it is
   * a step where they will make a mistake.
   */
  it('accepts what keytool prints', () => {
    expect(readFingerprint(REAL)).toBe(REAL);
  });

  it('and is not case-fussy about hex somebody lowercased', () => {
    expect(readFingerprint(REAL.toLowerCase())).toBe(REAL);
  });

  it('and ignores whitespace around it', () => {
    expect(readFingerprint(`  ${REAL}\n`)).toBe(REAL);
  });

  /*
   * THE SHAPE IS CHECKED BECAUSE NOTHING ELSE WILL. Android
   * fetches this once, silently, and on a mismatch just leaves
   * the address bar — no error anywhere. A typo would otherwise
   * produce an app that looks wrong for ever. [D-21, U-19]
   */
  it('refuses anything that is not 32 hex pairs', () => {
    for (const bad of [
      'A6:7F:B5:oops',
      REAL.slice(0, -3),                    // 31 pairs
      `${REAL}:AB`,                          // 33 pairs
      REAL.replace(/:/g, ''),                // no colons
      REAL.replace('A6', 'ZZ'),              // not hex
      'not a fingerprint at all',
    ]) {
      expect(readFingerprint(bad), bad.slice(0, 24)).toBeNull();
    }
  });

  /* Unset is not a mistake — it is an installation that has not
     published an app. Only a malformed one is worth complaining
     about. */
  it('says nothing about an unset variable', () => {
    expect(readFingerprint(undefined)).toBeNull();
    expect(fingerprintProblem(undefined)).toBeNull();
    expect(fingerprintProblem('')).toBeNull();
    expect(fingerprintProblem('   ')).toBeNull();
  });

  /*
   * AND EXPLAINS A MALFORMED ONE, in the one place the operator
   * who set it will look. This is the difference between a
   * five-minute fix and an app nobody can explain.
   */
  it('and explains a malformed one, naming the symptom', () => {
    const said = fingerprintProblem('A6:7F:B5:oops')!;
    expect(said).toMatch(/ANDROID_CERT_SHA256/);
    expect(said).toMatch(/keytool -list/);
    expect(said).toMatch(/32 hex pairs/);
    /* The symptom, so somebody seeing the symptom can find this. */
    expect(said).toMatch(/address bar/);
  });

  it('and a valid one is not a problem', () => {
    expect(fingerprintProblem(REAL)).toBeNull();
  });
});

describe('the document Android fetches', () => {
  it('is the shape the specification asks for', () => {
    const [one] = assetLinks([REAL]) as [Record<string, unknown>];
    expect(one['relation']).toEqual(['delegate_permission/common.handle_all_urls']);
    const target = one['target'] as Record<string, unknown>;
    expect(target['namespace']).toBe('android_app');
    expect(target['package_name']).toBe('com.balancevid.take');
    expect(target['sha256_cert_fingerprints']).toEqual([REAL]);
  });

  /*
   * SEVERAL, because a release build and a debug build are signed
   * differently and an operator testing on their own phone should
   * not have to choose between them.
   */
  it('carries more than one, for a debug build beside a release', () => {
    const other = REAL.replace('A6', 'B7');
    const [one] = assetLinks([REAL, other]) as [Record<string, unknown>];
    expect((one['target'] as Record<string, unknown>)['sha256_cert_fingerprints'])
      .toEqual([REAL, other]);
  });

  /*
   * AND AN EMPTY LIST PRODUCES NO STATEMENT, not a statement
   * about nobody. `[{...fingerprints: []}]` is a valid document
   * that actively authorises no app, which is a different claim
   * from "nobody has set this up".
   */
  it('makes no statement when there is nobody to vouch for', () => {
    expect(assetLinks([])).toEqual([]);
  });

  /*
   * ONE PACKAGE NAME FOR EVER. Change it and every phone that
   * installed the old one has a second, unrelated app and no
   * upgrade path.
   */
  it('is named once, by reversed domain', () => {
    expect(ANDROID_PACKAGE).toBe('com.balancevid.take');
  });
});

describe('and the rest of the road already existed', () => {
  /*
   * THE DOWNLOAD CENTRE ALREADY TAKES AN APK. This is why the
   * distribution was never the blocker — only nobody had said so.
   */
  it('the download centre already recognises an Android release', () => {
    const found = readName('take-0.1.0-android.apk');
    expect(found).not.toBeNull();
    expect(found!.product).toBe('take');
    expect(found!.platform).toBe('android');
    expect(found!.form).toBe('apk');
  });

  /*
   * ANDROID FETCHES THE DOCUMENT WITH NO SESSION, on first launch,
   * before anybody has signed in. Behind the wall it is never
   * read and the app keeps its address bar for ever, with nothing
   * anywhere saying why. [policy.ts]
   */
  it('a signed-out Android device may fetch the document', () => {
    expect(mayBePublic('/.well-known/assetlinks.json', 'GET')).toBe(true);
    expect(mayBePublic('/.well-known/assetlinks.json', 'HEAD')).toBe(true);
  });

  /* Readable, never writable. It is a published fact, not a form. */
  it('and may not write it', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(mayBePublic('/.well-known/assetlinks.json', method), method).toBe(false);
    }
  });

  /*
   * AND SOMEBODY IS TOLD WHAT THE WARNING MEANS. Android asks
   * about unknown sources for every sideloaded app, and an
   * operator sending this to a congregation needs the sentence
   * that goes with it or half of them stop there. [D-21]
   */
  it('says what Android will ask them, before it asks', () => {
    expect(SIDELOAD_SAYS).toMatch(/unknown sources|installing from this source/);
    expect(SIDELOAD_SAYS).toMatch(/where the file came from, not what is in it/);
  });
});

/* ------------------------------------------------------------------ *
 *  And the route serves it.
 * ------------------------------------------------------------------ */

describe('the route, run rather than read', () => {
  /*
   * RUN, BECAUSE READING IT MISSED THE ONE THAT MATTERS. This
   * began as three assertions against the file's text, and a
   * mutation serving the SUCCESS response as `text/plain` passed
   * all three — the regex was satisfied by the 404 branch's
   * content type a few lines above. Android checks the content
   * type and silently declines to verify a document served as
   * text, so the test that cannot see the difference is the test
   * that lets the app keep its address bar. [U-02]
   */
  const callIt = async (said: string | undefined) => {
    const was = process.env['ANDROID_CERT_SHA256'];
    if (said === undefined) delete process.env['ANDROID_CERT_SHA256'];
    else process.env['ANDROID_CERT_SHA256'] = said;
    try {
      const { GET } = await import(
        '../../app/.well-known/assetlinks.json/route.js');
      const response = GET();
      return {
        status: response.status,
        type: response.headers.get('content-type'),
        body: JSON.parse(await response.text()) as unknown,
      };
    } finally {
      if (was === undefined) delete process.env['ANDROID_CERT_SHA256'];
      else process.env['ANDROID_CERT_SHA256'] = was;
    }
  };

  /*
   * THE CONTENT TYPE ANDROID INSISTS ON, on the response that
   * actually carries the document.
   */
  it('serves the document as JSON', async () => {
    const out = await callIt(REAL);
    expect(out.status).toBe(200);
    expect(out.type).toMatch(/^application\/json/);
    expect(out.body).toEqual([{
      relation: ['delegate_permission/common.handle_all_urls'],
      target: {
        namespace: 'android_app',
        package_name: 'com.balancevid.take',
        sha256_cert_fingerprints: [REAL],
      },
    }]);
  });

  /*
   * ABSENT RATHER THAN EMPTY WHEN UNCONFIGURED. An empty `[]` is
   * a valid document saying "no app speaks for this site", which
   * is a different claim from "nobody has set this up" — and it
   * is the one that gets cached.
   */
  it('404s rather than authorising nobody', async () => {
    const out = await callIt(undefined);
    expect(out.status).toBe(404);
    expect(out.body).not.toEqual([]);
  });

  /* And a typo says so, where the operator who made it will look. */
  it('names a malformed fingerprint rather than failing in silence',
    async () => {
      const out = await callIt('A6:7F:B5:oops');
      expect(out.status).toBe(404);
      expect(JSON.stringify(out.body)).toMatch(/ANDROID_CERT_SHA256/);
      expect(JSON.stringify(out.body)).toMatch(/address bar/);
    });

  /* Several fingerprints, however the operator separated them —
     a release build and a debug build are signed differently. */
  it('takes a list, comma- or space-separated', async () => {
    const other = REAL.replace('A6', 'B7');
    for (const said of [`${REAL},${other}`, `${REAL} ${other}`]) {
      const out = await callIt(said);
      const [one] = out.body as [Record<string, Record<string, unknown>>];
      expect(one['target']!['sha256_cert_fingerprints'], said.slice(0, 10))
        .toEqual([REAL, other]);
    }
  });

  /* And one bad entry in a list does not take the good one with it. */
  it('keeps the good fingerprint when one in the list is wrong', async () => {
    const out = await callIt(`${REAL},nonsense`);
    expect(out.status).toBe(200);
    const [one] = out.body as [Record<string, Record<string, unknown>>];
    expect(one['target']!['sha256_cert_fingerprints']).toEqual([REAL]);
  });
});
