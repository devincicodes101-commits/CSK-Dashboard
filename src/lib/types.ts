/**
 * Shapes shared across the app.
 *
 * The domain types — Quote, Job, Week — live in ./metric-rules.ts, next to the
 * definitions that operate on them. What is left here is what several modules
 * need and none of them owns.
 *
 * This file used to describe the columns of Jobber's exported reports, from
 * when the plan was to read the screens. Reading the API instead made all of
 * that wrong rather than merely unused, so it is gone.
 */

/** Jobber's QuoteStatusTypeEnum, lower case exactly as the API returns it. */
export type QuoteStatus =
  | "draft"
  | "awaiting_response"
  | "changes_requested"
  | "approved"
  | "converted"
  | "archived";

/**
 * The Cash & AR figures, from QuickBooks.
 *
 * Every field is nullable and every one is currently null: as of 5 September
 * 2026 no QuickBooks figure has been checked against a real export, so this
 * block is typed but unproven.
 */
export interface QuickBooksFigures {
  readonly cashBalance: number | null;
  readonly arTotal: number | null;
  readonly arOver30: number | null;
  readonly invoicesOver30: number | null;
}

/**
 * Anything we could not compute, or that failed a self-check.
 *
 * Guiding rule: fail loudly. A figure we are unsure of becomes a visible
 * problem, never a silent zero. Wrong numbers that look fine are worse than a
 * gap, because a gap gets questioned and a plausible wrong number gets acted
 * on. Problems are rendered on the dashboard, not logged and forgotten.
 */
export interface Problem {
  readonly where: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}
