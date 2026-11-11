import { useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, MouseEvent } from "react";
import { THEME_TOKENS, isBuiltinThemeId, type ThemeColorScheme } from "@skriuw/theme";
import { CheckIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { settingsPress, settingsTransition } from "@/shared/ui/settings-controls";
import {
  THEME_ENTRIES,
  activeThemeIndex,
  isVariantActive,
  moveThemeTile,
  nextThemeVariant,
  shownThemeVariant,
  type ThemeEntry,
  type ThemeGridKey,
} from "@/features/settings/themes";

const GRID_COLUMNS = 3;
const GRID_KEYS: readonly string[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

function isGridKey(key: string): key is ThemeGridKey {
  return GRID_KEYS.includes(key);
}

function tileStyle(themeId: string): CSSProperties | undefined {
  if (!isBuiltinThemeId(themeId)) {
    return undefined;
  }
  const tokens = THEME_TOKENS[themeId];
  return {
    "--tile-bg": tokens.background,
    "--tile-sidebar": tokens["sidebar-background"],
    "--tile-rail": tokens["theme-icon-rail"],
    "--tile-fg": tokens.foreground,
    "--tile-muted": tokens["muted-foreground"],
    "--tile-border": tokens.border,
    "--tile-link": tokens["editor-link"],
    "--tile-tag": tokens["reference-tag"],
    "--tile-active": tokens["sidebar-accent"],
    "--tile-ink": tokens["accent-ink"],
  } as CSSProperties;
}

type Props = {
  value: string;
  onSelect: (themeId: string) => void;
};

export function ThemePicker({ value, onSelect }: Props) {
  const [remembered, setRemembered] = useState<Record<string, string>>({});
  const [sweeps, setSweeps] = useState<Record<string, number>>({});
  const activeIndex = activeThemeIndex(value);

  function choose(entry: ThemeEntry, themeId: string): void {
    if (entry.variants) {
      setRemembered((current) => ({ ...current, [entry.id]: themeId }));
    }
    setSweeps((current) => ({ ...current, [entry.id]: (current[entry.id] ?? 0) + 1 }));
    onSelect(themeId);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (!isGridKey(event.key)) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.getAttribute("role") !== "radio") {
      return;
    }
    event.preventDefault();
    const next = moveThemeTile(activeIndex, event.key, THEME_ENTRIES.length, GRID_COLUMNS);
    const entry = THEME_ENTRIES[next];
    if (!entry || next === activeIndex) {
      return;
    }
    choose(entry, shownThemeVariant(entry, value, remembered[entry.id]));
    event.currentTarget.querySelector<HTMLElement>(`[data-theme-tile="${entry.id}"]`)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className="theme-picker grid grid-cols-3 gap-2.5 py-1.5 max-[480px]:grid-cols-2"
      onKeyDown={handleKeyDown}
    >
      {THEME_ENTRIES.map((entry, index) => (
        <ThemeTile
          key={entry.id}
          entry={entry}
          value={value}
          shown={shownThemeVariant(entry, value, remembered[entry.id])}
          focusable={index === activeIndex}
          sweep={sweeps[entry.id] ?? 0}
          onChoose={(themeId) => choose(entry, themeId)}
        />
      ))}
    </div>
  );
}

type TileProps = {
  entry: ThemeEntry;
  value: string;
  shown: string;
  focusable: boolean;
  sweep: number;
  onChoose: (themeId: string) => void;
};

function ThemeTile({ entry, value, shown, focusable, sweep, onChoose }: TileProps) {
  const checked = entry.variants ? isVariantActive(entry, value) : value === entry.id;
  const scheme =
    entry.variants?.find((variant) => variant.id === shown)?.colorScheme ?? entry.colorScheme;

  function handleClick(event: MouseEvent<HTMLButtonElement>): void {
    const fromKeyboard = event.detail === 0;
    if (checked && fromKeyboard && entry.variants) {
      onChoose(nextThemeVariant(entry, shown));
      return;
    }
    onChoose(shown);
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-[9px] border p-[5px] pb-1.5",
        settingsTransition,
        checked
          ? "border-foreground/55 shadow-[0_0_0_1px_hsl(var(--foreground)/0.55)]"
          : "border-border hover:bg-theme-hover/45",
      )}
      style={tileStyle(shown)}
    >
      <button
        type="button"
        role="radio"
        aria-checked={checked}
        aria-label={entry.variants ? `${entry.label} ${variantLabel(entry, shown)}` : entry.label}
        data-theme-tile={entry.id}
        data-theme-id={shown}
        tabIndex={focusable ? 0 : -1}
        className={cn(
          "flex cursor-pointer flex-col gap-[7px] rounded-[5px] border-0 bg-transparent p-0 text-left",
          settingsPress,
        )}
        onClick={handleClick}
      >
        <ThemeMiniature key={sweep} scheme={scheme} replay={sweep > 0} />
        <span className="flex items-center justify-between gap-1.5 px-[3px]">
          <span className="truncate text-[12.5px] font-[450]">{entry.label}</span>
          {checked ? (
            <CheckIcon size={13} className="flex-none" />
          ) : (
            <span className="flex-none text-[10.5px] text-theme-dim">
              {scheme === "dark" ? "Dark" : "Light"}
            </span>
          )}
        </span>
      </button>
      {entry.variants ? (
        <span
          role="group"
          aria-label={`${entry.label} variant`}
          className="mx-px flex gap-0.5 rounded-[7px] border border-border bg-theme-deep p-0.5"
        >
          {entry.variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              aria-pressed={variant.id === shown}
              tabIndex={checked ? 0 : -1}
              className={cn(
                "flex-1 cursor-pointer rounded-[5px] border-0 bg-transparent px-1.5 py-[3px] text-[11px] text-theme-secondary hover:text-foreground aria-pressed:bg-theme-active aria-pressed:text-foreground",
                settingsTransition,
              )}
              onClick={() => onChoose(variant.id)}
            >
              {variant.label}
            </button>
          ))}
        </span>
      ) : null}
    </div>
  );
}

