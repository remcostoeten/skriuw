import Link from "next/link";
import { notFound } from "next/navigation";
import { cn } from "@skriuw/shared/helpers/cn";
import { cardSurface, outlineButton } from "@/components/frame/control";

import { getReleases } from "../api/queries/get-releases";
import { renderReleaseNotes } from "../utilities/release-notes";
import { ReleaseChanges } from "./release-changes";

const meta = "flex flex-wrap items-center justify-between gap-3 font-mono text-[12px] text-ink-500";

const notes = cn(
  "doc-prose max-w-none! wrap-anywhere [&_table]:max-w-full",
  "[&_h2]:mt-8! [&_h2]:mb-3! [&_h2]:pt-5! [&_h2]:text-[19px]! [&_h2]:leading-[26px]!",
  "[&_h3]:mt-6! [&_h3]:mb-2! [&_h3]:text-[16px]! [&_h3]:leading-6!",
  "[&>:first-child]:mt-0! [&>:first-child]:border-t-0! [&>:first-child]:pt-0!",
);

type Props = {
  searchParams: Promise<{
    page?: string | string[];
  }>;
};

export async function ReleaseList({ searchParams }: Props) {
  const params = await searchParams;
  const value = params.page ?? "1";

  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    notFound();
  }

  const page = Number(value);

  if (!Number.isSafeInteger(page)) {
    notFound();
  }

  const releases = await getReleases();
  const size = 10;
  const pages = Math.max(1, Math.ceil(releases.length / size));

  if (page > pages) {
    notFound();
  }

  const start = (page - 1) * size;
  const visible = releases.slice(start, start + size);

  if (!visible.length) {
    return (
      <p className="text-[14px] text-ink-500">No stable SemVer releases have been published yet.</p>
    );
  }

  return (
    <>
      <div className="grid gap-4">
        {visible.map(function render(release, index) {
          const previous = releases[start + index + 1];

          return (
            <article key={release.id} className={cn("min-w-0", cardSurface)}>
              <header className="grid gap-3 border-b border-dashed border-line px-6 py-5">
                <div className={meta}>
                  <code className="rounded-full bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] px-2 py-0.5 font-medium text-focus-ink">
                    {release.tag}
                  </code>
                  {release.date && <time dateTime={release.date}>{release.date.slice(0, 10)}</time>}
                </div>

                <h2 className="font-serif text-[28px] leading-[34px] font-normal tracking-[-0.6px] text-ink-900">
                  <a
                    href={release.url}
                    className="text-inherit no-underline decoration-accent underline-offset-4 hover:underline focus-visible:rounded focus-visible:bg-focus-tint focus-visible:text-focus-ink"
                  >
                    {release.title}
                  </a>
                </h2>
              </header>

              <div className="p-6">
                <div
                  className={notes}
                  dangerouslySetInnerHTML={{ __html: renderReleaseNotes(release.body) }}
                />

                {previous ? (
                  <ReleaseChanges id={release.id} previous={previous.tag} />
                ) : (
                  <p className="mt-6 border-t border-dashed border-line pt-5 text-[14px] text-ink-500">
                    First published stable release.
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>

      <nav className={cn(meta, "mt-6")} aria-label="Release pages">
        {page > 1 ? (
          <Link href={`/changelog?page=${page - 1}`} prefetch={false} className={outlineButton}>
            ← Newer releases
          </Link>
        ) : (
          <span />
        )}

        <span>
          Page {page} of {pages}
        </span>

        {page < pages ? (
          <Link href={`/changelog?page=${page + 1}`} prefetch={false} className={outlineButton}>
            Older releases →
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}
