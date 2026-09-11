import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeUrl, redirectUri } from "@/lib/jobber";

/**
 * Starts the Jobber connection.
 *
 * Whoever signs in on the screen this redirects to decides which Jobber
 * account we read from. It has to be CSK Electric's own account, not ours.
 *
 * The `state` value is random per attempt and stored in a short-lived cookie.
 * Jobber hands it back on the callback and we compare: without that check,
 * anyone could send Kyle a link that connects our app to *their* Jobber.
 */
/**
 * Start on the host the callback will come back to, or the cookie is lost.
 *
 * The OAuth state is kept in a cookie, and a cookie belongs to one host. The
 * redirect URI registered with Jobber is a fixed address, so beginning the
 * flow anywhere else — a Vercel deployment URL with a hash in it, say — sets
 * the cookie on that host and returns to the canonical one, which never
 * receives it.
 *
 * That is not theoretical. It is what happened here: every reconnect started
 * from a deployment URL, came back without a state cookie, and was written off
 * as a replayed callback. Bounce to the right host first and the cookie is set
 * where it will be read.
 */
function canonical(request: NextRequest, redirectUri: string): NextResponse | null {
  let expected: URL;
  try {
    expected = new URL(redirectUri);
  } catch {
    // A malformed redirect URI is the connection's problem to report, not
    // this guard's. Let the flow continue and fail with a real message.
    return null;
  }

  if (request.nextUrl.origin === expected.origin) return null;

  const here = new URL(request.nextUrl.pathname, expected.origin);
  return NextResponse.redirect(here);
}

export async function GET(request: NextRequest) {
  const onWrongHost = canonical(request, redirectUri());
  if (onWrongHost) return onWrongHost;

  const state = randomBytes(16).toString("hex");

  const response = NextResponse.redirect(authorizeUrl(state));
  response.cookies.set("jobber_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Thirty minutes. Ten was not enough: signing in to Jobber, picking the
    // right account and reading the permissions screen can genuinely take
    // longer, and running out turns into "could not be verified", which
    // sounds like a security problem rather than a timeout.
    maxAge: 1800,
  });
  return response;
}
