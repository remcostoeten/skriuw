"use client";

import type { ComponentType, SVGProps } from "react";
import { Moon, Sun } from "@/components/ui/icons";
import { cx } from "@/components/ui/primitives";
import { useTheme } from "@/lib/theme";
import type { ResolvedTheme } from "@/lib/theme";

type Props = {
  className?: string;
};

const options: Array<{
  value: ResolvedTheme;
  label: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
}> = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

export function ThemeToggle({ className }: Props) {
  const { resolved, select } = useTheme();
  const activeIndex = options.findIndex((option) => option.value === resolved);

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={cx(
        "relative grid grid-cols-2 rounded-full border border-border bg-surface p-0.5",
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          "absolute inset-y-0.5 left-0.5 w-[calc(50%-0.125rem)] rounded-full bg-ink-100",
          "transition-transform duration-200 ease-out motion-reduce:duration-75",
        )}
        style={{ transform: `translateX(${Math.max(activeIndex, 0) * 100}%)` }}
      />

      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={resolved === option.value}
          aria-label={option.label}
          title={option.label}
          onClick={() => select(option.value)}
          className={cx(
            "relative grid size-7 place-items-center rounded-full",
            "transition-colors duration-150 ease-out",
            "focus-visible:text-focus-ink",
            resolved === option.value ? "text-ink-900" : "text-ink-400 hover:text-ink-700",
          )}
        >
          <option.Icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
