/**
 * The shapes CSK's two systems actually give us.
 *
 * These mirror the columns of the reports as they are exported, not a tidied
 * idea of them. Where a field exists only so that we can prove we are NOT
 * using it, the comment says so.
 */

/* ------------------------------------------------------------------ quotes */

/**
 * One row of Jobber's Quotes report.
 *
 * The same quote can be returned by two different date filters in the same
 * week — once under "Converted within" and once under "Approved within" — so
 * `quoteNumber` is the identity, never the row position. See dedupeWon().
 */
export interface QuoteRow {
  /** Unique in Jobber. The only safe key for deduping. */
  readonly quoteNumber: string;
  readonly clientName: string;
  readonly title: string;
  /** Jobber's current status, which is the status TODAY, not on the pull date. */
  readonly status: QuoteStatus;
  /**
   * Pre-tax. This is the figure every dollar metric uses.
   *
   * CSK report before tax (their Monthly tab says so explicitly, and BC adds
   * 5% GST on top). Jobber's own summary card shows the tax-inclusive Total,
   * which is why the card and our number differ by about 5%.
   */
  readonly subtotal: number;
  /** Tax inclusive. Carried so we can show it, never used in a metric. */
  readonly total: number;
  /** Set once the quote becomes a job. Null while still only approved. */
  readonly jobNumber: string | null;
  readonly draftedDate: string | null;
  readonly approvedDate: string | null;
  readonly convertedDate: string | null;
}

export type QuoteStatus =
  | "Draft"
  | "Awaiting Response"
  | "Changes Requested"
  | "Approved"
  | "Converted"
  | "Archived";

/* -------------------------------------------------------------------- jobs */

/**
 * One row of Jobber's One-off jobs report, filtered to "Closed within".
 *
 * The report also prints a Totals row and, separately, summary cards above the
 * table. The cards count something else entirely: for the week of 3-9 August
 * 2026 they read $28,145 revenue against a table total of $11,404.08. Parse
 * the rows and total them ourselves; see sumJobs().
 */
export interface JobRow {
  readonly jobNumber: string;
  readonly clientName: string;
  readonly title: string;
  /** Materials and expenses. Column header is "Expenses total ($)". */
  readonly expensesTotal: number;
  /** Decimal hours. One of the few Jobber sums that does total correctly. */
  readonly timeTrackedHours: number;
  readonly labourCostTotal: number;
  /** Revenue for this job. Column header is "Total ($)". */
  readonly total: number;
  /**
   * Jobber's profit for the row. Not used — gross profit is always recomputed
   * from revenue, labour and materials. Kept so the self-check can compare.
   */
  readonly reportedProfit: number;
  /**
   * Jobber's per-job profit percentage. NEVER aggregated. Averaging this
   * column is what produces Jobber's misleading "51% avg"; the true blended
   * figure for that same week is 49.3%. See jobberAverageProfitPct().
   */
  readonly reportedProfitPct: number;
  /** Usually 0. Filled in on only 1 of the 8 jobs in the verified week. */
  readonly expensesQuoted: number;
  /** Usually 0. Same problem — this is what blocks Labour Efficiency. */
  readonly hoursQuoted: number;
}

/* ---------------------------------------------------------------- insights */

/** The Overview cards on Jobber's Insights tab, for one week. */
export interface InsightsRow {
  /** Jobber shows New leads AND New requests. They are different counts. */
  readonly newLeads: number;
  readonly newRequests: number;
  /** Rounded on screen to one decimal ("$12.8k"), so treat as approximate. */
  readonly invoicedValue: number | null;
}

/* --------------------------------------------------------------- quickbooks */

/**
 * The Cash & AR block. Entirely unverified as of 5 September 2026 — no
 * QuickBooks figures have been shown to us, so every field here is typed but
 * nothing has been checked against a real export.
 */
export interface QuickBooksRow {
  readonly cashBalance: number | null;
  readonly arTotal: number | null;
  readonly arOver30: number | null;
  readonly invoicesOver30: number | null;
}

/* ---------------------------------------------------------------- problems */

/**
 * Anything we could not read or that failed a self-check.
 *
 * Guiding rule, same as the MES importer: fail loudly. A figure we are unsure
 * of becomes a visible problem, never a silent zero. Wrong numbers that look
 * fine are worse than an error.
 */
export interface Problem {
  readonly where: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

/* ------------------------------------------------------------ week + input */

export interface WeekInput {
  /** Monday of the reporting week, ISO date. Weeks run Monday to Sunday. */
  readonly weekStarting: string;
  /** Count and value of quotes SENT in the week — Jobber's Sent card. */
  readonly quotesSentCount: number;
  readonly quotesSentValue: number;
  /** Rows from the Quotes report filtered to "Converted within" the week. */
  readonly converted: readonly QuoteRow[];
  /** Rows from the Quotes report filtered to "Approved within" the week. */
  readonly approved: readonly QuoteRow[];
  /** Rows from One-off jobs filtered to "Closed within" the week. */
  readonly jobs: readonly JobRow[];
  readonly insights: InsightsRow;
  readonly quickBooks: QuickBooksRow;
}

/** The nineteen numbers, computed. Nulls mean "not available", never zero. */
export interface WeeklyMetrics {
  readonly weekStarting: string;
  readonly weekEnding: string;

  /* Sales — audience: Chase */
  readonly newLeads: number;
  readonly quotesSentCount: number;
  readonly quotesSentValue: number;
  readonly convertedCount: number;
  readonly convertedValue: number;
  readonly approvedCount: number;
  readonly approvedValue: number;
  readonly wonCount: number;
  readonly wonValue: number;
  readonly conversionRate: number | null;
  /** Quote numbers that appeared on both lists and were counted once. */
  readonly deduped: readonly string[];

  /* Revenue & production — audience: technicians + Chad */
  readonly invoicedValue: number | null;
  readonly revenueClosed: number;
  readonly labourCost: number;
  readonly materialCost: number;
  readonly grossProfit: number;
  readonly grossProfitRate: number | null;

  /* Cash & AR — audience: Chase + Alana */
  readonly cashBalance: number | null;
  readonly arTotal: number | null;
  readonly arOver30: number | null;
  readonly arOver30Rate: number | null;
  readonly invoicesOver30: number | null;

  readonly problems: readonly Problem[];
}
