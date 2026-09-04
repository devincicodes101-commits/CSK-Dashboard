import { weekFromMonday } from "@/lib/metric-rules";
import {
  type PeriodKind,
  monthLabel,
  recentMonths,
  recentWeeks,
  shiftMonth,
  shiftWeek,
  weekLabel,
  weekLabelWithYear,
} from "@/lib/periods";

/**
 * Moving between periods.
 *
 * Entirely links and one <details>, with no client JavaScript. Every control
 * is a real anchor, so it is keyboard reachable, opens in a new tab if someone
 * wants that, and works before hydration — which matters when the whole page
 * is server rendered from a stored snapshot anyway.
 *
 * The <details> list is used rather than a <select> because a select needs JS
 * to navigate on change, and rather than a calendar grid because the choice is
 * "which of the last 13 weeks", not "which day of the year".
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

export function PeriodNav({
  kind,
  weekStart,
  month,
  syncedPeriods,
}: {
  kind: PeriodKind;
  /** Monday of the selected week. */
  weekStart: string;
  /** "2026-08" — the selected month. */
  month: string;
  /** Periods that actually have stored figures, so the list can say which. */
  syncedPeriods: readonly string[];
}) {
  const isWeekly = kind === "weekly";

  const current = isWeekly
    ? weekLabelWithYear(weekFromMonday(weekStart))
    : monthLabel(month);

  const previous = isWeekly
    ? `/?week=${shiftWeek(weekStart, -1)}`
    : `/?period=monthly&month=${shiftMonth(month, -1)}`;
  const next = isWeekly
    ? `/?week=${shiftWeek(weekStart, 1)}`
    : `/?period=monthly&month=${shiftMonth(month, 1)}`;

  const options = isWeekly
    ? recentWeeks(13, weekStart).map((monday) => ({
        href: `/?week=${monday}`,
        label: weekLabel(weekFromMonday(monday)),
        key: monday,
      }))
    : recentMonths(12, month).map((ym) => ({
        href: `/?period=monthly&month=${ym}`,
        label: monthLabel(ym),
        key: ym,
      }));

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-4">
      {/* Weekly / Monthly */}
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

      {/* ← current ▾ → */}
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

          <ul className="absolute left-0 top-11 z-30 max-h-80 w-60 overflow-y-auto rounded-xl border border-line bg-raised py-1.5 shadow-2xl shadow-black/50">
            {options.map((option) => {
              const synced = syncedPeriods.includes(option.key);
              return (
                <li key={option.key}>
                  <a
                    href={option.href}
                    className="micro flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 text-ink-2 transition-colors duration-150 hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 focus-visible:text-ink focus-visible:outline-none"
                  >
                    {option.label}
                    {synced ? (
                      <span className="text-good" aria-label="has figures">
                        &#9679;
                      </span>
                    ) : (
                      <span className="text-ink-4" aria-label="not synced">
                        &#9675;
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
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
        active
          ? "bg-accent-tint text-accent"
          : "text-ink-3 hover:text-ink"
      }`}
    >
      {children}
    </a>
  );
}
