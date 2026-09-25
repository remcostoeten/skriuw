import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { notFound } from "next/navigation";

import { getReleases } from "../api/queries/get-releases";
import { ReleaseChanges } from "./release-changes";
import styles from "./changelog.module.css";

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
    return <p>No stable SemVer releases have been published yet.</p>;
  }

  return (
    <>
      <div className={styles.list}>
        {visible.map(function render(release, index) {
          const previous = releases[start + index + 1];

          return (
            <article key={release.id} className={styles.card}>
              <header>
                <div className={styles.meta}>
                  <code>{release.tag}</code>
                  {release.date && <time dateTime={release.date}>{release.date.slice(0, 10)}</time>}
                </div>

                <h2>
                  <a href={release.url}>{release.title}</a>
                </h2>
              </header>

              <div className={styles.notes}>
                <Markdown remarkPlugins={[remarkGfm]}>{release.body}</Markdown>
              </div>

              {previous ? (
                <ReleaseChanges id={release.id} previous={previous.tag} />
              ) : (
                <p className={styles.muted}>First published stable release.</p>
              )}
            </article>
          );
        })}
      </div>

      <nav className={styles.pagination} aria-label="Release pages">
        {page > 1 ? (
          <Link href={`/changelog?page=${page - 1}`} prefetch={false}>
            Newer releases
          </Link>
        ) : (
          <span />
        )}

        <span>
          Page {page} of {pages}
        </span>

        {page < pages ? (
          <Link href={`/changelog?page=${page + 1}`} prefetch={false}>
            Older releases
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}
