import { settingsCopy } from "@/shared/ui/settings-copy";
import { useEffect, useRef, useState } from "react";
import type { MutableRefObject, KeyboardEvent as ReactKeyboardEvent } from "react";
import { formatShortcut } from "@remcostoeten/use-shortcut/formatter";
import {
  clearAllShortcutOverrides,
  clearShortcutOverride,
  setQuitShortcutEnabled,
  setShortcutOverride,
} from "@/features/settings/update-settings";
import { SearchIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { ShortcutRecorder } from "@/shared/ui/shortcut-recorder";
import type { ShortcutRecorderHandle } from "@/shared/ui/shortcut-recorder";
import {
  QUIT_ACTION_ID,
  effectiveShortcutKeys,
  findShortcutConflict,
  isDefaultBinding,
  quitComboError,
  sameCombo,
  sameShortcutOverrides,
  selectShortcutOverrides,
  shortcutShadowedByQuit,
} from "@/commands/bindings";
import type { ShortcutDefinition } from "@/commands/definitions";
import {
  filterShortcutSettings,
  shortcutSearchSuggestions,
  shortcutSettingsCount,
} from "@/commands/settings-search";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import {
  selectQuitShortcutEnabled,
  selectStoredShortcutOverrides,
} from "@/features/settings/selectors";
import {
  SettingsGroup,
  SettingsRow,
  settingsButton,
  settingsButtonDanger,
  settingsFieldFocus,
  settingsRowDescription,
  settingsSection,
  settingsToggleInput,
} from "@/shared/ui/settings-controls";
import { useSettingsLedger } from "@/shared/ui/settings-ledger";
import type { SectionProps } from "@/features/settings-dialog/sections";
import { shortcutGroupId } from "@/features/settings-dialog/navigation";

const LISTBOX_ID = "shortcut-search-listbox";

function suggestionOptionId(index: number): string {
  return `shortcut-search-option-${index}`;
}

export function ShortcutsSection({
  store,
  recordingCountRef,
}: SectionProps & { recordingCountRef: MutableRefObject<number> }) {
  const overrides = useRendererSelector(store, selectShortcutOverrides, sameShortcutOverrides);
  const storedOverrides = useRendererSelector(
    store,
    selectStoredShortcutOverrides,
    sameShortcutOverrides,
  );
  const quitEnabled = useRendererSelector(store, selectQuitShortcutEnabled);
  const ledger = useSettingsLedger();
  const [query, setQuery] = useState("");
  const [listboxOpen, setListboxOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const recorderHandles = useRef(new Map<string, ShortcutRecorderHandle>());
  const searching = Boolean(ledger?.search);
  const groups = filterShortcutSettings(storedOverrides, ledger?.search ? ledger.query : query);
  const matchCount = shortcutSettingsCount(groups);
  const suggestions = shortcutSearchSuggestions(storedOverrides, query);
  const expanded = listboxOpen && suggestions.length > 0;
  const trimmedQuery = query.trim();
  const overrideCount = Object.keys(storedOverrides).length;
  const hasOverrides = overrideCount > 0;

  useEffect(() => {
    function handleWindowKeyDown(event: KeyboardEvent): void {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
        return;
      }
      if (event.key.toLowerCase() !== "f" || recordingCountRef.current > 0 || searching) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [recordingCountRef, searching]);

  function recordShortcut(definition: ShortcutDefinition, combo: string): string | null {
    if (definition.id === QUIT_ACTION_ID) {
      const error = quitComboError(combo);
      if (error) {
        return error;
      }
    } else {
      const conflict = findShortcutConflict(overrides, definition.id, combo);
      if (conflict?.actionId === QUIT_ACTION_ID) {
        return settingsCopy.shortcuts.reservedForQuit;
      }
      if (conflict) {
        return conflict.slot === "secondary"
          ? `Already an alternate for “${conflict.label}”`
          : `Already used by “${conflict.label}”`;
      }
    }
    if (sameCombo(combo, effectiveShortcutKeys(definition, storedOverrides))) {
      return null;
    }
    setShortcutOverride(store, definition.id, combo);
    return null;
  }

  function rowDescription(definition: ShortcutDefinition): string | null {
    if (definition.id === QUIT_ACTION_ID) {
      return settingsCopy.shortcuts.twoOrThreeKeysHoldingCtrl;
    }
    const keys = effectiveShortcutKeys(definition, overrides);
    return shortcutShadowedByQuit(definition, keys, overrides)
      ? settingsCopy.shortcuts.unboundWhileQuitUsesTheSame
      : null;
  }

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
      <SettingsGroup
        id="all"
        title="All shortcuts"
        hint={settingsCopy.shortcuts.clickAShortcutThenPressA}
        keywords="keys hotkeys remap commands bindings filter find"
      >
        <SettingsRow
          label="Filter shortcuts"
          detail={`${formatShortcut("mod+f")} jumps here from anywhere on this page.`}
          notes={
            <span role="status" className={settingsRowDescription}>
              {trimmedQuery.length > 0
                ? `${matchCount} shortcut${matchCount === 1 ? "" : "s"} match. Press Enter to rebind the first`
                : ""}
            </span>
          }
          className="items-start"
        >
          <div className="group relative w-[min(240px,48%)] max-[620px]:w-full">
            <SearchIcon
              size={13}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-[9px] -translate-y-1/2 text-theme-dim transition-colors duration-150 group-focus-within:text-foreground"
            />
            <input
              ref={searchInputRef}
              type="search"
              role="combobox"
              value={query}
              className={cn(
                "h-[30px] w-full rounded-[7px] border border-border bg-background py-[5px] pr-2.5 pl-7 text-[12.5px] text-foreground placeholder:text-theme-dim [&::-webkit-search-cancel-button]:hidden",
                settingsFieldFocus,
              )}
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
                    index === activeIndex && "bg-theme-hover text-foreground",
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
        </SettingsRow>
        {hasOverrides && (
          <SettingsRow
            label={settingsCopy.shortcuts.resetAllShortcutsToDefaults}
            detail={`${overrideCount} changed ${overrideCount === 1 ? "binding" : "bindings"}. Other preferences are not affected.`}
            changed
          >
            <button
              type="button"
              className={cn(settingsButton, settingsButtonDanger)}
              aria-label={settingsCopy.shortcuts.resetAllShortcutsToDefaults}
              onClick={() => clearAllShortcutOverrides(store)}
            >
              Reset all
            </button>
          </SettingsRow>
        )}
        {!searching && trimmedQuery.length > 0 && matchCount === 0 && (
          <p className="m-0 py-3 text-xs text-theme-secondary">
            {settingsCopy.shortcuts.noShortcutsMatch}
            {trimmedQuery}”.
          </p>
        )}
      </SettingsGroup>
      {groups.map(({ group, definitions }) => (
        <SettingsGroup key={group} id={shortcutGroupId(group)} title={group}>
          {definitions.map((definition) => (
            <SettingsRow
              key={definition.id}
              label={definition.label}
              detail={rowDescription(definition)}
              changed={!isDefaultBinding(definition, storedOverrides)}
              className="min-h-10 py-[7px]"
            >
              <span className="flex items-center gap-2.5">
                {definition.id === QUIT_ACTION_ID && (
                  <input
                    type="checkbox"
                    data-directional-focus
                    className={settingsToggleInput}
                    checked={quitEnabled}
                    aria-label={settingsCopy.shortcuts.quitWithAKeyboardShortcut}
                    onChange={(event) => setQuitShortcutEnabled(store, event.currentTarget.checked)}
                  />
                )}
                <ShortcutRecorder
                  value={effectiveShortcutKeys(definition, storedOverrides)}
                  isDefault={isDefaultBinding(definition, storedOverrides)}
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
                  onRecord={(combo) => recordShortcut(definition, combo)}
                  onReset={() => clearShortcutOverride(store, definition.id)}
                />
              </span>
            </SettingsRow>
          ))}
        </SettingsGroup>
      ))}
    </section>
  );
}
