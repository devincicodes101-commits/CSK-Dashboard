# CSK Weekly Metrics

Weekly sales, revenue and cash figures for **CSK Electric**, an electrical
contractor in Surrey, BC. Reads Jobber and QuickBooks; writes to neither.

Kyle produces these numbers by hand every Tuesday and sends them to Chase on
Wednesday morning. Chase screenshots each block and forwards it to whoever
needs it — sales to himself, profit to the technicians and Chad, cash to
himself and Alana. That distribution is why the dashboard is built as three
self-contained blocks rather than one page.

## What the hard part actually is

Jobber's reporting screens are misleading in four specific ways, all of which
Kyle corrects in his head each week. Reading the API rather than the screens
removes three of them at source:

| | Jobber's screen | The truth | Why |
| --- | --- | --- | --- |
| Revenue on closed jobs | $28,145 | **$11,404.08** | The summary card counts a different population from the table beneath it |
| Gross profit | 51% | **49.3%** | Jobber averages each job's own percentage, so a $250 job weighs as much as a $6,563 one |
| Win rate | 29% | **42.9%** | Jobber counts conversions only; CSK also count approved change orders |
| Value of quotes won | $3,675 | **$3,500** | Jobber's figure includes GST; CSK report pre-tax |

The fourth is the one that survives, and it is the reason this project exists.
A quote can be won two ways — *approved* (a change order) or *converted* (a new
job) — and Jobber's two report filters both return a quote that did each in the
same week. In the verified week, quote **#1231** appears on both lists:

|  | Adding the lists | Counting once |
| --- | --- | --- |
| Quotes won | 4 | **3** |
| Value | $7,098.10 | **$6,442.47** |
| Win rate | 57.1% | **42.9%** |

Fourteen points on the headline sales number.

## The definitions are the product

Everything above lives in [`src/lib/metric-rules.ts`](src/lib/metric-rules.ts),
which holds no UI, no database and no API client. Four rules:

1. Money is pre-tax (subtotal), never tax-inclusive.
2. A quote won counts once, in the week it was **first** won.
3. Gross profit is computed from dollars, never from a percentage.
4. A figure we cannot compute is `null`, never `0`.

Rule 4 is the one to hold onto. A silent zero reads as "we earned nothing",
which is a fact. `null` reads as "we do not know", which is the truth.

`npm run test:metrics` checks those definitions against the week of **3–9
August 2026** — the one week CSK walked through on a recorded screen share, so
we know what Kyle's hand-built answer was. It asserts both that we produce the
right figures and that we do **not** produce the wrong ones. It runs before
every build, so a future tidy-up of the dedupe fails CI rather than quietly
returning the win rate to 57.1%.

## Running it

```bash
npm install
cp .env.example .env.local   # then fill it in
npm run dev                  # http://localhost:3005
```

Node 22 or newer: the test runs TypeScript directly via
`--experimental-strip-types`.

Port 3005 is pinned deliberately. Every other Next project on this machine
defaults to 3000, and a silent bump to 3001 breaks the OAuth callback in a way
that is annoying to diagnose.

## Where things stand

**Working.** The metric definitions, verified against a real week. The weekly
dashboard, rendering that week as a labelled worked example. The Jobber OAuth
flow. Supabase schema and RLS.

**Not built yet.**

- The Jobber GraphQL queries. The OAuth shape is right; the field names in the
  client were written from prior knowledge, not read off Jobber's current
  docs. **Confirm them in the schema explorer before the first real sync.**
- The sync job and its Vercel cron trigger.
- QuickBooks entirely. The Cash & AR block is structured but empty, and not one
  of its five figures has been checked against a real export.
- Auth. `ALLOWED_EMAILS` exists in the environment but nothing reads it.
- Targets. The table exists; there is no screen to set them, and every target
  cell in CSK's own spreadsheet was empty as of September 2026.
- "Copy block as image", which would replace Chase's manual screenshotting.

**Blocked on the client, not on us.** The monthly tab — labour and material
efficiency — cannot be built. It compares actual against quoted, and quoted
hours were blank on **seven of the eight** jobs in the verified week. That is
not something code can fix. See the open questions in the project brief.

## Open decision

A quote approved in one week and converted three weeks later currently counts
in the **first** week only (`WON_COUNTED_AT` in `metric-rules.ts`). CSK have not
confirmed whether they would rather see it in both. It changes monthly totals,
never weekly ones. The verified week cannot settle it, because #1231 did both
inside the same seven days.
