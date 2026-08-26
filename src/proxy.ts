import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * Optimistic gate in front of the dashboard: it keeps signed-out visitors off
 * the page and signed-in ones off the login form. The dashboard route checks
 * the session again server-side, which is what actually enforces access.
 *
 * Next.js 16 renamed `middleware` to `proxy`; the function must be named
 * `proxy` and always runs on the Node.js runtime.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const signedIn = token ? await verifySessionToken(token) : false;

  if (pathname.startsWith("/dashboard") && !signedIn) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (pathname === "/login" && signedIn) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login"],
};
