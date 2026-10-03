import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { activateNote } from "@/features/notes/navigation";
import { appRouteHash } from "@skriuw/renderer-core/route/app-route";
import { isBrowserRuntime } from "@/platform/runtime/runtime";
import { journalEntryDateKey } from "@/features/journal/model";
import { openJournalDay } from "@/features/journal/navigation";
import { CloseIcon, SearchIcon } from "@/shared/icons/static";
import { cn } from "@/shared/styling/class-names";
import { Dialog } from "@/shared/ui/dialog";
import { settingsPress, settingsTransition } from "@/shared/ui/settings-controls";
import {
  activeSettingsSection,
  filterSettingsSections,
  moveSettingsSection,
  rovingSettingsSection,
  settingsSearchEscape,
  settingsSearchSnippet,
} from "./navigation";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { AboutSection } from "@/features/settings-dialog/about/section";
import { AppearanceSection } from "@/features/settings-dialog/appearance/section";
import { DataSection } from "@/features/settings-dialog/data/section";
import { EditorSection } from "@/features/settings-dialog/editor/section";
import { LockSection } from "@/features/settings-dialog/lock/section";
import { MediaSection } from "@/features/media/media-library-section";
import {
  SECTIONS,
  availableSettingsSections,
  groupSettingsSections,
} from "@/features/settings-dialog/sections";
import type {
  SectionGroups,
  SectionId,
  SettingsSection,
} from "@/features/settings-dialog/sections";
import { selectEditorPlaceholder } from "@/features/settings/selectors";
import { ShortcutsSection } from "@/features/settings-dialog/shortcuts/section";
import { AiOptInGate, selectAiEnabled } from "@/features/ai/opt-in-gate";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";

const AccountSection = lazy(async () => {
  const module = await import("@/features/settings-dialog/account/section");
  return { default: module.AccountSection };
});

const AiSection = lazy(async () => {
  const module = await import("@/features/settings-dialog/ai/section");
  return { default: module.AiSection };
});

const BROWSER_RUNTIME = isBrowserRuntime();

const sectionGroupClass = "flex flex-col gap-0.5 max-[620px]:contents";

const sectionTabClass = cn(
  "flex min-h-[38px] items-center gap-2 rounded-lg border-0 bg-transparent px-[9px] py-1.5 text-left text-[13px] text-muted-foreground cursor-pointer hover:bg-muted hover:text-foreground max-[620px]:min-h-[34px] max-[620px]:flex-none",
  "focus-visible:[--focus-fill:hsl(var(--foreground)/0.09)] aria-selected:focus-visible:[--focus-fill:hsl(var(--foreground)/0.07)]",
  settingsTransition,
);

type Props = {
  store: RendererStore;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestSignIn: () => void;
  /** Owned by the shell so surfaces outside the dialog can open a chosen section. */
  section: SectionId;
  onSectionChange: (section: SectionId) => void;
};

