import { Block, Correction, EmptyBlock, Metric, Metrics, Pill } from "@/components/ui";
import { PeriodNav } from "@/components/PeriodNav";
import { SectionNav, type Section } from "@/components/SectionNav";
import { computeWeek, count, money, percent } from "@/lib/week-metrics";
import { syncWeek } from "@/lib/sync";
import { loadWeek, syncedWeeks } from "@/lib/week-store";
import { TokenExpired } from "@/lib/token-store";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui";
import {
  type PeriodKind,
  monthOf,
  weekFromParam,
  weekLabelWithYear,
} from "@/lib/periods";
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
 * Every period is a URL — /?week=2026-08-03 — so a week can be linked, sent to
 * someone, bookmarked and reloaded. That matters more than it sounds: the
 * whole product is one person sending figures to another.
 *
 * Only one week has figures until Jobber is connected, and it opens on that
 * week rather than on the current empty one. An empty shell says nothing about
 * whether any of this works; a week checked line by line against the client's
 * own spreadsheet says exactly that.
 */

/**
 * The three blocks, in the order they go out on a Wednesday morning.
 *
 * One list, used by both the sidebar and the blocks themselves, so a heading
 * can never say one thing in the nav and another on the block.
 */
const SECTIONS: readonly Section[] = [
  { id: "sales", ordinal: "01", title: "Sales pipeline", audience: "Chase", ready: true },
  { id: "revenue", ordinal: "02", title: "Revenue & production", audience: "Technicians + Chad", ready: true },
  { id: "cash", ordinal: "03", title: "Cash & AR", audience: "Chase + Alana", ready: false },
];

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
    month?: string;
    period?: string;
    /** "0" suppresses the live pull, for when Jobber is down. */
    fetch?: string;
    /** Set by the refresh route, so an expiry cannot become a redirect loop. */
    refreshed?: string;
  }>;
}) {
  const params = await searchParams;
  const kind: PeriodKind = params.period === "monthly" ? "monthly" : "weekly";

  const week = weekFromParam(params.week, VERIFIED_WEEK_MONDAY);
  const month = params.month ?? monthOf(week.start);

  // A stored week always wins. It was computed once, after the data settled,
  // and re-fetching it would both drift and burn Jobber's rate limit.
  const stored = kind === "weekly" ? await loadWeek(week.start).catch(() => null) : null;
  const storedWeeks = await syncedWeeks();

  const isSample =
    !stored && kind === "weekly" && week.start === VERIFIED_WEEK_MONDAY;
  const hasFigures = isSample;

  /**
   * Pull the week live rather than reading a stored snapshot.
   *
   * Automatic for any week without a stored snapshot: choosing a date should
   * show that date's figures, not a button asking permission to go and get
   * them. That is what a dashboard is.
   *
   * A stored week is never re-fetched. Once a week is frozen it must keep
   * reading the same, or a figure Chase screenshotted in August quietly
   * becomes a different figure in December.
   *
   * `?fetch=0` opts out, for when Jobber is down and the error is in the way.
   */
  const wantsLive =
    kind === "weekly" && !stored && !isSample && params.fetch !== "0";
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

  const metrics = stored
    ? stored.metrics
    : live
    ? live.metrics
    : hasFigures
    ? computeWeek({
        week,
        quotes: VERIFIED_QUOTES,
        jobs: VERIFIED_JOBS,
        // The recording listed the three winning quotes but not the other four
        // that were sent, so quotes sent comes from Jobber's card instead.
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

  return (
    <div className="relative min-h-screen">
      <div className="horizon" aria-hidden />

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
        {/* ------------------------------------------------------ masthead -- */}
        <header className="mb-10">
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <p className="micro mb-3 text-accent">CSK Electric</p>
              <h1 className="font-display text-[clamp(2rem,5vw,3rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-ink">
                CSK Dashboard
              </h1>
            </div>
            <a
              href="/settings"
              className="micro cursor-pointer text-ink-3 transition-colors duration-200 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Settings
            </a>
          </div>

          <PeriodNav
            kind={kind}
            weekStart={week.start}
            month={month}
            syncedPeriods={storedWeeks}
          />

          {stored ? (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Pill tone="good">Stored</Pill>
              <p className="font-mono text-[11px] text-ink-4">
                {`fetched ${new Date(stored.syncedAt).toLocaleDateString("en-CA", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}`}
              </p>
            </div>
          ) : live ? (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              {/* It IS saved — syncWeek writes the snapshot before returning.
                  This said "not saved", which was true before there was a
                  database and false the moment there was one. */}
              <Pill tone="good">Fetched just now</Pill>
              <p className="font-mono text-[11px] text-ink-4">
                {/* "506 quotes" read as though the week had 506 of them. The
                    quotes query has no upper bound on updatedAt by design, so
                    it scans everything touched since the week began and the
                    date rules narrow it. Say scanned, not counted. */}
                {`${live.counts.jobs} jobs closed · ${live.counts.requests} requests · ${live.counts.quotes} quotes scanned`}
              </p>
            </div>
          ) : hasFigures ? (
            <div className="mt-6">
              <Pill tone="warn">Sample week</Pill>
            </div>
          ) : null}
        </header>

        <div className="grid gap-8 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-10">
          {metrics ? (
            <SectionNav sections={SECTIONS} />
          ) : (
            <div aria-hidden className="hidden lg:block" />
          )}

          <div className="flex min-w-0 flex-col gap-4">
            {kind === "monthly" ? (
          <NotBuilt
            title="Monthly isn’t built yet"
            body="Efficiency compares actual against quoted, and quoted hours were blank on seven of the eight jobs in the verified week. That is a gap in what CSK record, not something the dashboard can compute around. The revenue split is buildable once the job-type field is being filled in."
          />
            ) : !metrics ? (
              <NotBuilt
                title={`No figures for ${weekLabelWithYear(week)}`}
                body={
                  liveError
                    ? `Couldn’t reach Jobber: ${liveError}`
                    : "Nothing stored for this week, and no live figures came back."
                }
                action={
                  <Button href={`/?week=${week.start}`}>Try again</Button>
                }
              />
            ) : (
          <div className="flex flex-col gap-4">
            {/* --------------------------------------------------- sales -- */}
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
                  <Correction>
                    {`Jobber’s own screen reads ${percent(
                      JOBBER_DISPLAYED.conversionRate,
                      0,
                    )} because it counts conversions only. CSK count approved change orders as won as well.`}
                  </Correction>
                  <Correction>
                    {`Values are pre-tax. Jobber’s card shows ${money(
                      JOBBER_DISPLAYED.convertedValue,
                    )} for converted quotes, which includes GST.`}
                  </Correction>
                </>
              }
            >
              <Metrics>
                <Metric
                  label="New leads"
                  value={count(metrics.newLeads)}
                  hint={`${count(metrics.newRequests)} requests`}
                />
                <Metric
                  label="Quotes sent"
                  value={count(metrics.quotesSentCount)}
                  hint={money(metrics.quotesSentValue)}
                />
                <Metric
                  label="Converted"
                  value={count(metrics.convertedCount)}
                  hint={money(metrics.convertedValue)}
                />
                <Metric
                  label="Approved"
                  value={count(metrics.approvedCount)}
                  hint={money(metrics.approvedValue)}
                />
                <Metric
                  label="Total won"
                  value={count(metrics.wonCount)}
                  hint={money(metrics.wonValue)}
                />
                <Metric
                  label="Win rate"
                  value={percent(metrics.conversionRate)}
                  hint="won / sent"
                  tone="good"
                />
              </Metrics>
            </Block>

            {/* ----------------------------------------- revenue & profit -- */}
            <Block
              id={SECTIONS[1]!.id}
              ordinal={SECTIONS[1]!.ordinal}
              title={SECTIONS[1]!.title}
              audience={SECTIONS[1]!.audience}
              note={
                <>
                  <Correction>
                    {`Gross profit is revenue less labour and materials, worked from the dollars. Jobber reports ${percent(
                      JOBBER_DISPLAYED.averageProfitRate,
                      0,
                    )} for this week by averaging each job’s own percentage, which weights a ${money(
                      250,
                    )} job the same as a ${money(6563)} one.`}
                  </Correction>
                  <Correction>
                    {`Revenue is the sum of the ${metrics.jobsClosed} jobs closed. The summary card above that same table reads ${money(
                      JOBBER_DISPLAYED.revenueCard,
                    )}, counting a different set of jobs.`}
                  </Correction>
                </>
              }
            >
              <Metrics>
                <Metric
                  label="Invoiced"
                  value={money(metrics.invoicedValue)}
                  hint="approximate"
                  tone="muted"
                />
                <Metric
                  label="Revenue closed"
                  value={money(metrics.revenueClosed)}
                  hint={`${metrics.jobsClosed} jobs`}
                />
                <Metric label="Labour" value={money(metrics.labourCost)} />
                <Metric label="Materials" value={money(metrics.materialCost)} />
                <Metric label="Gross profit" value={money(metrics.grossProfit)} />
                <Metric
                  label="Gross margin"
                  value={percent(metrics.grossProfitRate)}
                  hint="from dollars"
                  tone="good"
                />
                <Metric
                  label="Time tracked"
                  value={`${metrics.timeTrackedHours.toFixed(1)}h`}
                />
              </Metrics>
            </Block>

            {/* ----------------------------------------------- cash & ar -- */}
            <Block
              id={SECTIONS[2]!.id}
              ordinal={SECTIONS[2]!.ordinal}
              title={SECTIONS[2]!.title}
              audience={SECTIONS[2]!.audience}
              note={
                <Correction>
                  These five figures come from QuickBooks and not one of them
                  has been checked against a real export. Nothing here should be
                  sent on until it has.
                </Correction>
              }
            >
              <EmptyBlock>
                QuickBooks isn&rsquo;t connected. Bank balance, total owed,
                amount over 30 days and the late invoice count appear here.
              </EmptyBlock>
            </Block>
          </div>
        )}

        {metrics && metrics.problems.length > 0 ? (
          <section className="mt-10 border-t border-line pt-6">
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
          </div>
        </div>

        <footer className="mt-14 border-t border-line pt-6">
          <p className="micro text-ink-4">
            Monday to Sunday &middot; pre-tax &middot; CAD
          </p>
        </footer>
      </main>
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
    <section className="rounded-xl border border-dashed border-line-strong px-6 py-14 text-center">
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
