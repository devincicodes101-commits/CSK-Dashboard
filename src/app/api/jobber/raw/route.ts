import { NextResponse, type NextRequest } from "next/server";
import { fetchQuotesSent, fetchQuotesPossiblyWon } from "@/lib/jobber-queries";
import { graphql } from "@/lib/jobber";
import { weekFromMonday, within, type Quote } from "@/lib/metric-rules";

/**
 * Lists the quotes Jobber's API returns for a week, one row each.
 *
 * Jobber's own Quotes screen gives three different answers for 3-9 August:
 * the table lists 5, the status panel counts 6, the Sent card counts 7. The
 * table will not show the extras, so the disagreement cannot be settled in
 * the UI — and the win rate hangs on which one is right.
 *
 * This prints exactly what the API returns, with quote numbers, so ours can
 * be lined up against the screen row by row. Same idea as the QuickBooks raw
 * route, which is how the cash bug was found: stop inferring, read the data.
 *
 *   /api/jobber/raw?week=2026-08-03
 *
 * Behind the dashboard's own gate when one is set. It reads; it changes
 * nothing.
 */

const row = (q: Quote) => ({
  quote: q.quoteNumber,
  client: q.clientName,
  title: q.title,
  subtotal: q.subtotal,
  total: q.total,
  sentAt: q.sentAt,
  approvedAt: q.approvedAt,
  convertedAt: q.convertedAt,
});

/**
 * What Jobber will actually let us ask for.
 *
 * Jobber's own Quotes screen filters on `lastSentAt` — a quote re-sent inside
 * the week counts there even if it was first sent months earlier. Our query
 * filters on `sentAt` and therefore misses it, which is the likeliest reason
 * the dashboard shows 6 where the screen shows 7.
 *
 * Whether that is a one-word fix or a client-side one depends on whether the
 * filter accepts lastSentAt, and whether the Quote type even exposes it. Both
 * are questions only the schema can answer, so it is asked rather than
 * assumed — the same discipline that found the QuickBooks cash bug.
 */
const SCHEMA = `
  query QuoteSchema {
    filter: __type(name: "QuoteFilterAttributes") { inputFields { name } }
    quote: __type(name: "Quote") { fields { name } }
  }
`;

export async function GET(request: NextRequest) {
  const monday = request.nextUrl.searchParams.get("week") ?? "2026-08-03";

  try {
    const week = weekFromMonday(monday);

    const schema = (await graphql(SCHEMA, {})) as {
      filter: { inputFields: { name: string }[] } | null;
      quote: { fields: { name: string }[] } | null;
    };
    const filterFields = (schema.filter?.inputFields ?? []).map((f) => f.name);
    const quoteFields = (schema.quote?.fields ?? []).map((f) => f.name);

    const sent = await fetchQuotesSent(week.start, week.end);
    const candidates = await fetchQuotesPossiblyWon(week.start);

    const won = candidates.filter(
      (q) => within(q.approvedAt, week) || within(q.convertedAt, week),
    );

    // Quotes won in the week that are NOT in the sent list — the likeliest
    // explanation for Jobber's Sent card counting higher than its own status
    // panel, and the first thing to look at.
    const sentNumbers = new Set(sent.map((q) => q.quoteNumber));
    const wonButNotSent = won.filter((q) => !sentNumbers.has(q.quoteNumber));

    return NextResponse.json({
      week: { start: week.start, end: week.end },
      // The answer to "can we match Kyle's screen exactly, and how".
      canFilterOnLastSent: filterFields.includes("lastSentAt"),
      quoteExposesLastSent: quoteFields.some((f) => /lastSent/i.test(f)),
      schema: { quoteFilterAccepts: filterFields, quoteHasFields: quoteFields },
      sent: {
        count: sent.length,
        subtotalSum: sent.reduce((s, q) => s + q.subtotal, 0),
        totalSum: sent.reduce((s, q) => s + q.total, 0),
        quotes: sent.map(row),
      },
      wonThatWeek: { count: won.length, quotes: won.map(row) },
      wonButNotInSentList: wonButNotSent.map(row),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 502 },
    );
  }
}
