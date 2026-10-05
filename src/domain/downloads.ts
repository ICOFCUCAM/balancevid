/**
 * What this installation actually has to give somebody.
 *   [Doctrine D-21, U-02, D-19; TAKE-PLATFORM P6]
 *
 * A DOWNLOAD CENTRE IS SIX CARDS AND SIX CHANCES TO LIE. The gateway
 * offered "Take for Android", "Take for iOS", "BalanceVid Windows",
 * "BalanceVid Linux", "Self-hosted Installation" and "System
 * Requirements"; four of the six went to `#`, one went to a page
 * that was not installable, and one named a product this repository
 * does not build. Six cards, one working door.
 *
 * SO THE LIST IS READ OFF THE DISK AND NOT OUT OF A CONFIGURATION.
 * What is offered is what an operator has actually put in
 * `var/downloads/`, measured — name, size — at the moment somebody
 * asks. A card for a file that is not there is the fault this
 * module exists to make impossible. [U-02]
 *
 * AND THE NAME IS THE DECLARATION. There is no manifest beside the
 * files saying what they are, because a manifest is a second place
 * to be wrong: an operator who renames a file and forgets the
 * manifest publishes a card that downloads something else. The name
 * carries the product, the version and the platform, and a file
 * whose name does not say those things is not offered at all —
 * refused rather than guessed at.
 */

/** What is being installed, which is not always what wrote it. */
export type Product = 'take-desktop' | 'take' | 'balancevid';

export type Platform = 'linux' | 'win' | 'mac' | 'android' | 'server';

export interface Download {
  /** Exactly as it sits on disk, which is also how it is asked for. */
  file: string;
  product: Product;
  version: string;
  platform: Platform;
  /** `AppImage`, `deb`, `exe`, `dmg`, `apk`, `tar.gz`, `zip`. */
  form: string;
  bytes: number;
}

/*
 * THE ONE PATTERN, and the one place the convention is written.
 *
 *   take-desktop-0.1.0-linux-x86_64.AppImage
 *   take-desktop-0.1.0-linux-amd64.deb
 *   take-desktop-0.1.0-win-x64.exe
 *   take-0.1.0-android.apk
 *   balancevid-0.1.0-server.tar.gz
 *
 * THE ARCHITECTURE IS WHATEVER THE BUILDER CALLS IT, and this was
 * found by running one rather than by reading about it. The first
 * version of this pattern listed `x64|arm64|armv7l|ia32`, which is
 * electron-builder's own vocabulary for the arch it is BUILDING
 * for — and `${arch}` in an artifact name does not expand to that.
 * It expands to whatever the TARGET conventionally calls it, so one
 * build of one architecture wrote:
 *
 *   take-desktop-0.1.0-linux-x86_64.AppImage     (AppImage's word)
 *   take-desktop-0.1.0-linux-amd64.deb           (Debian's word)
 *
 * Neither of which the pattern admitted, so the download centre
 * would have ignored both artefacts of the only platform it can
 * currently build — silently, because an unrecognised name is
 * skipped rather than reported. [U-02]
 *
 * So the segment is taken as it comes. It is not read, not shown
 * and not compared: a person choosing a download picks a PLATFORM,
 * and an installation offering two architectures of one platform
 * is a problem this product does not have yet. It is in the
 * pattern only so that such a file is ACCEPTED rather than
 * dropped, and the alphabet is still closed — no dot, no slash,
 * nothing that could reach outside the directory.
 */
const NAMED = new RegExp(
  '^(take-desktop|take|balancevid)'
  + '-([0-9][0-9A-Za-z.+-]*?)'
  + '-(linux|win|mac|android|server)'
  + '(?:-([A-Za-z0-9_]{1,16}))?'
  + '\\.(AppImage|deb|rpm|exe|dmg|pkg|apk|tar\\.gz|zip)$',
);

/**
 * Read one file name, or refuse it.
 *
 * REFUSED RATHER THAN GUESSED AT, because the alternative is a card
 * headed `Unknown` offering a file nobody can account for — and a
 * download centre is the one surface where "I am not sure what this
 * is" must never be answered with a button. [D-21]
 */
export function readName(file: string): Omit<Download, 'bytes'> | null {
  const found = NAMED.exec(file);
  if (!found) return null;
  const [, product, version, platform, , form] = found;
  return {
    file,
    product: product as Product,
    version: version!,
    platform: platform as Platform,
    form: form!,
  };
}

/** The convention, said once, for the page that has nothing to show. */
export const HOW_TO_NAME =
  'Put release files in var/downloads named '
  + '<product>-<version>-<platform>[-<arch>].<form> — for example '
  + 'take-desktop-0.1.0-linux-x64.AppImage or '
  + 'balancevid-0.1.0-server.tar.gz. Anything else is ignored.';

/**
 * Everything on offer, newest version first within a product.
 *
 * SORTED SO THE SAME PAGE COMES BACK TWICE. `readdir` answers in
 * whatever order the filesystem feels like, and a download centre
 * whose cards move between reloads is one somebody misreads.
 */
export function offered(
  files: readonly { name: string; bytes: number }[],
): Download[] {
  return files
    .map((one) => {
      const read = readName(one.name);
      return read ? { ...read, bytes: one.bytes } : null;
    })
    .filter((one): one is Download => one !== null)
    .sort((a, b) => a.product.localeCompare(b.product)
      || a.platform.localeCompare(b.platform)
      || b.version.localeCompare(a.version, undefined, { numeric: true })
      || a.form.localeCompare(b.form));
}

/** `412 MB`, `9.4 MB`, `812 KB` — what a person decides on. */
export function sizeSays(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
  }
  if (bytes >= 10 * 1024 * 1024) return `${Math.round(bytes / (1024 ** 2))} MB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 ** 2)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
