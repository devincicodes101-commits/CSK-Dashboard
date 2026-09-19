/**
 * The metric definitions, pinned to a week we have verified by hand.
 *
 *   npm run test:metrics
 *
 * This file is the specification, and it runs before every build.
 *
 * On 3 September 2026 CSK recorded a walkthrough of their live Jobber account
 * for the week of 3-9 August 2026, and typed the resulting figures into their
 * spreadsheet. Every quote and job below is transcribed from that recording,
 * and every expectation is the number that ended up in Kyle's sheet.
 *
 * So this is not a test of arithmetic. It is a test that our definitions still
 * agree with the human who has been producing these numbers by hand. If a
 * change to metric-rules.ts breaks it, the change is wrong until CSK say
 * otherwise — the failure that matters most is the win rate quietly returning
 * to 57.1%, which is what naive arithmetic produces on this very week.
 */

import {
  type Quote,
  collapsedInWeek,
  conversionRate,
  efficiency,
  firstWonAt,
  grossProfit,
  grossProfitRate,
  jobberAverageProfitRate,
  naiveWonCount,
  naiveWonValue,
  quotesApproved,
  quotesConverted,
  quotesWon,
  reconcile,
  sumJobs,
  sumSubtotals,
  sumTotals,
  weekFromMonday,
  alsoWonEarlier,
} from "../src/lib/metric-rules.ts";
import {
  VERIFIED_CARDS,
  VERIFIED_JOBS,
  VERIFIED_QUOTES,
  VERIFIED_WEEK_MONDAY,
} from "../src/lib/verified-week.ts";
import { computeWeek } from "../src/lib/week-metrics.ts";
import {
  ANNUAL_PLAN,
  MONTHLY_PLAN,
  RATIO_TARGETS,
  weeklyTargets,
} from "../src/lib/targets.ts";
import { monthToDate, type WeekFigures } from "../src/lib/month-to-date.ts";

/* ------------------------------------------------------------- test runner */

let failures = 0;
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks += 1;
  const ok = Object.is(actual, expected);
  if (!ok) {
    failures += 1;
    console.error(`  FAIL  ${name}\n          expected ${expected}\n          actual   ${actual}`);
  }
}

/** Money and rates carry float noise; compare to a stated precision. */
function close(name: string, actual: number | null, expected: number, epsilon: number) {
  checks += 1;
  const ok = actual !== null && Math.abs(actual - expected) <= epsilon;
  if (!ok) {
    failures += 1;
    console.error(`  FAIL  ${name}\n          expected ${expected} (±${epsilon})\n          actual   ${actual}`);
  }
}

function section(title: string) {
  console.log(`\n${title}`);
}

/* ------------------------------------------------------- the verified week */

/**
 * The fixture lives in src/lib/verified-week.ts so that exactly one copy
 * exists. The dashboard renders the same rows as a worked example until
 * Jobber is connected, and two copies would eventually disagree.
 */
const WEEK = weekFromMonday(VERIFIED_WEEK_MONDAY);
const QUOTES: readonly Quote[] = VERIFIED_QUOTES;
const JOBS = VERIFIED_JOBS;
const SENT_COUNT = VERIFIED_CARDS.quotesSentCount;
const SENT_VALUE = VERIFIED_CARDS.quotesSentValue;

/* ----------------------------------------------------------------- the week */

section("Week boundaries");
check("week starts Monday 3 Aug", WEEK.start, "2026-08-03");
check("week ends Sunday 9 Aug", WEEK.end, "2026-08-09");

let rejectedNonMonday = false;
try {
  weekFromMonday("2026-08-05");
} catch {
  rejectedNonMonday = true;
}
check("a non-Monday start is refused", rejectedNonMonday, true);

/* --------------------------------------------------------- the dedupe case */

section("Quote #1231 — counted once, not twice");
check("first won on the approval date, not the conversion", firstWonAt(QUOTES[1]!), "2026-08-04");
check("it is reported as collapsed", collapsedInWeek(QUOTES, WEEK).join(","), "1231");

check("quotes won", quotesWon(QUOTES, WEEK).length, 3);
close("value won", sumSubtotals(quotesWon(QUOTES, WEEK)), 6442.47, 0.005);

check("of which converted", quotesConverted(QUOTES, WEEK).length, 2);
close("converted value", sumSubtotals(quotesConverted(QUOTES, WEEK)), 3500.03, 0.005);

check("of which approved only", quotesApproved(QUOTES, WEEK).length, 1);
close("approved value", sumSubtotals(quotesApproved(QUOTES, WEEK)), 2942.44, 0.005);

check(
  "converted plus approved equals total won",
  quotesConverted(QUOTES, WEEK).length + quotesApproved(QUOTES, WEEK).length,
  quotesWon(QUOTES, WEEK).length,
);

