/**
 * The three blocks, listed.
 *
 * More than a table of contents: each row names the block AND who it goes to,
 * because the audience is the reason there are three blocks rather than one
 * page. Chase reads this list the way he reads his Wednesday morning — sales
 * to me, profit to the techs, cash to me and Alana.
 *
 * Sticky beside the figures on a wide screen, a plain row above them on a
 * narrow one. Anchor links, so no JavaScript and no scroll hijacking.
 */

export interface Section {
  id: string;
  ordinal: string;
  title: string;
  audience: string;
  /**
   * Whether the block has figures behind it yet.
   *
   * Not shown here on purpose. A marker in the nav duplicated what the block
   * itself already says in words, as a glyph that read as noise rather than
   * as information.
   */
  ready: boolean;
}

export function SectionNav({ sections }: { sections: readonly Section[] }) {
  return (
    <nav aria-label="Sections" className="lg:sticky lg:top-8">
      <p className="micro mb-4 text-ink-4">Blocks</p>

      <ul className="flex flex-col gap-1">
        {sections.map((section) => (
          <li key={section.id}>
            <a
              href={`#${section.id}`}
              className="group flex cursor-pointer items-baseline gap-3 rounded-lg px-3 py-2.5 transition-colors duration-200 hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="micro shrink-0 text-ink-4 transition-colors duration-200 group-hover:text-accent">
                {section.ordinal}
              </span>
              <span className="flex min-w-0 flex-col gap-1">
                <span className="font-display text-[13px] font-medium leading-tight tracking-tight text-ink-2 transition-colors duration-200 group-hover:text-ink">
                  {section.title}
                </span>
                <span className="micro text-ink-4">{section.audience}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
