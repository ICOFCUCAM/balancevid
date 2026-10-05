/**
 * A download centre is six cards and six chances to lie.
 *   [Doctrine D-21, U-02, D-03, D-19; TAKE-PLATFORM P6]
 *
 * THE FAULT THESE ANSWER. The gateway offered "Take for Android",
 * "Take for iOS", "BalanceVid Windows", "BalanceVid Linux",
 * "Self-hosted Installation" and "System Requirements". Four of the
 * six went to `#`. One went to a page that was not installable until
 * this week. One named a product this repository does not build.
 *
 * > *"do it in a way we can download the app for mobile directly,
 * > download software Take for desktop, balance vid software
 * > download? all should have actication code for now so that we can
 * > use one master code to open them."*
 *
 * So: one code, and a list that cannot advertise a file that is not
 * there — because it is READ OFF THE DISK rather than configured.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import {
  HOW_TO_NAME, offered, readName, sizeSays,
} from '../../src/domain/downloads.js';
import {
  ACTIVATION_COOKIE, NOT_CONFIGURED, activationCode, activationMatches,
  issuePass, passCookie, passHolds,
} from '../../src/web/activation.js';
import { isAssetPath, mayBePublic } from '../../src/auth/policy.js';

const CODE = 'BV-MASTER-9Q2X';

function withCode(code: string | undefined): void {
  if (code === undefined) delete process.env['BALANCEVID_ACTIVATION'];
  else process.env['BALANCEVID_ACTIVATION'] = code;
}

let before: string | undefined;
beforeEach(() => { before = process.env['BALANCEVID_ACTIVATION']; });
afterEach(() => { withCode(before); });

/* ------------------------------------------------------------------ *
 *  What is on offer is what is on the disk.
 * ------------------------------------------------------------------ */

describe('reading a release name', () => {
  it('reads the product, the version and the platform out of it', () => {
    expect(readName('take-desktop-0.1.0-linux-x64.AppImage')).toMatchObject({
      product: 'take-desktop', version: '0.1.0', platform: 'linux',
      form: 'AppImage',
    });
    expect(readName('take-desktop-0.1.0-win-x64.exe')).toMatchObject({
      product: 'take-desktop', platform: 'win', form: 'exe',
    });
    expect(readName('balancevid-1.2.3-server.tar.gz')).toMatchObject({
      product: 'balancevid', version: '1.2.3', platform: 'server',
      form: 'tar.gz',
    });
  });

  /* The architecture is accepted so such a file is not silently
     dropped, and is not carried into the card: a person choosing a
     download picks a platform. */
  it('accepts a name with no architecture in it', () => {
    expect(readName('take-0.4.0-android.apk')).toMatchObject({
      product: 'take', platform: 'android', form: 'apk',
    });
  });

  /*
   * REFUSED RATHER THAN GUESSED AT. A card headed `Unknown` offering
   * a file nobody can account for is the one thing a download centre
   * must never do. [D-21]
   */
  it('refuses a name that does not say what it is', () => {
    for (const bad of [
      'take-desktop.AppImage',           // no version
      'take-desktop-0.1.0.AppImage',     // no platform
      'Take Setup 0.1.0.exe',            // electron-builder's own default
      'notes.txt',
      'take-desktop-0.1.0-linux-x64.sh',
      '',
    ]) {
      expect(readName(bad), bad).toBeNull();
    }
  });

  /*
   * AND THE PATTERN IS THE PATH SAFETY. It admits no slash, no
   * dot-dot and nothing outside the alphabet it names, so a name
   * that passes cannot leave the directory it is joined to.
   */
  it('refuses anything that could leave the directory', () => {
    for (const attack of [
      '../take-desktop-0.1.0-linux-x64.AppImage',
      '../../etc/passwd',
      'take-desktop-0.1.0-linux-x64.AppImage/../../x',
      'sub/take-desktop-0.1.0-linux-x64.AppImage',
      'take-desktop-0.1.0-linux-x64.AppImage\u0000.txt',
      /*
       * AND THROUGH THE ONE SEGMENT THAT IS NOT READ. The
       * architecture is accepted as it comes, because `${arch}`
       * expands to whatever the target calls it — so it is the one
       * part of the name nothing checks the MEANING of, and
       * therefore the one part an attack would be written into.
       *
       * `var/downloads/take-desktop-0.1.0-linux-../../x.deb`
       * resolves to `var/x.deb`: the first `..` eats the filename,
       * the second eats the directory. A mutation that widened the
       * segment to `.` found this, and the cases above did not —
       * every one of them put the traversal at the START of the
       * name, where the anchor already refuses it. [U-02]
       */
      'take-desktop-0.1.0-linux-../../x.deb',
      'take-desktop-0.1.0-linux-a/b.deb',
      'take-desktop-0.1.0-linux-..%2F.deb',
      'take-desktop-0.1.0-linux-x.y.deb',
    ]) {
      expect(readName(attack), attack).toBeNull();
    }
  });
});

