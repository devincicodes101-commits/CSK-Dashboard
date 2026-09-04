import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, saveConnection } from "@/lib/jobber";
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
  if (!state || !expected || state !== expected) {
    return fail(
      request,
      "That connection attempt could not be verified. Start again from Settings.",
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
