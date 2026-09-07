/**
 * Keeping the Jobber connection in an encrypted cookie.
 *
 * WHY THIS EXISTS
 *
 * The tokens have to outlive one serverless instance or the connection drops
 * between page loads. Normally that means a database. This is the version
 * that needs no database and no new account: the browser carries the tokens,
 * so every instance can read them.
 *
 * WHAT IT CANNOT DO — read this before relying on it
 *
 *   - It only works for a signed-in browser. The Tuesday night sync has no
 *     browser, so the scheduled report still needs real storage.
 *   - Weeks cannot be frozen. Freezing is what stops a figure screenshotted
 *     in August from quietly changing in December.
 *   - Jobber rotates refresh tokens, so two tabs refreshing at the same
 *     moment will break the connection and need a reconnect.
 *
 * It is a bridge, not a destination. token-store.ts prefers Supabase or a KV
 * store whenever either is configured.
 *
 * SECURITY
 *
 * AES-256-GCM, with the key derived from JOBBER_CLIENT_SECRET so no new
 * secret has to be created and stored. The cookie is httpOnly and secure, so
 * page scripts cannot read it. Anyone holding the cookie holds read access to
 * CSK's Jobber — which is the same thing as holding the browser session, and
 * why it is httpOnly rather than merely signed.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { StoredTokens } from "./token-store";

export const SESSION_COOKIE = "jobber_session";

/** Six months. The refresh token outlives the cookie either way. */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 180;

function key(): Buffer {
  const secret = process.env.JOBBER_CLIENT_SECRET?.trim();
  if (!secret) throw new Error("JOBBER_CLIENT_SECRET is not set.");
  // A hash, not the secret itself: AES needs exactly 32 bytes, and the client
  // secret is neither that length nor uniformly distributed.
  return createHash("sha256").update(`csk-jobber-session:${secret}`).digest();
}

export function seal(tokens: StoredTokens): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([
    cipher.update(JSON.stringify(tokens), "utf8"),
    cipher.final(),
  ]);
  // iv.tag.body, each base64url so it survives a cookie unescaped.
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    body.toString("base64url"),
  ].join(".");
}

/**
 * Returns null rather than throwing on anything malformed.
 *
 * A cookie can be truncated, stale from an older format, or encrypted under a
 * previous client secret. All of those mean "not connected", which the app
 * already handles; none of them should be a 500 on the dashboard.
 */
export function unseal(value: string | undefined): StoredTokens | null {
  if (!value) return null;
  try {
    const [ivPart, tagPart, bodyPart] = value.split(".");
    if (!ivPart || !tagPart || !bodyPart) return null;

    const decipher = createDecipheriv(
      "aes-256-gcm",
      key(),
      Buffer.from(ivPart, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagPart, "base64url"));

    const json = Buffer.concat([
      decipher.update(Buffer.from(bodyPart, "base64url")),
      decipher.final(),
    ]).toString("utf8");

    const parsed = JSON.parse(json) as StoredTokens;
    if (!parsed?.accessToken || !parsed?.refreshToken) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SESSION_MAX_AGE,
} as const;
