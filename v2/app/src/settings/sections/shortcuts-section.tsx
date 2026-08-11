import { useEffect, useRef, useState } from "react";
import type { MutableRefObject, KeyboardEvent as ReactKeyboardEvent } from "react";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import {
  clearAllShortcutOverrides,
  clearShortcutOverride,
  setShortcutOverride,
} from "@/actions/settings";
import { SearchIcon } from "@/shared/icons";
import { cn } from "@/shared/lib/utils";
import { ShortcutRecorder } from "@/shared/ui/shortcut-recorder";
import type { ShortcutRecorderHandle } from "@/shared/ui/shortcut-recorder";
import {
  effectiveShortcutKeys,
  findShortcutConflict,
  isDefaultBinding,
  sameCombo,
} from "@/commands/bindings";
import {
  filterShortcutSettings,
  shortcutSearchSuggestions,
  shortcutSettingsCount,
} from "@/commands/settings-search";
import { useRendererSelector } from "@/store/use-renderer-selector";
import { sameOverrides, selectShortcutOverrides } from "./selectors";
import {
  SettingsHeading,
  settingsButton,
  settingsButtonDanger,
  settingsGroup,
  settingsGroupTitle,
  settingsRow,
  settingsRowLabel,
  settingsSection,
} from "./settings-shared";
import type { SectionProps } from "./settings-shared";

const LISTBOX_ID = "shortcut-search-listbox";

function suggestionOptionId(index: number): string {
  return `shortcut-search-option-${index}`;
}

