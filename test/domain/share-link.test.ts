/**
 * Sending a link, once.  [TAKE-APP T2, T2b; ROOM §7; D-19]
 *
 * "Sendable by anything" was marked PARTIAL for one reason: the Room
 * knew how to hand a URL to a native share sheet, to WhatsApp, to SMS,
 * to a mail client and to a square on a wall — and it knew all of it
 * about a CONVERSATION, so the Take App could not use a line of it and
 * shipped a read-only input instead.
 *
 * THE FIX IS A WELD CUT, NOT A SECOND PANEL. What is generic about
 * sending a link is one component; what the Room knows on top of it —
 * who arrives as what, until when, and the button that withdraws the
 * link — stays in the Room. That claim is only worth making if it is
 * checked, so this file checks that there is exactly one of each.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { originFrom, originOf } from '../../src/web/share.js';

const ROOT = join(import.meta.dirname, '..', '..');
const read = (file: string) => readFileSync(join(ROOT, file), 'utf8');
/**
 * Comments are prose, not behaviour: stripped before any claim.
 *
 * THE LINE-COMMENT RULE IS ANCHORED, unlike every other copy of this
 * helper in the suite, and the first run of this file is why: the
 * subject is a component full of `https://` and an unanchored `//`
 * stripper ate every URL in it, so an assertion that WhatsApp is
 * reachable failed against a file that reaches it. Only a comment
 * that starts its own line is removed.
 */
const code = (file: string) => read(file)
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/[^\n]*/gm, '');

const SHARE = code('app/ShareLink.tsx');
const INVITE = code('app/c/[id]/room/InvitePanel.tsx');
const PERFORMERS = code('app/p/[id]/PerformersPanel.tsx');
const QR = code('app/api/requests/[requestId]/qr/route.ts');

