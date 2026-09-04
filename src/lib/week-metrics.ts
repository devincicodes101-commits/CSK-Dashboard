/**
 * Turns a week of raw Jobber and QuickBooks records into the nineteen numbers.
 *
 * All the thinking is in ./metric-rules.ts. This file only assembles, so that
 * the definitions stay testable on their own and this stays boring.
 */

import {
  type Job,
  type Quote,
  type Week,
  collapsedInWeek,
  conversionRate,
  grossProfit,
  grossProfitRate,
  quotesApproved,
  quotesConverted,
  quotesSent,
  quotesWon,
  rate,
  sumJobs,
  sumSubtotals,
  // Explicit .ts extension: scripts/test-metrics.mts imports this file through
  // Node's ESM loader, which will not resolve an extensionless path.
} from "./metric-rules.ts";
import type { Problem } from "./types";

export interface WeekSources {
  readonly week: Week;
  readonly quotes: readonly Quote[];
  readonly jobs: readonly Job[];
  /**
   * Whether `quotes` holds EVERY quote the week touched, or only the ones
   * that were won.
   *
   * This has to be stated rather than guessed. A sync from the API returns
   * the full set, so quotes sent can be counted from the records. The
   * verified-week fixture holds only the three winning quotes, because the
   * recording never listed the other four that were sent — counting those
   * records gives 2 sent against 3 won, and a win rate of 150%.
   *
   * Inferring completeness from "did we find any?" is what produced exactly
   * that on the first deploy. An incomplete set looks identical to a quiet
   * week, so only the caller knows which it is.
   */
  readonly quotesAreComplete: boolean;
  /**
   * Figures Jobber exposes only as summary cards. Once the API is connected
   * most of these are derived instead; until then they are supplied.
   */
  readonly cards: {
    readonly newLeads: number | null;
    readonly newRequests: number | null;
    readonly quotesSentCount: number | null;
    readonly quotesSentValue: number | null;
    readonly invoicedValue: number | null;
  };
  readonly quickBooks: {
    readonly cashBalance: number | null;
    readonly arTotal: number | null;
    readonly arOver30: number | null;
    readonly invoicesOver30: number | null;
  };
}

export interface ComputedWeek {
  readonly week: Week;

  readonly newLeads: number | null;
  readonly newRequests: number | null;
  readonly quotesSentCount: number | null;
  readonly quotesSentValue: number | null;
  readonly convertedCount: number;
  readonly convertedValue: number;
  readonly approvedCount: number;
  readonly approvedValue: number;
  readonly wonCount: number;
  readonly wonValue: number;
  readonly conversionRate: number | null;
  readonly collapsedQuotes: readonly string[];

  readonly invoicedValue: number | null;
  readonly revenueClosed: number;
  readonly labourCost: number;
  readonly materialCost: number;
  readonly grossProfit: number;
  readonly grossProfitRate: number | null;
  readonly timeTrackedHours: number;
  readonly jobsClosed: number;

  readonly cashBalance: number | null;
  readonly arTotal: number | null;
  readonly arOver30: number | null;
  readonly arOver30Rate: number | null;
  readonly invoicesOver30: number | null;

  readonly problems: readonly Problem[];
}

export function computeWeek(sources: WeekSources): ComputedWeek {
  const { week, quotes, jobs, cards, quickBooks, quotesAreComplete } = sources;
  const problems: Problem[] = [];

  /* ---- sales ---- */

  const won = quotesWon(quotes, week);
  const converted = quotesConverted(quotes, week);
  const approved = quotesApproved(quotes, week);

  // Count sent from the records only when the caller says we have all of
  // them. Otherwise take Jobber's own figure, which is the only complete one
  // available.
  const sent = quotesSent(quotes, week);
  const sentCount = quotesAreComplete ? sent.length : cards.quotesSentCount;
  const sentValue = quotesAreComplete ? sumSubtotals(sent) : cards.quotesSentValue;

  if (quotesAreComplete && sent.length === 0 && won.length > 0) {
    problems.push({
      where: "Quotes sent",
      message:
        "Quotes were won this week but none were sent, which cannot be right. " +
        "Check the date filter on the sync before trusting the win rate.",
      severity: "error",
    });
  }

  // A win rate above 100% is arithmetically possible here — a quote sent in
  // one week can be won in the next — but it is far more often a sign that the
  // two figures came from different populations. Say so rather than printing
  // it as though it meant something.
  if (sentCount !== null && won.length > sentCount) {
    problems.push({
      where: "Win rate",
      message:
        `${won.length} quotes were won against ${sentCount} sent, so the rate ` +
        `is over 100%. That is usually a mismatch between where the two ` +
        `figures came from, not a remarkable week.`,
      severity: "error",
    });
  }

  /* ---- revenue and production ---- */

  const totals = sumJobs(jobs);
  const gp = grossProfit(totals.revenue, totals.labourCost, totals.materialCost);

  if (jobs.length === 0) {
    problems.push({
      where: "Revenue",
      message:
        "No jobs closed in this week. That is possible but unusual, so " +
        "confirm before sending: a wrong date filter looks exactly like this.",
      severity: "warning",
    });
  }

  /* ---- cash and AR ---- */

  if (quickBooks.cashBalance === null && quickBooks.arTotal === null) {
    problems.push({
      where: "Cash & AR",
      message: "QuickBooks is not connected, so this block has no figures.",
      severity: "warning",
    });
  }

  return {
    week,

    newLeads: cards.newLeads,
    newRequests: cards.newRequests,
    quotesSentCount: sentCount,
    quotesSentValue: sentValue,
    convertedCount: converted.length,
    convertedValue: sumSubtotals(converted),
    approvedCount: approved.length,
    approvedValue: sumSubtotals(approved),
    wonCount: won.length,
    wonValue: sumSubtotals(won),
    conversionRate: sentCount === null ? null : conversionRate(won.length, sentCount),
    collapsedQuotes: collapsedInWeek(quotes, week),

    invoicedValue: cards.invoicedValue,
    revenueClosed: totals.revenue,
    labourCost: totals.labourCost,
    materialCost: totals.materialCost,
    grossProfit: gp,
    grossProfitRate: grossProfitRate(totals.revenue, gp),
    timeTrackedHours: totals.timeTrackedHours,
    jobsClosed: jobs.length,

    cashBalance: quickBooks.cashBalance,
    arTotal: quickBooks.arTotal,
    arOver30: quickBooks.arOver30,
    arOver30Rate: rate(quickBooks.arOver30, quickBooks.arTotal),
    invoicesOver30: quickBooks.invoicesOver30,

    problems,
  };
}

/* ------------------------------------------------------------- formatting */

const MONEY = new Intl.NumberFormat("en-CA", {
  style: "currency",
  currency: "CAD",
  maximumFractionDigits: 0,
});

/** Null renders as an em dash, never as zero. A gap is not an amount. */
export function money(value: number | null): string {
  return value === null ? "—" : MONEY.format(value);
}

export function percent(value: number | null, dp = 1): string {
  return value === null ? "—" : `${(value * 100).toFixed(dp)}%`;
}

export function count(value: number | null): string {
  return value === null ? "—" : String(value);
}

// weekLabel lives in ./periods.ts, next to the rest of the period handling.