describe('the list', () => {
  const file = (name: string, bytes = 1024) => ({ name, bytes });

  it('leaves out everything the convention does not recognise', () => {
    const list = offered([
      file('take-desktop-0.1.0-linux-x64.AppImage'),
      file('README'),
      file('.DS_Store'),
      file('old build.deb'),
    ]);
    expect(list.map((one) => one.file))
      .toEqual(['take-desktop-0.1.0-linux-x64.AppImage']);
  });

  /*
   * SORTED SO THE SAME PAGE COMES BACK TWICE. `readdir` answers in
   * whatever order the filesystem feels like, and a download centre
   * whose cards move between reloads is one somebody misreads.
   */
  it('comes back in the same order whatever the disk says', () => {
    const names = [
      'take-desktop-0.1.0-win-x64.exe',
      'balancevid-1.0.0-server.tar.gz',
      'take-desktop-0.2.0-linux-x64.AppImage',
      'take-desktop-0.1.0-linux-x64.AppImage',
    ];
    const once = offered(names.map((name) => file(name))).map((one) => one.file);
    const again = offered([...names].reverse().map((name) => file(name)))
      .map((one) => one.file);
    expect(again).toEqual(once);
    /* Newest first within a platform, so the top card is the one to take. */
    expect(once.indexOf('take-desktop-0.2.0-linux-x64.AppImage'))
      .toBeLessThan(once.indexOf('take-desktop-0.1.0-linux-x64.AppImage'));
  });

  it('measures rather than describes', () => {
    expect(sizeSays(812 * 1024)).toBe('812 KB');
    expect(sizeSays(9 * 1024 * 1024 + 400 * 1024)).toBe('9.4 MB');
    expect(sizeSays(97 * 1024 * 1024)).toBe('97 MB');
    expect(sizeSays(2 * 1024 ** 3)).toBe('2.0 GB');
  });

  it('says how to name a file, for the operator with nothing listed', () => {
    expect(HOW_TO_NAME).toMatch(/var\/downloads/);
    expect(HOW_TO_NAME).toMatch(/take-desktop-0\.1\.0-linux-x64\.AppImage/);
  });
});

/* ------------------------------------------------------------------ *
 *  One code.
 * ------------------------------------------------------------------ */

describe('the activation code', () => {
  /*
   * NOT CONFIGURED MEANS CLOSED. The alternative — no variable, no
   * gate — is a deployment that forgot one line and published its
   * binaries without anybody deciding to. A refusal is visible on
   * the first attempt; an open door is visible only to whoever
   * walks through it. [D-21]
   */
  it('is closed when nobody has set one', async () => {
    withCode(undefined);
    expect(activationCode()).toBeNull();
    expect(await activationMatches('')).toBe(false);
    expect(await activationMatches('anything')).toBe(false);
    expect(await issuePass()).toBeNull();
    expect(NOT_CONFIGURED).toMatch(/BALANCEVID_ACTIVATION/);
  });

  /* An empty or blank variable is not a code either, and a gate that
     accepted the empty string would be open to everybody typing
     nothing. */
  it('treats a blank variable as none at all', async () => {
    withCode('   ');
    expect(activationCode()).toBeNull();
    expect(await activationMatches('   ')).toBe(false);
    expect(await activationMatches('')).toBe(false);
  });

  it('opens to the code and to nothing else', async () => {
    withCode(CODE);
    expect(await activationMatches(CODE)).toBe(true);
    expect(await activationMatches(`${CODE} `)).toBe(false);
    expect(await activationMatches(CODE.toLowerCase())).toBe(false);
    expect(await activationMatches(CODE.slice(0, -1))).toBe(false);
    expect(await activationMatches(`${CODE}X`)).toBe(false);
  });
});

