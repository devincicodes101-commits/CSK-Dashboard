import { Block, Correction, Pill } from "@/components/ui";

/**
 * Where the two connections get made, and where a broken one shows up.
 *
 * Deliberately plain. It is used roughly twice a year: once to connect each
 * system, and again whenever a connection is revoked.
 */
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const { connected, error } = await searchParams;

  return (
    <main className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <p className="mt-1.5 max-w-2xl text-sm text-ink-2">
        Connect the two systems the dashboard reads from. Both are read-only —
        nothing is ever written back to Jobber or QuickBooks.
      </p>

      {error ? (
        <p className="mt-5 rounded-lg border border-bad bg-bad-tint px-4 py-3 text-sm text-bad">
          {error}
        </p>
      ) : null}
      {connected ? (
        <p className="mt-5 rounded-lg border border-good bg-good-tint px-4 py-3 text-sm text-good">
          {connected === "jobber" ? "Jobber" : "QuickBooks"} connected.
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-5">
        <Block
          title="Jobber"
          audience="Sales, revenue and production figures"
          note={
            <Correction>
              Sign in as <strong>CSK Electric</strong> when the Jobber screen
              appears. Whoever approves it decides which account we read.
            </Correction>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <Pill tone="warn">Not connected</Pill>
            <a
              href="/api/jobber/connect"
              className="rounded bg-ink px-3.5 py-2 text-sm font-medium text-surface hover:bg-ink-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Connect Jobber
            </a>
          </div>
        </Block>

        <Block
          title="QuickBooks"
          audience="Bank balance and unpaid invoices"
          note={
            <Correction>
              Not built yet. The Cash &amp; AR block stays empty until this is
              connected and its figures have been checked against a real export.
            </Correction>
          }
        >
          <Pill tone="warn">Not connected</Pill>
        </Block>
      </div>
    </main>
  );
}
