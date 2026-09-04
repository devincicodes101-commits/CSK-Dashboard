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
} from "./metric-rules";
import type { Problem } from "./types";

export interface WeekSources {
  readonly week: Week;
  readonly quotes: readonly Quote[];
  readonly jobs: readonly Job[];
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
  const { week, quotes, jobs, cards, quickBooks } = sources;
  const problems: Problem[] = [];

  /* ---- sales ---- */

  const won = quotesWon(quotes, week);
  const converted = quotesConverted(quotes, week);
  const approved = quotesApproved(quotes, week);

  // Prefer a count derived from records; fall back to the card only where we
  // genuinely have no rows, and say so rather than quietly reporting either.
  const derivedSent = quotesSent(quotes, week).length;
  const sentCount = derivedSent > 0 ? derivedSent : cards.quotesSentCount;
  if (derivedSent === 0 && cards.quotesSentCount !== null) {
    problems.push({
      where: "Quotes sent",
      message:
        "Taken from Jobber's summary card because no sent quotes were found " +
        "in the records for this week. Check the date filter.",
      severity: "warning",
    });
  }

  const sentValue =
    derivedSent > 0 ? sumSubtotals(quotesSent(quotes, week)) : cards.quotesSentValue;

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

export function weekLabel(week: Week): string {
  const format = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-CA", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return `${format(week.start)} – ${format(week.end)}`;
}
