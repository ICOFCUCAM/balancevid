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

import { isAssetPath, mayBePublic } from './src/auth/policy.js';
import { SESSION_COOKIE, verifySession } from './src/auth/session.js';

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

  if (mayBePublic(pathname, request.method)) return NextResponse.next();
  return deny(request, 'sign in to see this');
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
