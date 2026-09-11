import type { ReactNode } from "react";
import { Delta, Sparkline } from "./charts";

/**
 * A block is the unit of distribution, not just of layout.
 *
 * Chase screenshots one of these and sends it on, so each has to survive
 * alone in somebody's inbox: its own heading, its own audience, and the
 * corrections that explain why its figures differ from Jobber's screen.
 *
 * Hence the border and the ordinal. The number is not decoration — the three
 * blocks go out in that order, to those people, every Wednesday.
 */
export function Block({
  id,
  ordinal,
  title,
  audience,
  note,
  children,
}: {
  id: string;
  ordinal: string;
  title: string;
  audience: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      // scroll-mt so the sidebar's anchor links do not drop the heading under
      // the top of the viewport.
      className="card scroll-mt-6 overflow-hidden"
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-b border-line px-6 py-4">
        <div className="flex items-baseline gap-4">
          <span className="micro text-accent">{ordinal}</span>
          <h2 className="font-display text-[15px] font-semibold tracking-tight text-ink">
            {title}
          </h2>
        </div>
        <p className="micro text-ink-4">{audience}</p>
      </header>

      <div className="px-6 py-6">{children}</div>

      {note ? <Notes>{note}</Notes> : null}
    </section>
  );
}

/**
 * The corrections, folded away.
 *
 * They used to sit open under every block, three lines of small mono text
 * competing with the figures they were explaining. Closed by default keeps
 * the block readable; kept on the block, rather than moved to a page of
 * documentation, because whoever screenshots it needs the explanation
 * attached to the thing being explained.
 */
function Notes({ children }: { children: ReactNode }) {
  return (
    <details className="group border-t border-line bg-surface-2">
      <summary className="micro flex cursor-pointer list-none items-center gap-2 px-6 py-3 text-ink-4 transition-colors duration-200 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <svg
          viewBox="0 0 16 16"
          width="9"
          height="9"
          aria-hidden
          fill="currentColor"
          className="transition-transform duration-200 group-open:rotate-90"
        >
          <path d="M5 3 L11 8 L5 13 Z" />
        </svg>
        Why these differ from Jobber
      </summary>
      <div className="flex flex-col gap-2 px-6 pb-4">{children}</div>
    </details>
  );
}

/** Figures sit on one grid across every block so the eye can run down them. */
export function Metrics({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
      {children}
    </dl>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone = "plain",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "plain" | "good" | "warn" | "bad" | "muted";
}) {
  const toneClass = {
    plain: "text-ink",
    good: "text-good",
    warn: "text-warn",
    bad: "text-bad",
    muted: "text-ink-3",
  }[tone];

  return (
    <div className="flex flex-col gap-1.5">
      <dt className="micro text-ink-3">{label}</dt>
      <dd
        className={`tnum font-display text-[26px] leading-none font-semibold tracking-[-0.02em] ${toneClass}`}
      >
        {value}
      </dd>
      {hint ? (
        <p className="tnum font-mono text-[11px] leading-none text-ink-4">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * States what Jobber's own screen says, next to what we report.
 *
 * Chase can open Jobber and read a different number from the one we hand him.
 * Without the working shown he will conclude the dashboard is broken, and be
 * reasonable in doing so. So the correction ships attached to the block, not
 * buried in documentation nobody opens.
 */
export function Correction({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2.5 font-mono text-[11px] leading-relaxed text-ink-2">
      <span aria-hidden className="mt-px shrink-0 select-none text-accent">
        &#8225;
      </span>
      <span>{children}</span>
    </p>
  );
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "accent" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    muted: "border-line-strong bg-surface-2 text-ink-3",
    accent: "border-accent-soft bg-accent-tint text-accent",
    good: "border-good/40 bg-good-tint text-good",
    warn: "border-warn/40 bg-warn-tint text-warn",
    bad: "border-bad/40 bg-bad-tint text-bad",
  }[tone];

  return (
    <span className={`micro inline-block rounded-full border px-2.5 py-1 ${toneClass}`}>
      {children}
    </span>
  );
}

export function EmptyBlock({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-line-strong px-5 py-8 text-center font-mono text-[11px] leading-relaxed text-ink-4">
      {children}
    </p>
  );
}

/** Bronze on dark for the one real action; outlined for everything else. */
export function Button({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "ghost";
}) {
  const base =
    "inline-flex items-center rounded-full px-4 py-2 font-display text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  const look =
    variant === "primary"
      ? "bg-accent text-on-accent hover:bg-[#12903f]"
      : "border border-line-strong bg-surface text-ink-2 hover:border-accent-soft hover:text-ink";

  return (
    <a href={href} className={`${base} ${look}`}>
      {children}
    </a>
  );
}


/**
 * A headline figure, on its own card.
 *
 * Three of these sit above the blocks. They are not extra metrics — every one
 * also appears in the block it belongs to. They exist because the blocks are
 * built for screenshotting one at a time, which makes them dense, and a dense
 * page has no single thing to look at first.
 *
 * The sparkline and the change are the only things here the blocks do not
 * carry, and both come from stored weeks. Where there is only one stored week
 * neither renders: a trend needs a previous reading, and inventing one to keep
 * the layout tidy would be a lie in the shape of a chart.
 */
export function StatCard({
  label,
  value,
  icon,
  current,
  previous,
  history,
  goodWhen = "up",
  tone = "accent",
  footnote,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  current: number | null;
  previous: number | null;
  history: readonly (number | null)[];
  goodWhen?: "up" | "down";
  tone?: "accent" | "blue";
  footnote?: string;
}) {
  return (
    <section className="card flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full " +
            (tone === "blue" ? "bg-blue-tint text-blue" : "bg-accent-tint text-accent")
          }
        >
          {icon}
        </span>
        <h3 className="micro text-ink-3">{label}</h3>
      </div>

      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="tnum font-display text-[28px] leading-none font-semibold tracking-[-0.03em] text-ink">
            {value}
          </p>
          <Delta current={current} previous={previous} goodWhen={goodWhen} />
        </div>
        <Sparkline values={history} tone={tone} />
      </div>

      {footnote ? (
        <p className="font-mono text-[11px] leading-relaxed text-ink-4">{footnote}</p>
      ) : null}
    </section>
  );
}

/** The small glyphs on the stat cards. */
export function StatIcon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}