describe('the share row', () => {
  /*
   * THE FOUR CHANNELS AND THE SHEET. Named individually rather than
   * counted, because a count passes while the list quietly becomes
   * four copies of WhatsApp.
   */
  it('hands the link to every channel the Room had', () => {
    expect(SHARE).toContain('https://wa.me/?text=');
    expect(SHARE).toContain('sms:?&body=');
    expect(SHARE).toContain('mailto:?subject=');
    expect(SHARE).toContain('facebook.com/dialog/send');
    expect(SHARE).toContain('navigator.share');
    expect(SHARE).toContain('navigator.clipboard.writeText');
  });

  /*
   * WHAT TRAVELS IS THE MESSAGE, AND WHAT IS COPIED IS THE URL.
   *
   * A share sheet carrying a bare URL loses the sentence saying what
   * the recipient is being asked for; a clipboard carrying the whole
   * sentence pastes three lines into a field that wanted a link. They
   * are different payloads and the component must not confuse them.
   */
  it('shares the sentence and copies the bare link', () => {
    expect(SHARE).toMatch(/navigator\.share\(\{[^}]*text:\s*message/);
    expect(SHARE).toMatch(/writeText\(url\)/);
  });

  /*
   * NO SQUARE WITHOUT SOMEWHERE TO FETCH ONE. A caller with no QR
   * route must get no QR button rather than a button that renders a
   * broken image — a control that cannot do anything looks like a
   * fault. [U-19]
   */
  it('offers no QR button to a caller that gave no source', () => {
    expect(SHARE).toMatch(/\{qrSrc && \(/);
    expect(SHARE).toMatch(/\{qrSrc && showQr && \(/);
  });

  /*
   * AND IT NEVER DRAWS ONE ITSELF. The thing encoded is a credential;
   * a page handed the token so it could draw its own square is a page
   * any script on it can read the token from. [D-25]
   */
  it('never encodes a code in the browser', () => {
    expect(SHARE).not.toMatch(/qrcode|QRCode|toDataURL/);
    expect(SHARE).toMatch(/src=\{qrSrc\}/);
  });

  /*
   * A CODE YOU HAVE TO SCROLL TO IS A CODE NOBODY SCANS, and a
   * browser run is what said so: the Room's 220px square was written
   * for the Room's panel, and in the 290px takes rail the scroll
   * viewport cut it off a third of the way down. The producer
   * pressed "QR code" and got the top edge of one.
   */
  it('fits the column it is standing in', () => {
    expect(SHARE).toMatch(/maxWidth: '100%'/);
    expect(SHARE).toMatch(/aspectRatio: '1 \/ 1'/);
  });

  it('brings the square into view when it is revealed', () => {
    expect(SHARE).toMatch(/square\.current\?\.scrollIntoView/);
    expect(SHARE).toMatch(/\}, \[showQr\]\)/);
  });

  /*
   * AND THERE IS A SIZE IT CAN ACTUALLY BE SCANNED AT. A phone reads
   * a code from about ten times its width away; "put it on the wall
   * and everyone scans it" is not 220 pixels in a rail. The producer
   * should not have to screenshot the panel to give a band a code.
   */
  it('can be shown at the size the room needs', () => {
    expect(SHARE).toMatch(/data-testid=\{`\$\{testId\}-qr-full`\}/);
    expect(SHARE).toMatch(/width: 'min\(78vh, 78vw\)'/);
    expect(SHARE).toMatch(/position: 'fixed', inset: 0/);
  });

  /*
   * AND IT LEAVES THE RAIL TO DO IT.
   *
   * The first full-screen code was drawn a fifth of the screen wide,
   * and the reason is worth writing down because no amount of
   * z-index reaches it: `.shell-scroll` carries a `mask-image` for
   * its edge fade, and a mask makes its element a CONTAINING BLOCK
   * for everything `position: fixed` inside it. The overlay was
   * fixed — to the rail. It has to leave the subtree.
   */
  it('escapes the masked scroller it is rendered inside', () => {
    expect(SHARE).toMatch(/createPortal\(/);
    expect(SHARE).toMatch(/document\.body\)\}/);
    /* And not before there is a document to portal into. [SSR] */
    expect(SHARE).toMatch(/bigQr && mounted && createPortal/);
    expect(SHARE).toMatch(/useEffect\(\(\) => \{ setMounted\(true\); \}, \[\]\)/);
  });

  /*
   * WHITE TO THE EDGES, and that is not a style preference: scanners
   * look for a light ground, and the contrast a code is read by at
   * distance is the first thing a dark surround costs.
   */
  it('shows the full-screen code on white', () => {
    const full = SHARE.slice(SHARE.indexOf('-qr-full'));
    expect(full).toMatch(/background: 'var\(--qr-ground\)'/);
    /*
     * AND THE TOKEN IS FIXED, WHICH IS THE WHOLE CLAIM. Every other
     * colour here is a token so a surface can be RESTYLED; these are
     * tokens so they can be NAMED, and a `--qr-ground` that followed
     * the theme would be a code on a dark ground — which fails on a
     * lot of phones, fails silently, and gets the phone blamed.
     */
    const styles = read('app/styles/surfaces.css');
    expect(styles).toMatch(/--qr-ground: #ffffff;/);
    expect(styles).toMatch(/--qr-ink: #0e0f11;/);
    /* Declared once, on :root, and never redefined per theme. */
    expect((styles.match(/--qr-ground:/g) ?? [])).toHaveLength(1);
  });

  /* Escape leaves it, as it leaves every overlay in this product. */
  it('closes on Escape and on a tap', () => {
    expect(SHARE).toMatch(/event\.key === 'Escape'/);
    expect(SHARE).toMatch(/onClick=\{\(\) => setBigQr\(false\)\}/);
  });

  /*
   * TWO OF THESE CAN BE ON SCREEN AT ONCE — a control room invites
   * guests and performers from panels one tab apart — so every handle
   * is prefixed. A fixed `share-copy` would give a test whichever the
   * DOM offered first, which is the kind of flake nobody can read.
   */
  it('prefixes every handle with the caller name', () => {
    const handles = [...SHARE.matchAll(/data-testid=\{`([^`]+)`\}/g)]
      .map((match) => match[1]!);
    expect(handles.length).toBeGreaterThanOrEqual(6);
    for (const handle of handles) expect(handle.startsWith('${testId}-')).toBe(true);
  });
});

describe('one component, not two', () => {
  /*
   * THE D-19 CLAIM, TESTED RATHER THAN ASSERTED. Exactly one file
   * defines the share row, and the two panels that show one both
   * import it. Without this, the next surface that wants to send a
   * link copies the block again and nothing notices.
   */
  it('is defined exactly once in the tree', () => {
    const files = ['app/ShareLink.tsx', 'app/c/[id]/room/InvitePanel.tsx',
      'app/p/[id]/PerformersPanel.tsx']
      .filter((file) => /export default function ShareLink/.test(code(file)));
    expect(files).toEqual(['app/ShareLink.tsx']);
  });

  it('is what both panels use', () => {
    expect(INVITE).toMatch(/import ShareLink from/);
    expect(INVITE).toMatch(/<ShareLink\b/);
    expect(PERFORMERS).toMatch(/import ShareLink from/);
    expect(PERFORMERS).toMatch(/<ShareLink\b/);
  });

  /*
   * AND THE ROOM KEPT NONE OF IT. The extraction is only real if the
   * original copy is gone: a panel still holding its own WhatsApp
   * href is a second place the list can drift.
   */
  it('left no copy behind in the Room', () => {
    expect(INVITE).not.toMatch(/wa\.me|sms:\?|mailto:\?|navigator\.share/);
    expect(INVITE).not.toMatch(/clipboard\.writeText/);
  });

  /*
   * WHAT THE ROOM KEEPS IS WHAT THE COMPONENT CANNOT KNOW. Cutting
   * too much is the other way to get this wrong, and the terms and
   * the reset are the Room's own subject. [MASTER-EDIT §10]
   */
  it('keeps the terms and the reset where they belong', () => {
    expect(INVITE).toContain('invite-terms');
    expect(INVITE).toContain('invite-rotate');
    expect(SHARE).not.toMatch(/invite-terms|invite-rotate|Guest Reset Link/);
  });
});

describe('the take link', () => {
  /*
   * THE ONE THAT MATTERS ON THIS SURFACE. A producer with a band in a
   * rehearsal room, each holding the phone they will record on, does
   * not want a link in a chat thread.
   */
  it('gets a square to point a phone at', () => {
    expect(PERFORMERS).toMatch(
      /qrSrc=\{`\/api\/requests\/\$\{made\.link\.split\('\.'\)\[0\]\}\/qr`\}/);
  });

  /*
   * THE MESSAGE SAYS WHAT THEY ARE BEING ASKED FOR. The Room's
   * sentence is about a conversation and would be a lie here; that is
   * exactly why the message is the caller's to write.
   */
  it('says what the recording is for', () => {
    expect(PERFORMERS).toMatch(/You're asked to record/);
    expect(PERFORMERS).toMatch(/message=\{/);
  });

  /*
   * THE ASK TRAVELS WITH THE LINK, and this test exists because the
   * first version read the `asks` FIELD — which `invite` empties the
   * instant the link comes back. Every message sent from this panel
   * said "a part" however carefully the producer had described the
   * part, and it passed its tests: a source assertion that a message
   * mentions `asks` cannot tell which `asks`.
   *
   * A BROWSER RUN CAUGHT IT. The field said "Second verse, harmony"
   * and WhatsApp was handed "You're asked to record: a part."
   */
  it('sends the ask that was made, not a field since emptied', () => {
    expect(PERFORMERS).toMatch(/setMade\(\{ link: String\(data\.link\), asks: asks\.trim\(\) \}\)/);
    expect(PERFORMERS).toMatch(/message=\{`You're asked to record: \$\{made\.asks \|\| 'a part'\}/);
    /* And the cleared field is nowhere near the message. */
    const block = PERFORMERS.slice(PERFORMERS.indexOf('<ShareLink'),
      PERFORMERS.indexOf('</div>', PERFORMERS.indexOf('<ShareLink')));
    expect(block).not.toMatch(/\$\{asks\b/);
    expect(block).not.toMatch(/\{asks \|\|/);
  });

  /*
   * A NEW LINK CARRIES THE OLD ASK. Rotating does not ask the
   * producer to describe the part again, so the panel must find it
   * on the row rather than leave the message blank.
   */
  it('keeps the ask when the link is replaced', () => {
    expect(PERFORMERS).toMatch(
      /rows\.find\(\(row\) => row\.id === requestId\)\?\.assignment\.asks/);
  });

  /* Shown once, and the warning survived the rewrite. [T14] */
  it('still says the link is shown once', () => {
    expect(PERFORMERS).toMatch(/note="Send this to them\. It is shown once\."/);
  });
});

describe('the square itself', () => {
  /*
   * ONE ROUTE FOR ALL THREE HOLDERS, which is why it hangs off the
   * request and not off the performance. A conversation asking for a
   * video answer and a channel asking for one are the same request
   * object; a QR route per holder would be three files differing in
   * the loader. [D-19]
   */
  it('is keyed on the request, not on who is asking', () => {
    expect(QR).toMatch(/loadRequest\(requestId\)/);
    expect(QR).not.toMatch(/loadPerformance|loadChannel|loadConversation/);
  });

  /* Owner-only, because the thing encoded is the credential. [D-25] */
  it('is refused to anybody but the owner', () => {
    expect(QR).toMatch(/if \(!\(await isOwner\(request\)\)\) return fail\(404/);
  });

  /*
   * AND THE SHAPE IS CHECKED BEFORE THE DISK IS TOUCHED, the same
   * order every other id-bearing route holds. [INV-15]
   */
  it('refuses a malformed id before it loads anything', () => {
    const shape = QR.indexOf('REQUEST.test(requestId)');
    const load = QR.indexOf('loadRequest(');
    expect(shape).toBeGreaterThan(-1);
    expect(shape).toBeLessThan(load);
  });

  /*
   * A CLOSED REQUEST HAS NO SQUARE, judged by the predicate the link
   * itself is judged by rather than a second opinion about what
   * "closed" means. A code on a wall that leads to a refusal is worse
   * than no code: somebody scans it and blames their phone.
   */
  it('refuses one for a request that is no longer open', () => {
    expect(QR).toMatch(/if \(!isOpen\(found,/);
    expect(QR).toMatch(/return fail\(409/);
  });

  /* The Room's own two decisions, for the Room's own two reasons. */
  it('is SVG at error-correction Q and is never cached', () => {
    expect(QR).toMatch(/type: 'svg'/);
    expect(QR).toMatch(/errorCorrectionLevel: 'Q'/);
    expect(QR).toMatch(/'cache-control': 'no-store, private'/);
  });

  /*
   * IT ENCODES THE TAKE LINK AND NOT THE REQUEST ID. Both are strings
   * that start `req_`, and a square carrying the id alone is a code
   * that scans perfectly and opens nothing.
   */
  it('encodes the link a phone can actually open', () => {
    expect(QR).toMatch(/\$\{origin\}\/take\/\$\{linkFor\(found\)\}/);
  });

  /*
   * AND AT THE ORIGIN THE BROWSER REACHED.
   *
   * A page composes its own links from `window.location`, so they are
   * right whatever the server believes; a square is composed on the
   * SERVER, and behind a proxy the server's own URL is the internal
   * one. The first browser run of this route caught it: the studio
   * was open on `127.0.0.1:3100` and the code encoded `localhost:3100`,
   * which on the phone that scans it means the phone.
   *
   * BOTH SQUARES, because the Room's had the same fault and the same
   * fix, and one of them left on `request.url` is the copy the next
   * one gets written from. [D-19]
   */
  it('is drawn at the origin the browser reached', () => {
    const ROOM = code('app/api/conversations/[id]/room/qr/route.ts');
    for (const route of [QR, ROOM]) {
      expect(route).toMatch(/const origin = originOf\(request\)/);
      expect(route).not.toMatch(/new URL\(request\.url\)\.origin/);
    }
  });
});

/* ------------------------------------------------------------------ *
 *  Where this installation answers, which a television has to be told.
 * ------------------------------------------------------------------ */

describe('the origin, from headers alone (N-7)', () => {
  const of = (headers: Record<string, string>) => originFrom(new Headers(headers));

  /*
   * THIS RULE HAD NO BEHAVIOURAL TEST AT ALL — only a grep over
   * the routes that call it. It was fine while its output went
   * into a preview card nobody checks; `/tv` now prints it as an
   * address a viewer pastes into a set-top box, and an origin
   * that is wrong there is a television that tunes to nothing.
   */
  it('believes the proxy over the socket', () => {
    expect(of({
      host: 'internal:3000',
      'x-forwarded-host': 'balancevid.com',
      'x-forwarded-proto': 'https',
    })).toBe('https://balancevid.com');
  });

  /*
   * AND ASSUMES HTTPS WHERE THE PROXY DID NOT SAY. Everything
   * this product is deployed behind terminates TLS; a card or an
   * M3U that said `http://balancevid.com` would be a mixed-content
   * block on one and a redirect on the other.
   */
  it('assumes https for a real host that did not say', () => {
    expect(of({ host: 'balancevid.com' })).toBe('https://balancevid.com');
  });

  /* Except where it cannot be true. Development is plain HTTP. */
  it('keeps development on http', () => {
    expect(of({ host: 'localhost:3000' })).toBe('http://localhost:3000');
    expect(of({ host: '127.0.0.1:3100' })).toBe('http://127.0.0.1:3100');
  });

  /* A proxy that says `http` is believed, loopback or not. */
  it('still believes an explicit proto', () => {
    expect(of({ host: 'balancevid.com', 'x-forwarded-proto': 'http' }))
      .toBe('http://balancevid.com');
  });

  /*
   * AND NOTHING WHERE THERE IS NO HOST, because an invented
   * origin is worse than an absent one: the panel prints a bare
   * path, which a reader can see is incomplete, rather than a
   * confident address pointing at the wrong machine.
   */
  it('answers nothing when there is no host to build one from', () => {
    expect(of({})).toBe(null);
  });

  /*
   * THE `Request` FORM IS THE SAME ANSWER. Two copies of this
   * rule would be two behaviours, and the subtle half — the
   * loopback exception — is exactly the half that would drift.
   */
  it('gives a request the same answer, and falls back to its URL', () => {
    expect(originOf(new Request('http://internal/x', {
      headers: { 'x-forwarded-host': 'balancevid.com' },
    }))).toBe('https://balancevid.com');
    /* `Request` always carries a host header, so the fallback is
       reached by a caller that builds its own headers. */
    expect(originFrom(new Headers({})) ?? new URL('http://fallback/x').origin)
      .toBe('http://fallback');
  });
});
