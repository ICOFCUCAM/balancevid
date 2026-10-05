/**
 * The gate.  [Doctrine D-03, D-06, U-31]
 *
 * Every request passes through here, so a route added tomorrow is private
 * unless someone deliberately makes it public. The reverse — a default-open
 * gate with a list of things to protect — fails the moment anyone forgets to
 * add to the list, and that failure is silent.
 *
 * Only the SESSION is checked here. Whether a particular conversation is
 * published is checked by the route that loads it, because that answer lives
 * in the document and middleware has no business reading storage.
 */

import { NextResponse, type NextRequest } from 'next/server';

import { GATEWAY_PATH, isAssetPath, mayBePublic } from './src/auth/policy.js';
import { SESSION_COOKIE, verifySession } from './src/auth/session.js';
import { landingFor } from './src/web/hosting.js';

export const config = {
  // Everything except Next's own build output. `_next/static` is hashed
  // bundles and `_next/image` is a transform of files we already gate.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (isAssetPath(pathname)) return NextResponse.next();

  // Read the hash from the environment rather than importing the config
  // module: that one uses node:crypto, which does not exist out here.
  const passwordHash = process.env['BALANCEVID_PASSWORD_HASH']?.trim();
  const plain = process.env['BALANCEVID_PASSWORD']?.trim();

  /*
   * Locked. Nothing is configured, so nothing is served — including the
   * published pages, because an unconfigured instance has no owner to have
   * published anything on purpose. The sign-in page explains itself.
   */
  if (!passwordHash && !plain) {
    if (pathname === '/signin' || pathname === '/api/health') return NextResponse.next();
    return deny(request, 'this instance has no password configured');
  }

  /*
   * A STATION'S OWN FRONT DOOR.  [TV-NETWORK N-8]
   *
   * Before the session is looked at, because a custom host is a
   * public station whoever is asking — and after the lock above,
   * because an unconfigured instance serves nothing to anybody.
   *
   * THE DECISION IS `landingFor`'s AND THE LOOKUP IS THE PAGE'S.
   * This still reads no storage: it knows only that the host is
   * not the one this installation answers to, so the rewrite
   * sends the request somewhere that can go and ask.
   *
   * WITH `BALANCEVID_HOST` UNSET EVERY REQUEST IS `own`, which is
   * exactly what this file did before the branch existed.
   */
  const landing = landingFor({
    host: request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
    ownHost: process.env['BALANCEVID_HOST'],
    pathname,
    search: request.nextUrl.search,
    proto: request.headers.get('x-forwarded-proto'),
  });
  if (landing.kind === 'station') {
    return NextResponse.rewrite(new URL(landing.to, request.url));
  }
  if (landing.kind === 'canonical') {
    /* 308, not 302: the canonical address is permanent and a
       television or a crawler should stop asking the other one. */
    return NextResponse.redirect(landing.to, 308);
  }

  const signedIn = passwordHash
    ? await verifySession(request.cookies.get(SESSION_COOKIE)?.value, passwordHash)
    // With only a plaintext password set, the hash is computed per process and
    // the session cannot be verified out here. The route layer still checks.
    : Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (signedIn) {
    // Signed in and heading for the sign-in page: nothing to do there.
    if (pathname === '/signin') {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  if (!mayBePublic(pathname, request.method)) {
    return deny(request, 'sign in to see this');
  }

  /*
   * THE PUBLIC SITE, AT THE PUBLIC ADDRESS.  [TV-NETWORK N-1]
   *
   * > *"keep `balancevid.com` → public BalanceVid/product
   * > gateway and `balancevid.com/app/...` → authenticated
   * > production environment."*
   *
   * SIGNED OUT GETS THE GATEWAY; SIGNED IN GETS THE BUILDING —
   * and the branch is here because this is where the session
   * already is. A page that asked the question a second time
   * would be a second opinion about who is signed in, and the
   * day the two disagreed one of them would be showing the
   * marketing site to the owner or the control room to a
   * stranger. [D-19, D-24]
   *
   * A REWRITE AND NOT A REDIRECT. The address of the public site
   * is `/`, which is what gets printed on things, shared, and
   * indexed; `/gateway` is where the page happens to live.
   * `mayBePublic` has already refused anything that is not a GET
   * or a HEAD, so this cannot swallow a POST.
   */
  if (pathname === '/') {
    return NextResponse.rewrite(new URL(GATEWAY_PATH, request.url));
  }

  return NextResponse.next();
}

/**
 * A browser gets the sign-in page; an API caller gets 401 JSON.
 *
 * Redirecting a fetch() to an HTML page turns "you are signed out" into a JSON
 * parse error three layers away from the cause.
 */
function deny(request: NextRequest, message: string): NextResponse {
  const { pathname, search } = request.nextUrl;
  const wantsJson = pathname.startsWith('/api/')
    || request.headers.get('accept')?.includes('application/json');

  if (wantsJson) {
    return new NextResponse(JSON.stringify({ error: message }), {
      status: 401,
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }

  const signin = new URL('/signin', request.url);
  // Only a same-site path, so this cannot be turned into an open redirect.
  if (pathname !== '/') signin.searchParams.set('next', `${pathname}${search}`);
  return NextResponse.redirect(signin);
}