export function ShortcutsSection({
  store,
  recordingCountRef,
}: SectionProps & { recordingCountRef: MutableRefObject<number> }) {
  const overrides = useRendererSelector(store, selectShortcutOverrides, sameOverrides);
  const [query, setQuery] = useState("");
  const [listboxOpen, setListboxOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const recorderHandles = useRef(new Map<string, ShortcutRecorderHandle>());
  const groups = filterShortcutSettings(overrides, query);
  const matchCount = shortcutSettingsCount(groups);
  const suggestions = shortcutSearchSuggestions(overrides, query);
  const expanded = listboxOpen && suggestions.length > 0;
  const trimmedQuery = query.trim();
  const hasOverrides = Object.keys(overrides).length > 0;

  useEffect(() => {
    function handleWindowKeyDown(event: KeyboardEvent): void {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key.toLowerCase() !== "f" || recordingCountRef.current > 0) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [recordingCountRef]);

  function closeListbox(): void {
    setListboxOpen(false);
    setActiveIndex(-1);
  }

  function acceptSuggestion(suggestion: string): void {
    setQuery(suggestion);
    closeListbox();
  }

  function handleSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Escape") {
      if (expanded) {
        event.preventDefault();
        event.stopPropagation();
        closeListbox();
        return;
      }
      if (query.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        setQuery("");
      }
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (suggestions.length === 0) {
        return;
      }
      event.preventDefault();
      if (!expanded) {
        setListboxOpen(true);
        setActiveIndex(event.key === "ArrowDown" ? 0 : suggestions.length - 1);
        return;
      }
      const delta = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((activeIndex + delta + suggestions.length) % suggestions.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const active = expanded ? suggestions[activeIndex] : undefined;
      if (active !== undefined) {
        acceptSuggestion(active);
        return;
      }
      closeListbox();
      const first = groups[0]?.definitions[0];
      if (trimmedQuery.length > 0 && first) {
        recorderHandles.current.get(first.id)?.startRecording();
      }
    }
  }

  return (
    <section aria-label="Keyboard shortcuts" className={settingsSection}>
      <SettingsHeading
        title="Shortcuts"
        detail="Click a shortcut, then press a new key combination. Enter or clicking elsewhere keeps the current one, Escape cancels."
      />
      <div className="sticky top-0 z-[2] -mx-1 mb-4 bg-background px-1 pt-1.5 pb-2.5">
        <div className="relative">
          <SearchIcon
            size={14}
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-[9px] -translate-y-1/2 text-muted-foreground"
          />
          <input
            ref={searchInputRef}
            type="search"
            role="combobox"
            value={query}
            className="h-8 w-full rounded-lg border border-border bg-muted py-[5px] pr-2.5 pl-[30px] text-xs text-foreground outline-none placeholder:text-muted-foreground/[78%] [&::-webkit-search-cancel-button]:hidden focus-visible:border-foreground/70 focus-visible:bg-accent/25"
            placeholder={`Filter shortcuts (${formatShortcut("mod+f")})`}
            aria-label="Filter shortcuts"
            aria-keyshortcuts="Control+F"
            aria-expanded={expanded}
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-activedescendant={
              expanded && activeIndex >= 0 ? suggestionOptionId(activeIndex) : undefined
            }
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setListboxOpen(true);
              setActiveIndex(-1);
            }}
            onKeyDown={handleSearchKeyDown}
            onBlur={closeListbox}
          />
          <ul
            id={LISTBOX_ID}
            role="listbox"
            aria-label="Matching shortcuts"
            className={cn(
              "absolute inset-x-0 top-full z-[3] mt-1 m-0 list-none overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md",
              !expanded && "hidden",
            )}
          >
            {suggestions.map((suggestion, index) => (
              <li
                key={suggestion}
                id={suggestionOptionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                className={cn(
                  "cursor-pointer rounded-md px-2 py-1.5 text-xs",
                  index === activeIndex && "bg-accent text-accent-foreground",
                )}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => setActiveIndex(index)}
                onClick={() => acceptSuggestion(suggestion)}
              >
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-1.5 flex min-h-4 items-center justify-between gap-2">
          <p role="status" className="m-0 text-[11px] text-muted-foreground">
            {trimmedQuery.length > 0
              ? `${matchCount} shortcut${matchCount === 1 ? "" : "s"} match — press Enter to rebind the first`
              : ""}
          </p>
          {hasOverrides && (
            <button
              type="button"
              className={cn(settingsButton, settingsButtonDanger, "px-2 py-0.5 text-[11px]")}
              aria-label="Reset all shortcuts to defaults"
              onClick={() => clearAllShortcutOverrides(store)}
            >
              Reset all
            </button>
          )}
        </div>
      </div>
      {trimmedQuery.length > 0 && matchCount === 0 && (
        <p className="text-sm text-muted-foreground">
          No shortcuts match “{trimmedQuery}”.
        </p>
      )}
      {groups.map(({ group, definitions }) => (
        <div key={group} className={settingsGroup}>
          <div className={settingsGroupTitle}>{group}</div>
          {definitions.map((definition) => (
            <div key={definition.id} className={settingsRow}>
              <span className={settingsRowLabel}>{definition.label}</span>
              <ShortcutRecorder
                value={effectiveShortcutKeys(definition, overrides)}
                isDefault={isDefaultBinding(definition, overrides)}
                aria-label={`Change shortcut for ${definition.label}`}
                handleRef={(handle) => {
                  if (handle) {
                    recorderHandles.current.set(definition.id, handle);
                  } else {
                    recorderHandles.current.delete(definition.id);
                  }
                }}
                onRecordingChange={(recording) => {
                  recordingCountRef.current += recording ? 1 : -1;
                }}
                onRecord={(combo) => {
                  const conflict = findShortcutConflict(overrides, definition.id, combo);
                  if (conflict) {
                    return conflict.slot === "secondary"
                      ? `Already an alternate for “${conflict.label}”`
                      : `Already used by “${conflict.label}”`;
                  }
                  if (sameCombo(combo, effectiveShortcutKeys(definition, overrides))) {
                    return null;
                  }
                  setShortcutOverride(store, definition.id, combo);
                  return null;
                }}
                onReset={() => clearShortcutOverride(store, definition.id)}
              />
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
