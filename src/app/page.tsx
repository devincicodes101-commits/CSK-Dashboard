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
 * Until Jobber is connected this renders the one week we have checked by hand,
 * clearly labelled. That is on purpose: an empty shell shows nothing about
 * whether the thing works, whereas a week whose every figure has been verified
 * against the client's own hand-built spreadsheet shows exactly that.
 */
export default function WeeklyDashboard() {
  const week = weekFromMonday(VERIFIED_WEEK_MONDAY);

  const metrics = computeWeek({
    week,
    quotes: VERIFIED_QUOTES,
    jobs: VERIFIED_JOBS,
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

  return (
    <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">
            Week of {weekLabel(week)}
          </h1>
          <Pill tone="warn">Sample week</Pill>
        </div>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-2">
          Jobber is not connected yet, so this shows the week of 3–9 August
          2026 — the one week checked line by line against CSK&rsquo;s own
          figures. Every number below matches what Kyle produced by hand.
        </p>
      </header>

      <div className="flex flex-col gap-5">
        {/* ------------------------------------------------------- sales -- */}
        <Block
          title="Sales pipeline"
          audience="Chase"
          note={
            <div className="flex flex-col gap-1.5">
              {metrics.collapsedQuotes.length > 0 ? (
                <Correction>
                  Quote #{metrics.collapsedQuotes.join(", #")} was both approved
                  and converted this week. Jobber&rsquo;s reports list it twice;
                  it is counted once here. Adding both lists would show{" "}
                  {metrics.wonCount + metrics.collapsedQuotes.length} won and a{" "}
                  {percent(
                    (metrics.wonCount + metrics.collapsedQuotes.length) /
                      (metrics.quotesSentCount ?? 1),
                  )}{" "}
                  win rate.
                </Correction>
              ) : null}
              <Correction>
                Jobber&rsquo;s own screen shows{" "}
                {percent(JOBBER_DISPLAYED.conversionRate, 0)} because it counts
                conversions only. CSK count approved change orders as won too.
              </Correction>
              <Correction>
                Values are pre-tax. Jobber&rsquo;s card shows{" "}
                {money(JOBBER_DISPLAYED.convertedValue)} for converted quotes,
                which includes GST.
              </Correction>
            </div>
          }
        >
          <Metrics>
            <Metric
              label="New leads"
              value={count(metrics.newLeads)}
              hint={`${count(metrics.newRequests)} new requests`}
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
              hint="won ÷ sent"
            />
          </Metrics>
        </Block>

        {/* --------------------------------------------- revenue & profit -- */}
        <Block
          title="Revenue & production"
          audience="Technicians + Chad"
          note={
            <div className="flex flex-col gap-1.5">
              <Correction>
                Gross profit is revenue less labour and materials, worked from
                the dollars. Jobber reports{" "}
                {percent(JOBBER_DISPLAYED.averageProfitRate, 0)} for this week
                by averaging each job&rsquo;s own percentage, which weights a{" "}
                {money(250)} job the same as a {money(6563)} one.
              </Correction>
              <Correction>
                Revenue is the sum of the {metrics.jobsClosed} jobs closed.
                Jobber&rsquo;s summary card above the same table reads{" "}
                {money(JOBBER_DISPLAYED.revenueCard)}, counting a different set
                of jobs.
              </Correction>
            </div>
          }
        >
          <Metrics>
            <Metric label="Invoiced" value={money(metrics.invoicedValue)} hint="approximate" />
            <Metric
              label="Revenue — jobs closed"
              value={money(metrics.revenueClosed)}
              hint={`${metrics.jobsClosed} jobs`}
            />
            <Metric label="Labour cost" value={money(metrics.labourCost)} />
            <Metric label="Material cost" value={money(metrics.materialCost)} />
            <Metric label="Gross profit" value={money(metrics.grossProfit)} />
            <Metric
              label="Gross profit %"
              value={percent(metrics.grossProfitRate)}
              tone="good"
            />
            <Metric
              label="Time tracked"
              value={`${metrics.timeTrackedHours.toFixed(1)} h`}
            />
          </Metrics>
        </Block>

        {/* ------------------------------------------------- cash and AR -- */}
        <Block
          title="Cash & AR"
          audience="Chase + Alana"
          note={
            <Correction>
              These five figures come from QuickBooks and none of them has yet
              been checked against a real export. Nothing here should be sent
              on until it has been.
            </Correction>
          }
        >
          <EmptyBlock>
            QuickBooks isn&rsquo;t connected. Bank balance, total owed, amount
            over 30 days and the late invoice count will appear here.
          </EmptyBlock>
        </Block>
      </div>

      {metrics.problems.length > 0 ? (
        <section className="mt-5 rounded-lg border border-line bg-surface px-5 py-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-3">
            Worth knowing
          </h2>
          <ul className="mt-2.5 flex flex-col gap-2">
            {metrics.problems.map((problem) => (
              <li key={problem.where} className="text-sm text-ink-2">
                <span className="font-medium text-ink">{problem.where}</span>
                {" — "}
                {problem.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