export function SettingsDialog({
  store,
  open,
  onOpenChange,
  onRequestSignIn,
  section,
  onSectionChange: setSection,
}: Props) {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const recordingCountRef = useRef(0);
  const aiEnabled = useRendererSelector(store, selectAiEnabled);
  const editorPlaceholder = useRendererSelector(store, selectEditorPlaceholder);
  const availableSections = useMemo(
    () => availableSettingsSections(aiEnabled, BROWSER_RUNTIME, editorPlaceholder),
    [aiEnabled, editorPlaceholder],
  );
  const filteredSections = useMemo(
    () => filterSettingsSections(availableSections, query),
    [availableSections, query],
  );
  const sectionGroups = useMemo<SectionGroups>(
    () => (query ? { top: filteredSections, bottom: [] } : groupSettingsSections(filteredSections)),
    [filteredSections, query],
  );
  const availableIds = availableSections.map((entry) => entry.id);
  const filteredIds = filteredSections.map((entry) => entry.id);
  const rovingSection = rovingSettingsSection(filteredIds, section);
  const activeSection = activeSettingsSection(filteredIds, availableIds, section) ?? "appearance";
  const activeMeta = SECTIONS.find((entry) => entry.id === activeSection) ?? SECTIONS[0];

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  function focusSection(id: SectionId): void {
    requestAnimationFrame(() => {
      document.getElementById(`settings-tab-${id}`)?.focus();
    });
  }

  function focusFirstSetting(): void {
    requestAnimationFrame(() => {
      contentRef.current
        ?.querySelector<HTMLElement>(
          "section select:not([disabled]), section input:not([disabled]), section button:not([disabled]), section a[href]",
        )
        ?.focus();
    });
  }

  function renderSectionTab(entry: SettingsSection) {
    const active = activeSection === entry.id;
    return (
      <button
        key={entry.id}
        id={`settings-tab-${entry.id}`}
        type="button"
        role="tab"
        data-section-id={entry.id}
        tabIndex={rovingSection === entry.id ? 0 : -1}
        className={cn(sectionTabClass, active && "bg-accent text-accent-foreground")}
        aria-selected={active}
        aria-controls="settings-tabpanel"
        onClick={() => setSection(entry.id)}
      >
        <entry.icon size={15} aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col gap-[3px] leading-[1.05]">
          <span className="truncate">{entry.label}</span>
          {query && (
            <span className="truncate text-[10px] text-muted-foreground">
              {settingsSearchSnippet(entry, query) ?? entry.description}
            </span>
          )}
        </span>
      </button>
    );
  }

  function handleDialogCancel(event: Event): void {
    if (recordingCountRef.current > 0) {
      event.preventDefault();
    }
  }

  function handleDialogKeyDown(event: KeyboardEvent): void {
    if (event.key === "/" && !isTypingTarget(event.target)) {
      event.preventDefault();
      searchRef.current?.focus();
      return;
    }
    if (event.key.toLocaleLowerCase() === "e" && event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (rovingSection) {
        focusSection(rovingSection);
      }
      return;
    }
    if (event.key !== "F6") {
      return;
    }
    event.preventDefault();
    const activeTab = rovingSection
      ? document.getElementById(`settings-tab-${rovingSection}`)
      : null;
    const regions = [searchRef.current, activeTab, contentRef.current].filter(
      (region): region is HTMLElement => region !== null,
    );
    const active = document.activeElement;
    const currentIndex = Math.max(
      0,
      regions.findIndex((region) => region === active || region.contains(active)),
    );
    const offset = event.shiftKey ? -1 : 1;
    regions[(currentIndex + offset + regions.length) % regions.length]?.focus();
  }

  function handleNavKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.getAttribute("role") !== "tab") {
      return;
    }
    const current = target.dataset.sectionId as SectionId | undefined;
    if (!current) {
      return;
    }
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowRight") {
      event.preventDefault();
      setSection(current);
      focusFirstSetting();
      return;
    }
    if (
      event.key !== "ArrowDown" &&
      event.key !== "ArrowUp" &&
      event.key !== "Home" &&
      event.key !== "End"
    ) {
      return;
    }
    event.preventDefault();
    if (event.key === "ArrowUp" && filteredIds[0] === current) {
      searchRef.current?.focus();
      return;
    }
    const next = moveSettingsSection(filteredIds, current, event.key);
    if (next) {
      setSection(next);
      focusSection(next);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      className={cn(
        "w-[min(896px,calc(100vw-48px))] h-[min(720px,calc(var(--viewport-height)-64px))] max-h-[calc(var(--viewport-height)-64px)]",
        "dialog-fullscreen focus-fill",
      )}
      onKeyDown={handleDialogKeyDown}
      onCancel={handleDialogCancel}
      showHeader={false}
    >
      <div className="flex h-full min-h-0 max-[620px]:flex-col">
        <nav
          ref={navRef}
          className="flex w-[220px] flex-none flex-col gap-0.5 border-r border-border bg-sidebar px-2.5 pt-3.5 pb-2.5 max-[620px]:w-auto max-[620px]:grid max-[620px]:grid-cols-1 max-[620px]:border-r-0 max-[620px]:border-b max-[620px]:border-border max-[620px]:p-2.5"
          aria-label="Settings sections"
          onKeyDown={handleNavKeyDown}
        >
          <div className="group relative mx-0.5 mb-3 flex-none max-[620px]:mx-0 max-[620px]:mb-2 max-[620px]:w-full">
            <SearchIcon
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-[9px] -translate-y-1/2 text-muted-foreground transition-colors duration-150 group-focus-within:text-foreground"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              className="h-8 w-full rounded-lg border border-sidebar-border bg-background/[62%] py-[5px] pr-8 pl-[30px] text-xs text-sidebar-foreground outline-0 placeholder:text-muted-foreground/[78%] [&::-webkit-search-cancel-button]:hidden transition-[background-color,border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-foreground/20 focus-visible:border-foreground/35 focus-visible:bg-background"
              placeholder="Search settings"
              aria-label="Search settings"
              aria-controls="settings-tablist"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  const action = settingsSearchEscape(query, recordingCountRef.current > 0);
                  if (action === "clear-query") {
                    setQuery("");
                  } else if (action === "close-dialog") {
                    onOpenChange(false);
                  }
                  return;
                }
                if (event.key === "ArrowDown" && rovingSection) {
                  event.preventDefault();
                  focusSection(rovingSection);
                  return;
                }
                if (event.key === "Enter" && filteredSections[0]) {
                  event.preventDefault();
                  setSection(filteredSections[0].id);
                  focusFirstSetting();
                }
              }}
            />
            <kbd
              className="absolute top-1/2 right-[7px] min-w-[18px] -translate-y-1/2 rounded-md border border-sidebar-border bg-background/[66%] px-[5px] py-px text-center font-mono text-[10px] leading-[1.45] text-muted-foreground transition-opacity duration-150 group-focus-within:opacity-0"
              aria-hidden="true"
            >
              /
            </kbd>
          </div>
          <div
            id="settings-tablist"
            role="tablist"
            aria-orientation="vertical"
            aria-label="Settings sections"
            className="flex min-h-0 flex-1 flex-col gap-0.5 max-[620px]:flex-row max-[620px]:overflow-x-auto"
          >
            <div role="presentation" className={sectionGroupClass}>
              {sectionGroups.top.map(renderSectionTab)}
            </div>
            {sectionGroups.bottom.length > 0 && (
              <div
                role="presentation"
                className={cn(
                  sectionGroupClass,
                  "mt-auto border-t border-sidebar-border pt-2 max-[620px]:border-t-0 max-[620px]:pt-0",
                )}
              >
                {sectionGroups.bottom.map(renderSectionTab)}
              </div>
            )}
          </div>
          {filteredSections.length === 0 && (
            <p className="mx-1.5 my-0.5 text-xs leading-[1.45] text-muted-foreground">
              No settings match “{query.trim()}”.
            </p>
          )}
          <p className="mt-auto mx-1 flex items-center gap-[5px] pt-3 text-[10px] whitespace-nowrap text-muted-foreground/[78%] max-[620px]:hidden">
            <kbd className="rounded-md border border-sidebar-border bg-background/50 px-1 py-px font-mono text-[9px]">
              /
            </kbd>{" "}
            Search <span aria-hidden="true">·</span>{" "}
            <kbd className="rounded-md border border-sidebar-border bg-background/50 px-1 py-px font-mono text-[9px]">
              Ctrl E
            </kbd>{" "}
            Sections
          </p>
        </nav>
        <div
          ref={contentRef}
          id="settings-tabpanel"
          role="tabpanel"
          aria-label={`${activeMeta.label} settings`}
          tabIndex={0}
          className="relative min-w-0 flex-1 overflow-y-auto px-10 pt-8 pb-12 transition-[background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:bg-[hsl(var(--foreground)/3%)] max-[620px]:px-[18px] max-[620px]:pt-6 max-[620px]:pb-9"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" && event.target === event.currentTarget) {
              event.preventDefault();
              if (rovingSection) {
                focusSection(rovingSection);
              }
            }
          }}
        >
          <button
            type="button"
            className={cn(
              "absolute top-4 right-4 z-[1] flex h-7 w-7 items-center justify-center rounded-lg border-0 bg-transparent p-0 text-muted-foreground cursor-pointer hover:bg-accent hover:text-foreground",
              settingsTransition,
              settingsPress,
            )}
            aria-label="Close settings"
            onClick={() => onOpenChange(false)}
          >
            <CloseIcon size={16} />
          </button>
          {activeSection === "appearance" && <AppearanceSection store={store} />}
          {activeSection === "account" && (
            <Suspense fallback={<p className="text-sm text-muted-foreground">Loading account…</p>}>
              <AccountSection store={store} onRequestSignIn={onRequestSignIn} />
            </Suspense>
          )}
          {activeSection === "editor" && <EditorSection store={store} />}
          {activeSection === "lock" && <LockSection store={store} />}
          {activeSection === "ai" && (
            <AiOptInGate store={store}>
              {(signal) => (
                <Suspense fallback={null}>
                  <AiSection
                    store={store}
                    signal={signal}
                    onOpenPlayground={() => {
                      window.location.hash = appRouteHash("prompt-playground");
                      onOpenChange(false);
                    }}
                  />
                </Suspense>
              )}
            </AiOptInGate>
          )}
          {activeSection === "shortcuts" && (
            <ShortcutsSection store={store} recordingCountRef={recordingCountRef} />
          )}
          {activeSection === "media" && (
            <MediaSection
              store={store}
              onOpenReference={(usage) => {
                if (usage.surface === "journal") {
                  const dateKey = journalEntryDateKey(store.getState(), usage.noteId);
                  if (dateKey !== null) openJournalDay(dateKey);
                } else {
                  activateNote(store, usage.noteId);
                }
                onOpenChange(false);
              }}
            />
          )}
          {activeSection === "data" && <DataSection store={store} />}
          {activeSection === "about" && <AboutSection />}
        </div>
      </div>
    </Dialog>
  );
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
