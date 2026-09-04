import type { ReactNode } from "react";

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
  ordinal,
  title,
  audience,
  note,
  children,
}: {
  ordinal: string;
  title: string;
  audience: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-line bg-surface">
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

      {note ? (
        <footer className="flex flex-col gap-2 border-t border-line bg-surface-2 px-6 py-4">
          {note}
        </footer>
      ) : null}
    </section>
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
    muted: "border-line-strong text-ink-3",
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
      ? "bg-accent text-ground hover:bg-[#e0a463]"
      : "border border-line-strong text-ink-2 hover:border-accent-soft hover:text-ink";

  return (
    <a href={href} className={`${base} ${look}`}>
      {children}
    </a>
  );
}