close("win rate", conversionRate(quotesWon(QUOTES, WEEK).length, SENT_COUNT), 0.428571, 0.0001);

// Why CSK measure conversion by count and never by value: one large commercial
// bid dominates the $206,046 sent that week, so a dollar-based rate reads 3%
// and says nothing about how the selling went.
close(
  "a dollar-based win rate would read 3%",
  conversionRate(sumSubtotals(quotesWon(QUOTES, WEEK)), SENT_VALUE),
  0.0313,
  0.0005,
);

// CSK take Quotes Sent ($) off Jobber's card, which includes GST, while the
// won figures come from the Subtotal column. Inconsistent, and theirs.
section("Quotes Sent ($) is tax inclusive, the won figures are not");
close("won, pre-tax", sumSubtotals(quotesWon(QUOTES, WEEK)), 6442.47, 0.005);
close("the same quotes with tax", sumTotals(quotesWon(QUOTES, WEEK)), 6764.59, 0.005);
check(
  "which is about five percent higher",
  Math.round((sumTotals(quotesWon(QUOTES, WEEK)) / sumSubtotals(quotesWon(QUOTES, WEEK))) * 100) / 100,
  1.05,
);

section("The wrong answers, which we must not produce");
check("adding the two lists gives four", naiveWonCount(QUOTES, WEEK), 4);
close("and inflates the value", naiveWonValue(QUOTES, WEEK), 7098.1, 0.005);
close("and the win rate", conversionRate(naiveWonCount(QUOTES, WEEK), SENT_COUNT), 0.571429, 0.0001);
check(
  "our count differs from the naive one",
  quotesWon(QUOTES, WEEK).length !== naiveWonCount(QUOTES, WEEK),
  true,
);

/* ----------------------------------------------------------- cross-week rule */

section("A quote won in one week and converted in a later one");
const CROSS: Quote[] = [
  {
    quoteNumber: "9001",
    clientName: "Test",
    title: "Approved early, converted late",
    subtotal: 1000,
    total: 1050,
    approvedAt: "2026-08-04",
    convertedAt: "2026-08-26",
    sentAt: "2026-08-03",
  },
];
// CSK's definition counts it in both weeks: approved in one, converted in the
// other, and their spec says each week counts what happened in it. We follow
// the definition and report the overlap rather than quietly picking one week,
// because choosing is theirs to do and the choice changes monthly totals.
check("counts in the week it was approved", quotesWon(CROSS, WEEK).length, 1);
check(
  "and again in the week it converted, per CSK's definition",
  quotesWon(CROSS, weekFromMonday("2026-08-24")).length,
  1,
);
check(
  "the second week reports it as already won earlier",
  alsoWonEarlier(CROSS, weekFromMonday("2026-08-24")).join(","),
  "9001",
);
check(
  "the first week reports nothing earlier",
  alsoWonEarlier(CROSS, WEEK).length,
  0,
);

// The case this project exists for: converted keeps Jobber's own count, and
// the deduplication comes out of approved instead.
section("A quote approved in an earlier week and converted in this one");
const CARRIED: Quote[] = [
  {
    quoteNumber: "1191",
    clientName: "Test",
    title: "Approved before the week, converted inside it",
    subtotal: 5000,
    total: 5250,
    approvedAt: "2026-08-10",
    convertedAt: "2026-08-20",
    sentAt: "2026-08-03",
  },
];
const AUG17 = weekFromMonday("2026-08-17");
check("counts as converted, matching Jobber's screen", quotesConverted(CARRIED, AUG17).length, 1);
check("and is not double counted as approved", quotesApproved(CARRIED, AUG17).length, 0);
check("won once", quotesWon(CARRIED, AUG17).length, 1);

/* ------------------------------------------------------- revenue and profit */

section("Revenue and profit on jobs closed in the week");
const totals = sumJobs(JOBS);
close("revenue", totals.revenue, 11404.08, 0.005);
close("labour", totals.labourCost, 3154.18, 0.005);
close("materials", totals.materialCost, 2629.69, 0.005);
close("time tracked (70:30)", totals.timeTrackedHours, 70.5, 0.005);

const gp = grossProfit(totals.revenue, totals.labourCost, totals.materialCost);
close("gross profit", gp, 5620.21, 0.005);
close("gross profit rate", grossProfitRate(totals.revenue, gp), 0.4928, 0.0001);

section("Jobber's average profit, which we must not produce");
close("its figure", jobberAverageProfitRate(JOBS), 0.5118, 0.0001);
check(
  "ours is lower, because the large job is less profitable",
  (grossProfitRate(totals.revenue, gp) ?? 1) < (jobberAverageProfitRate(JOBS) ?? 0),
  true,
);

