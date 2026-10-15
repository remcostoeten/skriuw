import { cn } from "@skriuw/shared/helpers/cn";
import { badge } from "@/components/frame/control";
import type { AdrStatus } from "@/modules/docs/adr";

type Props = {
  status: AdrStatus;
  date: string;
};

const tones: Record<AdrStatus, string> = {
  accepted: "bg-ok/15 text-ok",
  proposed: "bg-ink-900/8 text-ink-500",
  superseded: "bg-ink-900/8 text-ink-400 line-through",
  deprecated: "bg-ink-900/8 text-ink-400",
};

export function AdrStatusLine({ status, date }: Props) {
  return (
    <p className="mt-4 flex items-center gap-2 font-mono text-[11px] text-ink-400">
      <span className={cn(badge, tones[status])}>{status}</span>
      {date ? <time dateTime={date}>{date}</time> : null}
    </p>
  );
}
