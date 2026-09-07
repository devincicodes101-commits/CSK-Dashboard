export const metadata = {
  title: "Sign in · CSK Dashboard",
};

/**
 * The way in.
 *
 * A plain form posting to a route handler, so it works without JavaScript and
 * the passphrase never touches client-side code.
 */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <div className="relative flex min-h-screen items-center justify-center">
      <div className="horizon" aria-hidden />

      <main className="relative z-10 w-full max-w-sm px-6">
        <p className="micro mb-3 text-accent">CSK Electric</p>
        <h1 className="font-display text-[2.25rem] font-semibold leading-[0.95] tracking-[-0.035em]">
          CSK Dashboard
        </h1>

        <form action="/api/auth" method="post" className="mt-8 flex flex-col gap-3">
          <input type="hidden" name="next" value={next ?? "/"} />

          <label htmlFor="passphrase" className="micro text-ink-3">
            Passphrase
          </label>
          <input
            id="passphrase"
            name="passphrase"
            type="password"
            autoFocus
            autoComplete="current-password"
            className="rounded-lg border border-line-strong bg-surface px-4 py-3 font-mono text-[13px] text-ink outline-none transition-colors duration-200 focus:border-accent-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          />

          {error ? (
            <p className="font-mono text-[11px] leading-relaxed text-bad">
              That passphrase is not right.
            </p>
          ) : null}

          <button
            type="submit"
            className="mt-2 cursor-pointer rounded-full bg-accent px-4 py-2.5 font-display text-[13px] font-medium text-ground transition-colors duration-200 hover:bg-[#e0a463] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Sign in
          </button>
        </form>

        <p className="mt-8 font-mono text-[11px] leading-relaxed text-ink-4">
          These figures are CSK Electric&rsquo;s. Don&rsquo;t share the
          passphrase or the link outside CSK and DeVinci Codes.
        </p>
      </main>
    </div>
  );
}
