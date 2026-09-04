/**
 * Where OAuth tokens live.
 *
 * Two backends. Supabase is the real one. The in-memory one exists so the
 * Jobber connection can be proved, and a real week pulled, before a database
 * exists — which is where this project is right now.
 *
 * The memory store is NOT a fallback that quietly takes over. It is chosen
 * only when Supabase is not configured at all, and it announces itself
 * everywhere it is used: in the server log, on the settings screen, and in
 * the sync response. A token store that silently forgot everything on the
 * next cold start would be a genuinely nasty thing to debug.
 */

import { serviceClient } from "./supabase";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
  /** When the ACCESS token dies, in epoch milliseconds. */
  expiresAt: number;
  connectedAccount: string | null;
}

export type Backend = "supabase" | "memory";

/**
 * Survives a warm serverless invocation and nothing more. On Vercel that is
 * often minutes; it can also be the next request. Fine for testing a
 * connection, useless for a Tuesday night cron job.
 */
const memory = new Map<string, StoredTokens>();

export function backend(): Backend {
  const configured =
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY;
  return configured ? "supabase" : "memory";
}

/** Plain English, for the settings screen. Never hidden from the user. */
export function backendWarning(): string | null {
  if (backend() === "supabase") return null;
  return (
    "Supabase isn’t configured, so this connection is being held in memory. " +
    "It proves the setup works and can pull a real week now, but it will be " +
    "lost when the server restarts, and the scheduled sync cannot run until " +
    "there is a database."
  );
}

export async function saveTokens(
  provider: string,
  tokens: StoredTokens,
): Promise<void> {
  if (backend() === "memory") {
    memory.set(provider, tokens);
    console.warn(
      `[token-store] ${provider} tokens held IN MEMORY. Configure Supabase ` +
        `before relying on this — a restart loses the connection.`,
    );
    return;
  }

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
  if (error) throw new Error(`Could not save the ${provider} connection: ${error.message}`);
}

export async function loadTokens(provider: string): Promise<StoredTokens | null> {
  if (backend() === "memory") return memory.get(provider) ?? null;

  const { data, error } = await serviceClient()
    .from("oauth_connections")
    .select("access_token, refresh_token, expires_at, connected_account")
    .eq("provider", provider)
    .maybeSingle();

  if (error) throw new Error(`Could not read the ${provider} connection: ${error.message}`);
  if (!data) return null;

  return {
    accessToken: data.access_token as string,
    refreshToken: data.refresh_token as string,
    expiresAt: new Date(data.expires_at as string).getTime(),
    connectedAccount: (data.connected_account as string | null) ?? null,
  };
}
