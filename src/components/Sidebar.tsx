import type { ReactNode } from "react";

/**
 * The left rail.
 *
 * More than a table of contents: each row names the block AND who it goes to,
 * because the audience is the reason there are three blocks rather than one
 * page. Chase reads this list the way he reads his Wednesday morning — sales
 * to me, profit to the techs, cash to me and Alana.
 *
 * Anchor links, so no JavaScript and no scroll hijacking. Which also means no
 * active-on-scroll highlight: that needs a scroll listener, and a rail that
 * has to hydrate before it is usable is a worse trade than a rail with one
 * fewer flourish. "Overview" carries the active treatment because it is where
 * the page opens.
 *
 * A column beside the figures on a wide screen; a scrolling strip above them
 * on a narrow one, where a fixed rail would eat half the width the numbers
 * need.
 */

export interface Section {
  id: string;
  ordinal: string;
  title: string;
  audience: string;
  /**
   * Whether the block has figures behind it yet.
   *
   * Not shown here on purpose. A marker in the rail duplicated what the block
   * itself already says in words, as a glyph that read as noise rather than
   * as information.
   */
  ready: boolean;
}

function Icon({ path }: { path: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="17"
      height="17"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <path d={path} />
    </svg>
  );
}

const ICONS: Record<string, string> = {
  overview: "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5",
  sales: "M3 17l5-5 4 3 7-8M21 7v5h-5",
  revenue: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  cash: "M3 7h18v11H3zM3 11h18M7 15h3",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.3-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  signout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
};

function Row({
  href,
  icon,
  label,
  meta,
  active = false,
}: {
  href: string;
  icon: string;
  label: string;
  meta?: string;
  active?: boolean;
}) {
  const look = active
    ? "bg-accent text-on-accent"
    : "text-ink-2 hover:bg-raised hover:text-ink";

  return (
    <a
      href={href}
      className={
        "group flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent " +
        look
      }
    >
      <Icon path={icon} />
      <span className="flex min-w-0 flex-col">
        <span className="font-display text-[13px] leading-tight font-medium tracking-tight">
          {label}
        </span>
        {meta ? (
          <span
            className={
              "micro mt-1 " + (active ? "text-on-accent/70" : "text-ink-4")
            }
          >
            {meta}
          </span>
        ) : null}
      </span>
    </a>
  );
}

export function Sidebar({
  sections,
  authed,
}: {
  sections: readonly Section[];
  /** Sign out only exists when a passphrase is configured. */
  authed: boolean;
}) {
  const rows: ReactNode = (
    <>
      <Row href="#top" icon={ICONS.overview!} label="Overview" active />
      {sections.map((section) => (
        <Row
          key={section.id}
          href={"#" + section.id}
          icon={ICONS[section.id] ?? ICONS.sales!}
          label={section.title}
          meta={section.audience}
        />
      ))}
    </>
  );

  return (
    <nav aria-label="Sections" className="lg:sticky lg:top-6 lg:self-start">
      <div className="card p-3 sm:p-4">
        <div className="mb-5 flex items-center gap-2.5 px-2 pt-2">
          <span
            aria-hidden
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent font-display text-[12px] font-bold text-on-accent"
          >
            C
          </span>
          <span className="font-display text-[14px] font-semibold tracking-tight text-ink">
            CSK Electric
          </span>
        </div>

        {/* One list, two shapes. Scrolls sideways where a column would not
            fit, stacks where it would. */}
        <div className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
          {rows}
        </div>

        <div className="mt-5 flex gap-1 border-t border-line pt-3 lg:flex-col">
          <Row href="/settings" icon={ICONS.settings!} label="Settings" />
          {authed ? (
            <Row href="/api/auth" icon={ICONS.signout!} label="Sign out" />
          ) : null}
        </div>
      </div>
    </nav>
  );
}
