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
  fetchJobsCompleted,
  fetchQuotesPossiblyWon,
  fetchQuotesSent,
} from "./jobber-queries.ts";
import { reconcile } from "./metric-rules.ts";
import type { Problem } from "./types";
import { type ComputedWeek, computeWeek } from "./week-metrics.ts";
import { saveWeek } from "./week-store.ts";

export interface SyncResult {
  metrics: ComputedWeek;
  /** How many records were involved, for the "where did this come from" line. */
  counts: { quotes: number; jobs: number };
}

export async function syncWeek(week: {
  start: string;
  end: string;
}): Promise<SyncResult> {
  const problems: Problem[] = [];

  // Two queries, because Jobber will filter on sentAt but not on the dates a
  // quote was actually won. See QUOTES_TRANSITIONED for why the second one has
  // no upper bound.
  const [sent, possiblyWon, jobs] = await Promise.all([
    fetchQuotesSent(week.start, week.end),
    fetchQuotesPossiblyWon(week.start),
    fetchJobsCompleted(week.start, week.end),
  ]);

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
      // Not fetched yet. These three come from Jobber's Insights cards, and
      // the filter shapes for `requests` and `invoices` have not been read off
      // the schema — guessing field names is what cost us a round earlier.
      newLeads: null,
      newRequests: null,
      quotesSentCount: null,
      quotesSentValue: null,
      invoicedValue: null,
    },
    quickBooks: {
      cashBalance: null,
      arTotal: null,
      arOver30: null,
      invoicesOver30: null,
    },
  });

  problems.push({
    where: "New leads and invoiced",
    message:
      "Not fetched. These need the requests and invoices queries, whose " +
      "filter shapes still have to be read off Jobber's schema.",
    severity: "warning",
  });

  const result = { ...metrics, problems: [...metrics.problems, ...problems] };

  // Freeze it. Storing the records alongside the figures means a definition
  // change can be replayed over history without going back to Jobber, which
  // matters while the cross-week counting rule is still unconfirmed.
  await saveWeek(result, { quotes, jobs: jobs.map((m) => m.job) });

  return {
    metrics: result,
    counts: { quotes: quotes.length, jobs: jobs.length },
  };
}
