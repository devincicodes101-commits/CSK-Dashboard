/**
 * Moving between reporting periods.
 *
 * Weeks run Monday to Sunday and months are calendar months, because that is
 * how CSK's own spreadsheet is built. Everything here works in UTC: a local
 * timezone would shift a Monday into a Sunday for anyone west of London and
 * silently move a whole week's figures.
 */

import { type Week, weekFromMonday } from "./metric-rules";

export type PeriodKind = "weekly" | "monthly";

/* ------------------------------------------------------------------- weeks */

const DAY = 86_400_000;

function utc(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The Monday of whatever week a date falls in. */
export function mondayOf(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  // getUTCDay is 0 for Sunday, so Sunday belongs to the week that began six
  // days earlier rather than the one starting tomorrow.
  const offset = (d.getUTCDay() + 6) % 7;
  return iso(new Date(d.getTime() - offset * DAY));
}

export function shiftWeek(monday: string, weeks: number): string {
  return iso(new Date(utc(monday).getTime() + weeks * 7 * DAY));
}

/**
 * The most recent week that has actually finished.
 *
 * A week in progress has no meaningful figures — invoices are still being
 * entered and expenses are still landing, which is exactly why CSK deliver on
 * Wednesday for the week before rather than on Monday.
 */
export function lastCompletedWeek(now = new Date()): string {
  return shiftWeek(mondayOf(now), -1);
}

/** Recent Mondays, newest first, for the period list. */
export function recentWeeks(count: number, from: string): string[] {
  return Array.from({ length: count }, (_, i) => shiftWeek(from, -i));
}

/* ------------------------------------------------------------------ months */

/** "2026-08". */
export function monthOf(monday: string): string {
  return monday.slice(0, 7);
}

export function recentMonths(count: number, from: string): string[] {
  const [y, m] = from.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y!, m! - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

export function shiftMonth(month: string, months: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + months, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ labels */

/**
 * "Aug 3 – 9", or "Aug 31 – Sep 6" where the week straddles two months.
 *
 * Repeating the month on both ends reads as two separate dates rather than one
 * span, and the span is the point.
 */
export function weekLabel(week: Week): string {
  const month = (d: Date) =>
    d.toLocaleDateString("en-CA", { month: "short", timeZone: "UTC" });
  const start = utc(week.start);
  const end = utc(week.end);

  return month(start) === month(end)
    ? `${month(start)} ${start.getUTCDate()} – ${end.getUTCDate()}`
    : `${month(start)} ${start.getUTCDate()} – ${month(end)} ${end.getUTCDate()}`;
}

export function weekLabelWithYear(week: Week): string {
  return `${weekLabel(week)}, ${utc(week.start).getUTCFullYear()}`;
}

export function monthLabel(month: string): string {
  return utc(`${month}-01`).toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/* ------------------------------------------------------------------- parse */

/**
 * The week named in the URL, or a fallback.
 *
 * Anything unparseable falls back rather than throwing: a mistyped URL should
 * land the reader on a real week, not an error page.
 */
export function weekFromParam(param: string | undefined, fallback: string): Week {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    try {
      return weekFromMonday(mondayOf(utc(param)));
    } catch {
      /* fall through */
    }
  }
  return weekFromMonday(fallback);
}
