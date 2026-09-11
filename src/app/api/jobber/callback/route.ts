import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, redirectUri, saveConnection } from "@/lib/jobber";
import { fetchAccountName } from "@/lib/jobber-queries";

/**
 * Where Jobber sends the browser back after someone approves the app.
 *
 * This URL must match the callback registered on the Jobber app exactly,
 * including the absence of a trailing slash. A mismatch fails at the token
 * exchange with a message that does not say so clearly, which is why the
 * error is passed straight through rather than tidied.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const denied = params.get("error");
  if (denied) {
    return fail(request, `Jobber refused the connection: ${denied}`);
  }

  const code = params.get("code");
  const state = params.get("state");
  const expected = request.cookies.get("jobber_oauth_state")?.value;

  if (!code) return fail(request, "Jobber did not return an authorisation code.");

  // Missing and mismatched mean different things, and conflating them sends
  // people hunting for a security problem when they simply took too long.
  if (!expected) {
    /**
     * NEVER report success from here.
     *
     * This used to check whether a connection was already stored and, if so,
     * redirect as though the reconnect had worked — on the theory that
     * arriving without a state cookie meant the callback was being replayed
     * by a refresh or the back button.
     *
     * It cost two days. Every reconnect arrived without the cookie, because
     * each was started from a Vercel deployment URL while the registered
     * callback returns to the canonical host — so the cookie was set on one
     * host and read on another. This branch saw a stored connection, threw
     * away a perfectly good authorisation code, and sent the browser to
     * "Connected to CSK Electric Inc". Meanwhile the row in the database
     * stayed two days old and every scheduled sync failed on a spent refresh
     * token.
     *
     * A screen that says connected while nothing was saved is worse than any
     * error message. The connect route now bounces to the right host first,
     * so this should be unreachable; if it is reached, it says so.
     */
    return fail(
      request,
      "The connection could not be verified: no state cookie came back with " +
        "this callback. That usually means the flow was started on a " +
        "different address from the one Jobber returns to. Open Settings on " +
        `${new URL(redirectUri()).origin} and click Connect there.`,
    );
  }
  if (!state || state !== expected) {
    return fail(
      request,
      "The value Jobber sent back did not match the one we issued, so the " +
        "connection was refused. Start again from Settings.",
    );
  }

  let account: string | null = null;
  try {
    const tokens = await exchangeCode(code);
    await saveConnection(tokens, null);

    // Immediately ask Jobber whose account this is, and store the answer.
    // "Connected to CSK Electric Inc" is a far better thing for the settings
    // screen to say than a green tick, because whoever signed in decided
    // whose data we read — and it is not obvious from anywhere else.
    account = await fetchAccountName();
    await saveConnection(tokens, account);
  } catch (error) {
    return fail(request, error instanceof Error ? error.message : String(error));
  }

  const url = new URL("/settings", request.url);
  url.searchParams.set("connected", "jobber");
  if (account) url.searchParams.set("account", account);

  const done = NextResponse.redirect(url);
  done.cookies.delete("jobber_oauth_state");
  return done;
}

function fail(request: NextRequest, message: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}
