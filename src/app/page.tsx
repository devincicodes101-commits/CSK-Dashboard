import {
  Block,
  Correction,
  Metric,
  Metrics,
  Pill,
  StatCard,
  StatIcon,
  Button,
} from "@/components/ui";
import { AreaTrend, Donut, GroupedBars, compact } from "@/components/charts";
import { PeriodNav } from "@/components/PeriodNav";
import { Sidebar, type Section } from "@/components/Sidebar";
import { computeWeek, count, money, percent } from "@/lib/week-metrics";
import { SYNC_VERSION, syncWeek } from "@/lib/sync";
import { authConfigured } from "@/lib/auth";
import { loadTrendWeeks, loadWeek, syncedWeeks } from "@/lib/week-store";
import { TokenExpired } from "@/lib/token-store";
import { redirect } from "next/navigation";
import { weekFromParam, weekLabelWithYear } from "@/lib/periods";
import {
  JOBBER_DISPLAYED,
  VERIFIED_CARDS,
  VERIFIED_JOBS,
  VERIFIED_QUOTES,
  VERIFIED_WEEK_MONDAY,
} from "@/lib/verified-week";

/**
 * The dashboard.
 *
 * Every week is a URL — /?week=2026-08-03 — so a week can be linked, sent to
 * someone, bookmarked and reloaded. That matters more than it sounds: the
 * whole product is one person sending figures to another.
 *
 * Two layers, and the order is deliberate. The charts and headline cards are
 * for whoever opens the page and wants to know how the week went. The blocks
 * below are for Chase, who screenshots one at a time and sends each to a
 * different person — which is why they stay dense, bordered and self-
 * contained rather than being dissolved into the prettier layout above them.
 *
 * The monthly tab is gone. CSK asked for it to be dropped, and it was blocked
 * anyway on quoted hours that nobody records.
 */

/**
 * The three blocks, in the order they go out on a Wednesday morning.
 *
 * One list, used by both the rail and the blocks themselves, so a heading can
 * never say one thing in the nav and another on the block.
 */
