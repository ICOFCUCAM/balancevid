/**
 * Finding a BalanceVid on this machine.
 *   [TAKE-DESKTOP T-2; TAKE-PLATFORM P24; Doctrine U-19]
 *
 * > *"directly if it is a selfhost balancevid server, it can
 * > automatically connect"*
 *
 * A SELF-HOSTED INSTALLATION IS USUALLY THE SAME MACHINE AS THE
 * CAPTURE STATION, and the operator was being asked to type its
 * address anyway. What *automatically* can honestly mean is
 * that the address is already filled in and named — not that
 * the station silently points four cameras at whatever answered
 * on port 3000.
 */

import { describe, expect, it } from 'vitest';

import { NEARBY, nearby } from '../../desktop/src/nearby.js';

/** An installation answering `/api/participate`, or not. */
function listening(on: Record<string, { name: string; origin: string } | null>) {
  const asked: string[] = [];
  const was = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL) => {
    const at = String(url);
    asked.push(at);
    const who = Object.entries(on)
      .find(([origin]) => at.startsWith(origin))?.[1];
    if (!who) throw new Error('connection refused');
    return new Response(JSON.stringify({
      instance: who, participate: [], calls: [],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { asked, restore: () => { globalThis.fetch = was; } };
}

describe('what is listening on this computer (T-2)', () => {
  /*
   * LOOPBACK ONLY, AND THAT IS THE WHOLE OF ITS SAFETY. A
   * capture station that swept the subnet for things answering
   * `/api/participate` would be a program doing something
   * nobody asked it to on somebody else's wifi — and the hall
   * it is standing in is as likely to be a school's as a
   * studio's.
   */
  it('looks at this computer and nowhere else', () => {
    for (const origin of NEARBY) {
      expect(origin).toMatch(/^http:\/\/(localhost|127\.0\.0\.1):\d+$/);
    }
  });

  it('finds a studio running here', async () => {
    const net = listening({
      'http://localhost:3000': {
        name: 'My Studio', origin: 'http://localhost:3000',
      },
    });
    try {
      const found = await nearby(NEARBY, 200);
      expect(found).toHaveLength(1);
      expect(found[0]!.instance.name).toBe('My Studio');
    } finally {
      net.restore();
    }
  });

  /*
   * ONE PER INSTALLATION. `localhost:3000` and `127.0.0.1:3000`
   * are the same server answering twice, and offering both
   * would be asking somebody to choose between two spellings
   * of one thing. The instance's own origin is what makes them
   * the same.
   */
  it('offers one server once, however many ways it answers', async () => {
    const same = { name: 'My Studio', origin: 'http://localhost:3000' };
    const net = listening({
      'http://localhost:3000': same,
      'http://127.0.0.1:3000': same,
    });
    try {
      expect(await nearby(NEARBY, 200)).toHaveLength(1);
    } finally {
      net.restore();
    }
  });

  /*
   * AND TWO DIFFERENT SERVERS ON THE SAME PORT ARE STILL TWO.
   * `localhost` can resolve to `::1` where `127.0.0.1` is the
   * v4 stack, so the port alone is not identity — the name is
   * what tells them apart when it happens, and nothing that
   * is actually different is hidden. [U-19]
   */
  it('offers two when the same port answers with two names', async () => {
    const net = listening({
      'http://localhost:3000': { name: 'Mine', origin: 'http://localhost:3000' },
      'http://127.0.0.1:3000': { name: 'Theirs', origin: 'http://127.0.0.1:3000' },
    });
    try {
      expect((await nearby(NEARBY, 200)).map((one) => one.instance.name))
        .toEqual(['Mine', 'Theirs']);
    } finally {
      net.restore();
    }
  });

  /* Two real installations on one laptop are two offers. */
  it('offers two when there are two', async () => {
    const net = listening({
      'http://localhost:3000': { name: 'One', origin: 'http://localhost:3000' },
      'http://localhost:3001': { name: 'Two', origin: 'http://localhost:3001' },
    });
    try {
      expect((await nearby(NEARBY, 200)).map((one) => one.instance.name))
        .toEqual(['One', 'Two']);
    } finally {
      net.restore();
    }
  });

  /*
   * AND NOTHING WHERE NOTHING ANSWERED, which is every station
   * connecting to a cloud installation. A line reading *no
   * local server found* would be an error message about
   * something nobody was looking for. [U-19]
   */
  it('says nothing when nothing is there', async () => {
    const net = listening({});
    try {
      expect(await nearby(NEARBY, 200)).toEqual([]);
    } finally {
      net.restore();
    }
  });

  /*
   * IN THE ORDER OF THE LIST, NOT OF WHO ANSWERED FIRST. The
   * same machine must offer the same thing twice running — a
   * list that reordered itself between two openings of the
   * same screen is a list an operator stops trusting.
   */
  it('is in the same order every time', async () => {
    const net = listening({
      'http://localhost:3001': { name: 'Two', origin: 'http://localhost:3001' },
      'http://localhost:3000': { name: 'One', origin: 'http://localhost:3000' },
    });
    try {
      const a = (await nearby(NEARBY, 200)).map((one) => one.origin);
      const b = (await nearby(NEARBY, 200)).map((one) => one.origin);
      expect(a).toEqual(b);
      expect(a[0]).toBe('http://localhost:3000');
    } finally {
      net.restore();
    }
  });
});
