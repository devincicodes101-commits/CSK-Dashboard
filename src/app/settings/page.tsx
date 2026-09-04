import { Block, Button, Correction, Pill } from "@/components/ui";

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
    <div className="relative min-h-screen">
      <div className="horizon" aria-hidden />

      <main className="relative z-10 mx-auto max-w-3xl px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
        <header className="mb-10">
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <a href="/" className="micro text-ink-3 transition-colors hover:text-accent">
              CSK Electric
            </a>
            <span aria-hidden className="micro text-ink-4">
              /
            </span>
            <span className="micro text-accent">Settings</span>
          </div>

          <h1 className="font-display text-[clamp(2rem,5vw,2.75rem)] font-semibold leading-[0.95] tracking-[-0.035em]">
            Connections
          </h1>

          <p className="mt-5 max-w-xl font-mono text-[11px] leading-relaxed text-ink-3">
            Both are read-only. Nothing is ever written back to Jobber or
            QuickBooks.
          </p>
        </header>

        {error ? (
          <p className="mb-6 rounded-lg border border-bad/40 bg-bad-tint px-5 py-4 font-mono text-[11px] leading-relaxed text-bad">
            {error}
          </p>
        ) : null}
        {connected ? (
          <p className="mb-6 rounded-lg border border-good/40 bg-good-tint px-5 py-4 font-mono text-[11px] leading-relaxed text-good">
            {connected === "jobber" ? "Jobber" : "QuickBooks"} connected.
          </p>
        ) : null}

        <div className="flex flex-col gap-4">
          <Block
            ordinal="01"
            title="Jobber"
            audience="Sales, revenue, production"
            note={
              <Correction>
                Sign in as CSK Electric when the Jobber screen appears. Whoever
                approves it decides whose account we read.
              </Correction>
            }
          >
            <div className="flex flex-wrap items-center gap-4">
              <Pill tone="warn">Not connected</Pill>
              <Button href="/api/jobber/connect">Connect Jobber</Button>
            </div>
          </Block>

          <Block
            ordinal="02"
            title="QuickBooks"
            audience="Bank balance, unpaid invoices"
            note={
              <Correction>
                Not built yet. Cash &amp; AR stays empty until this is connected
                and its figures have been checked against a real export.
              </Correction>
            }
          >
            <Pill tone="muted">Not started</Pill>
          </Block>
        </div>
      </main>
    </div>
  );
}
