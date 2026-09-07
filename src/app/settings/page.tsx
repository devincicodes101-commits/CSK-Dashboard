import { Block, Button, Correction, Pill } from "@/components/ui";
import { backend, backendWarning, loadTokens } from "@/lib/token-store";

/**
 * Where the two connections get made, and where a broken one shows up.
 *
 * Used roughly twice a year — once to connect each system, and again if a
 * connection is revoked — so it is deliberately plain. What it must never do
 * is look connected when it is only remembering something in RAM.
 */
export default async function Settings({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string; account?: string }>;
}) {
  const { connected, error, account } = await searchParams;

  // Never let a failure to read the store render as "not connected" — that
  // sends someone off to reconnect a connection that was fine.
  let jobber: Awaited<ReturnType<typeof loadTokens>> = null;
  let storeError: string | null = null;
  try {
    jobber = await loadTokens("jobber");
  } catch (e) {
    storeError = e instanceof Error ? e.message : String(e);
  }

  const warning = backendWarning();

  /**
   * Just connected, but this instance is not holding the token.
   *
   * The callback runs on one serverless instance and the redirect lands on
   * another, so with the in-memory store the page can truthfully say both
   * "connected" and "not connected" at once. Showing a bare NOT CONNECTED
   * next to a success banner reads as a failure, and it is not one — the
   * token exists, just somewhere else.
   */
  const connectedElsewhere = Boolean(connected) && !jobber && backend() === "memory";

  return (
    <div className="relative min-h-screen">
      <div className="horizon" aria-hidden />

      <main className="relative z-10 mx-auto max-w-3xl px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
        <header className="mb-8">
          <a
            href="/"
            className="micro mb-6 inline-flex cursor-pointer items-center gap-2 text-ink-3 transition-colors duration-200 hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <svg
              viewBox="0 0 16 16"
              width="12"
              height="12"
              aria-hidden
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 3 L5 8 L10 13" />
            </svg>
            Dashboard
          </a>

          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4">
            <div>
              <p className="micro mb-3 text-accent">CSK Electric</p>
              <h1 className="font-display text-[clamp(2rem,5vw,3rem)] font-semibold leading-[0.95] tracking-[-0.035em]">
                Connections
              </h1>
            </div>
          </div>

          <p className="max-w-xl font-mono text-[11px] leading-relaxed text-ink-3">
            Both are read-only. Nothing is ever written back to Jobber or
            QuickBooks.
          </p>
        </header>

        {error ? <Banner tone="bad">{error}</Banner> : null}
        {storeError ? (
          <Banner tone="bad">
            {`Couldn’t read the stored connection: ${storeError}`}
          </Banner>
        ) : null}
        {connected ? (
          <Banner tone="good">
            {account
              ? `Connected to ${account}.`
              : `${connected === "jobber" ? "Jobber" : "QuickBooks"} connected.`}
          </Banner>
        ) : null}
        {warning ? <Banner tone="warn">{warning}</Banner> : null}

        <div className="flex flex-col gap-4">
          <Block
            id="jobber"
            ordinal="01"
            title="Jobber"
            audience="Sales, revenue, production"
            note={
              <>
                <Correction>
                  Sign in as CSK Electric when the Jobber screen appears.
                  Whoever approves it decides whose account we read.
                </Correction>
                <Correction>
                  {`Tokens are held in ${
                    {
                      supabase: "Supabase",
                      cookie: "an encrypted cookie in your browser",
                      memory: "server memory",
                    }[backend()]
                  }. Jobber rotates its refresh token on every use, so the replacement has to be written back each time — which is why this cannot live in an environment variable.`}
                </Correction>
              </>
            }
          >
            <div className="flex flex-wrap items-center gap-4">
              {connectedElsewhere ? (
                <>
                  <Pill tone="warn">Connected, not held here</Pill>
                  <p className="max-w-md font-mono text-[11px] leading-relaxed text-ink-3">
                    The connection succeeded. This page was served by a
                    different server instance from the one that stored the
                    token, so it cannot see it. Reloading may or may not find
                    it — that is what a database fixes.
                  </p>
                </>
              ) : jobber ? (
                <>
                  <Pill tone="good">Connected</Pill>
                  {jobber.connectedAccount ? (
                    <p className="font-mono text-[11px] text-ink-2">
                      {jobber.connectedAccount}
                    </p>
                  ) : null}
                  <Button href="/api/jobber/connect" variant="ghost">
                    Reconnect
                  </Button>
                </>
              ) : (
                <>
                  <Pill tone="warn">Not connected</Pill>
                  <Button href="/api/jobber/connect">Connect Jobber</Button>
                </>
              )}
            </div>
          </Block>

          <Block
            id="quickbooks"
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

function Banner({
  tone,
  children,
}: {
  tone: "good" | "warn" | "bad";
  children: React.ReactNode;
}) {
  const look = {
    good: "border-good/40 bg-good-tint text-good",
    warn: "border-warn/40 bg-warn-tint text-warn",
    bad: "border-bad/40 bg-bad-tint text-bad",
  }[tone];

  return (
    <p
      className={`mb-4 rounded-lg border px-5 py-4 font-mono text-[11px] leading-relaxed ${look}`}
    >
      {children}
    </p>
  );
}
