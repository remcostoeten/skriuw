import { useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { CheckIcon, ChevronDownIcon } from "@/shared/icons/static";
import { cn } from "@/shared/lib/utils";
import {
  THEME_ENTRIES,
  activeThemeIndex,
  isVariantActive,
  type ThemeEntry,
} from "./themes";

const ARROW_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

type Props = {
  value: string;
  onSelect: (themeId: string) => void;
};

export function ThemePicker({ value, onSelect }: Props) {
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (!ARROW_KEYS.includes(event.key)) {
      return;
    }
    event.preventDefault();
    const index = activeThemeIndex(value);
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const next =
      THEME_ENTRIES[(index + delta + THEME_ENTRIES.length) % THEME_ENTRIES.length];
    if (!next) {
      return;
    }
    setExpandedGroup(null);
    onSelect(next.id);
    event.currentTarget
      .querySelector<HTMLElement>(`[data-theme-id="${next.id}"]`)
      ?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="grid grid-cols-3 gap-3"
      onKeyDown={handleKeyDown}
    >
      {THEME_ENTRIES.map((entry) =>
        entry.variants ? (
          <ThemeGroupCard
            key={entry.id}
            entry={entry}
            value={value}
            expanded={expandedGroup === entry.id}
            onToggle={() =>
              setExpandedGroup((current) => (current === entry.id ? null : entry.id))
            }
            onSelect={onSelect}
          />
        ) : (
          <ThemeCard
            key={entry.id}
            entry={entry}
            active={value === entry.id}
            onSelect={() => onSelect(entry.id)}
          />
        ),
      )}
    </div>
  );
}

const CARD_BASE =
  "group rounded-lg border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function cardTone(active: boolean): string {
  return active
    ? "border-foreground/60 bg-accent/40"
    : "border-border/60 bg-card/30 hover:border-border";
}

function swatchGradient(from: string, to: string): string {
  return `linear-gradient(135deg, ${from}, ${to})`;
}

type SwatchProps = {
  from: string;
  to: string;
};

function ThemeSwatch({ from, to }: SwatchProps) {
  return (
    <div
      className="relative h-20 overflow-hidden rounded-md"
      style={{ background: swatchGradient(from, to) }}
    >
      <div className="absolute inset-x-2 top-2 h-1.5 rounded-full bg-foreground/20" />
      <div className="absolute inset-x-2 top-5 h-1 w-2/3 rounded-full bg-foreground/15" />
      <div className="absolute inset-x-2 bottom-2 h-1 w-1/2 rounded-full bg-foreground/10" />
    </div>
  );
}

type CardProps = {
  entry: ThemeEntry;
  active: boolean;
  onSelect: () => void;
};

function ThemeCard({ entry, active, onSelect }: CardProps) {
  return (
    <button
      type="button"
      role="radio"
      data-theme-id={entry.id}
      aria-checked={active}
      className={cn(CARD_BASE, cardTone(active))}
      onClick={onSelect}
    >
      <ThemeSwatch from={entry.swatchFrom} to={entry.swatchTo} />
      <div className="mt-2 flex items-center justify-between px-0.5">
        <span className="text-xs font-medium">{entry.label}</span>
        {active && <CheckIcon size={14} />}
      </div>
    </button>
  );
}

type GroupCardProps = {
  entry: ThemeEntry;
  value: string;
  expanded: boolean;
  onToggle: () => void;
  onSelect: (themeId: string) => void;
};

function ThemeGroupCard({ entry, value, expanded, onToggle, onSelect }: GroupCardProps) {
  const variantActive = isVariantActive(entry, value);

  return (
    <div className="flex flex-col">
      <button
        type="button"
        data-theme-id={entry.id}
        aria-checked={variantActive}
        aria-expanded={expanded}
        className={cn(CARD_BASE, cardTone(variantActive))}
        onClick={onToggle}
      >
        <ThemeSwatch from={entry.swatchFrom} to={entry.swatchTo} />
        <div className="mt-2 flex items-center justify-between px-0.5">
          <span className="text-xs font-medium">{entry.label}</span>
          {variantActive ? (
            <CheckIcon size={14} />
          ) : (
            <ChevronDownIcon
              size={14}
              className={cn(
                "text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
            />
          )}
        </div>
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1">
          {entry.variants?.map((variant) => (
            <button
              key={variant.id}
              type="button"
              role="radio"
              data-theme-id={variant.id}
              aria-checked={value === variant.id}
              className={cn(
                "flex w-full items-center gap-2 rounded-md border p-1.5 text-left text-xs transition-colors",
                cardTone(value === variant.id),
              )}
              onClick={() => onSelect(variant.id)}
            >
              <span
                className="size-5 shrink-0 overflow-hidden rounded"
                style={{ background: swatchGradient(variant.swatchFrom, variant.swatchTo) }}
              />
              <span className="font-medium">{variant.label}</span>
              {value === variant.id && <CheckIcon size={12} className="ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
