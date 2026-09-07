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

/* --------------------------------------------------------------------- done */

console.log(
  `\n${checks - failures}/${checks} checks passed` +
    (failures ? ` — ${failures} FAILED` : ""),
);
if (failures > 0) process.exit(1);
