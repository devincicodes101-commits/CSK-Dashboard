/**
 * The GraphQL Jobber actually has, and the mapping into our own types.
 *
 * Confirmed against Jobber's schema explorer on 5 September 2026, API version
 * 2025-04-16. Where a name here differs from the obvious guess, it is because
 * the schema says so.
 *
 * Three names worth knowing before reading further:
 *
 *   Quote.amounts.subtotal        pre-tax; there is no top-level `subtotal`
 *   Quote.lastTransitioned        holds approvedAt and convertedAt
 *   Job.jobCosting                holds labourCost, expenseCost, labourDuration
 */

import { type Job, type Quote, round2 } from "./metric-rules.ts";
import { graphql, paginate } from "./jobber.ts";

/* ------------------------------------------------------------------ quotes */

const QUOTE_FIELDS = `
  id
  quoteNumber
  title
  quoteStatus
  sentAt
  amounts { subtotal total }
  lastTransitioned { approvedAt convertedAt }
  client { name }
`;

/**
 * Quotes sent inside a date range.
 *
 * This one filters server-side, because sentAt is one of the three fields
 * QuoteFilterAttributes accepts.
 */
export const QUOTES_SENT = `
  query QuotesSent($from: ISO8601DateTime!, $to: ISO8601DateTime!, $after: String) {
    quotes(filter: { sentAt: { after: $from, before: $to } }, first: 50, after: $after) {
      nodes { ${QUOTE_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

/**
 * Quotes that may have been won inside a date range.
 *
 * There is NO approvedAt or convertedAt filter — QuoteFilterAttributes offers
 * only sentAt, createdAt and updatedAt. So this cannot be asked for directly.
 *
 * The workaround relies on one guarantee: a quote's updatedAt is always at or
 * after the moment it transitioned. So every quote won during the week has
 * updatedAt >= the start of that week, and asking for everything updated since
 * then cannot miss one. The dates are then checked in `quotesWonFrom` below.
 *
 * Deliberately NO upper bound on updatedAt. Adding one would drop any quote
 * won during the week and edited afterwards, which is both easy to do and
 * invisible when it happens — the figures would simply come out low.
 *
 * The cost is that syncing an old week pulls every quote touched since. That
 * is acceptable for a weekly job, and is why weeks are frozen once computed
 * rather than recalculated on every page load.
 */
export const QUOTES_TRANSITIONED = `
  query QuotesTransitioned($since: ISO8601DateTime!, $after: String) {
    quotes(filter: { updatedAt: { after: $since } }, first: 50, after: $after) {
      nodes { ${QUOTE_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface RawQuote {
  id: string;
  quoteNumber: string;
  title: string | null;
  quoteStatus: string;
  sentAt: string | null;
  amounts: { subtotal: number; total: number };
  lastTransitioned: { approvedAt: string | null; convertedAt: string | null };
  client: { name: string } | null;
}

export function toQuote(raw: RawQuote): Quote {
  return {
    quoteNumber: raw.quoteNumber,
    clientName: raw.client?.name ?? "—",
    title: raw.title ?? "",
    // Pre-tax. amounts.total is carried for display only.
    subtotal: round2(raw.amounts.subtotal),
    total: round2(raw.amounts.total),
    approvedAt: raw.lastTransitioned.approvedAt,
    convertedAt: raw.lastTransitioned.convertedAt,
    sentAt: raw.sentAt,
  };
}

/* -------------------------------------------------------------------- jobs */

/**
 * One-off jobs completed inside a date range.
 *
 * "Closed within" in Jobber's own report means completedAt, and both that and
 * jobType are real filters, so this one is exact server-side.
 *
 * Two revenue figures are fetched on purpose. `total` is the job's own, and
 * `jobCosting.totalRevenue` is the costing engine's. They ought to agree; the
 * sync compares them and raises a problem if they do not, rather than silently
 * picking one. Same reasoning as never trusting a single reported total.
 */
export const JOBS_COMPLETED = `
  query JobsCompleted($from: ISO8601DateTime!, $to: ISO8601DateTime!, $after: String) {
    jobs(
      filter: { jobType: ONE_OFF, completedAt: { after: $from, before: $to } }
      first: 25
      after: $after
    ) {
      nodes {
        id
        jobNumber
        title
        completedAt
        total
        client { name }
        quote { quoteNumber }
        jobCosting {
          totalRevenue
          labourCost
          expenseCost
          labourDuration
          profitAmount
          profitPercentage
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface RawJob {
  id: string;
  jobNumber: number;
  title: string | null;
  completedAt: string | null;
  total: number;
  client: { name: string } | null;
  quote: { quoteNumber: string } | null;
  jobCosting: {
    totalRevenue: number;
    labourCost: number;
    expenseCost: number;
    /** Seconds. Jobber's own type is literally named Seconds. */
    labourDuration: number;
    /** Jobber's figures. Fetched to compare against, never to report. */
    profitAmount: number;
    profitPercentage: number | null;
  } | null;
}

/** What Jobber said, alongside what we derived, so the sync can reconcile. */
export interface MappedJob {
  job: Job;
  /** The job's own revenue field, where jobCosting disagrees with it. */
  reportedRevenue: number;
  /** Jobber's profit for the row. Never reported; only compared. */
  reportedProfit: number | null;
  /** The quote this job came from, if any. Identifies quoted jobs. */
  fromQuoteNumber: string | null;
}

export function toJob(raw: RawJob): MappedJob {
  const costing = raw.jobCosting;

  return {
    job: {
      jobNumber: String(raw.jobNumber),
      clientName: raw.client?.name ?? "—",
      title: raw.title ?? "",
      closedAt: raw.completedAt ?? "",
      revenue: round2(costing?.totalRevenue ?? raw.total),
      labourCost: round2(costing?.labourCost ?? 0),
      // "Expenses total" in the report is materials for our purposes.
      materialCost: round2(costing?.expenseCost ?? 0),
      timeTrackedHours: round2((costing?.labourDuration ?? 0) / 3600),
      // Not exposed on Job. Reachable through the linked quote's line items,
      // which is a later query and only worth making once CSK start filling
      // these in — they were blank on seven of eight jobs in the sample week.
      hoursQuoted: 0,
      materialsQuoted: 0,
    },
    reportedRevenue: round2(raw.total),
    reportedProfit: costing ? round2(costing.profitAmount) : null,
    fromQuoteNumber: raw.quote?.quoteNumber ?? null,
  };
}

/* ------------------------------------------------------------- the fetches */

/** ISO8601 bounds for a Monday-to-Sunday week, inclusive of both days. */
export function weekBounds(weekStart: string, weekEnd: string) {
  return {
    from: `${weekStart}T00:00:00Z`,
    to: `${weekEnd}T23:59:59Z`,
  };
}

export async function fetchQuotesSent(
  weekStart: string,
  weekEnd: string,
): Promise<Quote[]> {
  const { from, to } = weekBounds(weekStart, weekEnd);
  const nodes = await paginate<RawQuote>(QUOTES_SENT, { from, to }, (d) =>
    (d as { quotes: { nodes: RawQuote[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }).quotes,
  );
  return nodes.map(toQuote);
}

/**
 * Every quote that could have been won in the week.
 *
 * Returns a superset — anything updated since the week began. The date rules
 * in metric-rules.ts narrow it to the ones actually won, and they are the
 * tested part.
 */
export async function fetchQuotesPossiblyWon(weekStart: string): Promise<Quote[]> {
  const nodes = await paginate<RawQuote>(
    QUOTES_TRANSITIONED,
    { since: `${weekStart}T00:00:00Z` },
    (d) =>
      (d as { quotes: { nodes: RawQuote[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }).quotes,
  );
  return nodes.map(toQuote);
}

export async function fetchJobsCompleted(
  weekStart: string,
  weekEnd: string,
): Promise<MappedJob[]> {
  const { from, to } = weekBounds(weekStart, weekEnd);
  const nodes = await paginate<RawJob>(JOBS_COMPLETED, { from, to }, (d) =>
    (d as { jobs: { nodes: RawJob[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }).jobs,
  );
  return nodes.map(toJob);
}

/**
 * A cheap call, used to confirm a connection works and to name the account.
 *
 * Worth having on the settings screen: "connected to CSK Electric Inc" is a
 * far better answer than a green tick, given that whoever authorises decides
 * whose data we read.
 */
export const ACCOUNT_NAME = `query { account { name } }`;

export async function fetchAccountName(): Promise<string | null> {
  const data = await graphql<{ account: { name: string } | null }>(ACCOUNT_NAME);
  return data.account?.name ?? null;
}

/* ---------------------------------------------------------------- requests */

/**
 * Requests created inside the week — Jobber's "New requests" card.
 *
 * RequestFilterAttributes takes createdAt, so this is exact server-side.
 *
 * Note what this is NOT. Jobber's Insights shows "New leads" and "New
 * requests" as separate figures — 12 and 22 for the verified week — and there
 * is no `leads` query in the schema at all. Until CSK say which they mean,
 * only the one that can be derived unambiguously is reported.
 */
export const REQUESTS_CREATED = `
  query RequestsCreated($from: ISO8601DateTime!, $to: ISO8601DateTime!, $after: String) {
    requests(filter: { createdAt: { after: $from, before: $to } }, first: 50, after: $after) {
      nodes { id createdAt requestStatus source }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface RawRequest {
  id: string;
  createdAt: string;
  requestStatus: string;
  source: string;
}

export async function fetchRequestsCreated(
  weekStart: string,
  weekEnd: string,
): Promise<RawRequest[]> {
  const { from, to } = weekBounds(weekStart, weekEnd);
  return paginate<RawRequest>(REQUESTS_CREATED, { from, to }, (d) =>
    (d as { requests: { nodes: RawRequest[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }).requests,
  );
}

/* ---------------------------------------------------------------- invoices */

/**
 * Invoices issued inside the week — the "Revenue — Invoiced" line.
 *
 * InvoiceFilterAttributes takes issuedDate, which is what "invoiced within
 * the week" means; createdAt would count drafts written earlier and issued
 * later.
 *
 * `amounts` is an InvoiceAmounts object whose field names have NOT been read
 * off the schema. QuoteAmounts carries subtotal and total, and the same two
 * are assumed here. The sync calls this inside a try/catch precisely because
 * that is an assumption: a wrong field name degrades one metric to null with
 * a visible problem, rather than failing the whole week.
 */
export const INVOICES_ISSUED = `
  query InvoicesIssued($from: ISO8601DateTime!, $to: ISO8601DateTime!, $after: String) {
    invoices(filter: { issuedDate: { after: $from, before: $to } }, first: 50, after: $after) {
      nodes {
        id
        invoiceNumber
        issuedDate
        invoiceStatus
        amounts { subtotal total }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

interface RawInvoice {
  id: string;
  invoiceNumber: string;
  issuedDate: string | null;
  invoiceStatus: string;
  amounts: { subtotal: number; total: number } | null;
}

/** Pre-tax, like every other dollar figure on this dashboard. */
export async function fetchInvoicedValue(
  weekStart: string,
  weekEnd: string,
): Promise<{ value: number; count: number }> {
  const { from, to } = weekBounds(weekStart, weekEnd);
  const nodes = await paginate<RawInvoice>(INVOICES_ISSUED, { from, to }, (d) =>
    (d as { invoices: { nodes: RawInvoice[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } }).invoices,
  );

  return {
    value: round2(nodes.reduce((sum, i) => sum + (i.amounts?.subtotal ?? 0), 0)),
    count: nodes.length,
  };
}
