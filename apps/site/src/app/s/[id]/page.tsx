import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { cn } from "@skriuw/shared/helpers/cn";
import { DocOutline } from "@/modules/docs/doc-outline";
import type { DocHeading } from "@/modules/docs/heading-ids";
import { fetchSharedNote } from "@/modules/shared-note/fetch-shared-note";
import { showsOutline } from "@/modules/shared-note/render-markdown";
import { ScrollToHash } from "@/modules/shared-note/scroll-to-hash";

type Props = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "Shared note",
  description: "A note shared from Skriuw.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

type ContentsProps = {
  headings: DocHeading[];
};

const updatedFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

function SharedNoteContents({ headings }: ContentsProps) {
  return (
    <details className="group mb-10 border-y border-dashed border-line py-3 lg:hidden">
      <summary className="caps flex cursor-pointer list-none items-center justify-between text-ink-400 transition-colors hover:text-ink-900 [&::-webkit-details-marker]:hidden">
        Contents
        <span aria-hidden className="text-ink-300 group-open:hidden">
          +
        </span>
        <span aria-hidden className="hidden text-ink-300 group-open:inline">
          −
        </span>
      </summary>
      <nav aria-label="Contents">
        <ol className="m-0 mt-3 grid list-none gap-0.5 p-0">
          {headings.map((heading) => (
            <li key={heading.id} className="min-w-0">
              <a
                href={`#${heading.id}`}
                className={cn(
                  "flex min-h-[30px] items-center rounded-md pr-2 text-[14px] leading-[20px] text-ink-500 no-underline transition-colors duration-150 hover:bg-ink-100 hover:text-ink-900",
                  heading.depth === 3 ? "pl-5" : "pl-0",
                )}
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </details>
  );
}

async function SharedNoteBody({ params }: Props) {
  const { id } = await params;
  const note = await fetchSharedNote(id);

  if (!note) {
    notFound();
  }

  const outline = showsOutline(note.headings);
  const width = outline ? "max-w-3xl lg:max-w-5xl" : "max-w-3xl";

  return (
    <>
      <header className="border-b border-border">
        <div className={cn("mx-auto w-full px-4 py-10 sm:px-5 lg:py-12", width)}>
          <p className="font-mono text-[12px] tracking-[0.08em] text-ink-400 uppercase">
            Shared note
          </p>
          <h1 className="mt-3 font-serif text-[28px] leading-[34px] font-normal tracking-[-0.5px] text-balance text-ink-900 md:text-[32px] md:leading-[38px]">
            {note.title || "Untitled"}
          </h1>
          <p className="mt-3 font-mono text-[12px] text-ink-400">
            Updated {updatedFormat.format(new Date(note.updatedAt * 1_000))}
          </p>
        </div>
      </header>
      <div
        className={cn(
          "mx-auto w-full px-4 py-12 sm:px-5 lg:py-16",
          width,
          outline && "lg:grid lg:grid-cols-[minmax(0,1fr)_220px] lg:gap-12",
        )}
      >
        <div className="min-w-0">
          {outline ? <SharedNoteContents headings={note.headings} /> : null}
          <div
            className="doc-prose shared-note-prose min-w-0"
            dangerouslySetInnerHTML={{ __html: note.html }}
          />
          <ScrollToHash />
        </div>
        {outline ? (
          <aside className="hidden lg:block">
            <div className="sticky top-8">
              <p className="caps px-[22px] text-ink-400">On this page</p>
              <div
                data-outline-scroll
                className="no-scrollbar mt-4 max-h-[calc(100vh_-_120px)] overflow-y-auto overscroll-contain"
              >
                <DocOutline headings={note.headings} collapse={note.headings.length > 30} />
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </>
  );
}

function SharedNoteFallback() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-5 lg:py-12">
        <p className="font-mono text-[12px] tracking-[0.08em] text-ink-400 uppercase">
          Shared note
        </p>
        <div className="mt-4 h-8 w-2/3 rounded-card bg-ink-100" />
      </div>
    </header>
  );
}

export default function SharedNotePage({ params }: Props) {
  return (
    <article className="bg-surface">
      <Suspense fallback={<SharedNoteFallback />}>
        <SharedNoteBody params={params} />
      </Suspense>
    </article>
  );
}
