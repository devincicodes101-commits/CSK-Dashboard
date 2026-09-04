import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, saveConnection } from "@/lib/jobber";

/**
 * Where Jobber sends the browser back after someone approves the app.
 *
 * This URL must match the callback registered on the Jobber app exactly,
 * including the absence of a trailing slash. A mismatch fails at the token
 * exchange below with a message that does not say so clearly, which is why
 * the error is passed through verbatim.
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

  try {
    const tokens = await exchangeCode(code);
    await saveConnection(tokens, null);
  } catch (error) {
    return fail(request, error instanceof Error ? error.message : String(error));
  }

  const done = NextResponse.redirect(new URL("/settings?connected=jobber", request.url));
  done.cookies.delete("jobber_oauth_state");
  return done;
}

function fail(request: NextRequest, message: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}
