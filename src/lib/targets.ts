import type { Week } from "./metric-rules";

/**
 * CSK's annual plan, and what it means for one week.
 *
 * Taken verbatim from the two MBP planning sheets the client sent on 19
 * September 2026. Nothing here is derived or estimated: these are the numbers
 * in their cells.
 *
 * THE YEAR RUNS JULY TO JUNE
 *
 * Both sheets start at July and end at June, and the production sheet's
 * cumulative column reaches exactly 100.0% at June. So "this year" on the
 * plan is not the calendar year, and a target for January 2027 comes from the
 * seventh row, not the first.
 *
 * THE PLAN RECONCILES, WHICH IS WHY IT IS WORTH TRUSTING
 *
 * Checked before building anything on it:
 *
 *   $ booked, twelve months        3,400,000   sheet says New Sales 3,400,000
 *   plus carry over                  597,000
 *   equals total sales             3,997,000   sheet says 3,997,000
 *   estimates / leads                  78.7%   sheet says 79%
 *   jobs booked / estimates            66.7%   sheet says 67%
 *   $ booked / jobs booked            $5,686   sheet says $5,681
 *   $ produced / hours produced      $102.32   sheet says $102.33/hr
 *
 * The per-month counts are rounded — 284 + 102 is 386, and their cumulative
 * column says 387 — so the underlying plan is fractional and what is printed
 * is a rounding of it. Differences of one lead or one estimate in a month are
 * that, not a mistake.
 *
 * BOOKED IS NOT PRODUCED
 *
 * Two different sheets and two different numbers: $3.4m booked against $3.0m
 * produced. Booked is the value of quotes won; produced is the value of work
 * completed. They are months apart on a construction job and must never be
 * compared with each other. On this dashboard, booked is Total Quotes Won ($)
 * and produced is Revenue — Jobs Closed ($).
 */

/** July is index 0. The plan's own ordering. */
export const FISCAL_YEAR_STARTS_IN_MONTH = 7;

interface MonthPlan {
  /** Calendar month, 1-12. */
  readonly month: number;
  readonly leads: number;
  /** Quotes sent. The sheet calls them estimates. */
  readonly estimates: number;
  /** Quotes won. The sheet calls them jobs booked. */
  readonly jobsBooked: number;
  /** Value of quotes won. */
  readonly booked: number;
  /** Revenue on work completed. */
  readonly produced: number;
  readonly hours: number;
}

/** One row per month of the plan, July first, exactly as the sheets read. */
export const MONTHLY_PLAN: readonly MonthPlan[] = [
  { month: 7,  leads: 91,  estimates: 72, jobsBooked: 48, booked: 272_000, produced: 242_640, hours: 2_372 },
  { month: 8,  leads: 91,  estimates: 72, jobsBooked: 48, booked: 272_000, produced: 242_640, hours: 2_372 },
  { month: 9,  leads: 102, estimates: 81, jobsBooked: 54, booked: 306_000, produced: 264_640, hours: 2_585 },
  { month: 10, leads: 102, estimates: 81, jobsBooked: 54, booked: 306_000, produced: 264_640, hours: 2_585 },
  { month: 11, leads: 102, estimates: 81, jobsBooked: 54, booked: 306_000, produced: 264_640, hours: 2_585 },
  { month: 12, leads: 86,  estimates: 66, jobsBooked: 45, booked: 262_000, produced: 242_640, hours: 2_372 },
  { month: 1,  leads: 86,  estimates: 66, jobsBooked: 45, booked: 262_000, produced: 242_640, hours: 2_372 },
  { month: 2,  leads: 102, estimates: 81, jobsBooked: 54, booked: 306_000, produced: 264_640, hours: 2_585 },
  { month: 3,  leads: 94,  estimates: 74, jobsBooked: 49, booked: 277_000, produced: 242_640, hours: 2_372 },
  { month: 4,  leads: 94,  estimates: 74, jobsBooked: 49, booked: 277_000, produced: 242_640, hours: 2_372 },
  { month: 5,  leads: 94,  estimates: 74, jobsBooked: 49, booked: 277_000, produced: 242_640, hours: 2_372 },
  { month: 6,  leads: 94,  estimates: 74, jobsBooked: 49, booked: 277_000, produced: 242_640, hours: 2_372 },
];

