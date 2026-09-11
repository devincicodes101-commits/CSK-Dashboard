/**
 * Reading and writing frozen weeks.
 *
 * A week is fetched from Jobber once and then kept. Two reasons, and the
 * second is the one that bites:
 *
 *   Re-querying an old week does not give the same answer months later. Jobs
 *   get edited, late expenses land, invoices are adjusted. A figure Chase
 *   screenshotted in August has to still read the same in December.
 *
 *   Jobber throttles. The quotes query deliberately has no upper bound on
 *   updatedAt, so syncing an old week pulls everything touched since. Doing
 *   that on every page load is what produced "Jobber API errors: Throttled".
 */

import { serviceClient } from "./supabase";
import type { Problem } from "./types";
import type { ComputedWeek } from "./week-metrics";

export interface StoredWeek {
  metrics: ComputedWeek;
  syncedAt: string;
  status: "draft" | "final";
  /**
   * Which version of the sync produced this. 0 for weeks stored before the
   * stamp existed, which is exactly the set that needs re-fetching.
   */
  syncVersion: number;
}

function available(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

/** Mondays that have a stored week, newest first. For the period picker. */
export async function syncedWeeks(): Promise<string[]> {
  if (!available()) return [];
  const { data, error } = await serviceClient()
    .from("week_snapshots")
    .select("week_start")
    .order("week_start", { ascending: false })
    .limit(400);

  // A picker that cannot say which weeks have figures is a smaller problem
  // than a dashboard that will not render, so this degrades rather than
  // throws.
  if (error) return [];
  return (data ?? []).map((row) => row.week_start as string);
}

type Row = Record<string, unknown>;

function n(v: unknown): number {
  return Number(v ?? 0);
}
function maybe(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

/** One database row back into a week. Shared by the single and bulk loaders. */
function toStoredWeek(data: Row): StoredWeek {
  return {
    syncedAt: data.synced_at as string,
    status: data.status as "draft" | "final",
    syncVersion: Number((data.raw as { syncVersion?: number })?.syncVersion ?? 0),
    metrics: {
      week: { start: data.week_start as string, end: data.week_end as string },

      newLeads: maybe(data.new_leads),
      newRequests: maybe(data.new_requests),
      quotesSentCount: maybe(data.quotes_sent_count),
      quotesSentValue: maybe(data.quotes_sent_value),
      convertedCount: n(data.converted_count),
      convertedValue: n(data.converted_value),
      approvedCount: n(data.approved_count),
      approvedValue: n(data.approved_value),
      wonCount: n(data.won_count),
      wonValue: n(data.won_value),
      conversionRate: maybe(data.conversion_rate),
      collapsedQuotes: (data.collapsed_quotes as string[]) ?? [],
      // Not its own column; lives in raw so no migration is needed.
      wonEarlierToo: ((data.raw as { wonEarlierToo?: string[] })?.wonEarlierToo) ?? [],

      invoicedValue: maybe(data.invoiced_value),
      revenueClosed: n(data.revenue_closed),
      labourCost: n(data.labour_cost),
      materialCost: n(data.material_cost),
      grossProfit: n(data.gross_profit),
      grossProfitRate: maybe(data.gross_profit_rate),
      timeTrackedHours: n(data.time_tracked_hours),
      jobsClosed: Array.isArray((data.raw as { jobs?: unknown[] })?.jobs)
        ? ((data.raw as { jobs: unknown[] }).jobs.length)
        : 0,

      cashBalance: maybe(data.cash_balance),
      arTotal: maybe(data.ar_total),
      arOver30: maybe(data.ar_over_30),
      arOver30Rate: maybe(data.ar_over_30_rate),
      invoicesOver30: maybe(data.invoices_over_30),

      problems: (data.problems as Problem[]) ?? [],
    },
  };
}

export async function loadWeek(weekStart: string): Promise<StoredWeek | null> {
  if (!available()) return null;

  const { data, error } = await serviceClient()
    .from("week_snapshots")
    .select("*")
    .eq("week_start", weekStart)
    .maybeSingle();

  if (error) throw new Error(`Could not read the stored week: ${error.message}`);
  if (!data) return null;

  return toStoredWeek(data as Row);
}

/**
 * The weeks behind the trend charts, oldest first.
 *
 * Only weeks already stored. A chart cannot show a week nobody has opened,
 * and inventing the gap — interpolating, or drawing zero — would put a line
 * on the page that describes nothing. So the charts plot what exists and say
 * how many weeks that is.
 *
 * Bounded because a year of Mondays is the most any of these charts can show
 * legibly, and reading more would cost a query nothing uses.
 */
export async function loadRecentWeeks(
  upTo: string,
  limit = 14,
): Promise<StoredWeek[]> {
  if (!available()) return [];

  const { data, error } = await serviceClient()
    .from("week_snapshots")
    .select("*")
    .lte("week_start", upTo)
    .order("week_start", { ascending: false })
    .limit(limit);

  // A dashboard that renders without its charts beats one that will not
  // render, so this degrades rather than throws — same reasoning as
  // syncedWeeks above.
  if (error) return [];
  return (data ?? []).map((row) => toStoredWeek(row as Row)).reverse();
}

/**
 * The weeks the trend charts draw, oldest first.
 *
 * Anchored on the week being viewed and reaching backwards, because the
 * interesting question is how this week compares with the ones before it.
 *
 * But reaching backwards alone leaves the earliest stored week with nothing
 * behind it and an empty chart that says a trend needs two readings — which
 * is true and useless, since eighteen later weeks are sitting right there.
 * So when there is not enough history, the window extends forwards instead.
 * The anchor is still marked on the chart, so it stays obvious which week the
 * figures above belong to.
 */
export async function loadTrendWeeks(
  anchor: string,
  limit = 14,
): Promise<StoredWeek[]> {
  const before = await loadRecentWeeks(anchor, limit);
  if (before.length >= limit || !available()) return before;

  const { data, error } = await serviceClient()
    .from("week_snapshots")
    .select("*")
    .gt("week_start", anchor)
    .order("week_start", { ascending: true })
    .limit(limit - before.length);

  if (error) return before;
  return [...before, ...(data ?? []).map((row) => toStoredWeek(row as Row))];
}

/**
 * Writes a computed week.
 *
 * `raw` keeps the quotes and jobs the figures came from, so a week can be
 * recomputed after a definition changes without going back to Jobber — which
 * matters, because the cross-week counting rule is still unconfirmed with
 * CSK and changing it should not mean re-querying a year of history.
 */
export async function saveWeek(
  metrics: ComputedWeek,
  raw: unknown,
): Promise<void> {
  if (!available()) return;

  const { error } = await serviceClient().from("week_snapshots").upsert(
    {
      week_start: metrics.week.start,
      week_end: metrics.week.end,

      new_leads: metrics.newLeads,
      new_requests: metrics.newRequests,
      quotes_sent_count: metrics.quotesSentCount,
      quotes_sent_value: metrics.quotesSentValue,
      converted_count: metrics.convertedCount,
      converted_value: metrics.convertedValue,
      approved_count: metrics.approvedCount,
      approved_value: metrics.approvedValue,
      won_count: metrics.wonCount,
      won_value: metrics.wonValue,
      conversion_rate: metrics.conversionRate,
      collapsed_quotes: metrics.collapsedQuotes,

      invoiced_value: metrics.invoicedValue,
      revenue_closed: metrics.revenueClosed,
      labour_cost: metrics.labourCost,
      material_cost: metrics.materialCost,
      gross_profit: metrics.grossProfit,
      gross_profit_rate: metrics.grossProfitRate,
      time_tracked_hours: metrics.timeTrackedHours,

      cash_balance: metrics.cashBalance,
      ar_total: metrics.arTotal,
      ar_over_30: metrics.arOver30,
      ar_over_30_rate: metrics.arOver30Rate,
      invoices_over_30: metrics.invoicesOver30,

      problems: metrics.problems,
      raw,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "week_start" },
  );

  if (error) throw new Error(`Could not store the week: ${error.message}`);
}
