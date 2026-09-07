import { NextResponse, type NextRequest } from "next/server";
import { refreshAndSave } from "@/lib/jobber";

/**
 * Renews the Jobber access token, then sends the visitor back where they were.
 *
 * Exists because of one constraint: only a route handler may write a cookie,
 * and on browser-session storage the refreshed tokens have to be written or
 * they are lost. Jobber rotates its refresh token on every use, so a refresh
 * whose replacement is not saved breaks the connection permanently rather
 * than merely failing once.
 *
 * So a page that finds an expired token does not refresh in place — it
 * redirects here, which refreshes, saves, and redirects straight back. One
 * extra hop, roughly hourly, and invisible.
 */
export async function GET(request: NextRequest) {
  const next = request.nextUrl.searchParams.get("next") ?? "/";

  // Only ever return to this site. `next` arrives in a URL, and sending
  // someone to an arbitrary address after a token refresh is exactly the
  // open-redirect people phish with.
  const target = new URL(next.startsWith("/") ? next : "/", request.url);

  try {
    await refreshAndSave();
  } catch (error) {
    const settings = new URL("/settings", request.url);
    settings.searchParams.set(
      "error",
      `The Jobber connection could not be renewed: ${
        error instanceof Error ? error.message : String(error)
      }. Connect it again.`,
    );
    return NextResponse.redirect(settings);
  }

  // Marks the request as having just refreshed, so the page can avoid
  // bouncing back here if something is still wrong and it would otherwise
  // loop between the two.
  target.searchParams.set("refreshed", "1");
  return NextResponse.redirect(target);
}
