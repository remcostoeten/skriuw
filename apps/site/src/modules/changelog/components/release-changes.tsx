"use client";

import { useComparison } from "../hooks/use-comparison";
import { outlineButton } from "@/components/frame/control";

const focusTint = "focus-visible:rounded focus-visible:bg-focus-tint focus-visible:text-focus-ink";
const link = `text-ink-900 decoration-line underline-offset-3 hover:decoration-accent ${focusTint}`;
const muted = "text-[14px] text-ink-500";
const heading =
  "mt-6 mb-2 font-mono text-[11.5px] font-medium tracking-[0.02em] text-ink-500 uppercase";

type Props = {
  id: number;
  previous: string;
};

export function ReleaseChanges({ id, previous }: Props) {
  const { open, data, error, pending, toggle } = useComparison(id);
  const panel = `changes-${id}`;

  return (
    <section className="mt-6 border-t border-dashed border-line pt-5">
      <button
        type="button"
        className={outlineButton}
        onClick={toggle}
        disabled={pending}
        aria-expanded={open}
        aria-controls={panel}
      >
        {pending && (
          <span
            className="size-2.5 animate-[spin_0.8s_linear_infinite] rounded-full border-2 border-line border-t-ink-900 motion-reduce:animate-none"
            aria-hidden
          />
        )}
        {pending ? "Loading changes…" : open ? "Hide changes" : `Changes since ${previous}`}
      </button>

      <div id={panel} hidden={!open} aria-busy={pending}>
        {pending && (
          <p role="status" className={muted}>
            Fetching comparison…
          </p>
        )}
        {error && (
          <p role="alert" className={muted}>
            {error}
          </p>
        )}

        {data && (
          <div className="mt-5 text-[14px] text-ink-700">
            <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[12px] text-ink-500">
              <code>
                {data.base.slice(0, 7)} → {data.head.slice(0, 7)}
              </code>
              <a href={data.url} className={link}>
                Full comparison on GitHub
              </a>
            </div>

            {data.status !== "ahead" && (
              <p>Comparison status: {data.status}. These releases may not form a linear history.</p>
            )}

            <h3 className={heading}>{data.total} commits</h3>

            <ul className="list-none">
              {data.commits.map(function render(commit) {
                return (
                  <li key={commit.sha} className="border-b border-dashed border-line py-2">
                    <a
                      href={commit.url}
                      className={`flex items-baseline gap-3 text-ink-700 no-underline hover:text-ink-900 ${focusTint}`}
                    >
                      <code className="shrink-0 text-[12px] text-accent">
                        {commit.sha.slice(0, 7)}
                      </code>
                      <span className="wrap-anywhere">{commit.message}</span>
                    </a>
                  </li>
                );
              })}
            </ul>

            <h3 className={heading}>Changed files</h3>

            <p className={muted}>
              Patch previews are available for up to 20 files. Open GitHub for complete changes.
            </p>

            {data.files.map(function render(file) {
              return (
                <details key={file.name} className="border-b border-dashed border-line py-3">
                  <summary className={`cursor-pointer wrap-anywhere text-ink-900 ${focusTint}`}>
                    <span>{file.name}</span>
                    <span className="mt-1 block font-mono text-[12px] text-ink-500">
                      {file.status} · +{file.additions} / -{file.deletions}
                    </span>
                  </summary>

                  {file.patch ? (
                    <pre className="my-3 overflow-auto rounded-md border border-line bg-hy-bg p-4 font-mono text-[12.5px] leading-[1.65] text-ink-700">
                      <code>{file.patch}</code>
                    </pre>
                  ) : (
                    <p>No inline patch preview.</p>
                  )}

                  {file.truncated && <p>Patch preview truncated.</p>}

                  <a href={file.url} className={link}>
                    View file on GitHub
                  </a>
                </details>
              );
            })}

            {data.limited && (
              <p>
                This preview does not include every change.{" "}
                <a href={data.url} className={link}>
                  View the full comparison.
                </a>
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