/**
 * The ratios, straight off the summary panels.
 *
 * These are NOT pro-rated to a week. A conversion rate is a rate whatever
 * period you measure it over — dividing 67% by four would be nonsense — so a
 * week either hits the ratio or it does not.
 */
export const RATIO_TARGETS = {
  /** Estimates ÷ leads. How many enquiries turn into a quote. */
  leadConversion: 0.79,
  /** Jobs booked ÷ estimates. The dashboard's Quote Conversion %. */
  salesRatio: 0.67,
  /** $ booked ÷ jobs booked. */
  averageJobSize: 5_681,
  /** $ produced ÷ hours produced. */
  chargeRatePerHour: 102.33,
} as const;

/** Annual totals, for context rather than for weekly comparison. */
export const ANNUAL_PLAN = {
  newSales: 3_400_000,
  carryOverSales: 597_000,
  totalSales: 3_997_000,
  produced: 3_000_000,
} as const;

/* ------------------------------------------------------- monthly to weekly */

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function planFor(month: number): MonthPlan {
  const found = MONTHLY_PLAN.find((m) => m.month === month);
  if (!found) throw new Error(`No plan row for month ${month}.`);
  return found;
}

export interface WeeklyTargets {
  readonly leads: number;
  readonly quotesSent: number;
  readonly quotesWon: number;
  readonly wonValue: number;
  readonly revenue: number;
  readonly hours: number;
}

/**
 * A week's share of the monthly plan, counted day by day.
 *
 * Not "monthly ÷ 4", and not "annual ÷ 52". Each of the seven days takes that
 * month's plan divided by that month's length, and the seven are added.
 *
 * Two reasons it has to work this way. The months are not equal — September
 * plans 102 leads and December 86 — so a flat annual weekly figure would set
 * the wrong bar most of the year. And a week that straddles the turn of a
 * month genuinely belongs to both: the week of 29 September 2026 is two days
 * of September's plan and five of October's, and pretending otherwise puts a
 * fifth of a month's target in the wrong place.
 *
 * Dates are built from the ISO strings with UTC arithmetic. Parsing them as
 * local time shifts a day west of UTC, which is the bug that once put the
 * week boundaries seven hours out.
 */
export function weeklyTargets(week: Week): WeeklyTargets {
  const [y, m, d] = week.start.split("-").map(Number);
  const start = Date.UTC(y!, m! - 1, d!);

  const totals: WeeklyTargets = {
    leads: 0,
    quotesSent: 0,
    quotesWon: 0,
    wonValue: 0,
    revenue: 0,
    hours: 0,
  };
  const sum = totals as { -readonly [K in keyof WeeklyTargets]: number };

  for (let day = 0; day < 7; day += 1) {
    const at = new Date(start + day * 86_400_000);
    const month = at.getUTCMonth() + 1;
    const share = 1 / daysInMonth(at.getUTCFullYear(), month);
    const plan = planFor(month);

    sum.leads += plan.leads * share;
    sum.quotesSent += plan.estimates * share;
    sum.quotesWon += plan.jobsBooked * share;
    sum.wonValue += plan.booked * share;
    sum.revenue += plan.produced * share;
    sum.hours += plan.hours * share;
  }

  return totals;
}

/* ------------------------------------------------------------- performance */

/**
 * How a figure sits against its target.
 *
 * `null` where there is no figure. A week with nothing to report is not a
 * week that missed — and colouring an absent number red is how a gap in the
 * data turns into a conversation about performance.
 */
export function against(
  actual: number | null,
  target: number,
): { ratio: number; tone: "good" | "warn" | "bad" } | null {
  if (actual === null || target <= 0) return null;

  const ratio = actual / target;

  /**
   * Ninety per cent counts as on plan.
   *
   * These targets are a twelfth of an annual plan cut into sevenths of a
   * month. A single large job landing on a Monday rather than the previous
   * Friday moves a week by more than ten per cent on its own, so a tighter
   * band would flag ordinary timing as failure every other week and the
   * colour would stop meaning anything.
   */
  const tone = ratio >= 0.9 ? "good" : ratio >= 0.7 ? "warn" : "bad";
  return { ratio, tone };
}
