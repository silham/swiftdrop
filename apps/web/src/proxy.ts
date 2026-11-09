/**
 * Next.js 16 proxy (formerly middleware): fast UX redirect for portal routes when there is no
 * session cookie. This is NOT a security boundary — the API enforces auth on every request and
 * portal layouts call requireRole(). Owner: M2.
 *
 * The access cookie is short-lived. When it has expired, the browser is sent to
 * /api/v1/auth/resume, which can see the refresh cookie (scoped to /api/v1/auth), rotates the
 * session and redirects straight back. With no valid refresh token it ends up on /login.
 */
import { AUTH_COOKIES } from '@swiftdrop/contracts';
import { NextResponse, type NextRequest } from 'next/server';

export function proxy(req: NextRequest) {
  if (!req.cookies.has(AUTH_COOKIES.ACCESS)) {
    const url = new URL('/api/v1/auth/resume', req.url);
    url.searchParams.set('next', req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/customer/:path*',
    '/merchant/:path*',
    '/courier/:path*',
    '/dispatch/:path*',
    '/admin/:path*',
  ],
};
