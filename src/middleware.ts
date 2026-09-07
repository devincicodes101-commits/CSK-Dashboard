import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authConfigured, isValidSession } from "@/lib/auth";

/**
 * Nothing is served without a session, apart from the pages that must be
 * public.
 *
 * Fails CLOSED. If DASHBOARD_PASSWORD is missing the dashboard refuses to
 * render rather than falling open — a misconfigured deploy that quietly
 * published CSK's bank balance is exactly the failure this exists to prevent.
 *
 * The policy pages stay public because Intuit fetches them during review and
 * a privacy policy behind a login is no privacy policy at all.
 */

const PUBLIC = new Set(["/login", "/privacy", "/terms"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC.has(pathname) || pathname === "/api/auth") {
    return NextResponse.next();
  }

  if (!authConfigured()) {
    return new NextResponse(
      "This dashboard has no passphrase configured, so it will not serve " +
        "anything. Set DASHBOARD_PASSWORD and redeploy.",
      { status: 503, headers: { "content-type": "text/plain" } },
    );
  }

  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }

  // Remember where they were headed. An OAuth callback that lands on the
  // login screen must still complete afterwards, or connecting a system while
  // signed out silently loses the authorisation code.
  const login = new URL("/login", request.url);
  login.searchParams.set("next", pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
