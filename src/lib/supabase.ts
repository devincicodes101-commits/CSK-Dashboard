import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Two clients, and the difference matters.
 *
 * `browserClient` carries the anon key and is subject to row level security,
 * so the worst a leaked key can do is read weeks and targets. It cannot reach
 * oauth_connections, which has RLS on and no policies.
 *
 * `serviceClient` bypasses RLS entirely and must never be imported into
 * anything that reaches the browser. It exists for the sync job and the OAuth
 * callback, both of which run on the server.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export function browserClient(): SupabaseClient {
  return createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  );
}

let cachedService: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (cachedService) return cachedService;
  cachedService = createClient(
    required("NEXT_PUBLIC_SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return cachedService;
}
