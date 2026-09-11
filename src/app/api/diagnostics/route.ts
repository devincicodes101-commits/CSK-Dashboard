import { NextResponse, type NextRequest } from "next/server";
import { backend, loadTokens } from "@/lib/token-store";

/**
 * What the server can actually see, as opposed to what the Settings page says.
 *
 * Settings has been reporting both systems CONNECTED while the scheduled sync
 * insists the Jobber connection has expired, seconds after a reconnect. Both
 * cannot be describing the same stored token, and no amount of reading the
 * code has settled which one is wrong — so this prints the stored state
 * directly, from the same functions the sync uses.
 *
 *   /api/diagnostics?secret=<CRON_SECRET>
 *
 * NO SECRETS LEAVE THIS ROUTE. Tokens are reported as a length and their last
 * four characters — enough to tell two tokens apart and to confirm the browser
 * and the cron are looking at the same one, and useless to anybody who
 * intercepts it. Behind CRON_SECRET regardless.
 *
 * Read-only. It touches nothing.
 */

function fingerprint(token: string | undefined): string {
  if (!token) return "absent";
  return `${token.length} chars, ends ${token.slice(-4)}`;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.nextUrl.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const now = Date.now();

  const describe = async (provider: string) => {
    try {
      const stored = await loadTokens(provider);
      if (!stored) return { connected: false, reason: "No stored token." };

      const minutes = Math.round((stored.expiresAt - now) / 60_000);
      return {
        connected: true,
        account: stored.connectedAccount,
        accessTokenExpiresAt: new Date(stored.expiresAt).toISOString(),
        // The number that decides everything: positive means the token is
        // usable and no refresh should be attempted at all.
        minutesUntilExpiry: minutes,
        willRefreshOnNextCall: minutes <= 1,
        accessToken: fingerprint(stored.accessToken),
        refreshToken: fingerprint(stored.refreshToken),
      };
    } catch (error) {
      return {
        connected: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  };

  return NextResponse.json({
    now: new Date(now).toISOString(),

    /**
     * Which store is in use. "supabase" is the only one a scheduled job can
     * read — the others live in the visitor's browser or in one instance's
     * memory, so a cron would see nothing at all.
     */
    tokenBackend: backend(),
    environment: {
      supabaseUrl: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      supabaseServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
      jobberClientSecret: Boolean(process.env.JOBBER_CLIENT_SECRET),
      qboClientSecret: Boolean(process.env.QBO_CLIENT_SECRET),
    },

    jobber: await describe("jobber"),
    quickbooks: await describe("quickbooks"),
  });
}
