import { useEffect, useMemo, useRef, useState } from "react";
import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { CloseIcon, SearchIcon } from "../shared/icons";
import { Dialog } from "../shared/ui/dialog";
import {
  filterSettingsSections,
  moveSettingsSection,
  rovingSettingsSection,
} from "../settings/settings-navigation";
import type { RendererStore } from "../store/types";
import { AboutSection } from "./settings/about-section";
import { AppearanceSection } from "./settings/appearance-section";
import { DataSection } from "./settings/data-section";
import { EditorSection } from "./settings/editor-section";
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

  function handleDialogCancel(event: FormEvent<HTMLDialogElement>): void {
    if (recordingCountRef.current > 0) {
      event.preventDefault();
    }
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDialogElement>): void {
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
      className="settings-dialog"
      onKeyDown={handleDialogKeyDown}
      onCancel={handleDialogCancel}
      showHeader={false}
    >
      <div className="settings-layout">
        <nav
          ref={navRef}
          className="settings-nav"
          aria-label="Settings sections"
          onKeyDown={handleNavKeyDown}
        >
          <div className="settings-search-wrap">
            <SearchIcon size={14} aria-hidden="true" className="settings-search-icon" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              className="settings-search"
              placeholder="Search settings"
              aria-label="Search settings"
              aria-controls="settings-tablist"
              onChange={(event) => setQuery(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && query) {
                  event.preventDefault();
                  event.stopPropagation();
                  setQuery("");
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
            <kbd className="settings-search-hint" aria-hidden="true">/</kbd>
          </div>
          <div
            id="settings-tablist"
            role="tablist"
            aria-orientation="vertical"
            aria-label="Settings sections"
            className="settings-tablist"
          >
            {filteredSections.map((entry) => (
              <button
                key={entry.id}
                id={`settings-tab-${entry.id}`}
                type="button"
                role="tab"
                data-section-id={entry.id}
                tabIndex={rovingSection === entry.id ? 0 : -1}
                className={`settings-nav-item${section === entry.id ? " is-active" : ""}`}
                aria-selected={section === entry.id}
                aria-controls="settings-tabpanel"
                onClick={() => setSection(entry.id)}
              >
                <entry.icon size={15} aria-hidden="true" />
                <span className="settings-nav-copy">
                  <span>{entry.label}</span>
                  {query && <span>{entry.description}</span>}
                </span>
              </button>
            ))}
          </div>
          {filteredSections.length === 0 && (
            <p className="settings-search-empty" role="status">
              No settings match “{query.trim()}”.
            </p>
          )}
          <p className="settings-nav-help">
            <kbd>/</kbd> Search <span aria-hidden="true">·</span> <kbd>Ctrl E</kbd> Sections
          </p>
        </nav>
        <div
          ref={contentRef}
          id="settings-tabpanel"
          role="tabpanel"
          aria-label={`${activeMeta.label} settings`}
          tabIndex={0}
          className="settings-content"
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
            className="settings-close-button"
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
          {section === "data" && <DataSection store={store} />}
          {section === "about" && <AboutSection />}
        </div>
      </div>
    </Dialog>
  );
}

function isTypingTarget(target: EventTarget): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}
