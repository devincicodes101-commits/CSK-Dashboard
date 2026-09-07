/**
 * Who is allowed to see CSK's figures.
 *
 * A shared passphrase, held in a signed httpOnly cookie. Deliberately modest,
 * and worth being honest about what it is and is not.
 *
 * WHY THIS, AND WHY NOW
 *
 * The dashboard was public. Anyone with the URL could read CSK's revenue,
 * margins, win rates and client names — and connecting QuickBooks was about
 * to add their bank balance to that. Intuit's own production questionnaire
 * asked whether the app authenticates, which is how it surfaced. Shipping
 * something today beats designing something better next week.
 *
 * WHAT IT IS NOT
 *
 * There are no individual accounts, so there is no per-person revocation and
 * no record of who looked. If someone leaves, the passphrase changes for
 * everyone. Proper accounts — Supabase Auth against an allowlist — are the
 * upgrade, and the environment already carries ALLOWED_EMAILS for it.
 *
 * Uses Web Crypto rather than node:crypto so the same code runs in middleware
 * on the edge runtime.
 */

const COOKIE = "csk_session";

/** Thirty days. Long enough not to nag, short enough to expire a stale laptop. */
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const SESSION_COOKIE = COOKIE;

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  };
}

function secret(): string {
  const value = process.env.DASHBOARD_PASSWORD?.trim();
  if (!value) {
    throw new Error(
      "DASHBOARD_PASSWORD is not set. The dashboard refuses to serve CSK's " +
        "figures without one rather than falling open.",
    );
  }
  return value;
}

/** True when a passphrase is configured at all. */
export function authConfigured(): boolean {
  return Boolean(process.env.DASHBOARD_PASSWORD?.trim());
}

async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(`csk-dashboard-session:${secret()}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return base64url(new Uint8Array(mac));
}

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A cookie value proving the passphrase was given, valid until it expires. */
export async function issueSession(): Promise<string> {
  const expires = String(Date.now() + MAX_AGE_SECONDS * 1000);
  return `${expires}.${await sign(expires)}`;
}

export async function isValidSession(value: string | undefined): Promise<boolean> {
  if (!value) return false;

  const dot = value.lastIndexOf(".");
  if (dot < 1) return false;

  const expires = value.slice(0, dot);
  const mac = value.slice(dot + 1);

  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;

  // Compare in constant time. A timing oracle on a session cookie is a
  // stretch, but the fix is three lines.
  const expected = await sign(expires);
  if (expected.length !== mac.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ mac.charCodeAt(i);
  }
  return diff === 0;
}

/** Constant-time passphrase check. */
export function passphraseMatches(given: string): boolean {
  const expected = secret();
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}
