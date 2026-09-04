-- Row level security.
--
-- Two kinds of caller. The sync job runs as the service role and is the only
-- thing that writes. Signed-in people read, and may set targets. Nobody
-- reaches the OAuth tokens through the API at all: they are server-side only,
-- and a leaked anon key must not be enough to read CSK's Jobber account.

alter table oauth_connections enable row level security;
alter table week_snapshots    enable row level security;
alter table targets           enable row level security;

/* Tokens: no policy at all, deliberately. RLS with zero policies denies every
   request that is not the service role. The sync job holds the service key. */

/* Weeks: anyone signed in may read. Nobody but the sync job may write. */
create policy week_snapshots_read
  on week_snapshots for select
  to authenticated
  using (true);

/* Targets: signed-in users may read and set them, because that is the one
   number on the dashboard that comes from a person rather than a system. */
create policy targets_read
  on targets for select
  to authenticated
  using (true);

create policy targets_write
  on targets for insert
  to authenticated
  with check (true);

create policy targets_update
  on targets for update
  to authenticated
  using (true)
  with check (true);
