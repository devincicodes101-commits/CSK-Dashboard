import type { ReactNode } from "react";

/**
 * The charts, drawn as inline SVG.
 *
 * No charting library. Every one of these is a handful of points scaled into a
 * box, and a dependency would cost more kilobytes than the whole rest of the
 * page while giving a palette that is nearly ours. Inline SVG also renders on
 * the server, so the figures are in the HTML — which matters because these
 * blocks get screenshotted, and a chart that paints after hydration is a chart
 * that is sometimes missing from the screenshot.
 *
 * Honesty rules that apply to all of them:
 *
 *  - Only weeks actually stored are plotted. A gap is left as a gap; nothing
 *    is interpolated, and a missing week never renders as zero.
 *  - Fewer than two points draws nothing and says why. A single dot implying
 *    a trend is worse than an empty frame.
 *  - Curves are smoothed for the eye, but every real reading gets a dot on it,
 *    so what was measured and what was drawn between are distinguishable.
 */

export interface Point {
  /** Monday, ISO. The identity of the reading. */
  readonly key: string;
  /** Short axis label, e.g. "4 Aug". */
  readonly label: string;
  readonly value: number | null;
}

/* --------------------------------------------------------------- formatting */

export function compact(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return sign + "$" + (abs / 1_000_000).toFixed(1) + "m";
  if (abs >= 1_000) return sign + "$" + Math.round(abs / 1_000) + "k";
  return sign + "$" + Math.round(abs);
}

/* -------------------------------------------------------------------- frame */

function ChartFrame({
  title,
  subtitle,
  aside,
  children,
}: {
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card flex min-w-0 flex-col p-5 sm:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div>
          <h3 className="font-display text-[15px] font-semibold tracking-tight text-ink">
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-ink-3">
              {subtitle}
            </p>
          ) : null}
        </div>
        {aside}
      </header>
      {children}
    </section>
  );
}

/** Says why a chart is blank instead of drawing an empty grid. */
function TooFew({ have }: { have: number }) {
  return (
    <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed border-line-strong px-6 text-center">
      <p className="font-mono text-[11px] leading-relaxed text-ink-3">
        {have === 0
          ? "No weeks stored yet. Open a few weeks and they will chart here."
          : "One week stored. A second is needed before there is a trend to draw."}
      </p>
    </div>
  );
}

/** A readable top-of-axis: 12,481 becomes 15,000 rather than 12,481. */
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(max));
  return Math.ceil(max / (magnitude / 2)) * (magnitude / 2);
}

/**
 * A smooth path through the points.
 *
 * Cardinal spline at low tension. Enough to soften the line without inventing
 * a swing between two readings that the readings do not support.
 */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return "";
  const d: string[] = ["M " + pts[0]!.x + " " + pts[0]!.y];

  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const t = 0.18;

    const c1x = p1.x + (p2.x - p0.x) * t;
    const c1y = p1.y + (p2.y - p0.y) * t;
    const c2x = p2.x - (p3.x - p1.x) * t;
    const c2y = p2.y - (p3.y - p1.y) * t;

    d.push("C " + c1x + " " + c1y + ", " + c2x + " " + c2y + ", " + p2.x + " " + p2.y);
  }
  return d.join(" ");
}

/* --------------------------------------------------------------- area trend */

