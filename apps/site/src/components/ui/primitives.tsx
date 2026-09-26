import { cn } from "@skriuw/shared/helpers/cn";

type Props = {
  className?: string;
};

export function Wordmark({ className }: Props) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]">
        <g fill="currentColor" transform="translate(0.84 0) skewX(-4)">
          <rect x="4.3" y="6.4" width="4.7" height="12.4" rx="1" />
          <rect x="9.7" y="3.6" width="5" height="17.8" rx="1.2" />
          <rect x="15.4" y="6.4" width="4.7" height="12.4" rx="1" />
        </g>
      </svg>
      <span className="text-[17px] font-semibold tracking-[-0.02em]">Skriuw</span>
    </span>
  );
}
