import { importSources } from "@/data/content";

export function HomeSignals() {
  return (
    <section className="p-0!">
      <div className="grid lg:grid-cols-[auto_minmax(0,1fr)]">
        <p className="caps m-0 flex items-center px-6 py-5 text-[0.62rem] text-ink-400 max-lg:border-b max-lg:border-dashed max-lg:border-line max-[620px]:px-5 lg:border-r lg:border-dashed lg:border-line">
          Imports from
        </p>
        <div className="overflow-hidden">
          <ul className="-mt-px -ml-px grid list-none grid-cols-2 p-0 sm:grid-cols-3 lg:grid-cols-6">
            {importSources.map((source) => (
              <li
                key={source.name}
                className="flex flex-col gap-1 border-t border-l border-dashed border-line px-6 py-5 max-[620px]:px-5"
              >
                <span className="text-[15px] font-medium tracking-[-0.01em] text-ink-900">
                  {source.name}
                </span>
                <span className="font-mono text-[11px] text-accent">{source.format}</span>
                <span className="mt-1 text-[12px] leading-4 text-ink-400">{source.keeps}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
