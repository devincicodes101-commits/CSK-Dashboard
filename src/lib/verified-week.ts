/**
 * The one week of CSK data we have checked by hand: 3-9 August 2026.
 *
 * On 3 September 2026 CSK recorded a walkthrough of their live Jobber account
 * for this week and typed the resulting figures into their spreadsheet. Every
 * quote and job below is transcribed from that recording.
 *
 * It has two jobs. scripts/test-metrics.mts asserts our definitions still
 * reproduce Kyle's hand-built numbers from it, and the dashboard renders it as
 * a worked example until Jobber is actually connected — so the app opens
 * showing something real and provable rather than an empty shell.
 *
 * It is clearly labelled as a sample wherever it is displayed. Delete nothing
 * here once live data arrives: this is the regression fixture.
 */

import type { Job, Quote } from "./metric-rules";

export const VERIFIED_WEEK_MONDAY = "2026-08-03";

/**
 * #1231 is the case this whole project turns on. Approved on the 4th and
 * converted on the 6th, so Jobber's reporting screens return it under BOTH
 * the "Approved within" and "Converted within" filters for the same seven
 * days. Adding those two lists gives four wins instead of three, and a win
 * rate of 57.1% instead of 42.9%.
 */
export const VERIFIED_QUOTES: readonly Quote[] = [
  {
    quoteNumber: "1236",
    clientName: "Upfront Carpentry LTD.",
    title: "Gladwin Road - Renovation",
    subtotal: 2844.4,
    total: 2986.62,
    approvedAt: null,
    convertedAt: "2026-08-09",
    sentAt: "2026-08-07",
  },
  {
    quoteNumber: "1231",
    clientName: "Grant Brown",
    title: "Bathroom Lighting and Exhaust Fans",
    subtotal: 655.63,
    total: 688.41,
    approvedAt: "2026-08-04",
    convertedAt: "2026-08-06",
    sentAt: "2026-08-04",
  },
  {
    quoteNumber: "1219",
    clientName: "Van Kampen Construction Ltd",
    title: "Bramhoff Change Order #3",
    subtotal: 2942.44,
    total: 3089.56,
    approvedAt: "2026-08-03",
    convertedAt: null,
    sentAt: "2026-07-27",
  },
];

/**
 * The eight one-off jobs closed that week.
 *
 * Two job numbers were obscured by the recorder's own controls in the video
 * and appear here as 1679 and 1642. Job numbers take no part in any
 * calculation, so this affects nothing; it is noted so nobody later treats
 * those two as verified.
 *
 * Look at hoursQuoted and materialsQuoted: filled in on ONE job out of eight.
 * That single fact is what blocks both monthly efficiency metrics.
 */
export const VERIFIED_JOBS: readonly Job[] = [
  { jobNumber: "1704", clientName: "Simon Turner", title: "Service Callout", closedAt: "2026-08-05", revenue: 250.0, labourCost: 216.98, materialCost: 0.0, timeTrackedHours: 5.0, hoursQuoted: 0, materialsQuoted: 0 },
  { jobNumber: "1697", clientName: "Morgan Creek Corporate Centre", title: "Unit 106 Ballast Repair", closedAt: "2026-08-05", revenue: 376.72, labourCost: 52.56, materialCost: 63.36, timeTrackedHours: 1.0, hoursQuoted: 0, materialsQuoted: 0 },
  { jobNumber: "1696", clientName: "LM Icon Homes LP", title: "Pole Lights and Extra Garden Lights", closedAt: "2026-08-06", revenue: 1226.82, labourCost: 228.61, materialCost: 309.66, timeTrackedHours: 4.25, hoursQuoted: 0, materialsQuoted: 0 },
  { jobNumber: "1694", clientName: "Grace Liang", title: "Troubleshoot Tripping Breaker", closedAt: "2026-08-06", revenue: 351.02, labourCost: 140.27, materialCost: 23.01, timeTrackedHours: 3.0, hoursQuoted: 0, materialsQuoted: 0 },
  { jobNumber: "1693", clientName: "Caisley Developments", title: "Richards St Project", closedAt: "2026-08-07", revenue: 1465.0, labourCost: 717.61, materialCost: 9.83, timeTrackedHours: 16.25, hoursQuoted: 0, materialsQuoted: 0 },
  { jobNumber: "1687", clientName: "BC Boilers", title: "Grandmas House", closedAt: "2026-08-07", revenue: 713.84, labourCost: 125.3, materialCost: 149.42, timeTrackedHours: 2.5, hoursQuoted: 0, materialsQuoted: 0 },
  { jobNumber: "1679", clientName: "LM Icon Homes LP", title: "Garden Light", closedAt: "2026-08-08", revenue: 457.58, labourCost: 80.69, materialCost: 103.21, timeTrackedHours: 1.5, hoursQuoted: 0, materialsQuoted: 0 },
  { jobNumber: "1642", clientName: "Leslie Yang", title: "200A Service Upgrade & Electrical", closedAt: "2026-08-08", revenue: 6563.1, labourCost: 1592.16, materialCost: 1971.2, timeTrackedHours: 37.0, hoursQuoted: 32.0, materialsQuoted: 1650.22 },
];

/**
 * Figures Jobber only showed as summary cards, so we have the totals but not
 * the underlying rows. Quotes Sent in particular is seven quotes worth
 * $206,046 — dominated by one large commercial bid, which is exactly why CSK
 * measure conversion by count and not by dollars.
 */
export const VERIFIED_CARDS = {
  newLeads: 12,
  newRequests: 22,
  quotesSentCount: 7,
  quotesSentValue: 206046,
  /** Shown rounded on screen as "$12.8k", so treat as approximate. */
  invoicedValue: 12800,
} as const;

/** What Jobber displayed for the same week, kept so the app can show both. */
export const JOBBER_DISPLAYED = {
  /** Summary card above the one-off jobs table. The table totalled 11,404.08. */
  revenueCard: 28145,
  /** Mean of the eight per-job percentages. Blended truth is 49.3%. */
  averageProfitRate: 0.51,
  /** Jobber counts conversions only, so it omits approved change orders. */
  conversionRate: 0.29,
  /** Tax inclusive. Pre-tax is 3,500.03. */
  convertedValue: 3675.03,
} as const;
