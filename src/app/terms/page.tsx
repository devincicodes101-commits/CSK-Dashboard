/**
 * End-user licence agreement.
 *
 * Required by Intuit's production approval. Deliberately short: this is a
 * private tool for one client, not a product with users to bind, and a long
 * borrowed EULA would say things about this application that are not true.
 *
 * NOT reviewed by a lawyer. See the note in ../privacy/page.tsx.
 */

export const metadata = {
  title: "Terms of Use · CSK Dashboard",
};

const UPDATED = "8 September 2026";

export default function Terms() {
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
          Terms of Use
        </h1>
        <p className="micro mt-4 text-ink-4">Last updated {UPDATED}</p>

        <div className="mt-10 flex flex-col gap-7 font-mono text-[12px] leading-relaxed text-ink-2">
          <Section title="Scope">
            CSK Dashboard is provided by DeVinci Codes to CSK Electric Inc under
            the terms of their engagement. It is a private application, not
            offered to the public, and use is limited to CSK Electric staff and
            DeVinci Codes personnel maintaining it.
          </Section>

          <Section title="What it does">
            It reads data from CSK&rsquo;s Jobber and QuickBooks Online accounts
            and presents weekly reporting figures. Access is read only; it
            cannot alter anything in either system.
          </Section>

          <Section title="Accuracy">
            Figures are derived from CSK&rsquo;s own records and are intended
            for internal reporting. They are not accounting statements and
            should not be used as such. Where a figure cannot be calculated it
            is shown as unavailable rather than as zero, and where it differs
            from what Jobber or QuickBooks display on screen the reason is
            stated alongside it.
          </Section>

          <Section title="Availability">
            The application depends on Jobber and QuickBooks Online remaining
            reachable and on their connections remaining authorised. No
            uptime is guaranteed.
          </Section>

          <Section title="Ending access">
            CSK may revoke either connection at any time from within Jobber or
            QuickBooks. Doing so stops all reading immediately. Deletion of
            stored figures is covered in the Privacy Policy.
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
