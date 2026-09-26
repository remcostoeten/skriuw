"use client";

import { useComparison } from "../hooks/use-comparison";
import { outlineButton } from "@/components/frame/control";
import styles from "./changelog.module.css";

type Props = {
  id: number;
  previous: string;
};

export function ReleaseChanges({ id, previous }: Props) {
  const { open, data, error, pending, toggle } = useComparison(id);
  const panel = `changes-${id}`;

  return (
    <section className={styles.changes}>
      <button
        type="button"
        className={outlineButton}
        onClick={toggle}
        disabled={pending}
        aria-expanded={open}
        aria-controls={panel}
      >
        {pending && <span className={styles.spinner} aria-hidden />}
        {pending ? "Loading changes…" : open ? "Hide changes" : `Changes since ${previous}`}
      </button>

      <div id={panel} hidden={!open} aria-busy={pending}>
        {pending && (
          <p role="status" className={styles.muted}>
            Fetching comparison…
          </p>
        )}
        {error && (
          <p role="alert" className={styles.muted}>
            {error}
          </p>
        )}

        {data && (
          <div className={styles.comparison}>
            <div className={styles.meta}>
              <code>
                {data.base.slice(0, 7)} → {data.head.slice(0, 7)}
              </code>
              <a href={data.url}>Full comparison on GitHub</a>
            </div>

            {data.status !== "ahead" && (
              <p>Comparison status: {data.status}. These releases may not form a linear history.</p>
            )}

            <h3>{data.total} commits</h3>

            <ul className={styles.commits}>
              {data.commits.map(function render(commit) {
                return (
                  <li key={commit.sha}>
                    <a href={commit.url}>
                      <code>{commit.sha.slice(0, 7)}</code>
                      <span>{commit.message}</span>
                    </a>
                  </li>
                );
              })}
            </ul>

            <h3>Changed files</h3>

            <p className={styles.muted}>
              Patch previews are available for up to 20 files. Open GitHub for complete changes.
            </p>

            {data.files.map(function render(file) {
              return (
                <details key={file.name} className={styles.file}>
                  <summary>
                    <span>{file.name}</span>
                    <span className={styles.muted}>
                      {file.status} · +{file.additions} / -{file.deletions}
                    </span>
                  </summary>

                  {file.patch ? (
                    <pre className={styles.patch}>
                      <code>{file.patch}</code>
                    </pre>
                  ) : (
                    <p>No inline patch preview.</p>
                  )}

                  {file.truncated && <p>Patch preview truncated.</p>}

                  <a href={file.url}>View file on GitHub</a>
                </details>
              );
            })}

            {data.limited && (
              <p>
                This preview does not include every change.{" "}
                <a href={data.url}>View the full comparison.</a>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
