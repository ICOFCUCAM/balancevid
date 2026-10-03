'use client';

/**
 * The BalanceVid installations this BROWSER takes part in.
 *   [TAKE-PLATFORM U3, P13, P22, P23, P25; TAKE-DESKTOP T-2]
 *
 * *"Imagine you are a musician. Your Take app might have… each a
 * separate production environment. Yet you have one Take App."*
 *
 * THIS IS THAT LIST, AND IT LIVES ON THE DEVICE. Which production
 * companies somebody works with is exactly the kind of thing that
 * must not accumulate centrally — the same argument §12 makes about
 * the footage, turned on the participant. No installation is told
 * which others this person has, and there is no index above them to
 * ask. [P24]
 *
 * WHAT IS LEFT IN THIS FILE IS THE BROWSER'S HALF: `localStorage`,
 * and a `fetch` from a page. The rules — what an origin is, what a
 * stored list may contain, what an installation is allowed to say
 * about itself — moved to `shared/src/connections.ts` when Take
 * Software for desktop arrived, because that application keeps the
 * same list in a file beside its own settings and must not have its
 * own opinion about any of it. [D-19, T-2]
 *
 * `asOrigin` in particular. It carries two bugs found the hard way
 * — `ftp://studio.example` becoming a reachable host called `ftp`,
 * and `localhost:3101` refused as though a port were a scheme — and
 * a second copy would make both again.
 */

import {
  type Connection, type Instance, MOST_CONNECTIONS, asOrigin,
  instanceFrom, readConnectionList, withConnection, withoutConnection,
} from '../../shared/src/connections.js';

import type { CallRow } from '../../src/domain/campaign.js';
import type { Answer, Row } from './home.js';

export { asOrigin };
export type { Connection, Instance };

const KEY = 'balancevid.take.instances';

export function readConnections(): Connection[] {
  try {
    return readConnectionList(window.localStorage.getItem(KEY));
  } catch {
    /* Private browsing, or storage refused. One installation still
       works — the one serving this page. [U-19] */
    return [];
  }
}

function write(list: Connection[]): Connection[] {
  try {
    window.localStorage.setItem(KEY,
      JSON.stringify(list.slice(0, MOST_CONNECTIONS)));
  } catch { /* as above. */ }
  return list;
}

/** Remember an installation, or update what it is called. */
export function addConnection(one: Connection): Connection[] {
  return write(withConnection(readConnections(), one));
}

export function removeConnection(origin: string): Connection[] {
  return write(withoutConnection(readConnections(), origin));
}

/**
 * Ask an installation what it offers.
 *
 * NO CREDENTIALS, EVER, and that is not only a default: this is a
 * cross-origin read of a public listing, and a cookie could only
 * make the answer vary by who is asking — which it must not, because
 * the same listing is served to the owner and to a stranger. `omit`
 * says so where somebody reading this would otherwise have to check.
 */
export async function askInstance(
  origin: string, send: typeof fetch = fetch,
): Promise<Answer | null> {
  try {
    const response = await send(`${origin}/api/participate`, {
      credentials: 'omit',
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = await response.json() as {
      participate?: Row[]; calls?: CallRow[];
    };
    const instance = instanceFrom(origin, data);
    if (!instance) return null;
    /*
     * AND THE CALLS IN THE SAME ANSWER, BECAUSE THEY ARE IN THE
     * SAME ANSWER.  [GO-VIRAL V-4, V-8]
     *
     * `/api/participate` has carried `calls` since V-4 and this
     * function dropped them on the floor — so the Take App home
     * showed none, on any installation, including the one that
     * served it. A capability built and never reached.
     *
     * THIS IS THE WHOLE OF THE WIRE FOR V-8's THIRD CLAIM. One
     * public GET, no credentials, against an origin this device
     * was told to remember. There is no network protocol, because
     * the network is an installation. [P24]
     */
    return {
      instance, rows: data.participate ?? [], calls: data.calls ?? [],
    };
  } catch {
    /* Unreachable, refused by CORS, or not a BalanceVid. A connection
       that cannot be read is shown as such rather than dropped: a
       self-hosted installation on a laptop is often simply asleep. */
    return null;
  }
}