describe('the pass', () => {
  it('is accepted, and a forged one is not', async () => {
    withCode(CODE);
    const pass = (await issuePass())!;
    expect(await passHolds(pass.token)).toBe(true);
    expect(await passHolds(`${pass.token}x`)).toBe(false);
    expect(await passHolds(pass.token.replace(/\.[^.]+$/, '.AAAA'))).toBe(false);
    expect(await passHolds(undefined)).toBe(false);
    expect(await passHolds('')).toBe(false);
    expect(await passHolds('a1.9999999999999')).toBe(false);
  });

  /*
   * KEYED TO THE CODE ITSELF, so changing `BALANCEVID_ACTIVATION`
   * invalidates every pass issued under the old one without anything
   * having to remember that it did. [session.ts]
   */
  it('stops holding the moment the installation changes its code', async () => {
    withCode(CODE);
    const pass = (await issuePass())!;
    expect(await passHolds(pass.token)).toBe(true);
    withCode('BV-MASTER-DIFFERENT');
    expect(await passHolds(pass.token)).toBe(false);
    withCode(undefined);
    expect(await passHolds(pass.token)).toBe(false);
  });

  it('expires', async () => {
    withCode(CODE);
    const pass = (await issuePass())!;
    expect(await passHolds(pass.token, pass.expiresAt - 1)).toBe(true);
    expect(await passHolds(pass.token, pass.expiresAt + 1)).toBe(false);
  });

  /* HttpOnly so a script cannot read it; SameSite=Lax so another
     site cannot spend it; Secure only where the request was. */
  it('rides in a cookie a script cannot read', async () => {
    withCode(CODE);
    const pass = (await issuePass())!;
    const cookie = passCookie(pass.token, pass.expiresAt, true);
    expect(cookie).toMatch(new RegExp(`^${ACTIVATION_COOKIE}=`));
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/; Secure$/);
    expect(passCookie(pass.token, pass.expiresAt, false)).not.toMatch(/Secure/);
  });
});

/* ------------------------------------------------------------------ *
 *  And it is reachable by the people it is for.
 * ------------------------------------------------------------------ */

