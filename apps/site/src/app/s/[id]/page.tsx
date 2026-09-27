import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { fetchSharedNote } from "@/lib/shared-note";

type Props = {
  params: Promise<{ id: string }>;
};

export const metadata: Metadata = {
  title: "Shared note",
  description: "A note shared from Skriuw.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const updatedFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeZone: "UTC" });

async function SharedNoteBody({ params }: Props) {
  const { id } = await params;
  const note = await fetchSharedNote(id);

  if (!note) {
    notFound();
  }

  return (
    <>
      <header className="border-b border-border">
        <div className="mx-auto w-full max-w-3xl px-5 py-10 lg:py-12">
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
      <div className="mx-auto w-full max-w-3xl px-5 py-12 lg:py-16">
        <div className="doc-prose min-w-0" dangerouslySetInnerHTML={{ __html: note.html }} />
      </div>
    </>
  );
}

function SharedNoteFallback() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto w-full max-w-3xl px-5 py-10 lg:py-12">
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