section("Reconciling against the figure Jobber reported");
check(
  "two cents of rounding passes",
  reconcile("gross profit", 5620.21, 5620.24),
  null,
);
check(
  "a real gap is raised",
  reconcile("revenue", 11404.08, 28145)?.severity,
  "warning",
);

/* ----------------------------------------------------------- the blocked bit */

section("Efficiency — blocked, and visibly so");
const hours = efficiency(JOBS, "hours");
check("only one job carries quoted hours", hours.measured, 1);
check("seven are skipped", hours.skipped, 7);
close("so the ratio is drawn from a single job", hours.value, 1.15625, 0.0001);

const materials = efficiency(JOBS, "materials");
check("same story for materials", materials.measured, 1);
check("seven skipped", materials.skipped, 7);

check(
  "with nothing quoted at all the answer is null, never zero",
  efficiency(
    JOBS.filter((j) => j.hoursQuoted === 0),
    "hours",
  ).value,
  null,
);



/* ------------------------------------------------- the assembled dashboard */

/**
 * computeWeek, not just the rules underneath it.
 *
 * These exist because the first deploy rendered a 150% win rate. The rules
 * were right and every check above passed; the assembly was wrong. It counted
 * quotes sent from the fixture's three records — of which two fell inside the
 * week — and divided three wins by two. Testing the parts is not the same as
 * testing the thing that ships.
 */
section("The week as the dashboard assembles it");

const assembled = computeWeek({
  week: WEEK,
  quotes: QUOTES,
  jobs: JOBS,
  quotesAreComplete: false,
  cards: {
    newLeads: VERIFIED_CARDS.newLeads,
    newRequests: VERIFIED_CARDS.newRequests,
    quotesSentCount: VERIFIED_CARDS.quotesSentCount,
    quotesSentValue: VERIFIED_CARDS.quotesSentValue,
    invoicedValue: VERIFIED_CARDS.invoicedValue,
  },
  quickBooks: { cashBalance: null, arTotal: null, arOver30: null, invoicesOver30: null },
});

check("quotes sent comes from the card, not the partial records", assembled.quotesSentCount, 7);
close("and its value likewise", assembled.quotesSentValue, 206046, 0.005);
check("won", assembled.wonCount, 3);
close("win rate is 42.9%, not 150%", assembled.conversionRate, 0.428571, 0.0001);
check("the collapsed quote is reported", assembled.collapsedQuotes.join(","), "1231");
close("gross profit rate", assembled.grossProfitRate, 0.4928, 0.0001);
check("QuickBooks absence is raised, not zeroed", assembled.cashBalance, null);
check(
  "and said out loud",
  assembled.problems.some((p) => p.where === "Cash & AR"),
  true,
);

section("An impossible win rate is refused, not printed");
const impossible = computeWeek({
  week: WEEK,
  quotes: QUOTES,
  jobs: JOBS,
  quotesAreComplete: true, // pretend the partial set is the whole set
  cards: {
    newLeads: null, newRequests: null,
    quotesSentCount: null, quotesSentValue: null, invoicedValue: null,
  },
  quickBooks: { cashBalance: null, arTotal: null, arOver30: null, invoicesOver30: null },
});
check("three won against two sent", `${impossible.wonCount}/${impossible.quotesSentCount}`, "3/2");
check(
  "raises an error rather than showing 150%",
  impossible.problems.some((p) => p.where === "Win rate" && p.severity === "error"),
  true,
);

/* ------------------------------------------------------------------ targets */

/**
 * CSK's annual plan has to agree with itself.
 *
 * The plan is transcribed by hand from two screenshots, so a mistyped digit
 * is the likeliest fault in the whole module and would silently set the wrong
 * bar for a year. Every summary figure on their own sheets is derivable from
 * the monthly rows, so each one is a check on the transcription.
 */
section("CSK's plan reconciles against its own summary panels");

const sum = (pick: (m: (typeof MONTHLY_PLAN)[number]) => number) =>
  MONTHLY_PLAN.reduce((t, m) => t + pick(m), 0);

check("twelve months of plan", MONTHLY_PLAN.length, 12);
check("$ booked totals New Sales", sum((m) => m.booked), ANNUAL_PLAN.newSales);
check(
  "new sales plus carry over is total sales",
  ANNUAL_PLAN.newSales + ANNUAL_PLAN.carryOverSales,
  ANNUAL_PLAN.totalSales,
);
// Their $3,000,000 is the round figure; the months add to 2,999,680.
close("$ produced is the stated 3m", sum((m) => m.produced), ANNUAL_PLAN.produced, 400);
close("lead conversion is 79%", sum((m) => m.estimates) / sum((m) => m.leads), RATIO_TARGETS.leadConversion, 0.005);
close("sales ratio is 67%", sum((m) => m.jobsBooked) / sum((m) => m.estimates), RATIO_TARGETS.salesRatio, 0.005);
close("average job size is $5,681", sum((m) => m.booked) / sum((m) => m.jobsBooked), RATIO_TARGETS.averageJobSize, 10);
close("charge rate is $102.33/hr", sum((m) => m.produced) / sum((m) => m.hours), RATIO_TARGETS.chargeRatePerHour, 0.05);

