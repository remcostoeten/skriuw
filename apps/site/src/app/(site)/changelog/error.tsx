"use client";

import { cn } from "@skriuw/shared/helpers/cn";
import { cardSurface, outlineButton } from "@/components/frame/control";

type Props = {
  reset: () => void;
};

export default function ChangelogError({ reset }: Props) {
  return (
    <div
      className={cn(cardSurface, "flex flex-wrap items-center justify-between gap-3 p-6")}
      role="alert"
    >
      <p className="text-[14px] text-ink-500">Could not load releases from GitHub.</p>
      <button type="button" className={outlineButton} onClick={() => reset()}>
        Try again
      </button>
    </div>
  );
}
