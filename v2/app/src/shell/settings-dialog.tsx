import { useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { activateNote } from "../actions/workspace";
import { CloseIcon, SearchIcon } from "../shared/icons";
import { cn } from "../shared/lib/utils";
import { Dialog } from "../shared/ui/dialog";
import {
  filterSettingsSections,
  moveSettingsSection,
  rovingSettingsSection,
  settingsSearchEscape,
} from "../settings/settings-navigation";
import type { RendererStore } from "../store/types";
import { AboutSection } from "./settings/about-section";
import { AppearanceSection } from "./settings/appearance-section";
import { DataSection } from "./settings/data-section";
import { EditorSection } from "./settings/editor-section";
import { MediaSection } from "./settings/media-section";
import { SECTIONS } from "./settings/sections";
import type { SectionId } from "./settings/sections";
import { ShortcutsSection } from "./settings/shortcuts-section";

type Props = {
  store: RendererStore;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function SettingsDialog({ store, open, onOpenChange }: Props) {
  const [section, setSection] = useState<SectionId>("appearance");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const recordingCountRef = useRef(0);
  const filteredSections = useMemo(
    () => filterSettingsSections(SECTIONS, query),
    [query],
  );
  const filteredIds = filteredSections.map((entry) => entry.id);
  const rovingSection = rovingSettingsSection(filteredIds, section);
  const activeMeta = SECTIONS.find((entry) => entry.id === section) ?? SECTIONS[0];

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
    if (
      event.key.toLocaleLowerCase() === "e" &&
      event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
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
    if (
      event.key === "Enter" ||
      event.key === " " ||
      event.key === "ArrowRight"
    ) {
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
        "w-[min(896px,calc(100vw-48px))] h-[min(720px,calc(100vh-64px))] max-h-[calc(100vh-64px)]",
        "max-[620px]:h-[calc(100vh-24px)] max-[620px]:w-[calc(100vw-24px)] max-[620px]:max-h-[calc(100vh-24px)]",
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
          <div className="relative mx-0.5 mb-3 flex-none max-[620px]:mx-0 max-[620px]:mb-2 max-[620px]:w-full">
            <SearchIcon
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-[9px] -translate-y-1/2 text-muted-foreground"
            />
            <input
              ref={searchRef}
              type="search"
              value={query}
              className="h-8 w-full rounded-lg border border-sidebar-border bg-background/[62%] py-[5px] pr-8 pl-[30px] text-xs text-sidebar-foreground outline-0 placeholder:text-muted-foreground/[78%] [&::-webkit-search-cancel-button]:hidden focus-visible:border-foreground/45 focus-visible:shadow-[0_0_0_2px_hsl(var(--sidebar-background)),0_0_0_3px_hsl(var(--foreground)/0.25)]"
              placeholder="Search settings"
              aria-label="Search settings"
              aria-controls="settings-tablist"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  const action = settingsSearchEscape(
                    query,
                    recordingCountRef.current > 0,
                  );
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
              className="absolute top-1/2 right-[7px] min-w-[18px] -translate-y-1/2 rounded-md border border-sidebar-border bg-background/[66%] px-[5px] py-px text-center font-mono text-[10px] leading-[1.45] text-muted-foreground"
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
            {filteredSections.map((entry) => (
              <button
                key={entry.id}
                id={`settings-tab-${entry.id}`}
                type="button"
                role="tab"
                data-section-id={entry.id}
                tabIndex={rovingSection === entry.id ? 0 : -1}
                className={cn(
                  "flex min-h-[38px] items-center gap-2 rounded-lg border-0 bg-transparent px-[9px] py-1.5 text-left text-[13px] text-muted-foreground cursor-pointer hover:bg-muted hover:text-foreground max-[620px]:min-h-[34px] max-[620px]:flex-none",
                  "focus-visible:bg-sidebar-accent focus-visible:text-sidebar-accent-foreground focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.2)]",
                  section === entry.id && "bg-accent text-accent-foreground",
                )}
                aria-selected={section === entry.id}
                aria-controls="settings-tabpanel"
                onClick={() => setSection(entry.id)}
              >
                <entry.icon size={15} aria-hidden="true" />
                <span className="flex min-w-0 flex-1 flex-col gap-[3px] leading-[1.05]">
                  <span className="truncate">{entry.label}</span>
                  {query && (
                    <span className="truncate text-[10px] text-muted-foreground">
                      {entry.description}
                    </span>
                  )}
                </span>
              </button>
            ))}
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
          className="relative min-w-0 flex-1 overflow-y-auto px-10 pt-8 pb-12 focus-visible:bg-[hsl(var(--foreground)/2.5%)] focus-visible:shadow-[inset_0_0_0_1px_hsl(var(--foreground)/0.12)] max-[620px]:px-[18px] max-[620px]:pt-6 max-[620px]:pb-9"
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
            className="absolute top-4 right-4 z-[1] flex h-7 w-7 items-center justify-center rounded-lg border-0 bg-transparent p-0 text-muted-foreground cursor-pointer hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground"
            aria-label="Close settings"
            onClick={() => onOpenChange(false)}
          >
            <CloseIcon size={16} />
          </button>
          {section === "appearance" && <AppearanceSection store={store} />}
          {section === "editor" && <EditorSection store={store} />}
          {section === "shortcuts" && (
            <ShortcutsSection store={store} recordingCountRef={recordingCountRef} />
          )}
          {section === "media" && (
            <MediaSection
              store={store}
              onOpenNote={(noteId) => {
                activateNote(store, noteId);
                onOpenChange(false);
              }}
            />
          )}
          {section === "data" && <DataSection store={store} />}
          {section === "about" && <AboutSection />}
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
