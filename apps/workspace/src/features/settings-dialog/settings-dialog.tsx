import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from "react";
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
  SettingsLedgerContext,
  createLedgerRegistry,
  ledgerGroupDomId,
} from "@/shared/ui/settings-ledger";
import type { SettingsLedger } from "@/shared/ui/settings-ledger";
import {
  activeSettingsSection,
  keywordOnlySections,
  moveSettingsSection,
  rovingSettingsSection,
  searchSettingsRows,
  settingsSearchEscape,
  settingsSearchSnippet,
  shortcutGroupId,
} from "./navigation";
import type { SettingsGroupHit } from "./navigation";
import { SETTINGS_SEARCH_GROUPS } from "./search-copy.generated";
import { SettingsOutline } from "./outline";
import { SettingsSearchResults } from "./search-results";
import type { SettingsJump } from "./search-results";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { AboutSection } from "@/features/settings-dialog/about/section";
import { AppearanceSection } from "@/features/settings-dialog/appearance/section";
import { DataSection } from "@/features/settings-dialog/data/section";
import { EditorSection } from "@/features/settings-dialog/editor/section";
import { LockSection } from "@/features/settings-dialog/lock/section";
import { MediaSection } from "@/features/media/media-library-section";
import {
  SECTIONS,
  SECTION_GROUP_LABELS,
  availableSettingsSections,
  groupSettingsSections,
} from "@/features/settings-dialog/sections";
import type { SectionId, SettingsSection } from "@/features/settings-dialog/sections";
import {
  selectEditorPlaceholder,
  selectStoredShortcutOverrides,
} from "@/features/settings/selectors";
import { ShortcutsSection } from "@/features/settings-dialog/shortcuts/section";
import { AiOptInGate, selectAiEnabled } from "@/features/ai/opt-in-gate";
import { useRendererSelector } from "@skriuw/renderer-core/store/use-renderer-selector";
import { sameShortcutOverrides } from "@/commands/bindings";
import { filterShortcutSettings } from "@/commands/settings-search";

const AccountSection = lazy(async () => {
  const module = await import("@/features/settings-dialog/account/section");
  return { default: module.AccountSection };
});

const AiSection = lazy(async () => {
  const module = await import("@/features/settings-dialog/ai/section");
  return { default: module.AiSection };
});

const BROWSER_RUNTIME = isBrowserRuntime();
const REVEAL_ATTEMPTS = 40;
const FOCUSABLE =
  "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [role='radio'][tabindex='0']";

const sectionTabClass = cn(
  "flex min-h-8 w-full items-center gap-[9px] rounded-[7px] border-0 bg-transparent px-[9px] py-[5px] text-left text-[13px] text-theme-secondary cursor-pointer hover:bg-theme-hover/55 hover:text-foreground aria-selected:bg-theme-hover aria-selected:text-foreground max-[620px]:w-auto max-[620px]:flex-none",
  "focus-visible:[--focus-fill:hsl(var(--theme-bg-hover))] aria-selected:focus-visible:[--focus-fill:hsl(var(--theme-bg-active))]",
  settingsTransition,
);

const kbdClass =
  "rounded-[5px] border border-theme-divider bg-theme-hover/55 px-[5px] font-mono text-[10px] leading-[1.5] text-theme-secondary";

type Props = {
  store: RendererStore;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequestSignIn: () => void;
  /** Owned by the shell so surfaces outside the dialog can open a chosen section. */
  section: SectionId;
  onSectionChange: (section: SectionId) => void;
};

function shortcutHits(groups: ReturnType<typeof filterShortcutSettings>): SettingsGroupHit[] {
  return groups.map(({ group, definitions }) => ({
    id: shortcutGroupId(group),
    title: group,
    rows: definitions.map((definition) => ({
      label: definition.label,
      detail: definition.description ?? "",
    })),
    wholeGroup: true,
  }));
}