describe('who can reach the downloads', () => {
  /*
   * NOBODY DOWNLOADING THE TAKE APP OR TAKE DESKTOP HAS AN ACCOUNT —
   * that is the premise of both — so a download centre behind the
   * sign-in gate is a download centre for one person. [D-25]
   */
  const reachable = (path: string, method = 'GET') =>
    isAssetPath(path) || mayBePublic(path, method);

  it('lets somebody signed in to nothing see what exists', () => {
    expect(reachable('/api/downloads')).toBe(true);
  });

  it('lets them type the code without putting it in a URL', () => {
    expect(reachable('/api/downloads/unlock', 'POST')).toBe(true);
    /* And the listing is not writable by a stranger. */
    expect(reachable('/api/downloads', 'POST')).toBe(false);
    expect(reachable('/api/downloads', 'DELETE')).toBe(false);
  });

  it('lets a release through the session gate and no further', () => {
    expect(reachable('/api/downloads/take-desktop-0.1.0-linux-x64.AppImage'))
      .toBe(true);
    /* The route itself still refuses without a pass; what the policy
       must not do is let a path with a slash in it through. */
    expect(reachable('/api/downloads/../../etc/passwd')).toBe(false);
    expect(reachable('/api/downloads/sub/thing.deb')).toBe(false);
    expect(reachable(
      '/api/downloads/take-desktop-0.1.0-linux-x64.AppImage', 'DELETE')).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 *  And the cards no longer promise what the building has not built.
 * ------------------------------------------------------------------ */

describe('the gateway’s own download band', () => {
  const code = (path: string) => readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  const GATEWAY = code('app/gateway/page.tsx');
  const DOWNLOADS = GATEWAY.slice(
    GATEWAY.indexOf('const DOWNLOADS'), GATEWAY.indexOf('const DOCS'));

  /*
   * FOUR OF SIX WENT TO `#`. A card that cannot be followed is the
   * building advertising a room it has not built. [D-24, D-21]
   */
  it('leaves at most one card unbuilt', () => {
    const dead = DOWNLOADS.match(/href: '#'/g) ?? [];
    expect(dead.length).toBeLessThanOrEqual(1);
  });

  /*
   * AND IT NAMES THE PRODUCT THIS REPOSITORY ACTUALLY BUILDS.
   * "BalanceVid Windows — Desktop production environment" is not
   * what `desktop/` makes: Take Desktop is a multi-camera capture
   * station. Naming it after the studios is somebody downloading
   * three hundred megabytes to find out it is not the thing they
   * wanted. [D-21]
   */
  it('does not offer a desktop production environment it does not build', () => {
    expect(DOWNLOADS).not.toMatch(/BalanceVid Windows/);
    expect(DOWNLOADS).not.toMatch(/BalanceVid Linux/);
    expect(DOWNLOADS).toMatch(/Take Desktop/);
    expect(DOWNLOADS).toMatch(/capture station/);
  });

  /*
   * AND IT DOES NOT DRAW THE SAME DOOR TWICE. "Take for Android" and
   * "Take for iOS" both went to `/take`, which is one progressive
   * web application and on iOS the only door there is.
   */
  it('offers the Take App once', () => {
    expect((DOWNLOADS.match(/Take for (Android|iOS)/g) ?? [])).toHaveLength(0);
    expect((DOWNLOADS.match(/href: '\/take'/g) ?? [])).toHaveLength(1);
  });

  it('sends the release cards at the page that reads the disk', () => {
    expect((DOWNLOADS.match(/href: '\/downloads'/g) ?? []).length)
      .toBeGreaterThanOrEqual(2);
  });
});

describe('what the desktop build is called', () => {
  /*
   * THE NAME IS THE DECLARATION, so the thing that WRITES the name
   * has to agree with the thing that reads it. electron-builder's
   * own defaults do not: it writes `Take-0.1.0.AppImage`,
   * `take_0.1.0_amd64.deb` and `Take Setup 0.1.0.exe` — three
   * spellings of one product, one with a space in it — and every
   * one of them is refused by `readName`. The convention is stated
   * in the packaging config rather than applied by hand after each
   * build, which is a step somebody forgets once. [D-19]
   */
  const YML = readFileSync('desktop/electron-builder.yml', 'utf8');

  /*
   * HOW `${arch}` CAME OUT, measured from a build of each target
   * rather than assumed. The three differ, from one machine, for
   * one architecture.
   */
  const SPELT = [
    ['linux', 'x86_64', 'AppImage'],
    ['linux', 'amd64', 'deb'],
    ['win', 'x64', 'exe'],
  ] as const;

  it('is named the way the download centre reads names', () => {
    const line = /^artifactName:\s*(.+)$/m.exec(YML);
    expect(line, 'electron-builder.yml sets no artifactName').not.toBeNull();
    const pattern = line![1]!.trim();
    /* Substitute electron-builder's own placeholders and check the
       result against the reader, rather than eyeballing the two. */
    for (const [os, arch, ext] of SPELT) {
      const name = pattern
        .replace('${version}', '0.1.0')
        .replace('${os}', os)
        .replace('${arch}', arch)
        .replace('${ext}', ext);
      expect(readName(name), name).toMatchObject({
        product: 'take-desktop', version: '0.1.0', platform: os, form: ext,
      });
    }
  });

  /*
   * AND THESE ARE THE NAMES A BUILD ACTUALLY WROTE, not names
   * anybody reasoned to. The first version of the reader allowed
   * `x64|arm64|armv7l|ia32`, which is electron-builder's vocabulary
   * for the arch it BUILDS for — and `${arch}` in an artifact name
   * does not expand to that. It expands to whatever the TARGET
   * conventionally calls it, so one build of one machine wrote
   * `…-linux-x86_64.AppImage` and `…-linux-amd64.deb`, and the
   * download centre would have ignored both artefacts of the only
   * platform it can currently build — silently, because an
   * unrecognised name is skipped and not reported.
   *
   * Running the builder is what found it. [U-02]
   */
  it('reads the names one real build wrote', () => {
    expect(readName('take-desktop-0.1.0-linux-x86_64.AppImage'))
      .toMatchObject({ platform: 'linux', form: 'AppImage' });
    expect(readName('take-desktop-0.1.0-linux-amd64.deb'))
      .toMatchObject({ platform: 'linux', form: 'deb' });
  });

  /* And electron-builder's defaults would NOT have been read, which
     is why the line has to be there at all. */
  it('would not have been read under the defaults', () => {
    for (const was of ['Take-0.1.0.AppImage', 'take_0.1.0_amd64.deb',
      'Take Setup 0.1.0.exe']) {
      expect(readName(was), was).toBeNull();
    }
  });
});

describe('what the desktop build looks like once installed', () => {
  /*
   * THE INSTALLER PRINTED ONE LINE AND IT WAS EASY TO READ PAST:
   *
   *   • default Electron icon is used  reason=application icon is not set
   *
   * So every build would have installed under Electron's own logo —
   * in the launcher, in the dock, in the window list and in the
   * `.deb`'s desktop entry. A capture station that looks like a
   * sample application is one somebody is not sure they installed.
   * Found by running the packager, not by reading its config. [U-02]
   */
  const BUILD = readFileSync('desktop/build.mjs', 'utf8');

  it('puts an icon where the packager looks for one', () => {
    const where = /await cp\('([^']+)',\s*'build\/icon\.png'\)/.exec(BUILD);
    expect(where, 'build.mjs copies no launcher icon').not.toBeNull();

    /* AND THE ONE IT COPIES IS THERE, at the size the packager
       asks for — a missing or small source is the same silent
       fallback in a different costume. */
    const from = where![1]!.replace(/^\.\.\//, '');
    const png = readFileSync(from);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
    expect(png.readUInt32BE(16), `${from} is too small`)
      .toBeGreaterThanOrEqual(512);
    expect(png.readUInt32BE(20)).toBeGreaterThanOrEqual(512);
  });

  /*
   * AND IT IS COPIED RATHER THAN KEPT. A second PNG committed under
   * `desktop/` would be the product's mark in two places, and the
   * one nobody looks at is the one that goes stale. [D-19]
   */
  it('keeps the mark in one place', () => {
    expect(readFileSync('.gitignore', 'utf8')).toMatch(/^\/desktop\/build\/$/m);
  });
});

describe('the download centre page', () => {
  const PAGE = readFileSync('app/downloads/DownloadCentre.tsx', 'utf8');

  /*
   * A LOCKED CARD IS NOT A LINK. A control that cannot act looks
   * like a fault, and an anchor to a route that will answer 403 is
   * a control that cannot act. [U-19]
   */
  it('does not draw a locked release as something to click', () => {
    expect(PAGE).toMatch(/aria-disabled="true"/);
    expect(PAGE).toMatch(/open\s*\n?\s*\?\s*\(/);
  });

  /*
   * THREE STATES AND THREE SENTENCES: no code configured, a code
   * nobody has typed, and open. A page that showed the same locked
   * card for the first two would send somebody hunting a code that
   * does not exist. [D-21]
   */
  it('tells an unconfigured installation apart from a locked one', () => {
    expect(PAGE).toMatch(/data-testid="downloads-unconfigured"/);
    expect(PAGE).toMatch(/data-testid="downloads-unlock"/);
    expect(PAGE).toMatch(/BALANCEVID_ACTIVATION/);
  });

  /* And an installation with no release files says what to do. */
  it('says what to do when there is nothing to offer', () => {
    expect(PAGE).toMatch(/data-testid="downloads-empty"/);
    expect(PAGE).toMatch(/HOW_TO_NAME/);
  });

  /*
   * ONE SECTION, SO THE GROUND HAS TO BE ITS OWN. `.bv-site` paints
   * `--paper`, which the gateway's eleven alternating sections
   * cover; this page is one band, and on any screen taller than it
   * the paper showed as a stripe of near-white below the page —
   * found in a browser run, where it read as the page having
   * stopped. [gateway.css]
   */
  it('does not leave the gateway\u2019s paper showing under one band', () => {
    expect(PAGE).toMatch(/bv-one-band/);
    const sheet = readFileSync('app/gateway/gateway.css', 'utf8');
    expect(sheet).toMatch(/\.bv-site\.bv-one-band\{[^}]*min-height:100vh/);
    /* The same colour the section itself paints, so the two cannot
       disagree about where the band ends. */
    const band = /\.bv-site \.downloads\{[^}]*background:(#[0-9a-f]{6})/.exec(sheet);
    expect(sheet).toMatch(
      new RegExp(`\\.bv-site\\.bv-one-band\\{[^}]*background:${band![1]}`));
  });

  /*
   * THE CODE IS POSTED AND NOT PUT IN A URL, and the page does not
   * keep it afterwards: the server set a cookie, so the page asks
   * the server again rather than remembering. [D-03]
   */
  it('posts the code and then forgets it', () => {
    expect(PAGE).toMatch(/method: 'POST'/);
    expect(PAGE).toMatch(/router\.refresh\(\)/);
    expect(PAGE).not.toMatch(/localStorage|sessionStorage/);
  });
});
