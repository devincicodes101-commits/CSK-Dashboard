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
  weekFromMonday,
} from "../src/lib/metric-rules.ts";
import {
  VERIFIED_CARDS,
  VERIFIED_JOBS,
  VERIFIED_QUOTES,
  VERIFIED_WEEK_MONDAY,
} from "../src/lib/verified-week.ts";

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
check("counts in the week it was approved", quotesWon(CROSS, WEEK).length, 1);
check(
  "and not again when the job starts",
  quotesWon(CROSS, weekFromMonday("2026-08-24")).length,
  0,
);

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

/* --------------------------------------------------------------------- done */

console.log(
  `\n${checks - failures}/${checks} checks passed` +
    (failures ? ` — ${failures} FAILED` : ""),
);
if (failures > 0) process.exit(1);