export function SettingsDialog({
  store,
  open,
  onOpenChange,
  onRequestSignIn,
  section,
  onSectionChange: setSection,
}: Props) {
  const [query, setQuery] = useState("");
  const [registry] = useState(createLedgerRegistry);
  const searchRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  const recordingCountRef = useRef(0);
  const aiEnabled = useRendererSelector(store, selectAiEnabled);
  const editorPlaceholder = useRendererSelector(store, selectEditorPlaceholder);
  const shortcutOverrides = useRendererSelector(
    store,
    selectStoredShortcutOverrides,
    sameShortcutOverrides,
  );
  const availableSections = useMemo(
    () => availableSettingsSections(aiEnabled, BROWSER_RUNTIME, editorPlaceholder),
    [aiEnabled, editorPlaceholder],
  );
  const searching = query.trim().length > 0;
  const hits = useMemo(
    () =>
      searchSettingsRows(
        availableSections,
        (entry) => SETTINGS_SEARCH_GROUPS[entry.id],
        query,
        (entry) =>
          entry.id === "shortcuts"
            ? shortcutHits(filterShortcutSettings(shortcutOverrides, query))
            : [],
      ),
    [availableSections, query, shortcutOverrides],
  );
  const keywordOnly = useMemo(
    () => keywordOnlySections(availableSections, hits, query),
    [availableSections, hits, query],
  );
  const hitIds = new Set(hits.map((hit) => hit.section.id));
  const filteredSections = searching
    ? availableSections.filter(
        (entry) => hitIds.has(entry.id) || keywordOnly.some((match) => match.id === entry.id),
      )
    : availableSections;
  const availableIds = availableSections.map((entry) => entry.id);
  const filteredIds = filteredSections.map((entry) => entry.id);
  const rovingSection = rovingSettingsSection(filteredIds, section);
  const activeSection = activeSettingsSection(filteredIds, availableIds, section) ?? "appearance";
  const activeMeta = SECTIONS.find((entry) => entry.id === activeSection) ?? SECTIONS[0];
  const sectionGroups = groupSettingsSections(filteredSections);
  const ledger: SettingsLedger = {
    sectionId: activeSection,
    sectionLabel: activeMeta.label,
    registry,
    query: "",
    search: null,
  };

  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  useLayoutEffect(() => {
    const content = contentRef.current;
    if (content) {
      content.scrollTop = 0;
    }
    barRef.current?.removeAttribute("data-scrolled");
  }, [activeSection, searching]);

  function focusSection(id: SectionId): void {
    requestAnimationFrame(() => {
      document.getElementById(`settings-tab-${id}`)?.focus();
    });
  }

  function focusFirstSetting(): void {
    requestAnimationFrame(() => {
      contentRef.current?.querySelector<HTMLElement>(`section :is(${FOCUSABLE})`)?.focus();
    });
  }

  function reveal(jump: SettingsJump, attempt = 0): void {
    const content = contentRef.current;
    const group =
      jump.groupId === undefined
        ? null
        : document.getElementById(ledgerGroupDomId(jump.sectionId, jump.groupId));
    if (!content || (jump.groupId !== undefined && !group)) {
      if (attempt < REVEAL_ATTEMPTS) {
        requestAnimationFrame(() => reveal(jump, attempt + 1));
      }
      return;
    }
    if (!group) {
      focusFirstSetting();
      return;
    }
    const row =
      jump.rowLabel === undefined
        ? null
        : group.querySelector<HTMLElement>(`[data-settings-row="${CSS.escape(jump.rowLabel)}"]`);
    const target = row ?? group;
    target.scrollIntoView({ block: row ? "center" : "start" });
    target.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
  }

  function jumpTo(jump: SettingsJump): void {
    setQuery("");
    setSection(jump.sectionId);
    requestAnimationFrame(() => reveal(jump));
  }

  function scrollToGroup(groupId: string, focusControl: boolean): void {
    const group = document.getElementById(ledgerGroupDomId(activeSection, groupId));
    if (!group) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    group.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    if (focusControl) {
      group.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
    }
  }

  function enterFirstResult(): void {
    const hit = hits[0];
    const group = hit?.groups[0];
    if (hit && group) {
      jumpTo({ sectionId: hit.section.id, groupId: group.id, rowLabel: group.rows[0]?.label });
      return;
    }
    const keywordHit = keywordOnly[0];
    if (keywordHit) {
      jumpTo({ sectionId: keywordHit.id });
    }
  }

  function selectTab(id: SectionId): void {
    setSection(id);
    if (searching) {
      requestAnimationFrame(() => {
        contentRef.current
          ?.querySelector<HTMLElement>(`[data-results-section="${id}"]`)
          ?.scrollIntoView({ block: "start" });
      });
    }
  }

  function renderSection(id: SectionId): ReactNode {
    switch (id) {
      case "appearance":
        return <AppearanceSection store={store} />;
      case "account":
        return (
          <Suspense fallback={<p className="text-sm text-theme-secondary">Loading account…</p>}>
            <AccountSection store={store} onRequestSignIn={onRequestSignIn} />
          </Suspense>
        );
      case "editor":
        return <EditorSection store={store} />;
      case "lock":
        return <LockSection store={store} />;
      case "ai":
        return (
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
        );
      case "shortcuts":
        return <ShortcutsSection store={store} recordingCountRef={recordingCountRef} />;
      case "media":
        return (
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
        );
      case "data":
        return <DataSection store={store} />;
      case "about":
        return <AboutSection />;
    }
  }

  function renderSectionTab(entry: SettingsSection) {
    const active = activeSection === entry.id;
    const hit = searching ? hits.find((candidate) => candidate.section.id === entry.id) : undefined;
    const firstRow = hit?.groups[0]?.rows[0]?.label ?? hit?.groups[0]?.title;
    return (
      <button
        key={entry.id}
        id={`settings-tab-${entry.id}`}
        type="button"
        role="tab"
        data-section-id={entry.id}
        tabIndex={rovingSection === entry.id ? 0 : -1}
        className={sectionTabClass}
        aria-selected={active}
        aria-controls="settings-tabpanel"
        onClick={() => selectTab(entry.id)}
      >
        <entry.icon size={15} aria-hidden="true" className="flex-none opacity-85" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 leading-[1.15]">
          <span className="truncate">{entry.label}</span>
          {searching && (
            <span className="truncate text-[10.5px] text-theme-dim">
              {firstRow ?? settingsSearchSnippet(entry, query) ?? entry.description}
            </span>
          )}
        </span>
        {searching && hit ? (
          <span className="text-[10.5px] tabular-nums text-theme-dim">{hit.count}</span>
        ) : null}
      </button>
    );
  }

  function renderNavEntry(entry: SettingsSection) {
    return [
      renderSectionTab(entry),
      <SettingsOutline
        key={`${entry.id}-outline`}
        open={!searching && entry.id === activeSection}
        registry={registry}
        scrollerRef={contentRef}
        onJump={(groupId) => scrollToGroup(groupId, false)}
      />,
    ];
  }

  function handleDialogCancel(event: Event): void {
    if (recordingCountRef.current > 0) {
      event.preventDefault();
    }
  }

  function handleDialogKeyDown(event: KeyboardEvent): void {
    if (event.key === "Escape" && event.target === searchRef.current) {
      const action = settingsSearchEscape(query, recordingCountRef.current > 0);
      if (action !== "close-dialog") {
        event.preventDefault();
      }
      if (action === "clear-query") {
        setQuery("");
      }
      return;
    }
    if (event.key === "/" && !isTypingTarget(event.target)) {
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
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
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const outlineId = target.dataset.outlineItem;
    const current = target.getAttribute("role") === "tab" ? target.dataset.sectionId : undefined;
    const tabId = filteredIds.find((id) => id === current);
    if (outlineId === undefined && tabId === undefined) {
      return;
    }
    if (event.key === "Enter" || event.key === " " || event.key === "ArrowRight") {
      event.preventDefault();
      if (outlineId !== undefined) {
        scrollToGroup(outlineId, true);
        return;
      }
      if (tabId) {
        selectTab(tabId);
        if (searching) {
          enterFirstResult();
        } else {
          focusFirstSetting();
        }
      }
      return;
    }
    if (tabId && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      const next = moveSettingsSection(filteredIds, tabId, event.key);
      if (next) {
        selectTab(next);
        focusSection(next);
      }
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
      return;
    }
    event.preventDefault();
    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[role='tab'], [data-outline-item]"),
    );
    const index = items.indexOf(target);
    if (event.key === "ArrowUp" && index === 0) {
      searchRef.current?.focus();
      return;
    }
    const next =
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
    const nextTab = filteredIds.find((id) => id === next?.dataset.sectionId);
    if (next?.getAttribute("role") === "tab" && nextTab) {
      selectTab(nextTab);
      focusSection(nextTab);
      return;
    }
    next?.focus();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      className={cn(
        "w-[min(896px,calc(100vw-48px))] h-[min(720px,calc(var(--viewport-height)-64px))] max-h-[calc(var(--viewport-height)-64px)]",
        "dialog-fullscreen focus-fill settings-dialog",
      )}
      onKeyDown={handleDialogKeyDown}
      onCancel={handleDialogCancel}
      showHeader={false}
    >
      <div className="flex h-full min-h-0 max-[620px]:flex-col">
        <nav
          className="flex w-[220px] flex-none flex-col border-r border-theme-divider bg-theme-deep px-2.5 pt-3 pb-2.5 text-theme-secondary max-[620px]:w-auto max-[620px]:border-r-0 max-[620px]:border-b max-[620px]:p-2.5"
          aria-label="Settings sections"
          onKeyDown={handleNavKeyDown}
        >
          <div className="group relative mx-0.5 mb-3 flex-none max-[620px]:mx-0 max-[620px]:mb-2">
            <SearchIcon
              size={13}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-[9px] -translate-y-1/2 text-theme-secondary transition-colors duration-150 group-focus-within:text-foreground"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              className="h-8 w-full rounded-lg border border-border bg-background py-0 pr-[30px] pl-[29px] text-[12.5px] text-foreground outline-0 placeholder:text-theme-dim [&::-webkit-search-cancel-button]:hidden transition-[border-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-theme-btn-outline focus-visible:border-ring"
              placeholder="Search settings"
              aria-label="Search settings"
              aria-controls="settings-tablist"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown" && rovingSection) {
                  event.preventDefault();
                  focusSection(rovingSection);
                  return;
                }
                if (event.key === "Enter" && searching) {
                  event.preventDefault();
                  enterFirstResult();
                }
              }}
            />
            <kbd
              className={cn(
                kbdClass,
                "absolute top-1/2 right-[7px] min-w-[18px] -translate-y-1/2 text-center transition-opacity duration-150 group-focus-within:opacity-0",
              )}
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
            className="flex min-h-0 flex-1 flex-col gap-px overflow-y-auto [scrollbar-width:thin] max-[620px]:flex-row max-[620px]:overflow-x-auto"
          >
            {searching ? (
              filteredSections.map(renderSectionTab)
            ) : (
              <>
                <div
                  role="presentation"
                  className="px-[9px] pb-[5px] text-[11px] text-theme-dim max-[620px]:hidden"
                >
                  {SECTION_GROUP_LABELS.top}
                </div>
                {sectionGroups.top.flatMap(renderNavEntry)}
                {sectionGroups.bottom.length > 0 && (
                  <div
                    role="presentation"
                    className="px-[9px] pt-2.5 pb-[5px] text-[11px] text-theme-dim max-[620px]:hidden"
                  >
                    {SECTION_GROUP_LABELS.bottom}
                  </div>
                )}
                {sectionGroups.bottom.flatMap(renderNavEntry)}
              </>
            )}
            {searching && filteredSections.length === 0 && (
              <p className="mx-1.5 my-0.5 text-xs leading-[1.45] text-theme-secondary">
                No settings match “{query.trim()}”.
              </p>
            )}
          </div>
          <p
            className="mt-auto flex flex-wrap gap-x-2.5 gap-y-1 px-1 pt-3 text-[10.5px] whitespace-nowrap text-theme-dim max-[620px]:hidden"
            aria-hidden="true"
          >
            <span className="inline-flex items-center gap-1">
              <kbd className={kbdClass}>/</kbd> Search
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className={kbdClass}>↑</kbd>
              <kbd className={kbdClass}>↓</kbd> Move
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className={kbdClass}>→</kbd> Into page
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className={kbdClass}>Esc</kbd> Close
            </span>
          </p>
        </nav>
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          <header
            ref={barRef}
            className="flex h-12 flex-none items-center gap-3 border-b border-transparent bg-background pr-12 pl-7 transition-[border-color] duration-150 data-[scrolled]:border-theme-divider max-[620px]:pl-[18px]"
          >
            <h1 className="m-0 flex-none text-[15px] leading-none font-medium tracking-[-0.01em]">
              {searching ? "Results" : activeMeta.label}
            </h1>
            <p className="m-0 min-w-0 truncate text-[12.5px] text-theme-secondary">
              {searching ? `Settings matching “${query.trim()}”` : activeMeta.summary}
            </p>
          </header>
          <button
            type="button"
            className={cn(
              "absolute top-2.5 right-3 z-[3] flex h-7 w-7 items-center justify-center rounded-[7px] border-0 bg-transparent p-0 text-theme-secondary cursor-pointer hover:bg-theme-hover hover:text-foreground",
              settingsTransition,
              settingsPress,
            )}
            aria-label="Close settings"
            onClick={() => onOpenChange(false)}
          >
            <CloseIcon size={15} />
          </button>
          <div
            ref={contentRef}
            id="settings-tabpanel"
            role="tabpanel"
            aria-label={searching ? "Settings search results" : `${activeMeta.label} settings`}
            tabIndex={0}
            className="relative min-h-0 flex-1 overflow-y-auto px-7 pt-2 pb-14 [scrollbar-width:thin] transition-[background-color] duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] focus-visible:bg-theme-hover/30 max-[620px]:px-[18px] max-[620px]:pb-9"
            onScroll={(event) => {
              barRef.current?.toggleAttribute("data-scrolled", event.currentTarget.scrollTop > 0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft" && event.target === event.currentTarget) {
                event.preventDefault();
                if (rovingSection) {
                  focusSection(rovingSection);
                }
              }
            }}
          >
            {searching ? (
              <SettingsSearchResults
                query={query}
                hits={hits}
                keywordOnly={keywordOnly}
                renderSection={renderSection}
                onJump={jumpTo}
              />
            ) : (
              <SettingsLedgerContext.Provider value={ledger}>
                {renderSection(activeSection)}
              </SettingsLedgerContext.Provider>
            )}
          </div>
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
