/**
 * Shown while a week is being fetched.
 *
 * A week that is not stored takes eight API calls — five to Jobber, three to
 * QuickBooks — and one of the Jobber queries is deliberately unbounded, so an
 * older week pulls everything touched since. That is several seconds, during
 * which the page previously sat blank and looked broken.
 *
 * Only the first view of a week costs this. Once stored it is read back from
 * Supabase and returns immediately, and the Tuesday sync means the week Chase
 * actually reads is already there before he opens it.
 */
export default function Loading() {
  return (
    <div className="relative min-h-screen">
      <div className="horizon" aria-hidden />

      <main className="relative z-10 mx-auto max-w-6xl px-5 pt-12 sm:px-8 sm:pt-16">
        <p className="micro mb-3 text-accent">CSK Electric</p>
        <h1 className="font-display text-[clamp(2rem,5vw,3rem)] font-semibold leading-[0.95] tracking-[-0.035em] text-ink">
          CSK Dashboard
        </h1>

        <div className="mt-10 flex items-center gap-3">
          <span
            aria-hidden
            className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent"
          />
          <p className="micro text-ink-3">Fetching this week from Jobber and QuickBooks</p>
        </div>

        <p className="mt-4 max-w-md font-mono text-[11px] leading-relaxed text-ink-4">
          This happens once per week of data. After that it is stored and opens
          straight away.
        </p>

        {/* The shape of what is coming, so the page does not jump when it
            arrives. Three blocks, matching the real layout. */}
        <div className="mt-10 flex flex-col gap-4" aria-hidden>
          {[0, 1, 2].map((block) => (
            <div
              key={block}
              className="rounded-xl border border-line bg-surface px-6 py-6"
            >
              <div className="mb-6 h-3 w-40 rounded bg-surface-2" />
              <div className="grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
                {[0, 1, 2, 3].map((tile) => (
                  <div key={tile} className="flex flex-col gap-2">
                    <div className="h-2 w-20 rounded bg-surface-2" />
                    <div className="h-6 w-24 rounded bg-surface-2" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
