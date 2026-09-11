/**
 * Where OAuth tokens live.
 *
 * Three backends, chosen by what is configured:
 *
 *   supabase  the real one. Survives everything, and the only one a
 *             scheduled job can use, because a cron has no browser.
 *   cookie    encrypted in the visitor's browser. No database, no new
 *             account, and it survives across serverless instances because
 *             the browser carries it. Browsing only — see session-tokens.ts.
 *   memory    one instance, until it restarts. Effectively useless; kept
 *             because it is the honest answer when nothing else is set up.
 *
 * The choice is never silent. backendWarning() puts it on the settings
 * screen, in the visitor's words, along with what it cannot do.
 */

import { cookies } from "next/headers";
import { serviceClient } from "./supabase";
import { COOKIE_OPTIONS, SESSION_COOKIE, seal, unseal } from "./session-tokens";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** When the ACCESS token dies, in epoch milliseconds. */
  expiresAt: number;
  connectedAccount: string | null;
}

export type Backend = "supabase" | "cookie" | "memory";

/** Survives a warm invocation and nothing more. */
const memory = new Map<string, StoredTokens>();

/**
 * A few seconds of memory, so one sync does not read the same row forty times.
 *
 * syncWeek reads the QuickBooks token for the access token, again for the
 * company id, and again inside every API call — six or more reads per week of
 * a row that cannot have changed in between. Twenty weeks of backfill turned
 * that into hundreds of identical queries in a couple of minutes, and Supabase
 * answered one of them with a Gateway Timeout. The dashboard then reported
 * "QuickBooks is not connected", which was true of nothing at all.
 *
 * Ten seconds is long enough to cover a single sync and far too short to
 * matter against a token that lives an hour. Writes update the cache rather
 * than clearing it, so a refresh is immediately visible to its own process.
 */
const CACHE_MS = 10_000;
const cache = new Map<string, { value: StoredTokens | null; at: number }>();

export function backend(): Backend {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "supabase";
  }
  // The cookie needs the client secret for its key; without it there is
  // nothing to encrypt with.
  if (process.env.JOBBER_CLIENT_SECRET) return "cookie";
  return "memory";
}

export function backendWarning(): string | null {
  switch (backend()) {
    case "supabase":
      return null;
    case "cookie":
      return (
        "No database yet, so the connection is kept encrypted in your " +
        "browser. It survives page loads and restarts, and the dashboard " +
        "will fetch on its own. Two things it cannot do: run the scheduled " +
        "Wednesday sync, which has no browser, and freeze a week so it always " +
        "reads the same."
      );
    case "memory":
      return (
        "Neither a database nor a browser session is available, so the " +
        "connection is held in server memory and will be lost on the next " +
        "restart."
      );
  }
}

export async function saveTokens(
  provider: string,
  tokens: StoredTokens,
): Promise<void> {
  switch (backend()) {
    case "supabase": {
      const { error } = await serviceClient()
        .from("oauth_connections")
        .upsert(
          {
            provider,
            access_token: tokens.accessToken,
            refresh_token: tokens.refreshToken,
            expires_at: new Date(tokens.expiresAt).toISOString(),
            connected_account: tokens.connectedAccount,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "provider" },
        );
      if (error) {
        throw new Error(`Could not save the ${provider} connection: ${error.message}`);
      }
      cache.set(provider, { value: tokens, at: Date.now() });
      return;
    }

    case "cookie": {
      // Only a Route Handler may write cookies; a Server Component render
      // cannot. Every call site that saves is a route, and this throws
      // clearly rather than failing silently if that ever stops being true.
      const jar = await cookies();
      try {
        jar.set(SESSION_COOKIE, seal(tokens), COOKIE_OPTIONS);
      } catch {
        throw new Error(
          "Tokens can only be saved from a route handler while running on " +
            "browser-session storage. Configure Supabase or a KV store to " +
            "save from anywhere.",
        );
      }
      return;
    }

    case "memory":
      memory.set(provider, tokens);
      console.warn(
        `[token-store] ${provider} tokens held IN MEMORY; a restart loses them.`,
      );
      return;
  }
}

export async function loadTokens(
  provider: string,
  options: {
    /**
     * Skip the cache.
     *
     * Required by the refresh-race recovery in jobber.ts and quickbooks.ts:
     * those re-read specifically to find out whether ANOTHER instance has
     * rotated the token, and a cached copy of what this instance already had
     * would answer the wrong question and defeat the check entirely.
     */
    fresh?: boolean;
  } = {},
): Promise<StoredTokens | null> {
  const hit = options.fresh ? undefined : cache.get(provider);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const value = await readTokens(provider);
  cache.set(provider, { value, at: Date.now() });
  return value;
}

async function readTokens(provider: string): Promise<StoredTokens | null> {
  switch (backend()) {
    case "supabase": {
      const { data, error } = await serviceClient()
        .from("oauth_connections")
        .select("access_token, refresh_token, expires_at, connected_account")
        .eq("provider", provider)
        .maybeSingle();

      if (error) {
        throw new Error(`Could not read the ${provider} connection: ${error.message}`);
      }
      if (!data) return null;

      return {
        accessToken: data.access_token as string,
        refreshToken: data.refresh_token as string,
        expiresAt: new Date(data.expires_at as string).getTime(),
        connectedAccount: (data.connected_account as string | null) ?? null,
      };
    }

    case "cookie": {
      const jar = await cookies();
      return unseal(jar.get(SESSION_COOKIE)?.value);
    }

    case "memory":
      return memory.get(provider) ?? null;
  }
}

/**
 * Thrown when the access token has expired and the caller cannot refresh it.
 *
 * On browser-session storage a refresh has to happen in a route handler, so
 * that the replacement can be written back — Jobber rotates refresh tokens,
 * and losing the new one breaks the connection for good. A page that hits
 * this redirects through /api/jobber/refresh and comes straight back.
 */
export class TokenExpired extends Error {
  constructor() {
    super("The Jobber access token has expired and needs refreshing.");
    this.name = "TokenExpired";
  }
}
