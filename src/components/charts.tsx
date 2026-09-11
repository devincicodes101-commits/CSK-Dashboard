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
  highlight,
  aside,
}: {
  title: string;
  subtitle?: string;
  points: readonly Point[];
  /**
   * The week being viewed, marked on the line.
   *
   * Without it the chart looks frozen: it plots the last fourteen weeks, so
   * moving from one week to the next adds a point on the right and leaves
   * everything else identical. The figures were changing and the picture was
   * not, which reads as a chart wired to nothing.
   */
  highlight?: string;
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
  const y = (v: number) => padT + (1 - v / top) * (H - padT - padB);

  /**
   * The axis runs on real time, not on position in the array.
   *
   * It used to space the readings evenly, which drew a four-month gap between
   * January and May at the same width as the one week between 13 and 20 July.
   * The subtitle said gaps existed; the picture said they did not, and the
   * picture is what people believe.
   *
   * Built from the ISO string rather than a Date, for the same reason
   * axisLabel is: parsing "2026-08-03" and reading it back shifts a day in
   * every timezone west of UTC.
   */
  const at = (iso: string) => {
    const [yy, mm, dd] = iso.split("-").map(Number);
    return Date.UTC(yy!, mm! - 1, dd!) / 86_400_000;
  };

  const days = real.map((p) => at(p.key));
  const first = days[0]!;
  const span = Math.max(days[days.length - 1]! - first, 1);
  const x = (d: number) => padL + ((d - first) / span) * (W - padL - padR);

  const pts = real.map((p, i) => ({ x: x(days[i]!), y: y(p.value) }));

  /**
   * The line breaks across missing weeks.
   *
   * Two readings a week apart are a trend. Two readings four months apart are
   * two readings, and joining them draws revenue for eighteen weeks nobody
   * ever fetched. Anything beyond a fortnight starts a new run.
   */
  const runs: { x: number; y: number }[][] = [];
  let run: { x: number; y: number }[] = [];

  pts.forEach((p, i) => {
    const adjacent = i === 0 || days[i]! - days[i - 1]! <= 14;
    if (!adjacent && run.length > 0) {
      runs.push(run);
      run = [];
    }
    run.push(p);
  });
  if (run.length > 0) runs.push(run);

  const base = H - padB;

  // Five gridlines. More turns the card into graph paper and competes with
  // the line it is meant to support.
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => top * f);

  /**
   * Which readings get an axis label.
   *
   * Chosen by distance along the axis, not by position in the array. Now that
   * x follows real time, readings bunch wherever weeks were fetched together,
   * and labelling every third one there overlaps while leaving the sparse
   * stretches bare. The last reading always gets one — it is the week being
   * looked at.
   */
  const MIN_GAP = 96;
  const labelled = pts.map(() => false);
  let lastLabelX = -Infinity;

  pts.forEach((p, i) => {
    if (p.x - lastLabelX >= MIN_GAP) {
      labelled[i] = true;
      lastLabelX = p.x;
    }
  });
  if (pts.length > 0) {
    const lastIndex = pts.length - 1;
    // Never let the final label collide with the one before it.
    if (!labelled[lastIndex] && pts[lastIndex]!.x - lastLabelX < MIN_GAP) {
      const clash = labelled.lastIndexOf(true);
      if (clash > 0) labelled[clash] = false;
    }
    labelled[lastIndex] = true;
  }

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

        {runs.map((segment, i) => {
          // A lone reading with no neighbouring week gets a dot and no line.
          // There is nothing to draw a trend through.
          if (segment.length < 2) return null;
          const path = smoothPath(segment);
          const shape =
            path +
            " L " +
            segment[segment.length - 1]!.x +
            " " +
            base +
            " L " +
            segment[0]!.x +
            " " +
            base +
            " Z";
          return (
            <g key={i}>
              <path d={shape} fill="url(#areaFill)" />
              <path
                d={path}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}

        {pts.map((p, i) => {
          const isHere = real[i]!.key === highlight;
          return (
          <g key={real[i]!.key}>
            {isHere ? (
              <>
                <line
                  x1={p.x}
                  x2={p.x}
                  y1={padT}
                  y2={base}
                  stroke="var(--color-accent)"
                  strokeWidth="1"
                  strokeDasharray="3 4"
                  opacity="0.5"
                />
                <text
                  x={p.x}
                  y={p.y - 14}
                  textAnchor="middle"
                  className="tnum"
                  fontSize="12"
                  fontWeight="600"
                  fill="var(--color-accent)"
                  fontFamily="var(--font-mono)"
                >
                  {compact(real[i]!.value)}
                </text>
              </>
            ) : null}
            {/* The dot marks a real reading. The curve between two dots is
                drawing, not data. */}
            <circle cx={p.x} cy={p.y} r={isHere ? 5 : 4} fill="var(--color-surface)" />
            <circle
              cx={p.x}
              cy={p.y}
              r={isHere ? 5 : 4}
              fill={isHere ? "var(--color-accent)" : "none"}
              stroke="var(--color-accent)"
              strokeWidth="2.5"
            />
            {/* Native tooltip: the exact figure on hover, no JavaScript. */}
            <circle cx={p.x} cy={p.y} r="14" fill="transparent">
              <title>{real[i]!.label + " — " + compact(real[i]!.value)}</title>
            </circle>
            {labelled[i] ? (
              <text
                x={p.x}
                y={H - 8}
                // The first and last labels would otherwise hang off the
                // edges of the card.
                textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}
                fontSize="11"
                fill="var(--color-ink-4)"
                fontFamily="var(--font-mono)"
              >
                {real[i]!.label}
              </text>
            ) : null}
          </g>
          );
        })}
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
  highlight,
}: {
  title: string;
  subtitle?: string;
  labels: readonly string[];
  series: readonly Series[];
  /** Index of the week being viewed. See AreaTrend's highlight. */
  highlight?: number;
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
          const isHere = i === highlight;
          return (
            <g key={label}>
              {isHere ? (
                // A band rather than a border: the bars have to stay the
                // readable thing, and an outline around a pair of bars reads
                // as a fourth series.
                <rect
                  x={cx - slot / 2}
                  y={padT}
                  width={slot}
                  height={base - padT}
                  rx="6"
                  fill="var(--color-accent-tint)"
                />
              ) : null}
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
  /**
   * A share-of-total ring cannot honestly show a negative share.
   *
   * Dropping the negative slice and drawing the rest was the old behaviour:
   * on a week where costs exceeded revenue, labour and material would fill
   * the ring and read 55% and 45% of a total that silently excluded the loss,
   * while the centre showed a revenue figure smaller than the two of them
   * together. Every number on the card would have been wrong in the same
   * direction, and the picture would have looked entirely normal.
   */
  const negative = slices.filter((s) => s.value < 0);
  if (negative.length > 0) {
    return (
      <ChartFrame title={title} subtitle={subtitle}>
        <div className="flex h-[180px] items-center justify-center rounded-xl border border-dashed border-bad/40 bg-bad-tint px-6 text-center">
          <p className="font-mono text-[11px] leading-relaxed text-bad">
            {negative.map((s) => `${s.name} is ${compact(s.value)}`).join("; ")}.
            {" "}
            Costs exceeded revenue this week, which a share-of-total chart
            cannot show. The figures are in the blocks below.
          </p>
        </div>
      </ChartFrame>
    );
  }

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
  unit = "amount",
}: {
  current: number | null;
  previous: number | null;
  goodWhen?: "up" | "down";
  /**
   * "rate" for figures that are already percentages.
   *
   * Gross profit going from 33.2% to 62.4% is a rise of 29.2 PERCENTAGE
   * POINTS. Reported as a relative change it reads "88.2%", sitting directly
   * beneath the number 62.4% — which invites exactly the wrong reading, and
   * did. Rates report points; amounts report percentages.
   */
  unit?: "amount" | "rate";
}) {
  if (current === null || previous === null) return null;
  if (unit === "amount" && previous === 0) return null;

  const change =
    unit === "rate" ? current - previous : (current - previous) / Math.abs(previous);
  if (!Number.isFinite(change)) return null;

  const up = change >= 0;
  const good = goodWhen === "up" ? up : !up;
  const tone =
    Math.abs(change) < 0.0005
      ? "bg-raised text-ink-3"
      : good
        ? "bg-good-tint text-good"
        : "bg-bad-tint text-bad";

  const reading =
    unit === "rate"
      ? `${Math.abs(change * 100).toFixed(1)} pts`
      : `${Math.abs(change * 100).toFixed(1)}%`;

  return (
    <span
      className={
        "tnum inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10px] font-medium " +
        tone
      }
      title={
        unit === "rate"
          ? "Change in percentage points, against the previous stored week"
          : "Against the previous stored week"
      }
    >
      <span aria-hidden>{up ? "↑" : "↓"}</span>
      {reading}
    </span>
  );
}
