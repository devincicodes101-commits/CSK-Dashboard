import { NextResponse, type NextRequest } from "next/server";
import { weekFromMonday } from "@/lib/metric-rules";
import { mondayOf, shiftWeek } from "@/lib/periods";
import { syncWeek } from "@/lib/sync";

/**
 * The scheduled refresh. Two schedulers call this; nothing else should.
 *
 * Vercel Cron runs it once a day, which is all the Hobby plan allows. A
 * GitHub Actions workflow (.github/workflows/refresh.yml) runs it every
 * thirty minutes, which Hobby does not permit and GitHub does not charge for.
 * Both hit this same route with the same secret. If the account moves to
 * Vercel Pro, drop the workflow and set vercel.json to the frequent schedule.
 *
 * WHICH WEEKS, AND WHY NOT ALL OF THEM
 *
 * Weeks freeze once computed. That is the whole point of storing them: a
 * figure Chase sent out on Wednesday has to still say the same thing when
 * somebody opens it in November, and re-fetching history would let a late
 * invoice quietly rewrite a number that has already been reported.
 *
 * So this refreshes only the weeks that are genuinely still settling — the
 * current one and the one just finished. Jobs close, invoices go out, quotes
 * get approved, and until a week is a few days behind us those figures are
 * still moving. Everything older is left alone.
 *
 * Refreshing the current week is what makes Wednesday work: by the time
 * anyone opens the dashboard the week is already stored, so it appears
 * instantly rather than costing the eight API calls and several seconds a
 * cold week costs.
 *
 * BACKFILL
 *
 *   /api/sync?weeks=12
 *
 * Fetches the last twelve weeks instead of two, for filling the trend charts
 * in one go rather than clicking through the picker. Bounded at 26 — beyond
 * that the run is long enough to hit Vercel's function timeout, and a job
 * that dies halfway is worse than one that refuses.
 *
 * FAILURE
 *
 * One week failing does not stop the others. The response says exactly which
 * weeks were written and which were not, with the error, because a cron that
 * reports success while writing nothing is how a dashboard goes quietly stale
 * for a month.
 */

export const maxDuration = 60;

function authorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();

  // No secret configured means no scheduled refresh. Refusing is the safe
  // default: this route costs real API budget and writes to the database, so
  // it must never be open to whoever finds the URL.
  if (!secret) return false;

  // Vercel Cron sends the secret as a bearer token. The query parameter is
  // for running it by hand.
  const header = request.headers.get("authorization");
  if (header === `Bearer ${secret}`) return true;
  return request.nextUrl.searchParams.get("secret") === secret;
}

export async function GET(request: NextRequest) {
  if (!authorised(request)) {
    return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  }

  const asked = Number(request.nextUrl.searchParams.get("weeks") ?? 2);
  const count = Number.isFinite(asked) ? Math.min(Math.max(Math.trunc(asked), 1), 26) : 2;

  // Newest first: the current week matters most, and if the run is cut short
  // by a timeout the weeks that got written are the ones people will open.
  const thisMonday = mondayOf(new Date());
  const mondays = Array.from({ length: count }, (_, i) => shiftWeek(thisMonday, -i));

  const written: string[] = [];
  const failed: { week: string; error: string }[] = [];

  for (const monday of mondays) {
    try {
      await syncWeek(weekFromMonday(monday));
      written.push(monday);
    } catch (error) {
      failed.push({
        week: monday,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json(
    {
      ranAt: new Date().toISOString(),
      written,
      failed,
      note:
        "Only the current and most recent weeks are refreshed. Older weeks stay " +
        "frozen as reported.",
    },
    // A run where nothing was written is a failed run, and should read as one
    // in Vercel's cron log rather than as a green tick.
    { status: failed.length > 0 && written.length === 0 ? 502 : 200 },
  );
}
