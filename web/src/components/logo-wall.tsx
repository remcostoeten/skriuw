import { Action, Container } from "@/components/ui/primitives";
import { importSources, repoUrl } from "@/data/content";

export function LogoWall() {
  return (
    <section className="w-full border-y border-border bg-surface">
      <Container className="grid gap-8 py-9 md:grid-cols-[minmax(0,280px)_minmax(0,1fr)] md:gap-10">
        <div className="flex flex-col justify-between gap-8">
          <h2 className="text-[20px] leading-[27px] font-semibold text-ink-900">
            Bring the notes you already have.{" "}
            <span className="text-ink-700">
              Preview every import before a single byte is written.
            </span>
          </h2>
          <Action
            arrow="inline"
            size="lg"
            className="self-start"
            href={`${repoUrl}/blob/daddy/docs/provider-import.md`}
          >
            Read the import guide
          </Action>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {importSources.map((source) => (
            <div
              key={source}
              className="grid h-[144px] place-items-center rounded-md border border-border bg-ink-50"
            >
              <span className="px-3 text-center text-[20px] font-semibold tracking-[-0.03em] text-ink-800">
                {source}
              </span>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