function variantLabel(entry: ThemeEntry, shown: string): string {
  return entry.variants?.find((variant) => variant.id === shown)?.label ?? "";
}

type MiniatureProps = {
  scheme: ThemeColorScheme;
  replay: boolean;
};

function ThemeMiniature({ scheme, replay }: MiniatureProps) {
  return (
    <span
      aria-hidden="true"
      data-scheme={scheme}
      data-shimmer={replay ? "select" : "intro"}
      className="theme-miniature grid h-[66px] grid-cols-[8px_24px_1fr] overflow-hidden rounded-[5px] border border-[var(--tile-border)] bg-[var(--tile-bg)]"
    >
      <span className="border-r border-[var(--tile-border)] bg-[var(--tile-rail)]" />
      <span className="flex flex-col gap-1 border-r border-[var(--tile-border)] bg-[var(--tile-sidebar)] px-[3px] py-[7px]">
        <i className="block h-[3px] rounded-sm bg-(--tile-muted)/55" />
        <i className="block h-[7px] w-[90%] rounded-sm bg-[var(--tile-active)]" />
        <i className="block h-[3px] w-[65%] rounded-sm bg-(--tile-muted)/55" />
      </span>
      <span className="flex flex-col gap-[5px] px-[9px] pt-[9px]">
        <b className="mb-0.5 block h-[5px] w-1/2 rounded-sm bg-(--tile-fg)/85" />
        <i className="block h-[3px] rounded-sm bg-(--tile-fg)/35" />
        <i className="block h-[3px] w-[72%] rounded-sm bg-(--tile-fg)/35" />
        <i className="block h-[3px] w-[36%] rounded-sm bg-(--tile-link)/90" />
        <i className="block h-[3px] w-[22%] rounded-sm bg-(--tile-tag)/90" />
        <u className="mt-auto mb-1.5 block h-1.5 w-4 rounded-sm bg-[var(--tile-ink)]" />
      </span>
    </span>
  );
}
