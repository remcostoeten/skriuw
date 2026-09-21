import { Container } from "@/components/ui/primitives";
import { tickerStats } from "@/data/content";

function TickerRun() {
  return (
    <div className="flex shrink-0 items-center gap-10 pr-10">
      {tickerStats.map((stat) => (
        <div key={stat.label} className="flex shrink-0 items-center gap-2.5">
          <span className="text-xs font-medium whitespace-nowrap text-ink-500">{stat.label}</span>
          <span className="rounded bg-ink-100 px-2 py-1 font-mono text-xs font-medium tracking-[0.06em] text-ink-700 tabular-nums">
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Ticker() {
  return (
    <section className="relative border-b border-border bg-surface">
      <Container className="flex h-[90px] items-center gap-8 overflow-hidden">
        <span className="shrink-0 text-[16px] font-medium text-ink-900">
          What it is held to
        </span>
        <div className="ticker-track relative min-w-0 flex-1 overflow-hidden">
          <div className="flex w-max animate-ticker items-center">
            <TickerRun />
            <TickerRun />
          </div>
        </div>
      </Container>
    </section>
  );
}
