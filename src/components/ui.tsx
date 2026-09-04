import type { ReactNode } from "react";

/**
 * A block is the unit of distribution, not just of layout.
 *
 * Chase screenshots one of these at a time and sends it on, so each carries
 * its own heading, its own audience, and enough context to make sense alone in
 * somebody's inbox. That is why the audience is printed on it rather than
 * living in a sidebar.
 */
export function Block({
  title,
  audience,
  note,
  children,
}: {
  title: string;
  audience: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-lg border border-line bg-surface">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line px-5 py-3.5">
        <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
        <p className="text-xs text-ink-3">{audience}</p>
      </header>
      <div className="px-5 py-4">{children}</div>
      {note ? (
        <footer className="border-t border-line bg-surface-2 px-5 py-3 text-xs leading-relaxed text-ink-2">
          {note}
        </footer>
      ) : null}
    </section>
  );
}

/** A row of figures. Two up on a phone, four up on a laptop. */
export function Metrics({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
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
    <div>
      <dt className="text-xs font-medium text-ink-3">{label}</dt>
      <dd className={`tnum mt-0.5 text-2xl font-semibold tracking-tight ${toneClass}`}>
        {value}
      </dd>
      {hint ? <p className="mt-0.5 text-xs text-ink-3">{hint}</p> : null}
    </div>
  );
}

/**
 * States a figure Jobber's own screen shows, next to ours.
 *
 * Chase can open Jobber and see a different number from the one we hand him.
 * If we do not show our working he will reasonably conclude the dashboard is
 * broken, so the correction is printed rather than hidden.
 */
export function Correction({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 text-xs leading-relaxed text-ink-2">
      <span aria-hidden className="mt-px select-none text-accent">
        ‡
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
  tone?: "muted" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    muted: "bg-surface-2 text-ink-2",
    good: "bg-good-tint text-good",
    warn: "bg-warn-tint text-warn",
    bad: "bg-bad-tint text-bad",
  }[tone];

  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${toneClass}`}
    >
      {children}
    </span>
  );
}

export function EmptyBlock({ children }: { children: ReactNode }) {
  return (
    <p className="rounded border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-3">
      {children}
    </p>
  );
}
