import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  issueSession,
  passphraseMatches,
  sessionCookieOptions,
} from "@/lib/auth";

/**
 * Signing in, and signing out.
 *
 * The delay on a wrong passphrase is not decoration. There is one shared
 * secret and this endpoint is public, so without it an attacker gets as many
 * guesses per second as the network allows.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const given = String(form.get("passphrase") ?? "");
  const next = String(form.get("next") ?? "/");

  // Only ever return somewhere on this site.
  const target = new URL(next.startsWith("/") ? next : "/", request.url);

  if (!passphraseMatches(given)) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const login = new URL("/login", request.url);
    login.searchParams.set("error", "1");
    login.searchParams.set("next", next);
    return NextResponse.redirect(login, { status: 303 });
  }

  const response = NextResponse.redirect(target, { status: 303 });
  response.cookies.set(SESSION_COOKIE, await issueSession(), sessionCookieOptions());
  return response;
}

/** Sign out. */
export async function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL("/login", request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
