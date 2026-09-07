/**
 * How CSK's nineteen numbers are defined.
 *
 * This module is the specification. It holds no UI, no database and no API
 * client, so it can be checked in isolation against a week we have already
 * verified by hand: see scripts/test-metrics.mts, which runs before every
 * build.
 *
 * WHY THIS EXISTS AT ALL
 *
 * Kyle produces these numbers by reading Jobber's reporting screens. Those
 * screens are misleading in four specific ways, all of which he corrects in
 * his head every week. Reading the API rather than the screens removes three
 * of the four at the source:
 *
 *   - The summary cards above a report count a different population from the
 *     table beneath them. For 3-9 Aug 2026 the card read $28,145 against a
 *     table total of $11,404.08. There are no cards in the API.
 *   - "Average profit %" is the mean of each job's own percentage, so a $250
 *     job counts as much as a $6,563 one. It read 51% where the true blended
 *     figure was 49.3%. We only ever get dollars from the API.
 *   - The same quote is returned by two different report filters in one week,
 *     which is how quote #1231 got counted twice. In the API a quote is one
 *     record carrying both timestamps, so it cannot duplicate.
 *
 * What does NOT go away is the fourth one, and the definitions around it.
 * Those are decisions about what CSK mean, not bugs in a screen, and they are
 * what this file encodes:
 *
 *   1. Money is always pre-tax (subtotal), never tax-inclusive (total).
 *   2. A quote won counts once, in the week it was FIRST won.
 *   3. Gross profit is computed from dollars, never from a percentage.
 *   4. A figure we cannot compute is null, never zero.
 *
 * Rule 4 is the one to hold onto when editing this file. A silent zero on a
 * dashboard reads as "we earned nothing", which is a fact. Null reads as "we
 * do not know", which is the truth. Wrong numbers that look fine are worse
 * than a visible gap.
 */

import type { Problem } from "./types";
import { localDate } from "./timezone.ts";

/* ------------------------------------------------------------------ inputs */

/**
 * A quote as the API gives it: one record, both timestamps on it.
 *
 * `quoteNumber` is what CSK say out loud ("quote 1231") and is unique, so it
 * stays the identity even though the API also carries an opaque id.
 */
export interface Quote {
  readonly quoteNumber: string;
  readonly clientName: string;
  readonly title: string;
  /** Pre-tax. Every dollar metric uses this. */
  readonly subtotal: number;
  /** Tax inclusive. Displayed only; never enters a metric. */
  readonly total: number;
  /** ISO date, or null if never approved. */
  readonly approvedAt: string | null;
  /** ISO date, or null if never turned into a job. */
  readonly convertedAt: string | null;
  /** ISO date the quote was sent. Drives the conversion denominator. */
  readonly sentAt: string | null;
}

/** A one-off job, as at the moment it closed. */
export interface Job {
  readonly jobNumber: string;
  readonly clientName: string;
  readonly title: string;
  readonly closedAt: string;
  /** Revenue. */
  readonly revenue: number;
  readonly labourCost: number;
  /** Materials and expenses. */
  readonly materialCost: number;
  readonly timeTrackedHours: number;
  /** Usually 0 — CSK are not recording these. Blocks monthly efficiency. */
  readonly hoursQuoted: number;
  readonly materialsQuoted: number;
}

/* ---------------------------------------------------------------- the week */

/** Weeks run Monday to Sunday. "Week ended Aug 9" means Aug 3-9. */
export interface Week {
  /** ISO date of the Monday. */
  readonly start: string;
  /** ISO date of the Sunday. */
  readonly end: string;
}

export function weekFromMonday(mondayIso: string): Week {
  const monday = new Date(`${mondayIso}T00:00:00Z`);
  if (Number.isNaN(monday.getTime())) {
    throw new Error(`weekFromMonday: not a date: ${mondayIso}`);
  }
  if (monday.getUTCDay() !== 1) {
    throw new Error(
      `weekFromMonday: ${mondayIso} is not a Monday. Weeks run Monday to ` +
        `Sunday, so starting anywhere else would silently shift every figure.`,
    );
  }
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return { start: mondayIso, end: sunday.toISOString().slice(0, 10) };
}

