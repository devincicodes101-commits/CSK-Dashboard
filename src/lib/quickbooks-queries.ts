/**
 * Reading the five Cash & AR figures out of QuickBooks.
 *
 * We know exactly what the answers should be for the week ending 23 August
 * 2026, because CSK exported the three reports by hand:
 *
 *   Cash Balance              392,136.57   bank accounts only
 *   AR — Total                392,229.80
 *   AR Over 30 Days ($)        87,260.79   31-60 + 61-90 + 91+
 *   AR Over 30 Days (%)            22.2%
 *   Invoices Over 30 Days (#)          31   Invoice rows only, no credits
 *
 * That is the same kind of verification set the 3-9 August Jobber week gave
 * us, and it is what makes this checkable rather than hopeful.
 *
 * QBO's report JSON is a nested Rows/ColData tree whose exact shape is not
 * documented in a way worth trusting from memory. Everything here walks it
 * defensively and, when a figure cannot be found, says so with the structure
 * it actually received — see /api/quickbooks/raw for the full dump.
 */

import { qboFetch } from "./quickbooks";

/* ------------------------------------------------------- report structures */

interface ColData {
  value?: string;
  id?: string;
}

interface ReportRow {
  Header?: { ColData?: ColData[] };
  Rows?: { Row?: ReportRow[] };
  Summary?: { ColData?: ColData[] };
  ColData?: ColData[];
  type?: string;
  group?: string;
}

interface Report {
  Header?: { Time?: string; ReportName?: string; StartPeriod?: string; EndPeriod?: string };
  Columns?: { Column?: { ColTitle?: string; ColType?: string }[] };
  Rows?: { Row?: ReportRow[] };
}

/** Every row in the tree, flattened, so a value can be found wherever it sits. */
function flatten(rows: ReportRow[] | undefined): ReportRow[] {
  if (!rows) return [];
  return rows.flatMap((row) => [row, ...flatten(row.Rows?.Row)]);
}

