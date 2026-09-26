import Link from "next/link";
import { ArrowRight } from "@/components/ui/icons";

type Props = {
  version?: string;
  headline?: string;
};

export function ReleasePill({ version, headline }: Props) {
  return (
    <Link
      href="/changelog/"
      className="hy-link inline-flex max-w-full items-center gap-2 rounded-full border border-line bg-hy-card py-1 pr-2 pl-3 text-xs font-medium text-ink-500 no-underline transition-colors hover:border-ink-400 hover:text-ink-900"
    >
      <span className="shrink-0">{version ? "New in" : "What's new"}</span>
      {version && (
        <span className="shrink-0 rounded-full bg-ink-900/8 px-2 py-0.5 font-mono text-xs font-medium text-ink-700 tabular-nums">
          {version}
        </span>
      )}
      {headline && <span className="truncate text-ink-700">{headline}</span>}
      <ArrowRight className="size-3 shrink-0" />
    </Link>
  );
}
