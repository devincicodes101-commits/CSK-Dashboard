import { NextResponse, type NextRequest } from "next/server";
import { qboFetch } from "@/lib/quickbooks";

/**
 * Returns a QuickBooks report exactly as Intuit sends it.
 *
 * Guessing at field names cost a round on Jobber. Rather than repeat that
 * with QBO's nested report JSON, this dumps the real thing so the parser can
 * be written against what actually arrives.
 *
 *   /api/quickbooks/raw?report=AgedReceivables&date=2026-08-23
 *   /api/quickbooks/raw?report=BalanceSheet&date=2026-08-23
 *   /api/quickbooks/raw?report=AgedReceivableDetail&date=2026-08-23
 *
 * Behind the dashboard's own gate when one is set, so it is no more exposed
 * than the figures themselves. It reads; it changes nothing.
 */

const ALLOWED = new Set([
  "BalanceSheet",
  "AgedReceivables",
  "AgedReceivableDetail",
  "ProfitAndLoss",
]);

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const name = params.get("report") ?? "AgedReceivables";
  const date = params.get("date") ?? new Date().toISOString().slice(0, 10);

  if (!ALLOWED.has(name)) {
    return NextResponse.json(
      { error: `Unknown report. One of: ${[...ALLOWED].join(", ")}` },
      { status: 400 },
    );
  }

  // BalanceSheet takes as_of; the ageing reports take report_date.
  const query = new URLSearchParams({ minorversion: "70" });
  if (name === "BalanceSheet") {
    query.set("as_of", date);
    query.set("accounting_method", "Accrual");
  } else {
    query.set("report_date", date);
  }

  try {
    const response = await qboFetch(`reports/${name}?${query}`);
    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