/**
 * Inclusive of both ends, compared as dates in CSK's own timezone.
 *
 * Slicing the first ten characters off a UTC timestamp is the obvious
 * implementation and it is wrong: 2026-08-17T02:00:00Z is Sunday evening in
 * Surrey and belongs to the week before. See ./timezone.ts.
 */
export function within(date: string | null, week: Week): boolean {
  if (!date) return false;
  const day = localDate(date);
  return day >= week.start && day <= week.end;
}

/* --------------------------------------------------------- winning a quote */

/**
 * The moment a quote first counted as won.
 *
 * A quote can be won two ways. It can be APPROVED — the customer said yes,
 * typically a change order on a job that already exists. Or it can be
 * CONVERTED — it became a new job. Many quotes do both, and CSK count both as
 * won, which is why their conversion rate (42.9% for 3-9 Aug) is higher than
 * the 29% Jobber displays, since Jobber counts only conversions.
 *
 * Taking the EARLIER of the two timestamps does two jobs at once:
 *
 *   - Within one week it collapses a quote that was approved and converted in
 *     the same week down to a single win. This is quote #1231, the case that
 *     inflated the manual figures by 14 points.
 *   - Across weeks it puts the win in the week it was actually won, rather
 *     than counting it again weeks later when the job finally starts.
 *
 * OPEN WITH THE CLIENT. The cross-week half is our decision, not theirs. A
 * quote approved in week 1 and converted in week 4 is counted here in week 1
 * only. CSK have not yet said whether they would rather see it in both. The
 * verified week cannot tell us, because #1231 was approved and converted
 * within the same seven days. Changing this constant changes monthly totals,
 * never weekly ones.
 */
export const WON_COUNTED_AT = "first-win" as const;

export function firstWonAt(quote: Quote): string | null {
  const dates = [quote.approvedAt, quote.convertedAt].filter(
    (d): d is string => Boolean(d),
  );
  if (dates.length === 0) return null;
  return dates.reduce((a, b) => (a <= b ? a : b));
}

/** Deduplicate by quote number, keeping first appearance. */
function unique(quotes: readonly Quote[]): Quote[] {
  const seen = new Set<string>();
  const out: Quote[] = [];
  for (const quote of quotes) {
    if (seen.has(quote.quoteNumber)) continue;
    seen.add(quote.quoteNumber);
    out.push(quote);
  }
  return out;
}

/**
 * Quotes that became a new job during the week.
 *
 * CSK's definition, verbatim: "Quotes report, dropdown 'Converted', within the
 * week." Every quote whose convertedAt falls in the week, full stop.
 *
 * This was previously narrowed to quotes whose FIRST win also fell in the
 * week, which quietly excluded any quote approved earlier and converted now.
 * For 17-23 August that reported 2 where Jobber showed 3 — a rule we invented
 * overriding a definition the client had written down.
 */
export function quotesConverted(
  quotes: readonly Quote[],
  week: Week,
): readonly Quote[] {
  return unique(quotes.filter((q) => within(q.convertedAt, week)));
}

/**
 * Approved during the week, excluding anything already counted as converted.
 *
 * This is where the deduplication lives, and it is where Kyle does it by hand:
 * quote #1231 was approved on the Tuesday and converted on the Thursday, so it
 * appears on both of Jobber's lists and must be counted once. Taking it out of
 * Approved rather than Converted keeps Converted matching Jobber's own screen,
 * which is what anyone checking will look at.
 */
export function quotesApproved(
  quotes: readonly Quote[],
  week: Week,
): readonly Quote[] {
  const converted = new Set(
    quotesConverted(quotes, week).map((q) => q.quoteNumber),
  );
  return unique(
    quotes.filter((q) => within(q.approvedAt, week) && !converted.has(q.quoteNumber)),
  );
}

