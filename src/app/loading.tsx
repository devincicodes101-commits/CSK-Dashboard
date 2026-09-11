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
    <div className="min-h-screen">
      <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="grid gap-5 lg:grid-cols-[236px_minmax(0,1fr)] lg:gap-6">
          {/* The rail's footprint, so the content does not shift sideways
              when the real one arrives. */}
          <div aria-hidden className="card hidden h-64 lg:block" />

          <div className="flex min-w-0 flex-col gap-5">
            <header className="card px-5 py-5 sm:px-6">
              <h1 className="font-display text-[22px] font-semibold leading-none tracking-[-0.03em] text-ink">
                Dashboard
              </h1>
              <div className="mt-4 flex items-center gap-3 border-t border-line pt-4">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 animate-pulse rounded-full bg-accent"
                />
                <p className="micro text-ink-3">
                  Fetching this week from Jobber and QuickBooks
                </p>
              </div>
              <p className="mt-3 max-w-md font-mono text-[11px] leading-relaxed text-ink-4">
                This happens once per week of data. After that it is stored and
                opens straight away.
              </p>
            </header>

            {/* The shape of what is coming, so the page does not jump when it
                arrives: four headline cards, a chart, then the blocks. */}
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
              {[0, 1, 2, 3].map((tile) => (
                <div key={tile} className="card flex flex-col gap-4 p-5">
                  <div className="h-3 w-24 rounded bg-raised" />
                  <div className="h-7 w-28 rounded bg-raised" />
                  <div className="h-2 w-32 rounded bg-raised" />
                </div>
              ))}
            </div>

            <div aria-hidden className="card h-[300px] p-6">
              <div className="h-3 w-44 rounded bg-raised" />
            </div>

            <div className="flex flex-col gap-5" aria-hidden>
              {[0, 1, 2].map((block) => (
                <div key={block} className="card px-6 py-6">
                  <div className="mb-6 h-3 w-40 rounded bg-raised" />
                  <div className="grid grid-cols-2 gap-x-8 gap-y-7 sm:grid-cols-3 lg:grid-cols-4">
                    {[0, 1, 2, 3].map((tile) => (
                      <div key={tile} className="flex flex-col gap-2">
                        <div className="h-2 w-20 rounded bg-raised" />
                        <div className="h-6 w-24 rounded bg-raised" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
