import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Optimistic check: only looks for the session cookie, no DB hit.
// Pages and data access must still validate the session with auth.api.getSession.
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", pathname + search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/collection", "/collection/:path*"],
};
