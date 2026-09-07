import { NextResponse, type NextRequest } from "next/server";
import { exchangeCode, saveConnection } from "@/lib/quickbooks";
import { loadTokens } from "@/lib/token-store";

/**
 * Where QuickBooks sends the browser back.
 *
 * Unlike Jobber, the company is not implied by the token: Intuit returns a
 * `realmId` on this callback and every later API call needs it. Losing it
 * makes the tokens address nothing, so it is stored with them and the
 * connection is refused outright if it is missing.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const denied = params.get("error");
  if (denied) return fail(request, `QuickBooks refused the connection: ${denied}`);

  const code = params.get("code");
  const state = params.get("state");
  const realm = params.get("realmId");
  const expected = request.cookies.get("qbo_oauth_state")?.value;

  if (!code) return fail(request, "QuickBooks did not return an authorisation code.");

  if (!realm) {
    return fail(
      request,
      "QuickBooks did not return a company id, so there is nothing to read " +
        "from. Start again from Settings.",
    );
  }

  // A replayed callback — refresh, or the back button after it worked — is
  // not an error if the connection is in fact stored. Same reasoning as the
  // Jobber callback.
  if (!expected) {
    const existing = await loadTokens("quickbooks").catch(() => null);
    if (existing) {
      const settled = new URL("/settings", request.url);
      settled.searchParams.set("connected", "quickbooks");
      return NextResponse.redirect(settled);
    }
    return fail(
      request,
      "That connection attempt expired, or its link had already been used. " +
        "Click Connect QuickBooks to start a fresh one.",
    );
  }

  if (!state || state !== expected) {
    return fail(
      request,
      "The value QuickBooks sent back did not match the one we issued, so the " +
        "connection was refused. Start again from Settings.",
    );
  }

  try {
    await saveConnection(await exchangeCode(code), realm);
  } catch (error) {
    return fail(request, error instanceof Error ? error.message : String(error));
  }

  const done = NextResponse.redirect(
    new URL("/settings?connected=quickbooks", request.url),
  );
  done.cookies.delete("qbo_oauth_state");
  return done;
}

function fail(request: NextRequest, message: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}
