import Link from "next/link";
import { cn } from "@skriuw/shared/helpers/cn";
import { outlineButton } from "@/components/frame/control";
import type { DocSection } from "@/modules/docs/render-doc";

type Props = {
  sections: DocSection[];
  href: string;
};

export function FeatureOverview({ sections, href }: Props) {
  return (
    <section>
      <ol className="list-none p-0">
        {sections.map((section, index) => (
          <li
            key={section.id}
            className="grid gap-5 border-t border-dashed border-line py-8 first:border-t-0 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)] lg:gap-12"
          >
            <div>
              <p className="caps flex items-center gap-2 text-ink-400">
                <span className="text-accent tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {section.items.length > 0 ? `${section.items.length} features` : null}
              </p>
              <h2 className="mt-3 font-serif text-[24px] leading-[30px] font-normal tracking-[-0.4px] text-ink-900">
                <Link
                  href={`${href}#${section.id}`}
                  className="transition-colors hover:text-accent"
                >
                  {section.title}
                </Link>
              </h2>
              {section.intro ? (
                <p className="mt-2 text-[14px] leading-[22px] text-ink-500">{section.intro}</p>
              ) : null}
            </div>

            {section.items.length > 0 ? (
              <ul className="grid list-none content-start gap-x-4 p-0 sm:grid-cols-2 xl:grid-cols-3">
                {section.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`${href}#${item.id}`}
                      className="group flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-[14px] leading-[20px] text-ink-700 transition-colors hover:bg-ink-900/7 hover:text-ink-900 focus-visible:bg-ink-900/7 focus-visible:text-ink-900 focus-visible:outline-none"
                    >
                      {item.text}
                      <span
                        aria-hidden
                        className="text-ink-300 transition-colors group-hover:text-ink-500"
                      >
                        →
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Link
                href={`${href}#${section.id}`}
                className={cn(outlineButton, "self-start justify-self-start")}
              >
                Read this section
                <span aria-hidden>→</span>
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