function money(text: string | undefined): number {
  if (!text) return 0;
  // QBO renders negatives as -1,040.94 and occasionally as (1,040.94).
  const cleaned = text.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

async function report(name: string, params: Record<string, string>): Promise<Report> {
  const query = new URLSearchParams({ ...params, minorversion: "70" });
  const response = await qboFetch(`reports/${name}?${query}`);
  return (await response.json()) as Report;
}

/* ------------------------------------------------------------ cash balance */

interface RawAccount {
  Id: string;
  Name: string;
  AccountType: string;
  CurrencyRef?: { value?: string };
}

/**
 * The bank accounts, by name.
 *
 * Needed because the Balance Sheet groups accounts under "Cash and Cash
 * Equivalent" without saying which are banks — and that group also holds
 * Undeposited Funds and Deposit clearing, which are NOT money in the bank.
 * For 23 August they were $48,217.85 and -$12,964.53, so including them
 * overstates the balance by $35,253.
 *
 * CSK's own definition is "amount in the bank account", so the account list
 * decides what counts and the report supplies the as-at balances.
 */
async function bankAccountNames(): Promise<{ names: Set<string>; currencies: Set<string> }> {
  const query = encodeURIComponent(
    "select Id, Name, AccountType, CurrencyRef from Account where AccountType = 'Bank'",
  );
  const response = await qboFetch(`query?query=${query}&minorversion=70`);
  const body = (await response.json()) as {
    QueryResponse?: { Account?: RawAccount[] };
  };

  const accounts = body.QueryResponse?.Account ?? [];
  return {
    names: new Set(accounts.map((a) => a.Name.trim().toLowerCase())),
    currencies: new Set(
      accounts.map((a) => a.CurrencyRef?.value).filter((c): c is string => Boolean(c)),
    ),
  };
}

export interface CashResult {
  balance: number | null;
  /** Named so the dashboard can show what was and was not counted. */
  counted: { name: string; amount: number }[];
  excluded: { name: string; amount: number }[];
  problems: string[];
}

/**
 * Money in the bank as at a date.
 *
 * The Balance Sheet rather than each account's CurrentBalance, because
 * CurrentBalance is today's figure. Using it would make every historical week
 * show the same number and change every time anyone looked — which is the
 * opposite of a frozen week.
 */
export async function fetchCashBalance(asOf: string): Promise<CashResult> {
  const problems: string[] = [];

  const { names, currencies } = await bankAccountNames();
  if (names.size === 0) {
    return {
      balance: null,
      counted: [],
      excluded: [],
      problems: ["No accounts of type Bank were found in QuickBooks."],
    };
  }

  if (currencies.size > 1) {
    // Adding CAD to USD would produce a number that looks fine and means
    // nothing. Refuse rather than report it.
    return {
      balance: null,
      counted: [],
      excluded: [],
      problems: [
        `Bank accounts are held in more than one currency (${[...currencies].join(", ")}). ` +
          "Summing them would mix currencies, so no cash balance is reported.",
      ],
    };
  }

  const sheet = await report("BalanceSheet", {
    as_of: asOf,
    accounting_method: "Accrual",
  });

  const counted: { name: string; amount: number }[] = [];
  const excluded: { name: string; amount: number }[] = [];

  for (const row of flatten(sheet.Rows?.Row)) {
    const cells = row.ColData;
    if (!cells || cells.length < 2) continue;

    const label = cells[0]?.value?.trim();
    if (!label) continue;

    const amount = money(cells[cells.length - 1]?.value);

    // Balance Sheet rows read "1020 RBC Chequing (4810)" while the account
    // list says "1020 RBC Chequing (4810)" too — but compare loosely, since a
    // renamed account should not silently drop out of the total.
    const key = label.toLowerCase();
    if (names.has(key)) counted.push({ name: label, amount });
    else if ([...names].some((n) => key.includes(n) || n.includes(key))) {
      counted.push({ name: label, amount });
    }
  }

  // Anything in the cash grouping we did NOT count, so the difference from
  // the report's own subtotal is explainable rather than mysterious.
  for (const row of flatten(sheet.Rows?.Row)) {
    const cells = row.ColData;
    const label = cells?.[0]?.value?.trim();
    if (!label || !cells) continue;
    if (/undeposited|deposit clearing|for recon/i.test(label)) {
      excluded.push({ name: label, amount: money(cells[cells.length - 1]?.value) });
    }
  }

  if (counted.length === 0) {
    problems.push(
      "No bank accounts were matched in the Balance Sheet. The report was " +
        "read but none of its rows matched the Bank accounts in QuickBooks — " +
        "see /api/quickbooks/raw for what came back.",
    );
    return { balance: null, counted, excluded, problems };
  }

  const balance = Math.round(counted.reduce((sum, a) => sum + a.amount, 0) * 100) / 100;
  return { balance, counted, excluded, problems };
}

/* ---------------------------------------------------------------------- AR */

export interface ArResult {
  total: number | null;
  overThirty: number | null;
  invoicesOverThirty: number | null;
  problems: string[];
}

/**
 * Receivables as at a date, and how much of it is late.
 *
 * "Over 30 days" is 31-60 plus 61-90 plus 91+. The 1-30 bucket is deliberately
 * excluded: paying a week or two late is ordinary, and counting it would bury
 * the signal the metric exists for.
 */
export async function fetchAr(asOf: string): Promise<ArResult> {
  const problems: string[] = [];

  const summary = await report("AgedReceivables", { report_date: asOf });

  // The grand total is the last Summary in the tree.
  const summaries = flatten(summary.Rows?.Row)
    .map((row) => row.Summary?.ColData)
    .filter((cells): cells is ColData[] => Boolean(cells && cells.length > 1));

  const grand = summaries[summaries.length - 1];

  let total: number | null = null;
  let overThirty: number | null = null;

  if (grand) {
    // Columns are Customer, Current, 1-30, 31-60, 61-90, 91+, Total.
    total = money(grand[grand.length - 1]?.value);
    const buckets = grand.slice(3, grand.length - 1).map((c) => money(c?.value));
    overThirty = Math.round(buckets.reduce((sum, b) => sum + b, 0) * 100) / 100;
  } else {
    problems.push(
      "The aged receivables report had no total row. See /api/quickbooks/raw.",
    );
  }

  /* --- the invoice count needs the detail report --- */

  let invoicesOverThirty: number | null = null;
  try {
    const detail = await report("AgedReceivableDetail", { report_date: asOf });

    let count = 0;
    let inLateSection = false;

    for (const row of flatten(detail.Rows?.Row)) {
      const heading = row.Header?.ColData?.[0]?.value ?? row.group;
      if (heading) {
        // Section headings read "31 - 60 days past due", "91 or more days
        // past due", "1 - 30 days past due", "CURRENT".
        inLateSection = /(31\s*-\s*60|61\s*-\s*90|91)/i.test(heading);
      }

      const cells = row.ColData;
      if (!inLateSection || !cells) continue;

      // Only invoices. Payments and credit memos also appear in these
      // sections — four of them on 23 August — and a credit is money CSK owe
      // back, not a bill anyone needs to chase.
      const isInvoice = cells.some((c) => c.value?.trim().toLowerCase() === "invoice");
      if (isInvoice) count += 1;
    }

    invoicesOverThirty = count;
  } catch (error) {
    problems.push(
      `The aged receivables detail could not be read, so the invoice count is ` +
        `missing: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return { total, overThirty, invoicesOverThirty, problems };
}