/** Converted plus approved, deduped by quote number. CSK's Total Quotes Won. */
export function quotesWon(
  quotes: readonly Quote[],
  week: Week,
): readonly Quote[] {
  return [...quotesConverted(quotes, week), ...quotesApproved(quotes, week)];
}

/**
 * Quotes counted as won here that were ALSO won in an earlier week.
 *
 * The open question, made visible instead of silently decided. A quote
 * approved in March and converted in August is won twice under CSK's stated
 * definition — once in each week — so the two weeks added together count it
 * twice. Weekly figures are unaffected; monthly and yearly totals are not.
 *
 * We previously "solved" this by counting only the first win, which had the
 * side effect of contradicting their Converted definition. Reporting it is
 * honest; deciding it is CSK's to do.
 */
export function alsoWonEarlier(
  quotes: readonly Quote[],
  week: Week,
): readonly string[] {
  return quotesWon(quotes, week)
    .filter((q) => {
      const first = firstWonAt(q);
      return first !== null && localDate(first) < week.start;
    })
    .map((q) => q.quoteNumber);
}

/**
 * Quote numbers approved AND converted inside the same week.
 *
 * Shown on the dashboard under the win rate. Chase is being given a number
 * that will not match what he sees if he opens Jobber himself, so the
 * correction has to be visible or he will reasonably assume we are wrong.
 */
export function collapsedInWeek(
  quotes: readonly Quote[],
  week: Week,
): readonly string[] {
  return unique(quotes)
    .filter((q) => within(q.approvedAt, week) && within(q.convertedAt, week))
    .map((q) => q.quoteNumber);
}

export function quotesSent(
  quotes: readonly Quote[],
  week: Week,
): readonly Quote[] {
  return quotes.filter((q) => within(q.sentAt, week));
}

/* ------------------------------------------------------------------- money */

/** Pre-tax. How every WON dollar figure is summed. */
export function sumSubtotals(quotes: readonly Quote[]): number {
  return round2(quotes.reduce((sum, q) => sum + q.subtotal, 0));
}

/**
 * Tax inclusive. Used for Quotes Sent ($) and nothing else.
 *
 * This is deliberately inconsistent with sumSubtotals, because CSK's own
 * figures are. Kyle reads Quotes Sent ($) straight off Jobber's "Sent" card,
 * which includes GST, while taking Converted and Approved from the Subtotal
 * column, which does not. For 17-23 August that is $242,501 against $230,953
 * — the same fourteen quotes, five percent apart.
 *
 * Reproducing his sheet means reproducing that. What it must not do is go
 * unmentioned: Sent ($) and Won ($) are not on the same basis and should not
 * be compared, which the dashboard says on the block.
 */
export function sumTotals(quotes: readonly Quote[]): number {
  return round2(quotes.reduce((sum, q) => sum + q.total, 0));
}

export function sumJobs(jobs: readonly Job[]): {
  revenue: number;
  labourCost: number;
  materialCost: number;
  timeTrackedHours: number;
} {
  return {
    revenue: round2(jobs.reduce((s, j) => s + j.revenue, 0)),
    labourCost: round2(jobs.reduce((s, j) => s + j.labourCost, 0)),
    materialCost: round2(jobs.reduce((s, j) => s + j.materialCost, 0)),
    timeTrackedHours: round2(jobs.reduce((s, j) => s + j.timeTrackedHours, 0)),
  };
}

/** Always a formula. Never a profit figure read from anywhere. */
export function grossProfit(
  revenue: number,
  labourCost: number,
  materialCost: number,
): number {
  return round2(revenue - labourCost - materialCost);
}

/**
 * Blended gross profit: total profit over total revenue.
 *
 * Not the mean of the individual job percentages. On 3-9 Aug those two
 * approaches give 49.3% and 51% respectively, over the same eight jobs.
 */
export function grossProfitRate(
  revenue: number,
  grossProfitDollars: number,
): number | null {
  if (revenue === 0) return null;
  return grossProfitDollars / revenue;
}

