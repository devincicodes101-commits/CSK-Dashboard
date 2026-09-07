/**
 * Privacy policy.
 *
 * Exists because Intuit's production approval requires a resolving privacy
 * policy URL. Written to describe what this application actually does rather
 * than as boilerplate — every claim below is checkable against the code, and
 * should be corrected here if the code changes.
 *
 * NOT reviewed by a lawyer. It is accurate, which is the part that matters
 * for approval and for the client; whether it is sufficient for DeVinci's own
 * obligations is a question for someone qualified.
 */

export const metadata = {
  title: "Privacy Policy · CSK Dashboard",
};

const UPDATED = "8 September 2026";

export default function Privacy() {
  return (
    <div className="relative min-h-screen">
      <div className="horizon" aria-hidden />
      <main className="relative z-10 mx-auto max-w-2xl px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
        <a
          href="/"
          className="micro mb-8 inline-block cursor-pointer text-ink-3 transition-colors duration-200 hover:text-accent"
        >
          &larr; Dashboard
        </a>

        <h1 className="font-display text-[clamp(1.9rem,4.5vw,2.5rem)] font-semibold leading-[1] tracking-[-0.03em]">
          Privacy Policy
        </h1>
        <p className="micro mt-4 text-ink-4">Last updated {UPDATED}</p>

        <div className="mt-10 flex flex-col gap-7 font-mono text-[12px] leading-relaxed text-ink-2">
          <Section title="What this application is">
            CSK Dashboard is a private reporting tool built by DeVinci Codes for
            CSK Electric Inc. It reads business data from CSK&rsquo;s Jobber and
            QuickBooks Online accounts and presents weekly figures to CSK staff.
            It is not offered to the public and has no other users.
          </Section>

          <Section title="What it reads">
            From <strong>Jobber</strong>: quotes, one-off jobs and their costs,
            invoices, requests, and client records — only the fields needed for
            the reported figures. From <strong>QuickBooks Online</strong>: bank
            account balances and accounts-receivable ageing.
            <br />
            <br />
            Access is <strong>read only</strong>. The application holds no write
            permission and never creates, edits or deletes anything in either
            system.
          </Section>

          <Section title="What it stores">
            Weekly totals — counts, sums and percentages — together with the
            quote and job records those totals were derived from, so a figure
            can be re-checked without querying the source again. Access tokens
            for the two connections are stored so the weekly sync can run
            unattended.
            <br />
            <br />
            Data is held in a Supabase project in the United States, protected
            by row-level security. The connection tokens are readable only by
            the application server and by no API key that reaches a browser.
          </Section>

          <Section title="What it does not do">
            No data is sold, shared with, or transmitted to any third party. No
            advertising or analytics service receives it. There are no tracking
            cookies; the only cookies set are short-lived values used to verify
            an authorisation request, and a session cookie where no database is
            configured.
          </Section>

          <Section title="Who can see it">
            Only people at CSK Electric and DeVinci Codes staff maintaining the
            application.
          </Section>

          <Section title="Disconnecting and deletion">
            CSK can revoke access at any time from within Jobber or QuickBooks,
            or by asking DeVinci Codes to disconnect it. On request, all stored
            figures and records are deleted and the tokens destroyed. Revoking
            access stops all future reading immediately.
          </Section>

          <Section title="Contact">
            DeVinci Codes — the address on the engagement with CSK Electric.
          </Section>
        </div>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="micro mb-2.5 text-accent">{title}</h2>
      <p>{children}</p>
    </section>
  );
}
