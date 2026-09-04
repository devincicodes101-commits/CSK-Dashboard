import { Block, Correction, EmptyBlock, Metric, Metrics, Pill } from "@/components/ui";
import { weekFromMonday } from "@/lib/metric-rules";
import { computeWeek, count, money, percent, weekLabel } from "@/lib/week-metrics";
import {
  JOBBER_DISPLAYED,
  VERIFIED_CARDS,
  VERIFIED_JOBS,
  VERIFIED_QUOTES,
  VERIFIED_WEEK_MONDAY,
} from "@/lib/verified-week";

/**
 * The weekly dashboard.
 *
 * Until Jobber is connected this renders the one week checked by hand, plainly
 * labelled. An empty shell would say nothing about whether any of this works;
 * a week whose every figure was verified against the client's own spreadsheet
 * says exactly that.
 */
export default function WeeklyDashboard() {
  const week = weekFromMonday(VERIFIED_WEEK_MONDAY);

  const metrics = computeWeek({
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
  });

  const naiveWon = metrics.wonCount + metrics.collapsedQuotes.length;

  return (
    <div className="relative min-h-screen">
      <div className="horizon" aria-hidden />

      <main className="relative z-10 mx-auto max-w-5xl px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
        {/* ------------------------------------------------------ masthead -- */}
        <header className="mb-12">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <span className="micro text-accent">CSK Electric</span>
            <span aria-hidden className="micro text-ink-4">
              /
            </span>
            <span className="micro text-ink-3">Weekly metrics</span>
          </div>

          <h1 className="font-display text-[clamp(2.25rem,6vw,3.5rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-ink">
            Week of {weekLabel(week)}
          </h1>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Pill tone="warn">Sample week</Pill>
            <p className="max-w-xl font-mono text-[11px] leading-relaxed text-ink-3">
              Jobber isn&rsquo;t connected, so these are the figures for 3&ndash;9
              August 2026 &mdash; the one week checked line by line against
              CSK&rsquo;s own numbers.
            </p>
          </div>
        </header>

        <div className="flex flex-col gap-4">
          {/* ------------------------------------------------------ sales -- */}
          <Block
            ordinal="01"
            title="Sales pipeline"
            audience="Chase"
            note={
              <>
                {metrics.collapsedQuotes.length > 0 ? (
                  <Correction>
                    Quote #{metrics.collapsedQuotes.join(", #")}
                    {" was approved and converted in the same week."} Jobber&rsquo;s reports list
                    it twice; counted once here. Adding both lists would show{" "}
                    {naiveWon} won at{" "}
                    {percent(naiveWon / (metrics.quotesSentCount ?? 1))}.
                  </Correction>
                ) : null}
                <Correction>
                  Jobber&rsquo;s own screen reads{" "}
                  {percent(JOBBER_DISPLAYED.conversionRate, 0)} because it
                  counts conversions only. CSK count approved change orders as
                  won as well.
                </Correction>
                <Correction>
                  Values are pre-tax. Jobber&rsquo;s card shows{" "}
                  {money(JOBBER_DISPLAYED.convertedValue)} for converted quotes,
                  which includes GST.
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

          {/* -------------------------------------------- revenue & profit -- */}
          <Block
            ordinal="02"
            title="Revenue &amp; production"
            audience="Technicians + Chad"
            note={
              <>
                <Correction>
                  Gross profit is revenue less labour and materials, worked from
                  the dollars. Jobber reports{" "}
                  {percent(JOBBER_DISPLAYED.averageProfitRate, 0)}
                  {" for this week by averaging each job’s own percentage, "}
                  {"which weights a "}
                  {money(250)} job the same as a {money(6563)} one.
                </Correction>
                <Correction>
                  Revenue is the sum of the {metrics.jobsClosed} jobs closed.
                  The summary card above that same table reads{" "}
                  {money(JOBBER_DISPLAYED.revenueCard)}, counting a different
                  set of jobs.
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

          {/* -------------------------------------------------- cash & ar -- */}
          <Block
            ordinal="03"
            title="Cash &amp; AR"
            audience="Chase + Alana"
            note={
              <Correction>
                These five figures come from QuickBooks and not one of them has
                been checked against a real export. Nothing here should be sent
                on until it has.
              </Correction>
            }
          >
            <EmptyBlock>
              QuickBooks isn&rsquo;t connected. Bank balance, total owed, amount
              over 30 days and the late invoice count appear here.
            </EmptyBlock>
          </Block>
        </div>

        {metrics.problems.length > 0 ? (
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

        <footer className="mt-14 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <p className="micro text-ink-4">
            Monday to Sunday &middot; pre-tax &middot; CAD
          </p>
          <a
            href="/settings"
            className="micro text-ink-3 transition-colors hover:text-accent"
          >
            Settings
          </a>
        </footer>
      </main>
    </div>
  );
}
