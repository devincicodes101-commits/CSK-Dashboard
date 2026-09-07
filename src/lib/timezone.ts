/**
 * CSK's week runs in CSK's timezone, not in UTC.
 *
 * This was wrong until 7 September 2026 and it was wrong everywhere. Weeks
 * were bounded at UTC midnight, which in Surrey is 5pm the previous
 * afternoon. So a quote approved on Sunday evening, or a job completed after
 * work on a Friday, landed in the following week — and the figures still
 * looked completely reasonable, which is why it went unnoticed.
 *
 * It surfaced by accident: Jobber's own Insights reported 16 new leads for
 * 10-16 August where the same range through the API returned 15. Seven hours
 * of a week, in one client record.
 *
 * Everything that compares a timestamp to a week boundary goes through here.
 */

/**
 * CSK Electric is in Surrey, British Columbia.
 *
 * Overridable because the next client will not be, but it is a real IANA
 * zone rather than a fixed offset on purpose: British Columbia observes
 * daylight saving, so a hardcoded -8 would be an hour out for two thirds of
 * the year, including the entire verified week.
 */
export const ACCOUNT_TIMEZONE = process.env.ACCOUNT_TIMEZONE?.trim() || "America/Vancouver";

/** How far the zone is ahead of UTC at a given instant, in milliseconds. */
function offsetAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  const asIfUtc = Date.UTC(
    at("year"),
    at("month") - 1,
    at("day"),
    // Intl renders midnight as 24 in some engines with hour12:false.
    at("hour") % 24,
    at("minute"),
    at("second"),
  );
  return asIfUtc - instant.getTime();
}

/**
 * The calendar date an instant falls on, in the account's timezone.
 *
 * A plain "2026-08-04" is returned unchanged: it is already a local date, not
 * an instant, and re-interpreting it would shift it by the offset.
 */
export function localDate(iso: string, timeZone = ACCOUNT_TIMEZONE): string {
  if (iso.length === 10) return iso;

  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return iso.slice(0, 10);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * The UTC instant for local midnight, or the last second of a local day.
 *
 * Used to build the date filters sent to Jobber, so that "the week of 10
 * August" means what CSK mean by it.
 */
export function zonedInstant(
  date: string,
  edge: "start" | "end",
  timeZone = ACCOUNT_TIMEZONE,
): string {
  const naive = new Date(`${date}T${edge === "end" ? "23:59:59.999" : "00:00:00.000"}Z`);

  // Correct twice. The first pass uses the offset at the wrong instant, which
  // is off by an hour when the correction itself crosses a daylight saving
  // boundary; the second settles it.
  let guess = new Date(naive.getTime() - offsetAt(naive, timeZone));
  guess = new Date(naive.getTime() - offsetAt(guess, timeZone));

  return guess.toISOString();
}