const SECTIONS: readonly Section[] = [
  { id: "sales", ordinal: "01", title: "Sales pipeline", audience: "Chase", ready: true },
  { id: "revenue", ordinal: "02", title: "Revenue & production", audience: "Technicians + Chad", ready: true },
  { id: "cash", ordinal: "03", title: "Cash & AR", audience: "Chase + Alana", ready: false },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "3 Aug" for a chart axis.
 *
 * Built from the ISO string rather than a Date. Parsing "2026-08-03" into a
 * Date and formatting it renders the 2nd in any timezone west of UTC, which
 * is every timezone CSK operates in — the same class of bug that put the week
 * boundaries seven hours out.
 */
function axisLabel(monday: string): string {
  const [, m, d] = monday.split("-");
  return Number(d) + " " + (MONTHS[Number(m) - 1] ?? "");
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
    /** "0" suppresses the live pull, for when Jobber is down. */
    fetch?: string;
    /** Set by the refresh route, so an expiry cannot become a redirect loop. */
    refreshed?: string;
    /** "1" re-fetches a week that is already stored, replacing it. */
    resync?: string;
  }>;
}) {
  const params = await searchParams;
  const week = weekFromParam(params.week, VERIFIED_WEEK_MONDAY);

  // A stored week always wins. It was computed once, after the data settled,
  // and re-fetching it would both drift and burn Jobber's rate limit.
  const found = await loadWeek(week.start).catch(() => null);
  const storedWeeks = await syncedWeeks();

  /**
   * A stored week computed by an older version is stale, not finished.
   *
   * Weeks frozen before the requests, invoices and clients queries existed
   * carry nulls where figures belong, and weeks frozen before the timezone
   * fix have boundaries seven hours out. Both look exactly like a complete
   * week, which is the problem.
   */
  const isStale = Boolean(found && found.syncVersion < SYNC_VERSION);

  /**
   * The week we checked by hand. Its identity, not its rendering.
   *
   * Used for the correction notes, which quote real figures from Jobber's own
   * screens for this week — 29%, $3,675, 51%, $28,145 — and those stay true
   * whether the figures on screen came from the fixture or from the API.
   */
  const isVerifiedWeek = week.start === VERIFIED_WEEK_MONDAY;

  /**
   * Fetch every week, including the verified one.
   *
   * Stale weeks heal themselves rather than waiting to be clicked. It costs
   * one fetch per affected week, once — after which the week is stamped
   * current and never queried again, which is what keeps this clear of
   * Jobber's throttle. `?fetch=0` still opts out, for when Jobber is down and
   * the error is in the way of reading the older figures.
   */
  const wantsLive =
    params.fetch !== "0" && (!found || isStale || params.resync === "1");

  let live: Awaited<ReturnType<typeof syncWeek>> | null = null;
  let liveError: string | null = null;

  if (wantsLive) {
    try {
      live = await syncWeek(week);
    } catch (e) {
      // An expired token cannot be renewed from here — only a route handler
      // may write the replacement back. Bounce through the one that can and
      // come straight back. `refreshed` stops that becoming a loop if the
      // renewal itself is what is failing.
      if (e instanceof TokenExpired && params.refreshed !== "1") {
        const back = `/?week=${week.start}`;
        redirect(`/api/jobber/refresh?next=${encodeURIComponent(back)}`);
      }
      liveError = e instanceof Error ? e.message : String(e);
    }
  }

  // Fresh wins. Otherwise fall back to whatever was stored — including a
  // stale week — because older figures beat an error page when Jobber is
  // unreachable. Say which is being shown, though; never let stale pass for
  // current.
  const stored = live ? null : found;
  const servingStale = Boolean(!live && isStale);

  // The fixture only appears when there is nothing else to show — no live
  // fetch, nothing stored — on the one week it describes.
  const usingSample = !live && !found && isVerifiedWeek;

  const metrics = live
    ? live.metrics
    : found
      ? found.metrics
      : usingSample
        ? computeWeek({
            week,
            quotes: VERIFIED_QUOTES,
            jobs: VERIFIED_JOBS,
            // The recording listed the three winning quotes but not the other
            // four that were sent, so quotes sent comes from Jobber's card.
            quotesAreComplete: false,
            cards: {
              newLeads: VERIFIED_CARDS.newLeads,
              newRequests: VERIFIED_CARDS.newRequests,
              quotesSentCount: VERIFIED_CARDS.quotesSentCount,
              quotesSentValue: VERIFIED_CARDS.quotesSentValue,
              invoicedValue: VERIFIED_CARDS.invoicedValue,
            },
            quickBooks: {
              cashBalance: null,
              arTotal: null,
              arOver30: null,
              invoicesOver30: null,
            },
          })
        : null;

  /**
   * The weeks behind the charts, read AFTER the live fetch.
   *
   * Order matters: syncWeek writes its snapshot before returning, so reading
   * afterwards includes the week being viewed. Reading first would draw every
   * chart one week short of the figures printed above it.
   *
   * Anchored on this week and reaching backwards, extending forwards when
   * there is not enough history behind it — see loadTrendWeeks.
   */
  const trend = await loadTrendWeeks(week.start, 14);
  const labels = trend.map((w) => axisLabel(w.metrics.week.start));
  const series = (pick: (m: (typeof trend)[number]["metrics"]) => number | null) =>
    trend.map((w) => pick(w.metrics));

  // The reading before this one, for the change badges. "Previous stored",
  // not "previous" — see Delta.
  const prior = trend.length > 1 ? trend[trend.length - 2]!.metrics : null;

  // Which point on the trend charts is the week being looked at. -1 when the
  // week has not been stored yet, which simply marks nothing.
  const here = trend.findIndex((w) => w.metrics.week.start === week.start);

  const revenueHistory = series((m) => m.revenueClosed);
  const marginHistory = series((m) => m.grossProfitRate);
  const winHistory = series((m) => m.conversionRate);
  const arHistory = series((m) => m.arOver30Rate);

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="grid gap-5 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-6">
          {/* The open-access banner that used to sit at the foot of this page was
              removed at the client's request. The dashboard is still public
              whenever DASHBOARD_PASSWORD is unset — the rail simply stops
              offering a sign-out that would do nothing. */}
          <Sidebar sections={SECTIONS} authed={authConfigured()} />

          <div className="flex min-w-0 flex-col gap-5">
            {/* --------------------------------------------------- header -- */}
            <header id="top" className="card scroll-mt-6 px-5 py-5 sm:px-6">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
                <div>
                  <h1 className="font-display text-[22px] font-semibold leading-none tracking-[-0.03em] text-ink">
                    Dashboard
                  </h1>
                  <p className="mt-2 font-mono text-[11px] text-ink-3">
                    Monday to Sunday &middot; pre-tax &middot; CAD
                  </p>
                </div>

                <PeriodNav weekStart={week.start} syncedPeriods={storedWeeks} />
              </div>

              {/* Where these figures came from and how fresh they are. Never
                  let stored pass for live, or stale pass for current. */}
              {stored ? (
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                  <Pill tone={servingStale ? "warn" : "good"}>
                    {servingStale ? "Older figures" : "Stored"}
                  </Pill>
                  <p className="font-mono text-[11px] text-ink-4">
                    {`fetched ${new Date(stored.syncedAt).toLocaleDateString("en-CA", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}`}
                  </p>
                  {servingStale && liveError?.includes("Reconnect") ? (
                    <a
                      href="/api/jobber/connect"
                      className="micro cursor-pointer rounded-full bg-accent px-4 py-2 text-on-accent transition-colors duration-200 hover:bg-[#12903f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      Reconnect Jobber
                    </a>
                  ) : null}
                  {servingStale && liveError ? (
                    <p className="max-w-md font-mono text-[11px] leading-relaxed text-warn">
                      {/* Was only in a banner below the blocks, where someone
                          reading the figures never sees it and concludes the
                          numbers simply did not update. */}
                      {`Refresh failed: ${liveError}`}
                    </p>
                  ) : null}
                  {servingStale ? (
                    <a
                      href={`/?week=${week.start}&resync=1`}
                      className="micro cursor-pointer rounded-full border border-accent-soft px-3 py-1.5 text-accent transition-colors duration-200 hover:bg-accent-tint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                      Try again
                    </a>
                  ) : null}
                </div>
              ) : live ? (
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                  {/* It IS saved — syncWeek writes the snapshot before
                      returning. This said "not saved", which was true before
                      there was a database and false the moment there was. */}
                  <Pill tone="good">Fetched just now</Pill>
                  <p className="font-mono text-[11px] text-ink-4">
                    {/* "506 quotes" read as though the week had 506 of them.
                        The quotes query has no upper bound on updatedAt by
                        design, so it scans everything touched since the week
                        began and the date rules narrow it. Say scanned. */}
                    {`${live.counts.jobs} jobs closed · ${live.counts.requests} requests · ${live.counts.quotes} quotes scanned`}
                  </p>
                </div>
              ) : usingSample ? (
                <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                  <Pill tone="warn">Sample week</Pill>
                  <p className="font-mono text-[11px] text-ink-4">
                    figures checked by hand; neither system could be reached
                  </p>
                </div>
              ) : null}
            </header>

            {!metrics ? (
              <NotBuilt
                title={`No figures for ${weekLabelWithYear(week)}`}
                body={
                  liveError
                    ? `Couldn’t reach Jobber: ${liveError}`
                    : "Nothing stored for this week, and no live figures came back."
                }
                action={<Button href={`/?week=${week.start}`}>Try again</Button>}
              />
            ) : (
              <>
                {/* --------------------------------------- headline cards -- */}
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                  <StatCard
                    label="Revenue — jobs closed"
                    value={money(metrics.revenueClosed)}
                    icon={<StatIcon path="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />}
                    current={metrics.revenueClosed}
                    previous={prior?.revenueClosed ?? null}
                    history={revenueHistory}
                    footnote={`${metrics.jobsClosed} jobs closed this week`}
                  />
                  <StatCard
                    label="Gross profit %"
                    value={percent(metrics.grossProfitRate)}
                    icon={<StatIcon path="M3 17l5-5 4 3 7-8M21 7v5h-5" />}
                    current={metrics.grossProfitRate}
                    previous={prior?.grossProfitRate ?? null}
                    history={marginHistory}
                    footnote={`${money(metrics.grossProfit)} on ${money(metrics.revenueClosed)}`}
                  />
                  <StatCard
                    label="Quote conversion %"
                    value={percent(metrics.conversionRate)}
                    icon={<StatIcon path="M9 12l2 2 4-4M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />}
                    current={metrics.conversionRate}
                    previous={prior?.conversionRate ?? null}
                    history={winHistory}
                    tone="blue"
                    footnote={`${count(metrics.wonCount)} won of ${count(metrics.quotesSentCount)} sent`}
                  />
                  <StatCard
                    label="AR over 30 days"
                    value={percent(metrics.arOver30Rate)}
                    icon={<StatIcon path="M12 8v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z" />}
                    current={metrics.arOver30Rate}
                    previous={prior?.arOver30Rate ?? null}
                    history={arHistory}
                    // Late money going up is bad news, so the badge has to
                    // know which direction is good or it will colour a
                    // worsening week green.
                    goodWhen="down"
                    tone="blue"
                    footnote={
                      metrics.arOver30 === null
                        ? "not available from QuickBooks"
                        : `${money(metrics.arOver30)} of ${money(metrics.arTotal)}`
                    }
                  />
                </div>

                {/* --------------------------------------------- charts -- */}
                <AreaTrend
                  title="Revenue on closed jobs"
                  subtitle={
                    trend.length > 1
                      ? `The last ${trend.length} weeks that have been fetched. Gaps are weeks nobody has opened yet, not weeks with no revenue.`
                      : undefined
                  }
                  points={trend.map((w) => ({
                    key: w.metrics.week.start,
                    label: axisLabel(w.metrics.week.start),
                    value: w.metrics.revenueClosed,
                  }))}
                  highlight={week.start}
                />

                <div className="grid gap-5 xl:grid-cols-2">
                  <Donut
                    title="Where the revenue went"
                    subtitle="This week's closed jobs, split into what it cost and what was left."
                    slices={[
                      { name: "Labor", value: metrics.labourCost, colour: "var(--color-blue)" },
                      { name: "Material", value: metrics.materialCost, colour: "var(--color-blue-soft)" },
                      { name: "Gross profit", value: metrics.grossProfit, colour: "var(--color-accent)" },
                    ]}
                    centreLabel="Revenue"
                    centreValue={compact(metrics.revenueClosed)}
                  />

                  <GroupedBars
                    title="Quotes sent and won"
                    subtitle="Counts, by week. The gap between the two bars is the pipeline that did not close."
                    labels={labels}
                    highlight={here >= 0 ? here : undefined}
                    series={[
                      {
                        name: "Sent",
                        colour: "var(--color-blue-soft)",
                        values: series((m) => m.quotesSentCount),
                      },
                      {
                        name: "Won",
                        colour: "var(--color-blue)",
                        values: series((m) => m.wonCount),
                      },
                    ]}
                  />
                </div>

                {/* ------------------------------------------------ sales -- */}
                <Block
                  id={SECTIONS[0]!.id}
                  ordinal={SECTIONS[0]!.ordinal}
                  title={SECTIONS[0]!.title}
                  audience={SECTIONS[0]!.audience}
                  note={
                    <>
                      {metrics.collapsedQuotes.length > 0 ? (
                        <Correction>
                          {`Quote #${metrics.collapsedQuotes.join(", #")} was approved and converted in the same week. Jobber’s reports list it twice; counted once here. Adding both lists would show ${
                            metrics.wonCount + metrics.collapsedQuotes.length
                          } won at ${percent(
                            (metrics.wonCount + metrics.collapsedQuotes.length) /
                              (metrics.quotesSentCount ?? 1),
                          )}.`}
                        </Correction>
                      ) : null}
                      {/* The specific comparison figures belong to the
                          verified week and nowhere else. Quoting "29%" and
                          "$3,675" on January's week said something simply
                          untrue about January. Generic wording elsewhere. */}
                      {metrics.wonEarlierToo.length > 0 ? (
                        <Correction>
                          {`Quote #${metrics.wonEarlierToo.join(", #")} was already counted as won in an earlier week — approved then, converted now. Each week counts what happened in it, so adding weeks together counts ${
                            metrics.wonEarlierToo.length === 1 ? "it" : "them"
                          } twice.`}
                        </Correction>
                      ) : null}
                      <Correction>
                        {isVerifiedWeek
                          ? `Jobber’s own screen reads ${percent(
                              JOBBER_DISPLAYED.conversionRate,
                              0,
                            )} for this week because it counts conversions only. CSK count approved change orders as won as well.`
                          : "Jobber’s own screen shows a lower rate, because it counts conversions only. CSK count approved change orders as won as well."}
                      </Correction>
                      <Correction>
                        Quotes Sent ($) matches Jobber&rsquo;s Sent card, which
                        includes GST. The converted, approved and won figures
                        are pre-tax, as CSK report them. The two are about 5%
                        apart and are not directly comparable.
                      </Correction>
                      <Correction>
                        {isVerifiedWeek
                          ? `Values are pre-tax. Jobber’s card shows ${money(
                              JOBBER_DISPLAYED.convertedValue,
                            )} for converted quotes this week, which includes GST.`
                          : "Values are pre-tax. Jobber’s summary cards include GST, about 5% higher in BC."}
                      </Correction>
                    </>
                  }
                >
                  {/* The Weekly tab's rows, one tile each.

                      The Definitions tab pairs these — "Quotes Converted
                      (#/$)" — and building from it collapsed ten rows into
                      seven. But the Weekly tab is the sheet Kyle actually
                      fills in and walked through on the call, and its rows are
                      what Chase reads. So this follows Weekly, and the counts
                      and dollars stand alone.

                      Names verbatim, including the American "Labor" and the
                      lower-case w in "Total Quotes won ($)". Chase reads this
                      beside a spreadsheet he has used for years; a tidier
                      wording only makes him stop to check whether it means the
                      same. */}
                  <Metrics>
                    <Metric label="New Leads" value={count(metrics.newLeads)} />
                    <Metric label="Quotes Sent" value={count(metrics.quotesSentCount)} />
                    <Metric label="Quotes Converted (#)" value={count(metrics.convertedCount)} />
                    <Metric label="Quotes Approved (#)" value={count(metrics.approvedCount)} />
                    <Metric label="Total Quotes Won (#)" value={count(metrics.wonCount)} />
                    <Metric
                      label="Quote Conversion %"
                      value={percent(metrics.conversionRate)}
                      tone="good"
                    />
                    <Metric label="Quotes Converted ($)" value={money(metrics.convertedValue)} />
                    <Metric label="Quotes Approved ($)" value={money(metrics.approvedValue)} />
                    <Metric label="Total Quotes won ($)" value={money(metrics.wonValue)} />
                    <Metric label="Quotes Sent ($)" value={money(metrics.quotesSentValue)} />
                  </Metrics>
                </Block>

                {/* ------------------------------------- revenue & profit -- */}
                <Block
                  id={SECTIONS[1]!.id}
                  ordinal={SECTIONS[1]!.ordinal}
                  title={SECTIONS[1]!.title}
                  audience={SECTIONS[1]!.audience}
                  note={
                    <>
                      <Correction>
                        {isVerifiedWeek
                          ? `Gross profit is revenue less labour and materials, worked from the dollars. Jobber reports ${percent(
                              JOBBER_DISPLAYED.averageProfitRate,
                              0,
                            )} for this week by averaging each job’s own percentage, which weights a ${money(
                              250,
                            )} job the same as a ${money(6563)} one.`
                          : "Gross profit is revenue less labour and materials, worked from the dollars. Jobber’s own profit percentage averages each job equally, so a small job counts as much as a large one."}
                      </Correction>
                      <Correction>
                        {isVerifiedWeek
                          ? `Revenue is the sum of the ${metrics.jobsClosed} jobs closed. The summary card above that same table reads ${money(
                              JOBBER_DISPLAYED.revenueCard,
                            )}, counting a different set of jobs.`
                          : `Revenue is the sum of the ${metrics.jobsClosed} jobs closed in the week. Jobber’s summary cards count a different set of jobs and will not match.`}
                      </Correction>
                      <Correction>
                        Revenue — Invoiced is tax-inclusive, matching Jobber’s
                        Invoices screen and Kyle’s sheet. Every other figure in
                        this block is pre-tax.
                      </Correction>
                    </>
                  }
                >
                  <Metrics>
                    <Metric label="Revenue — Invoiced ($)" value={money(metrics.invoicedValue)} />
                    <Metric
                      label="Revenue — Jobs Closed ($)"
                      value={money(metrics.revenueClosed)}
                      hint={`${metrics.jobsClosed} jobs`}
                    />
                    <Metric label="Labor Cost ($)" value={money(metrics.labourCost)} />
                    <Metric label="Material Cost ($)" value={money(metrics.materialCost)} />
                    <Metric label="Gross Profit ($)" value={money(metrics.grossProfit)} />
                    <Metric
                      label="Gross Profit %"
                      value={percent(metrics.grossProfitRate)}
                      tone="good"
                    />
                  </Metrics>
                </Block>

                {/* ----------------------------------------------- cash -- */}
                <Block
                  id={SECTIONS[2]!.id}
                  ordinal={SECTIONS[2]!.ordinal}
                  title={SECTIONS[2]!.title}
                  audience={SECTIONS[2]!.audience}
                  note={
                    <>
                      <Correction>
                        AR Total, AR Over 30 Days and the invoice count were
                        checked against CSK&rsquo;s own QuickBooks exports for
                        16 August and matched exactly.
                      </Correction>
                      <Correction>
                        Cash is bank accounts only, as CSK define it. Deposit
                        Clearing and Undeposited Funds are excluded — they are
                        typed as bank accounts in QuickBooks but hold money in
                        transit, and Deposit Clearing was sitting at minus
                        $12,964.
                      </Correction>
                    </>
                  }
                >
                  {/* Five rows, as the Weekly tab has them. AR — Total and AR
                      Over 30 Days ($) are the two figures the percentage is
                      derived from, and Kyle keeps them on the sheet, so they
                      are here too rather than folded away. */}
                  <Metrics>
                    <Metric label="Cash Balance ($)" value={money(metrics.cashBalance)} />
                    <Metric label="AR — Total ($)" value={money(metrics.arTotal)} />
                    <Metric label="AR Over 30 Days ($)" value={money(metrics.arOver30)} />
                    <Metric
                      label="AR Over 30 Days (%)"
                      value={percent(metrics.arOver30Rate)}
                      tone="warn"
                    />
                    <Metric
                      label="Invoices Over 30 Days (#)"
                      value={count(metrics.invoicesOver30)}
                    />
                  </Metrics>
                </Block>

                {servingStale ? (
                  <p className="rounded-xl border border-warn/40 bg-warn-tint px-5 py-4 font-mono text-[11px] leading-relaxed text-warn">
                    {`These figures were computed before some metrics could be fetched, and before week boundaries were corrected to CSK's timezone. Refreshing them just now didn't work${
                      liveError ? `: ${liveError}` : ""
                    }. Showing the older ones rather than nothing.`}
                  </p>
                ) : null}

                {metrics.problems.length > 0 ? (
                  <section className="card px-5 py-5 sm:px-6">
                    <h2 className="micro mb-4 text-ink-4">Worth knowing</h2>
                    <ul className="flex flex-col gap-3">
                      {metrics.problems.map((problem) => (
                        <li
                          key={problem.where}
                          className="flex gap-3 font-mono text-[11px] leading-relaxed text-ink-3"
                        >
                          <span
                            aria-hidden
                            className={`mt-px shrink-0 ${
                              problem.severity === "error" ? "text-bad" : "text-warn"
                            }`}
                          >
                            &#9679;
                          </span>
                          <span>
                            <span className="text-ink-2">{problem.where}</span>
                            {" — "}
                            {problem.message}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Says what is missing and why, rather than showing an empty grid. */
function NotBuilt({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="card px-6 py-14 text-center">
      <h2 className="font-display text-lg font-semibold tracking-tight text-ink-2">
        {title}
      </h2>
      <p className="mx-auto mt-3 max-w-lg font-mono text-[11px] leading-relaxed text-ink-3">
        {body}
      </p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
