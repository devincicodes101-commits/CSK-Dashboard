import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authConfigured, isValidSession } from "@/lib/auth";

/**
 * The passphrase gate, enforced only when one is set.
 *
 * DASHBOARD_PASSWORD set   -> everything requires a session
 * DASHBOARD_PASSWORD unset -> the dashboard is public
 *
 * It used to refuse to serve at all without a passphrase. That was the safer
 * default and it was changed on request, so be clear about what the open mode
 * means: anyone with the URL can read CSK's revenue, margins, win rates and
 * client names, and once QuickBooks is connected, their bank balance and who
 * owes them money. There is no obscurity in a Vercel URL.
 *
 * Turning it back on is one environment variable and a redeploy. The login
 * page, the session cookie and the sign-out link all stay in place.
 *
 * The policy pages are public either way: Intuit fetches them during review,
 * and a privacy policy behind a login is not one.
 */

const PUBLIC = new Set(["/login", "/privacy", "/terms"]);

/**
 * Routes that carry their own authentication and must not meet this gate.
 *
 * /api/sync is called by Vercel Cron with a bearer secret. Sending it to the
 * login page would turn a scheduled refresh into a 307 to a form, silently,
 * and the dashboard would go stale the day a passphrase was set.
 */
const SELF_AUTHENTICATING = new Set(["/api/auth", "/api/sync", "/api/diagnostics"]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC.has(pathname) || SELF_AUTHENTICATING.has(pathname)) {
    return NextResponse.next();
  }

  // No passphrase configured: serve everything. See the note above.
  if (!authConfigured()) return NextResponse.next();

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
