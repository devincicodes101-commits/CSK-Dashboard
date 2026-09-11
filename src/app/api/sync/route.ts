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
 * BACKFILL, AND THE SIXTY-SECOND WALL
 *
 *   /api/sync?weeks=12
 *   /api/sync?weeks=12&skip=6     resume from the seventh week back
 *
 * A cold week costs eight API calls and several seconds. Vercel's Hobby plan
 * kills a function at sixty seconds, so asking for twenty weeks in one request
 * returns a 504 having written some unknowable number of them — which is the
 * worst of both worlds, because the caller cannot tell what succeeded.
 *
 * So the run watches the clock. It stops cleanly before the wall, reports the
 * weeks it managed, and names the offset to resume from in `nextSkip`. A
 * caller loops until that comes back null; the workflow in
 * .github/workflows/refresh.yml does exactly that.
 *
 * Partial progress answers 200, not an error. Six weeks written out of twenty
 * is six weeks of work done, and the response says precisely where it stopped.
 *
 * FAILURE
 *
 * One week failing does not stop the others. The response says exactly which
 * weeks were written and which were not, with the error, because a cron that
 * reports success while writing nothing is how a dashboard goes quietly stale
 * for a month.
 */

/** Vercel Hobby's ceiling. Asking for more is refused at deploy time. */
export const maxDuration = 60;

/**
 * Stop well short of the wall, and judge by what a week here actually costs.
 *
 * A fixed 45s budget still produced 504s, because it only asked "have I spent
 * my budget", never "can I afford another one". Starting a twenty-second week
 * at forty-four seconds overruns by exactly as much as you would expect.
 *
 * Older weeks are the expensive ones. QUOTES_TRANSITIONED deliberately has no
 * upper bound on updatedAt — see the comment there — so syncing January pulls
 * every quote touched since January, fifty at a time. A recent week scans a
 * few hundred; an old one can scan the lot.
 *
 * So the budget is smaller, and a week is only started if the slowest one so
 * far would still fit inside it.
 */
const DEADLINE_MS = 32_000;

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

  const started = Date.now();

  const number = (name: string, fallback: number) => {
    const raw = Number(request.nextUrl.searchParams.get(name) ?? fallback);
    return Number.isFinite(raw) ? Math.trunc(raw) : fallback;
  };

  const count = Math.min(Math.max(number("weeks", 2), 1), 104);
  const skip = Math.max(number("skip", 0), 0);

  // Newest first: the current week matters most, and a run cut short leaves
  // the weeks people actually open already written.
  const thisMonday = mondayOf(new Date());
  const mondays = Array.from({ length: count }, (_, i) =>
    shiftWeek(thisMonday, -(skip + i)),
  );

  const written: string[] = [];
  const failed: { week: string; error: string }[] = [];
  let nextSkip: number | null = null;

  // The longest week seen in this run, used to decide whether another fits.
  let slowestWeekMs = 0;

  for (const [i, monday] of mondays.entries()) {
    // Checked before starting a week, never during. A week either completes
    // or is left for the next call; there is no half-written week.
    //
    // The first week always runs: refusing to do any work at all would leave
    // the caller looping forever on the same offset.
    if (i > 0 && Date.now() - started + slowestWeekMs > DEADLINE_MS) {
      nextSkip = skip + i;
      break;
    }

    const weekStarted = Date.now();
    try {
      await syncWeek(weekFromMonday(monday));
      written.push(monday);
    } catch (error) {
      failed.push({
        week: monday,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    slowestWeekMs = Math.max(slowestWeekMs, Date.now() - weekStarted);
  }

  return NextResponse.json(
    {
      ranAt: new Date().toISOString(),
      elapsedSeconds: Math.round((Date.now() - started) / 100) / 10,
      written,
      failed,
      slowestWeekSeconds: Math.round(slowestWeekMs / 100) / 10,
      // Non-null means the run stopped early to stay inside the timeout. Call
      // again with this as `skip` to carry on.
      nextSkip,
      note:
        "Only the current and most recent weeks are refreshed by the schedule. " +
        "Older weeks stay frozen as reported.",
    },
    // Partial progress is progress. Only a run that wrote nothing at all is a
    // failure, and it should read as one in the cron log rather than as a
    // green tick.
    { status: failed.length > 0 && written.length === 0 ? 502 : 200 },
  );
}
