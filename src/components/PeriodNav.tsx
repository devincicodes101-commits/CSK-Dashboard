import { weekFromMonday } from "@/lib/metric-rules";
import {
  type PeriodKind,
  lastCompletedWeek,
  monthLabel,
  monthOf,
  monthsOfYear,
  shiftMonth,
  shiftWeek,
  weekLabel,
  weekLabelWithYear,
  weeksOfYear,
  yearOfWeek,
} from "@/lib/periods";

/**
 * Moving between periods.
 *
 * Entirely links and one <details>, with no client JavaScript. Every control
 * is a real anchor, so it is keyboard reachable and works before hydration —
 * which suits a page rendered from a stored snapshot.
 *
 * The list holds a whole year, grouped by month, rather than a rolling window
 * counting back from wherever you happen to be. A rolling window meant moving
 * to July put August off the end with no way back to it.
 */

function Chevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={direction === "left" ? "M10 3 L5 8 L10 13" : "M6 3 L11 8 L6 13"} />
    </svg>
  );
}

const STEP =
  "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line-strong text-ink-3 transition-colors duration-200 hover:border-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

interface Option {
  key: string;
  href: string;
  label: string;
  /** Heading this option sits under, e.g. "August". */
  group: string;
}

export function PeriodNav({
  kind,
  weekStart,
  month,
  syncedPeriods,
}: {
  kind: PeriodKind;
  weekStart: string;
  month: string;
  /** Periods with stored figures, so the list can show which. */
  syncedPeriods: readonly string[];
}) {
  const isWeekly = kind === "weekly";
  const year = isWeekly ? yearOfWeek(weekStart) : Number(month.slice(0, 4));

  const current = isWeekly
    ? weekLabelWithYear(weekFromMonday(weekStart))
    : monthLabel(month);

  const previous = isWeekly
    ? `/?week=${shiftWeek(weekStart, -1)}`
    : `/?period=monthly&month=${shiftMonth(month, -1)}`;
  const next = isWeekly
    ? `/?week=${shiftWeek(weekStart, 1)}`
    : `/?period=monthly&month=${shiftMonth(month, 1)}`;

  const selected = isWeekly ? weekStart : month;

  const options: Option[] = isWeekly
    ? weeksOfYear(year, lastCompletedWeek()).map((monday) => ({
        key: monday,
        href: `/?week=${monday}`,
        label: weekLabel(weekFromMonday(monday)),
        group: monthLabel(monthOf(monday)).replace(` ${year}`, ""),
      }))
    : monthsOfYear(year, monthOf(new Date().toISOString().slice(0, 10))).map((ym) => ({
        key: ym,
        href: `/?period=monthly&month=${ym}`,
        label: monthLabel(ym).replace(` ${year}`, ""),
        group: String(year),
      }));

  // Group in place; the list is already newest first, so months come out in
  // that order without sorting again.
  const groups: { name: string; items: Option[] }[] = [];
  for (const option of options) {
    const last = groups[groups.length - 1];
    if (last && last.name === option.group) last.items.push(option);
    else groups.push({ name: option.group, items: [option] });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
      <div
        role="group"
        aria-label="Reporting period"
        className="inline-flex rounded-full border border-line p-0.5"
      >
        <TabLink href={`/?week=${weekStart}`} active={isWeekly}>
          Weekly
        </TabLink>
        <TabLink href={`/?period=monthly&month=${month}`} active={!isWeekly}>
          Monthly
        </TabLink>
      </div>

      <div className="flex items-center gap-2">
        <a href={previous} className={STEP} aria-label="Previous period" rel="nofollow">
          <Chevron direction="left" />
        </a>

        <details className="relative">
          <summary className="micro flex h-9 cursor-pointer list-none items-center gap-2 rounded-full border border-line-strong px-4 text-ink transition-colors duration-200 hover:border-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            {current}
            <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden fill="currentColor">
              <path d="M3 6 L8 11 L13 6 Z" />
            </svg>
          </summary>

          <div className="absolute left-0 top-11 z-30 max-h-[26rem] w-64 overflow-y-auto rounded-xl border border-line bg-raised py-1 shadow-2xl shadow-black/60">
            <p className="micro sticky top-0 z-10 bg-raised px-4 py-2.5 text-accent">
              {year}
            </p>

            {groups.map((group) => (
              <div key={group.name}>
                <p className="micro px-4 py-2 text-ink-4">{group.name}</p>
                <ul>
                  {group.items.map((option) => {
                    const isSelected = option.key === selected;
                    const synced = syncedPeriods.includes(option.key);
                    return (
                      <li key={option.key}>
                        <a
                          href={option.href}
                          aria-current={isSelected ? "page" : undefined}
                          className={`micro flex cursor-pointer items-center justify-between gap-3 py-2 pl-6 pr-4 transition-colors duration-150 focus-visible:outline-none ${
                            isSelected
                              ? "bg-accent-tint text-accent"
                              : "text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 focus-visible:text-ink"
                          }`}
                        >
                          {option.label}
                          {synced ? (
                            <span className="text-good" title="has figures">
                              &#9679;
                            </span>
                          ) : null}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </details>

        <a href={next} className={STEP} aria-label="Next period" rel="nofollow">
          <Chevron direction="right" />
        </a>
      </div>
    </div>
  );
}

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={`micro cursor-pointer rounded-full px-4 py-2 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        active ? "bg-accent-tint text-accent" : "text-ink-3 hover:text-ink"
      }`}
    >
      {children}
    </a>
  );
}
