import { useEffect, useState, type ReactNode } from "react";
import { useStorybookConfig } from "./config";

export type CodeSource = {
  /** Heading for the file, usually its path. */
  label: string;
  code: string;
};

const TOKEN =
  /(\/\*[\s\S]*?\*\/|\/\/[^\n]*)|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b(?:import|export|from|default|function|return|const|let|var|if|else|for|of|in|while|type|interface|extends|as|new|await|async|true|false|null|undefined|typeof|keyof|readonly|void)\b)|(<\/?[A-Za-z][\w.]*)|(\b\d[\d_.]*\b)/g;

const TOKEN_CLASS = [
  "text-muted-foreground/70 italic",
  "text-emerald-500",
  "text-violet-500",
  "text-sky-500",
  "text-orange-500",
];

function highlight(code: string): ReactNode[] {
  const pieces: ReactNode[] = [];
  let last = 0;
  for (const match of code.matchAll(TOKEN)) {
    if (match.index > last) pieces.push(code.slice(last, match.index));
    const group = match.slice(1).findIndex((value) => value !== undefined);
    pieces.push(
      <span key={match.index} className={TOKEN_CLASS[group]}>
        {match[0]}
      </span>,
    );
    last = match.index + match[0].length;
  }
  pieces.push(code.slice(last));
  return pieces;
}

function CopyButton({ code }: { code: string }) {
  const { labels } = useStorybookConfig();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(code).then(
          () => setCopied(true),
          (error: unknown) => console.warn("Copy failed", error),
        );
      }}
      className="h-6 rounded px-2 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      <span aria-live="polite">{copied ? labels.copied : labels.copy}</span>
    </button>
  );
}

type CodeBlockProps = {
  label: string;
  code: string;
};

/** Highlighted, copyable code with a filename bar. */
export function CodeBlock({ label, code }: CodeBlockProps) {
  const text = code.trim();
  return (
    <figure className="m-0 overflow-hidden rounded-lg border border-border/60 bg-muted/20">
      <figcaption className="flex h-8 items-center justify-between border-b border-border/60 pl-3 pr-1 font-mono text-[11px] text-muted-foreground">
        {label}
        <CopyButton code={text} />
      </figcaption>
      <pre className="m-0 max-h-[32rem] overflow-auto p-3 font-mono text-[12px] leading-5 text-foreground/90">
        <code>{highlight(text)}</code>
      </pre>
    </figure>
  );
}

/** "Usage" section: one copyable example. */
export function UsageSection({ usage }: { usage: string }) {
  const { labels } = useStorybookConfig();
  return (
    <section className="mt-14 flex flex-col gap-4 border-t border-border/60 pt-10">
      <h2
        data-section="usage"
        data-toc={labels.usage}
        tabIndex={-1}
        className="scroll-mt-6 text-[18px] font-semibold tracking-[-0.015em] outline-none"
      >
        {labels.usage}
      </h2>
      <CodeBlock label="tsx" code={usage} />
    </section>
  );
}

/** "Source" section: one collapsible, copyable file per entry. */
export function SourceSection({ sources }: { sources: readonly CodeSource[] }) {
  const { labels } = useStorybookConfig();
  return (
    <section className="mt-14 flex flex-col gap-3 border-t border-border/60 pt-10">
      <h2
        data-section="source"
        data-toc={labels.source}
        tabIndex={-1}
        className="scroll-mt-6 text-[18px] font-semibold tracking-[-0.015em] outline-none"
      >
        {labels.source}
      </h2>
      {sources.map((source) => (
        <details key={source.label} className="group">
          <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-md px-2 font-mono text-[12px] hover:bg-muted/60 [&::-webkit-details-marker]:hidden">
            <span
              aria-hidden="true"
              className="text-muted-foreground transition-transform group-open:rotate-90"
            >
              ›
            </span>
            {source.label}
            <span className="ml-auto text-[11px] text-muted-foreground">
              {labels.lines(source.code.trim().split("\n").length)}
            </span>
          </summary>
          <div className="mt-2">
            <CodeBlock label={source.label} code={source.code} />
          </div>
        </details>
      ))}
    </section>
  );
}
