import { weeklyTargets } from "./targets.ts";

/**
 * The month so far, against the month's plan.
 *
 * WHY THIS EXISTS
 *
 * CSK's plan is monthly. Cutting it into flat sevenths and judging one week
 * against its slice produces figures that are arithmetically correct and
 * badly misleading: the week of 3 August 2026 reads 21% of its revenue target
 * and 28% of its quotes-won target, while CSK's own sheet shows August
 * finishing at 82% and 112% of plan. That week contained BC Day. Four working
 * days measured against a seven-day target will always look like collapse.
 *
 * Their own sheets avoid this by being cumulative, and this is that column.
 * A weekly figure still answers "how was last week"; this answers "are we on
 * plan", which is the question a target is actually for.
 *
 * WEEKS BELONG TO THE MONTH THEIR MONDAY FALLS IN
 *
 * A week can straddle the turn of a month and the stored figures are weekly
 * totals — there is no way to split one across the boundary after the fact.
 * So a week counts wholly towards the month it began in. The weekly TARGET
 * for that week still draws on both months' plans, which is correct and keeps
 * actual and target measuring the same seven days.
 *
 * THE TARGET COVERS ONLY THE WEEKS THAT ARE STORED
 *
 * If a week in the month was never fetched, its actuals are missing. Setting
 * the target to the whole elapsed month regardless would show that gap as a
 * shortfall in performance, which is the exact failure this module exists to
 * prevent. So the target sums the same weeks the actuals came from, and the
 * count of weeks is reported alongside so a partial month reads as partial.
 */

export interface WeekFigures {
  readonly start: string;
  readonly end: string;
  readonly newLeads: number | null;
  readonly quotesSentCount: number | null;
  readonly wonCount: number;
  readonly wonValue: number;
  readonly revenueClosed: number;
}

export interface Progress {
  readonly label: string;
  readonly actual: number | null;
  readonly target: number;
  readonly kind: "count" | "money";
}

export interface MonthToDate {
  /** "August 2026". */
  readonly month: string;
  /** Weeks in this month, up to and including the anchor, that are stored. */
  readonly weeksCounted: number;
  /** Weeks that had begun by the anchor. Fewer counted means a partial view. */
  readonly weeksElapsed: number;
  readonly rows: readonly Progress[];
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Every Monday of the anchor's month, up to and including the anchor.
 *
 * Built with UTC arithmetic on the ISO string. Parsing "2026-08-03" as local
 * time lands on the 2nd anywhere west of UTC, which is the bug that once put
 * the week boundaries seven hours out.
 */
function mondaysUpTo(anchorMonday: string): string[] {
  const [y, m] = anchorMonday.split("-").map(Number);

  const mondays: string[] = [];
  const first = new Date(Date.UTC(y!, m! - 1, 1));
  // 0 is Sunday; Monday is 1.
  const offset = (8 - first.getUTCDay()) % 7;
  let at = new Date(first.getTime() + offset * 86_400_000);

  while (at.getUTCMonth() === m! - 1) {
    const iso = at.toISOString().slice(0, 10);
    if (iso > anchorMonday) break;
    mondays.push(iso);
    at = new Date(at.getTime() + 7 * 86_400_000);
  }
  return mondays;
}

export function monthToDate(
  stored: readonly WeekFigures[],
  anchorMonday: string,
): MonthToDate {
  const [y, m] = anchorMonday.split("-").map(Number);
  const elapsed = mondaysUpTo(anchorMonday);
  const wanted = new Set(elapsed);

  const counted = stored.filter((w) => wanted.has(w.start));

  /**
   * Sums a column, and returns null only when NOTHING contributed.
   *
   * A month where leads were recorded in two weeks out of three is a partial
   * figure worth showing, not a missing one. A month where they were never
   * recorded at all is missing, and must not read as zero.
   */
  const sum = (pick: (w: WeekFigures) => number | null): number | null => {
    const values = counted.map(pick).filter((v): v is number => v !== null);
    return values.length === 0 ? null : values.reduce((t, v) => t + v, 0);
  };

  // The target covers exactly the weeks the actuals came from.
  const target = counted.reduce(
    (totals, w) => {
      const t = weeklyTargets({ start: w.start, end: w.end });
      return {
        leads: totals.leads + t.leads,
        quotesSent: totals.quotesSent + t.quotesSent,
        quotesWon: totals.quotesWon + t.quotesWon,
        wonValue: totals.wonValue + t.wonValue,
        revenue: totals.revenue + t.revenue,
      };
    },
    { leads: 0, quotesSent: 0, quotesWon: 0, wonValue: 0, revenue: 0 },
  );

  return {
    month: `${MONTHS[m! - 1]} ${y}`,
    weeksCounted: counted.length,
    weeksElapsed: elapsed.length,
    rows: [
      {
        label: "Revenue — jobs closed",
        actual: sum((w) => w.revenueClosed),
        target: target.revenue,
        kind: "money",
      },
      {
        label: "Total quotes won ($)",
        actual: sum((w) => w.wonValue),
        target: target.wonValue,
        kind: "money",
      },
      {
        label: "Quotes won",
        actual: sum((w) => w.wonCount),
        target: target.quotesWon,
        kind: "count",
      },
      {
        label: "Quotes sent",
        actual: sum((w) => w.quotesSentCount),
        target: target.quotesSent,
        kind: "count",
      },
      {
        label: "New leads",
        actual: sum((w) => w.newLeads),
        target: target.leads,
        kind: "count",
      },
    ],
  };
}
