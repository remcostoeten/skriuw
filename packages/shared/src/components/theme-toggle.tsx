import type { ReactNode } from "react";
import { cn } from "../helpers/cn";

export type ThemeToggleMode = "light" | "dark" | "system";

type ThemeToggleProps = {
  value: ThemeToggleMode;
  onChange: (mode: ThemeToggleMode) => void;
  /** Segments in display order; defaults to light and dark. Include `"system"` for a three-way switch. */
  modes?: readonly ThemeToggleMode[];
  /** Accessible name per segment; defaults to the capitalized mode. */
  labels?: Partial<Record<ThemeToggleMode, string>>;
  /** `sm` matches 28px (`h-7`) toolbar controls; `md` is 34px. */
  size?: "sm" | "md";
  "aria-label"?: string;
  className?: string;
};

const DEFAULT_LABELS: Record<ThemeToggleMode, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

const DEFAULT_MODES: readonly ThemeToggleMode[] = ["light", "dark"];

const ICONS: Record<ThemeToggleMode, ReactNode> = {
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </>
  ),
  dark: <path d="M20 14.2A8.2 8.2 0 0 1 9.8 4 8.4 8.4 0 1 0 20 14.2Z" />,
  system: (
    <>
      <rect x="3" y="4.5" width="18" height="12" rx="2" />
      <path d="M9 20h6M12 16.5V20" />
    </>
  ),
};

/**
 * Segmented light/dark(/system) radio group with a sliding thumb. Controlled and storage-free:
 * each app owns persistence and applies the theme. Styled with the semantic Tailwind tokens
 * `border`, `background`, `muted`, `foreground` and `muted-foreground`, so the consuming app's
 * Tailwind build must `@source` this package.
 *
 * @example
 * <ThemeToggle value={resolved} onChange={select} />
 * <ThemeToggle modes={["light", "dark", "system"]} value={mode} onChange={setMode} />
 */
export function ThemeToggle({
  value,
  onChange,
  modes = DEFAULT_MODES,
  labels,
  size = "md",
  "aria-label": ariaLabel = "Color theme",
  className,
}: ThemeToggleProps) {
  const activeIndex = Math.max(modes.indexOf(value), 0);

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        "relative grid grid-flow-col auto-cols-fr rounded-full border border-border bg-background p-0.5",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 rounded-full bg-muted transition-transform duration-200 ease-out motion-reduce:duration-75"
        style={{
          width: `calc((100% - 0.25rem) / ${modes.length})`,
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />

      {modes.map((mode) => {
        const label = labels?.[mode] ?? DEFAULT_LABELS[mode];
        const checked = mode === value;
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            title={label}
            onClick={() => onChange(mode)}
            className={cn(
              "relative grid place-items-center rounded-full outline-none",
              size === "sm" ? "size-[1.375rem]" : "size-7",
              "transition-colors duration-150 ease-out focus-visible:ring-2 focus-visible:ring-foreground/30",
              checked ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
              className={size === "sm" ? "size-3" : "size-3.5"}
            >
              {ICONS[mode]}
            </svg>
          </button>
        );
      })}
    </div>
  );
}
