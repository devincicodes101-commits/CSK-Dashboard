import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authorizeUrl } from "@/lib/jobber";

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
export async function GET() {
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