export function conversionRate(won: number, sent: number): number | null {
  if (sent === 0) return null;
  return won / sent;
}

export function rate(part: number | null, whole: number | null): number | null {
  if (part === null || whole === null || whole === 0) return null;
  return part / whole;
}

/* ---------------------------------------------------- deliberately not used */

/**
 * The mean of each job's own profit percentage — Jobber's "average profit".
 *
 * Exported ONLY so the test can assert that our figure differs from it, and so
 * that anyone who finds this number elsewhere can see where it comes from.
 * Never call this from application code.
 */
export function jobberAverageProfitRate(jobs: readonly Job[]): number | null {
  if (jobs.length === 0) return null;
  const rates = jobs.map((j) =>
    j.revenue === 0 ? 0 : grossProfit(j.revenue, j.labourCost, j.materialCost) / j.revenue,
  );
  return rates.reduce((a, b) => a + b, 0) / rates.length;
}

/**
 * What you get by adding the two report lists without deduping: the mistake
 * this project exists to prevent. Exported only so the test can prove we do
 * not produce it.
 */
export function naiveWonCount(
  quotes: readonly Quote[],
  week: Week,
): number {
  const converted = quotes.filter((q) => within(q.convertedAt, week)).length;
  const approved = quotes.filter((q) => within(q.approvedAt, week)).length;
  return converted + approved;
}

export function naiveWonValue(quotes: readonly Quote[], week: Week): number {
  const converted = quotes.filter((q) => within(q.convertedAt, week));
  const approved = quotes.filter((q) => within(q.approvedAt, week));
  return round2(sumSubtotals(converted) + sumSubtotals(approved));
}

/* ------------------------------------------------------------- efficiency */

/**
 * Actual against quoted, on quoted jobs only.
 *
 * Returns null with a problem attached rather than a number, whenever there is
 * nothing to compare against. As of the verified week, seven of eight closed
 * jobs carried no quoted hours at all, so this will usually be null until CSK
 * change how quotes are written. That gap is the point: it has to be visible.
 */
export function efficiency(
  jobs: readonly Job[],
  field: "hours" | "materials",
): { value: number | null; measured: number; skipped: number } {
  const quotedOf = (j: Job) =>
    field === "hours" ? j.hoursQuoted : j.materialsQuoted;
  const actualOf = (j: Job) =>
    field === "hours" ? j.timeTrackedHours : j.materialCost;

  const measured = jobs.filter((j) => quotedOf(j) > 0);
  const skipped = jobs.length - measured.length;
  if (measured.length === 0) {
    return { value: null, measured: 0, skipped };
  }
  const quoted = measured.reduce((s, j) => s + quotedOf(j), 0);
  const actual = measured.reduce((s, j) => s + actualOf(j), 0);
  return { value: quoted === 0 ? null : actual / quoted, measured: measured.length, skipped };
}

/* -------------------------------------------------------------- self-check */

/**
 * Compares our sum against a total the source reported, where one is
 * available, and raises a warning if they disagree by more than a rounding
 * cent or two.
 *
 * Jobber rounds each row's own profit before totalling, so an exact match is
 * not expected: on the verified week our gross profit is $5,620.22 against
 * Jobber's reported $5,620.24. Two cents is rounding. Two dollars is a bug.
 */
export const RECONCILE_TOLERANCE = 0.05;

export function reconcile(
  where: string,
  ours: number,
  theirs: number | null,
): Problem | null {
  if (theirs === null) return null;
  const gap = Math.abs(ours - theirs);
  if (gap <= RECONCILE_TOLERANCE) return null;
  return {
    where,
    message:
      `We computed ${ours.toFixed(2)} but the source reported ` +
      `${theirs.toFixed(2)}, a difference of ${gap.toFixed(2)}. ` +
      `Check the date filter before trusting either figure.`,
    severity: "warning",
  };
}

/* ------------------------------------------------------------------ helper */

/** Money is rounded to the cent at each sum, so totals stay addable. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
