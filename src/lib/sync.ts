/**
 * Pulling one week out of Jobber and running it through the definitions.
 *
 * This is the sync job minus the last step. It fetches, reconciles and
 * computes; it does not store, because there is nowhere to store yet. Once
 * Supabase exists the only addition is writing the result into
 * week_snapshots and marking the week final.
 *
 * Kept separate from the page so that the scheduled job and the on-demand
 * button run exactly the same code. A "refresh" that computed differently
 * from the cron would be the worst kind of bug: rare, and invisible.
 */

import { type Quote } from "./metric-rules.ts";
import {
  fetchInvoicedValue,
  fetchNewClients,
  fetchJobsCompleted,
  fetchQuotesPossiblyWon,
  fetchQuotesSent,
  fetchRequestsCreated,
} from "./jobber-queries.ts";
import { reconcile } from "./metric-rules.ts";
import type { Problem } from "./types";
import { type ComputedWeek, computeWeek } from "./week-metrics.ts";
import { saveWeek } from "./week-store.ts";

/**
 * Bumped whenever a change would make a stored week wrong.
 *
 * A frozen week keeps whatever was true when it was fetched, which is the
 * point — but it also keeps whatever was BROKEN when it was fetched. Weeks
 * stored on 7 September carry null leads and no invoiced value because those
 * queries did not exist yet, and boundaries seven hours out because they were
 * bounded in UTC. They look finished and are not.
 *
 * The stamp lets the dashboard say so and offer to re-fetch, rather than
 * silently serving a stale figure that nobody can tell apart from a fresh one.
 *
 * Raise it for anything that changes the numbers: a definition, a query, a
 * date boundary. Not for wording or layout.
 */
export const SYNC_VERSION = 5;

export interface SyncResult {
  metrics: ComputedWeek;
  /** How many records were involved, for the "where did this come from" line. */
  counts: { quotes: number; jobs: number; requests: number };
}

export async function syncWeek(week: {
  start: string;
  end: string;
}): Promise<SyncResult> {
  const problems: Problem[] = [];

  // Two queries, because Jobber will filter on sentAt but not on the dates a
  // quote was actually won. See QUOTES_TRANSITIONED for why the second one has
  // no upper bound.
  const [sent, possiblyWon, jobs, requests, newClients] = await Promise.all([
    fetchQuotesSent(week.start, week.end),
    fetchQuotesPossiblyWon(week.start),
    fetchJobsCompleted(week.start, week.end),
    fetchRequestsCreated(week.start, week.end),
    fetchNewClients(week.start, week.end),
  ]);

  // Invoices separately, and allowed to fail. InvoiceAmounts' field names are
  // assumed rather than confirmed, and one uncertain metric must not take the
  // other eighteen down with it.
  let invoicedValue: number | null = null;
  try {
    invoicedValue = (await fetchInvoicedValue(week.start, week.end)).value;
  } catch (error) {
    problems.push({
      where: "Revenue — invoiced",
      message:
        `Could not be read: ${error instanceof Error ? error.message : String(error)}. ` +
        "Every other figure on this week is unaffected.",
      severity: "warning",
    });
  }

  // Union by quote number. A quote can be in both lists — sent on Monday and
  // won on Thursday — and must appear once.
  const byNumber = new Map<string, Quote>();
  for (const quote of [...sent, ...possiblyWon]) {
    byNumber.set(quote.quoteNumber, quote);
  }
  const quotes = [...byNumber.values()];

  // Jobber gives revenue twice: on the job, and via its costing engine. They
  // ought to agree. Checking is cheap, and the whole reason this project
  // exists is that Jobber's own totals disagree with each other.
  for (const mapped of jobs) {
    const problem = reconcile(
      `Job #${mapped.job.jobNumber} revenue`,
      mapped.job.revenue,
      mapped.reportedRevenue,
    );
    if (problem) problems.push(problem);
  }

  const metrics = computeWeek({
    week,
    quotes,
    jobs: jobs.map((m) => m.job),
    // The sentAt filter runs server-side, so this really is every quote sent
    // in the week rather than a partial set.
    quotesAreComplete: true,
    cards: {
      // Jobber has no leads query, but its filter has an isLead flag, so a
      // lead is a client record. Clients created in the week is the closest
      // stable equivalent — see fetchNewClients for why isLead is not used.
      newLeads: newClients,
      newRequests: requests.length,
      // Derived from the records; see quotesAreComplete above.
      quotesSentCount: null,
      quotesSentValue: null,
      invoicedValue,
    },
    quickBooks: {
      cashBalance: null,
      arTotal: null,
      arOver30: null,
      invoicesOver30: null,
    },
  });

  problems.push({
    where: "New leads",
    message:
      "Counted as clients created in the week. Jobber's API exposes no leads " +
      "query, so this is the closest equivalent to the figure on its Insights " +
      "screen rather than the same figure. Worth confirming with Kyle.",
    severity: "warning",
  });

  const result = { ...metrics, problems: [...metrics.problems, ...problems] };

  // Freeze it. Storing the records alongside the figures means a definition
  // change can be replayed over history without going back to Jobber, which
  // matters while the cross-week counting rule is still unconfirmed.
  await saveWeek(result, {
    syncVersion: SYNC_VERSION,
    wonEarlierToo: result.wonEarlierToo,
    quotes,
    jobs: jobs.map((m) => m.job),
  });

  return {
    metrics: result,
    counts: { quotes: quotes.length, jobs: jobs.length, requests: requests.length },
  };
}
