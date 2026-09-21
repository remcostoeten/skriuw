import { Container } from "@/components/ui/primitives";

const barWidths = ["w-[92%]", "w-[84%]", "w-[60%]"];

export default function Loading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="border-b border-border bg-surface"
    >
      <Container className="grid gap-10 py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:py-28">
        <span className="sr-only">Loading</span>

        <div className="flex flex-col gap-3 motion-safe:animate-pulse">
          <div className="h-3 w-28 rounded-full bg-ink-200" />
          <div className="h-7 w-32 rounded-full bg-ink-200" />
          <div className="h-7 w-24 rounded-full bg-ink-200" />
        </div>

        <div className="motion-safe:animate-pulse">
          <div className="h-3 w-40 rounded-full bg-ink-200" />
          <div className="mt-6 h-11 w-[88%] max-w-[720px] rounded bg-ink-200" />
          <div className="mt-3 h-11 w-[64%] max-w-[560px] rounded bg-ink-200" />
          <div className="mt-8 flex max-w-[620px] flex-col gap-3">
            {barWidths.map((width) => (
              <div key={width} className={`h-4 rounded-full bg-ink-200 ${width}`} />
            ))}
          </div>
          <div className="mt-9 flex gap-3">
            <div className="h-[45px] w-44 rounded-full bg-ink-200" />
            <div className="h-[45px] w-36 rounded-full bg-ink-200" />
          </div>
        </div>
      </Container>
    </section>
  );
}
