import { weekFromMonday } from "@/lib/metric-rules";
import {
  lastCompletedWeek,
  monthLabel,
  monthOf,
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
 *
 * There was a Weekly/Monthly toggle here. Monthly is out of scope — CSK asked
 * for it to be dropped — and a tab leading to an explanation of why a tab does
 * nothing is worse than no tab.
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
  "inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-line bg-surface text-ink-3 shadow-sm transition-colors duration-200 hover:border-accent-soft hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

interface Option {
  key: string;
  href: string;
  label: string;
  /** Heading this option sits under, e.g. "August". */
  group: string;
}

export function PeriodNav({
  weekStart,
  syncedPeriods,
}: {
  weekStart: string;
  /** Weeks with stored figures, so the list can show which. */
  syncedPeriods: readonly string[];
}) {
  const year = yearOfWeek(weekStart);
  const current = weekLabelWithYear(weekFromMonday(weekStart));
  const previous = `/?week=${shiftWeek(weekStart, -1)}`;
  const next = `/?week=${shiftWeek(weekStart, 1)}`;
  const selected = weekStart;

  const options: Option[] = weeksOfYear(year, lastCompletedWeek()).map((monday) => ({
    key: monday,
    href: `/?week=${monday}`,
    label: weekLabel(weekFromMonday(monday)),
    group: monthLabel(monthOf(monday)).replace(` ${year}`, ""),
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
      <div className="flex items-center gap-2">
        <a href={previous} className={STEP} aria-label="Previous period" rel="nofollow">
          <Chevron direction="left" />
        </a>

        <details className="relative">
          <summary className="micro flex h-9 cursor-pointer list-none items-center gap-2 rounded-full border border-line bg-surface px-4 text-ink shadow-sm transition-colors duration-200 hover:border-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            {current}
            <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden fill="currentColor">
              <path d="M3 6 L8 11 L13 6 Z" />
            </svg>
          </summary>

          <div className="card absolute left-0 top-11 z-30 max-h-[26rem] w-64 overflow-y-auto py-1">
            <p className="micro sticky top-0 z-10 bg-surface px-4 py-2.5 text-accent">
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
