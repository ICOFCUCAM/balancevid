import { cookies } from 'next/headers';

import { json } from '../../../src/web/http.js';
import {
  ACTIVATION_COOKIE, NOT_CONFIGURED, activationCode, passHolds,
} from '../../../src/web/activation.js';
import { listDownloads } from '../../../src/store/downloads.js';
import { HOW_TO_NAME } from '../../../src/domain/downloads.js';

export const dynamic = 'force-dynamic';

/**
 * What this installation has, and whether you may have it.
 *   [Doctrine D-21, D-03; TAKE-PLATFORM P6]
 *
 * THE LIST IS NOT A SECRET AND THE FILES ARE. Which platforms a
 * release exists for, and how big it is, is what a person needs to
 * decide whether to ask for the code at all — a gate that will not
 * say what is behind it makes somebody chase an operator to find
 * out whether there is a Windows build. The BYTES are what the code
 * is for.
 *
 * AND IT SAYS WHICH STATE IT IS IN. `locked` is not inferred by the
 * page from an empty list: an installation with no releases and an
 * installation that has not been given a code are different
 * sentences, and a surface that could not tell them apart would
 * send somebody looking for a code that would not help. [D-21]
 */
export async function GET(): Promise<Response> {
  const configured = activationCode() !== null;
  const open = configured
    && await passHolds((await cookies()).get(ACTIVATION_COOKIE)?.value);
  return json({
    downloads: await listDownloads(),
    /* Three states, not two: no code set, code set and not given, given. */
    gate: !configured ? 'unconfigured' : open ? 'open' : 'locked',
    ...(configured ? {} : { note: NOT_CONFIGURED }),
    how: HOW_TO_NAME,
  });
}
