-- CSK weekly metrics dashboard: tables.
--
-- Three things live here and nothing else: the OAuth connections to Jobber and
-- QuickBooks, one frozen row per reporting week, and the monthly targets a
-- human types in.
--
-- Weeks are FROZEN on purpose. Re-querying Jobber for an old week does not
-- return the same answer months later: jobs get edited, late expenses land,
-- invoices are adjusted. If Chase screenshots a 42.9% win rate in August, that
-- week has to still read 42.9% in December or the dashboard loses his trust.
-- So a week is computed once, after the data settles, and then it is history.

create extension if not exists pgcrypto;

/* ------------------------------------------------------------- connections */

create table if not exists oauth_connections (
  provider          text primary key check (provider in ('jobber', 'quickbooks')),
  access_token      text        not null,
  refresh_token     text        not null,
  -- When the ACCESS token dies. The refresh token outlives it and is what we
  -- actually depend on; Intuit rotates theirs on every use, which is why this
  -- table exists at all rather than the tokens sitting in env vars.
  expires_at        timestamptz not null,
  -- QuickBooks only: identifies which company file we are connected to.
  realm_id          text,
  -- Which account authorised it. Shown in Settings so it is obvious whose
  -- Jobber we are reading, and who to go back to if the connection breaks.
  connected_account text,
  connected_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table oauth_connections is
  'One row per provider. Tokens are refreshed in place by the sync job.';

/* ---------------------------------------------------------------- the week */

create table if not exists week_snapshots (
  -- The Monday. Weeks run Monday to Sunday, always.
  week_start        date primary key,
  week_end          date        not null,

  /* Sales — audience: Chase */
  new_leads             integer,
  new_requests          integer,
  quotes_sent_count     integer,
  quotes_sent_value     numeric(12,2),
  converted_count       integer,
  converted_value       numeric(12,2),
  approved_count        integer,
  approved_value        numeric(12,2),
  won_count             integer,
  won_value             numeric(12,2),
  conversion_rate       numeric(6,4),
  -- Quote numbers that were approved AND converted inside this week, and so
  -- were counted once. Displayed under the win rate: Chase is being given a
  -- figure that will not match Jobber's own screen, so the correction has to
  -- be visible or he will assume we are wrong.
  collapsed_quotes      text[] not null default '{}',

  /* Revenue and production — audience: technicians + Chad */
  invoiced_value        numeric(12,2),
  revenue_closed        numeric(12,2),
  labour_cost           numeric(12,2),
  material_cost         numeric(12,2),
  gross_profit          numeric(12,2),
  gross_profit_rate     numeric(6,4),
  time_tracked_hours    numeric(8,2),

  /* Cash and AR — audience: Chase + Alana. Unverified as of 5 Sep 2026:
     no QuickBooks figures have been checked against a real export yet. */
  cash_balance          numeric(12,2),
  ar_total              numeric(12,2),
  ar_over_30            numeric(12,2),
  ar_over_30_rate       numeric(6,4),
  invoices_over_30      integer,

  -- Anything that could not be computed or failed a self-check. Rendered on
  -- the dashboard rather than swallowed: a visible gap beats a silent zero.
  problems              jsonb not null default '[]'::jsonb,
  -- The quotes and jobs the figures above were derived from, so any week can
  -- be re-derived after a rule changes without going back to Jobber.
  raw                   jsonb,

  synced_at             timestamptz not null default now(),
  -- 'draft' while the week is still settling, 'final' once it is Chase's.
  status                text not null default 'draft'
                          check (status in ('draft', 'final'))
);

comment on column week_snapshots.collapsed_quotes is
  'Quote numbers counted once that Jobber''s own reports would count twice.';

create index if not exists week_snapshots_recent
  on week_snapshots (week_start desc);

/* ------------------------------------------------------------------ targets */

create table if not exists targets (
  id             uuid primary key default gen_random_uuid(),
  -- Matches a field name on week_snapshots, e.g. 'conversion_rate'.
  metric         text not null,
  -- Targets are set per month and apply from that month onward until replaced.
  effective_from date not null,
  value          numeric(12,4) not null,
  set_by         text,
  set_at         timestamptz not null default now(),
  unique (metric, effective_from)
);

comment on table targets is
  'Monthly goals. These exist in neither Jobber nor QuickBooks; a person types
   them in. Every target cell in CSK''s spreadsheet was empty as of Sep 2026.';