export function AreaTrend({
  title,
  subtitle,
  points,
  aside,
}: {
  title: string;
  subtitle?: string;
  points: readonly Point[];
  aside?: ReactNode;
}) {
  const real = points.filter((p): p is Point & { value: number } => p.value !== null);

  if (real.length < 2) {
    return (
      <ChartFrame title={title} subtitle={subtitle} aside={aside}>
        <TooFew have={real.length} />
      </ChartFrame>
    );
  }

  const W = 760;
  const H = 240;
  const padL = 54;
  const padR = 14;
  const padT = 14;
  const padB = 30;

  const top = niceMax(Math.max(...real.map((p) => p.value)));
  const stepX = (W - padL - padR) / Math.max(real.length - 1, 1);
  const y = (v: number) => padT + (1 - v / top) * (H - padT - padB);

  const pts = real.map((p, i) => ({ x: padL + i * stepX, y: y(p.value) }));
  const line = smoothPath(pts);
  const base = H - padB;
  const area =
    line + " L " + pts[pts.length - 1]!.x + " " + base + " L " + pts[0]!.x + " " + base + " Z";

  // Five gridlines. More turns the card into graph paper and competes with
  // the line it is meant to support.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => top * f);

  // Every label on a fourteen-week axis collides. Thin to roughly six.
  const every = Math.ceil(real.length / 6);

  return (
    <ChartFrame title={title} subtitle={subtitle} aside={aside}>
      <svg
        viewBox={"0 0 " + W + " " + H}
        className="h-auto w-full overflow-visible"
        role="img"
        aria-label={title + ". " + real.length + " weeks plotted."}
      >
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-accent)" stopOpacity="0.26" />
            <stop offset="100%" stopColor="var(--color-accent)" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--color-line)"
              strokeDasharray="3 5"
            />
            <text
              x={padL - 10}
              y={y(t) + 4}
              textAnchor="end"
              className="tnum"
              fontSize="11"
              fill="var(--color-ink-4)"
              fontFamily="var(--font-mono)"
            >
              {compact(t)}
            </text>
          </g>
        ))}

        <path d={area} fill="url(#areaFill)" />
        <path
          d={line}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {pts.map((p, i) => (
          <g key={real[i]!.key}>
            {/* The dot marks a real reading. The curve between two dots is
                drawing, not data. */}
            <circle cx={p.x} cy={p.y} r="4" fill="var(--color-surface)" />
            <circle
              cx={p.x}
              cy={p.y}
              r="4"
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth="2.5"
            />
            {/* Native tooltip: the exact figure on hover, no JavaScript. */}
            <circle cx={p.x} cy={p.y} r="14" fill="transparent">
              <title>{real[i]!.label + " — " + compact(real[i]!.value)}</title>
            </circle>
            {i % every === 0 || i === pts.length - 1 ? (
              <text
                x={p.x}
                y={H - 8}
                textAnchor="middle"
                fontSize="11"
                fill="var(--color-ink-4)"
                fontFamily="var(--font-mono)"
              >
                {real[i]!.label}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
    </ChartFrame>
  );
}

/* ------------------------------------------------------------ grouped bars */

export interface Series {
  readonly name: string;
  readonly colour: string;
  readonly values: readonly (number | null)[];
}

export function GroupedBars({
  title,
  subtitle,
  labels,
  series,
}: {
  title: string;
  subtitle?: string;
  labels: readonly string[];
  series: readonly Series[];
}) {
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));

  if (labels.length < 2 || all.length === 0) {
    return (
      <ChartFrame title={title} subtitle={subtitle}>
        <TooFew have={labels.length} />
      </ChartFrame>
    );
  }

  const W = 760;
  const H = 240;
  const padL = 44;
  const padR = 14;
  const padT = 14;
  const padB = 30;

  const top = niceMax(Math.max(...all));
  const slot = (W - padL - padR) / labels.length;
  const barW = Math.min(14, (slot - 10) / series.length);
  const gap = 4;
  const groupW = series.length * barW + (series.length - 1) * gap;
  const base = H - padB;
  const y = (v: number) => padT + (1 - v / top) * (H - padT - padB);
  const ticks = [0, 0.5, 1].map((f) => top * f);
  const every = Math.ceil(labels.length / 7);

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      aside={
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((s) => (
            <li key={s.name} className="flex items-center gap-2">
              <span
                aria-hidden
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: s.colour }}
              />
              <span className="micro text-ink-3">{s.name}</span>
            </li>
          ))}
        </ul>
      }
    >
      <svg
        viewBox={"0 0 " + W + " " + H}
        className="h-auto w-full"
        role="img"
        aria-label={title + ". " + series.map((s) => s.name).join(" and ") + " by week."}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line
              x1={padL}
              x2={W - padR}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--color-line)"
              strokeDasharray="3 5"
            />
            <text
              x={padL - 10}
              y={y(t) + 4}
              textAnchor="end"
              className="tnum"
              fontSize="11"
              fill="var(--color-ink-4)"
              fontFamily="var(--font-mono)"
            >
              {Math.round(t)}
            </text>
          </g>
        ))}

        {labels.map((label, i) => {
          const cx = padL + slot * i + slot / 2;
          return (
            <g key={label}>
              {series.map((s, j) => {
                const v = s.values[i];
                if (v === null || v === undefined) return null;
                const h = Math.max(base - y(v), v > 0 ? 3 : 0);
                return (
                  <rect
                    key={s.name}
                    x={cx - groupW / 2 + j * (barW + gap)}
                    y={base - h}
                    width={barW}
                    height={h}
                    rx="3"
                    fill={s.colour}
                  >
                    <title>{label + " — " + s.name + ": " + v}</title>
                  </rect>
                );
              })}
              {i % every === 0 || i === labels.length - 1 ? (
                <text
                  x={cx}
                  y={H - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--color-ink-4)"
                  fontFamily="var(--font-mono)"
                >
                  {label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </ChartFrame>
  );
}

/* -------------------------------------------------------------------- donut */

export interface Slice {
  readonly name: string;
  readonly value: number;
  readonly colour: string;
}

export function Donut({
  title,
  subtitle,
  slices,
  centreLabel,
  centreValue,
}: {
  title: string;
  subtitle?: string;
  slices: readonly Slice[];
  centreLabel: string;
  centreValue: string;
}) {
  const positive = slices.filter((s) => s.value > 0);
  const total = positive.reduce((sum, s) => sum + s.value, 0);

  if (total <= 0) {
    return (
      <ChartFrame title={title} subtitle={subtitle}>
        <TooFew have={0} />
      </ChartFrame>
    );
  }

  const R = 62;
  const STROKE = 24;
  const C = 2 * Math.PI * R;

  let offset = 0;

  return (
    <ChartFrame title={title} subtitle={subtitle}>
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative shrink-0">
          <svg viewBox="0 0 160 160" width="160" height="160" role="img" aria-label={title}>
            {/* Rotated so the first slice starts at twelve o'clock, which is
                where the eye starts reading a dial. */}
            <g transform="rotate(-90 80 80)">
              {positive.map((s) => {
                const len = (s.value / total) * C;
                const dash = len + " " + (C - len);
                const el = (
                  <circle
                    key={s.name}
                    cx="80"
                    cy="80"
                    r={R}
                    fill="none"
                    stroke={s.colour}
                    strokeWidth={STROKE}
                    strokeDasharray={dash}
                    strokeDashoffset={-offset}
                  >
                    <title>{s.name + ": " + compact(s.value)}</title>
                  </circle>
                );
                offset += len;
                return el;
              })}
            </g>
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="tnum font-display text-[19px] leading-none font-semibold tracking-[-0.02em] text-ink">
              {centreValue}
            </span>
            <span className="micro mt-1.5 text-ink-4">{centreLabel}</span>
          </div>
        </div>

        <ul className="flex min-w-[150px] flex-1 flex-col gap-3">
          {positive.map((s) => (
            <li key={s.name} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: s.colour }}
                />
                <span className="font-display text-[13px] text-ink-2">{s.name}</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="tnum font-display text-[13px] font-semibold text-ink">
                  {compact(s.value)}
                </span>
                <span className="tnum font-mono text-[11px] text-ink-4">
                  {Math.round((s.value / total) * 100) + "%"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
}

/* ---------------------------------------------------------------- sparkline */

/** The small bars beside a headline figure. Shape only — no axis, no scale. */
export function Sparkline({
  values,
  tone = "accent",
}: {
  values: readonly (number | null)[];
  tone?: "accent" | "blue";
}) {
  const real = values.filter((v): v is number => v !== null);
  if (real.length < 2) return null;

  const top = Math.max(...real, 1);
  const W = 62;
  const H = 26;
  const step = W / real.length;
  const barW = Math.max(2, step * 0.55);
  const colour = tone === "blue" ? "var(--color-blue)" : "var(--color-accent)";

  return (
    <svg viewBox={"0 0 " + W + " " + H} width={W} height={H} aria-hidden className="shrink-0">
      {real.map((v, i) => {
        const h = Math.max((v / top) * H, 2);
        return (
          <rect
            key={i}
            x={i * step}
            y={H - h}
            width={barW}
            height={h}
            rx="1.5"
            fill={colour}
            // The latest reading is the one being reported; the rest are
            // context for it.
            opacity={i === real.length - 1 ? 1 : 0.24}
          />
        );
      })}
    </svg>
  );
}

/* -------------------------------------------------------------------- delta */

/**
 * Change against the previous stored week.
 *
 * "Previous stored", not "previous" — if nobody opened last week, the
 * comparison is against whatever week came before this one in the database.
 * The tooltip says so, because a percentage that silently skips a week would
 * mean something other than what it appears to.
 */
export function Delta({
  current,
  previous,
  goodWhen = "up",
}: {
  current: number | null;
  previous: number | null;
  goodWhen?: "up" | "down";
}) {
  if (current === null || previous === null || previous === 0) return null;

  const change = (current - previous) / Math.abs(previous);
  if (!Number.isFinite(change)) return null;

  const up = change >= 0;
  const good = goodWhen === "up" ? up : !up;
  const tone =
    Math.abs(change) < 0.005
      ? "bg-raised text-ink-3"
      : good
        ? "bg-good-tint text-good"
        : "bg-bad-tint text-bad";

  return (
    <span
      className={
        "tnum inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium " +
        tone
      }
      title="Against the previous stored week"
    >
      <span aria-hidden>{up ? "↑" : "↓"}</span>
      {Math.abs(change * 100).toFixed(1) + "%"}
    </span>
  );
}
