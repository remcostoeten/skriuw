import { tickerStats } from "@/data/content";

export function HybridSignals() {
  return (
    <section className="p-0!">
      <dl className="grid grid-cols-2 divide-x divide-dashed divide-line sm:grid-cols-3 lg:grid-cols-5">
        {tickerStats.map((stat, index) => (
          <div
            key={stat.label}
            className="flex flex-col gap-2 px-6 py-5 max-[620px]:px-5 [&:nth-child(2n)]:max-sm:border-l-0 [&:nth-child(n+3)]:max-sm:border-t [&:nth-child(n+3)]:max-sm:border-dashed [&:nth-child(n+3)]:max-sm:border-line"
            style={{ animationDelay: `${index * 40}ms` }}
          >
            <dt className="caps text-[0.62rem] text-ink-400">{stat.label}</dt>
            <dd className="m-0 font-mono text-[15px] font-medium tracking-[-0.01em] text-ink-900 tabular-nums">
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