section("A week takes its share of the month, not a flat twelfth");

// August 2026 has 31 days; the plan is 91 leads. A whole week inside it is
// seven thirty-firsts of that.
const inAugust = weeklyTargets({ start: "2026-08-03", end: "2026-08-09" });
close("a full August week", inAugust.leads, (91 / 31) * 7, 0.001);

// 28 September to 4 October: three days of September, four of October. Both
// months plan 102 leads, so the total is the same — but the machinery has to
// walk the days to get there, and the revenue split proves it did.
const straddling = weeklyTargets({ start: "2026-09-28", end: "2026-10-04" });
close(
  "a week straddling the month end",
  straddling.revenue,
  (264_640 / 30) * 3 + (264_640 / 31) * 4,
  0.01,
);

// Fifty-two weekly targets must add to roughly the annual plan. Not exactly:
// 52 weeks is 364 days and a year is 365.
section("The weekly targets add back up to the year");
let yearOfWeeks = 0;
for (let i = 0; i < 52; i += 1) {
  const monday = new Date(Date.UTC(2026, 6, 6) + i * 7 * 86_400_000);
  const iso = monday.toISOString().slice(0, 10);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
  yearOfWeeks += weeklyTargets({ start: iso, end: sunday }).revenue;
}
close("52 weeks of revenue target", yearOfWeeks, ANNUAL_PLAN.produced, 40_000);

/* ------------------------------------------------------------ month to date */

section("Month to date adds the weeks up and matches their targets");

const augustWeek = (start: string, end: string, revenue: number, leads: number | null): WeekFigures => ({
  start, end, revenueClosed: revenue, newLeads: leads,
  quotesSentCount: 6, wonCount: 3, wonValue: 6_442,
});

// August 2026 begins on a Saturday, so its Mondays are 3, 10, 17, 24 and 31.
const augustStored = [
  augustWeek("2026-08-03", "2026-08-09", 11_404, 12),
  augustWeek("2026-08-10", "2026-08-16", 65_925, 15),
  augustWeek("2026-08-17", "2026-08-23", 33_843, null),
];

const mtd = monthToDate(augustStored, "2026-08-17");
check("names the month", mtd.month, "August 2026");
check("three Mondays had passed by the 17th", mtd.weeksElapsed, 3);
check("and all three are stored", mtd.weeksCounted, 3);

const revenue = mtd.rows.find((r) => r.label === "Revenue — jobs closed")!;
close("revenue is the three weeks added", revenue.actual, 11_404 + 65_925 + 33_843, 0.01);
// Three whole weeks of August: 21 of its 31 days.
close("target is those same three weeks", revenue.target, (242_640 / 31) * 21, 0.01);

// A week nobody fetched must not read as a shortfall: the target shrinks with
// the actuals, and weeksCounted says the view is partial.
const partial = monthToDate(augustStored.slice(0, 2), "2026-08-17");
check("a missing week is reported, not absorbed", `${partial.weeksCounted}/${partial.weeksElapsed}`, "2/3");
close(
  "and the target covers only the weeks present",
  partial.rows.find((r) => r.label === "Revenue — jobs closed")!.target,
  (242_640 / 31) * 14,
  0.01,
);

// Leads were recorded in two of the three weeks. A partial figure is worth
// showing; a column never recorded at all must stay null rather than read 0.
const leads = mtd.rows.find((r) => r.label === "New leads")!;
check("leads sum what was recorded", leads.actual, 27);
const noLeads = monthToDate(
  [augustWeek("2026-08-03", "2026-08-09", 11_404, null)],
  "2026-08-03",
);
check(
  "a column with nothing recorded stays null, never zero",
  noLeads.rows.find((r) => r.label === "New leads")!.actual,
  null,
);

section("A week counts towards the month its Monday falls in");
// 28 September starts a week running into October. It belongs to September.
const straddles = monthToDate(
  [augustWeek("2026-09-28", "2026-10-04", 50_000, 10)],
  "2026-09-28",
);
check("counted in September", straddles.weeksCounted, 1);
check("labelled September", straddles.month, "September 2026");
// Its target still spans both months' plans, because its actuals do too.
close(
  "target draws on both months",
  straddles.rows.find((r) => r.label === "Revenue — jobs closed")!.target,
  (264_640 / 30) * 3 + (264_640 / 31) * 4,
  0.01,
);

/* --------------------------------------------------------------------- done */

console.log(
  `\n${checks - failures}/${checks} checks passed` +
    (failures ? ` — ${failures} FAILED` : ""),
);
if (failures > 0) process.exit(1);
