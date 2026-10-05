/**
 * What is actually in `var/downloads`.  [Doctrine U-02, D-21]
 *
 * THE LIST IS THE DIRECTORY. There is no manifest beside the files
 * saying what they are, because a manifest is a second place to be
 * wrong: an operator who replaces a release and forgets to edit it
 * publishes a card that hands somebody the old build. The name
 * carries the product, the version and the platform; the size is
 * measured; and a file whose name does not say those things is not
 * offered rather than guessed at. [downloads.ts]
 *
 * AND IT IS NOT UNDER AN ACCOUNT. Everything else in `var/` belongs
 * to somebody — `var/accounts/<account>/…`, which is how D-06's
 * isolation is enforced at the data layer. A release binary belongs
 * to the INSTALLATION: there is one copy, every downloader gets the
 * same bytes, and putting it under an account would be claiming an
 * owner it does not have.
 */

import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { type Download, offered, readName } from '../domain/downloads.js';
import { VAR_ROOT } from './paths.js';

export const DOWNLOADS_DIR = join(VAR_ROOT, 'downloads');

/**
 * Everything on offer, measured.
 *
 * A MISSING DIRECTORY IS AN EMPTY ONE and not an error: an
 * installation that has published no releases is the ordinary case,
 * not a fault, and the page it produces says so in words.
 */
export async function listDownloads(): Promise<Download[]> {
  let names: string[];
  try {
    names = await readdir(DOWNLOADS_DIR);
  } catch {
    return [];
  }
  const found = await Promise.all(names.map(async (name) => {
    /* Named first, measured second: a directory called
       `take-desktop-0.1.0-linux-x64.deb` is not a download, and
       neither is anything the convention does not recognise. */
    if (!readName(name)) return null;
    try {
      const about = await stat(join(DOWNLOADS_DIR, name));
      return about.isFile() ? { name, bytes: about.size } : null;
    } catch {
      return null;
    }
  }));
  return offered(found.filter((one): one is { name: string; bytes: number } => one !== null));
}

/**
 * The path of one file, or nothing.
 *
 * THE NAME IS CHECKED AGAINST THE SAME PATTERN THE LISTING USES, and
 * that is the whole of the path safety here: the pattern admits no
 * slash, no dot-dot and no character outside the alphabet it names,
 * so a joined path cannot leave the directory. Checked rather than
 * sanitised — a sanitiser turns an attack into a different file,
 * and this refuses it.
 */
export async function downloadPath(file: string): Promise<string | null> {
  if (!readName(file)) return null;
  const path = join(DOWNLOADS_DIR, file);
  try {
    return (await stat(path)).isFile() ? path : null;
  } catch {
    return null;
  }
}
