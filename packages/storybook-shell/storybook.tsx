import { flushSync } from "react-dom";
import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  MonitorIcon,
  MoonIcon,
  SearchIcon,
  SidebarIcon,
  SunIcon,
} from "./icons";
import {
  ConfigContext,
  DEFAULT_FEATURES,
  DEFAULT_LABELS,
  DEFAULT_LAYOUT,
  DEFAULT_SHORTCUTS,
  ariaShortcuts,
  formatShortcut,
  isEditable,
  matchesShortcut,
  useStorybookConfig,
  type StorybookConfig,
  type StorybookFeatures,
  type StorybookLabels,
  type StorybookLayout,
  type StorybookShortcuts,
} from "./config";
import {
  PreferencesContext,
  createPreferencesStore,
  usePreferencesStore,
  type ColorMode,
  type StorybookPreferences,
  type StorybookTheme,
  type StorybookToggle,
} from "./preferences";
import { SourceSection, UsageSection, type CodeSource } from "./code";
import { PropsTables } from "./props-table";
import { TableOfContents } from "./toc";
import { jumpMatch, jumpMatches } from "./jump";
import { ShortcutHelp } from "./shortcut-help";
import type { Story } from "./story";

export type StorybookProps = {
  /** Name shown at the top of the sidebar. */
  title: string;
  stories: readonly Story[];
  /** Replaces the default first-letter badge next to the title and in the collapsed rail. */
  logo?: ReactNode;
  /** Themes offered in the top bar; the first one is the default. Omit to hide the picker. */
  themes?: readonly StorybookTheme[];
  /** Mode used until the viewer picks one; defaults to `"system"`. */
  defaultColorMode?: ColorMode;
  /** Class toggled on `<html>` in the dark scheme, for Tailwind's `dark:` variant; defaults to `"dark"`, `false` to skip. */
  darkClass?: string | false;
  /** Extra persisted switches shown in the top bar, e.g. an app-specific feature flag. */
  toggles?: readonly StorybookToggle[];
  /** Extra controls rendered at the end of the top bar. */
  actions?: ReactNode;
  /** Wraps the whole shell; use it for app providers that should follow the preferences. */
  wrapper?: (children: ReactNode, preferences: StorybookPreferences) => ReactNode;
  /** `localStorage` key for the preferences; defaults to one derived from `title`. */
  storageKey?: string;
  /** Sidebar groups that start closed. */
  defaultClosedGroups?: readonly string[];
  /** Overrides for any interface text, e.g. for translation. */
  labels?: Partial<StorybookLabels>;
  /** Overrides for keyboard shortcuts; pass `false` for an action to disable it. */
  shortcuts?: Partial<StorybookShortcuts>;
  /** Turns parts of the interface off; everything is on by default. */
  features?: Partial<StorybookFeatures>;
  layout?: Partial<StorybookLayout>;
};

type ShellProps = Pick<
  StorybookProps,
  "title" | "stories" | "themes" | "toggles" | "actions" | "wrapper" | "defaultClosedGroups"
>;

function storySources(story: Story): readonly CodeSource[] {
  if (story.source) return story.source;
  const seen = new Map<string, CodeSource>();
  for (const entry of story.api ?? []) {
    if (!seen.has(entry.source))
      seen.set(entry.source, {
        label: entry.file ?? entry.label ?? entry.type,
        code: entry.source,
      });
  }
  return [...seen.values()];
}

function storyIdFromHash(stories: readonly Story[]): string {
  const id = window.location.hash.slice(1);
  return stories.some((story) => story.id === id) ? id : (stories[0]?.id ?? "");
}

/** Reads the preferences of the surrounding `<Storybook>` and re-renders when they change. */
export function usePreferences(): StorybookPreferences {
  const store = usePreferencesStore();
  return useSyncExternalStore(store.subscribe, store.get);
}

/** Changes the preferences of the surrounding `<Storybook>`. */
export function useUpdatePreferences(): (patch: Partial<StorybookPreferences>) => void {
  return usePreferencesStore().update;
}

/** A self-contained component catalog: searchable sidebar, theme and motion controls, and a document-style canvas. */
export function Storybook({
  storageKey,
  labels,
  shortcuts,
  features,
  layout,
  logo,
  defaultColorMode,
  darkClass,
  ...props
}: StorybookProps) {
  const [store] = useState(() =>
    createPreferencesStore({
      storageKey: storageKey ?? `storybook:${props.title}`,
      themes: props.themes ?? [],
      toggles: props.toggles ?? [],
      defaultColorMode: defaultColorMode ?? "system",
      darkClass: darkClass ?? "dark",
    }),
  );
  const config: StorybookConfig = {
    labels: { ...DEFAULT_LABELS, ...labels },
    shortcuts: { ...DEFAULT_SHORTCUTS, ...shortcuts },
    features: { ...DEFAULT_FEATURES, ...features },
    layout: { ...DEFAULT_LAYOUT, ...layout },
    logo: logo ?? <LetterBadge title={props.title} />,
  };
  return (
    <ConfigContext.Provider value={config}>
      <PreferencesContext.Provider value={store}>
        <Shell {...props} />
      </PreferencesContext.Provider>
    </ConfigContext.Provider>
  );
}

const SEQUENCE_TIMEOUT_MS = 1000;

function Highlighted({ text, indices }: { text: string; indices: readonly number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const matched = new Set(indices);
  const runs: { text: string; hit: boolean }[] = [];
  [...text].forEach((char, index) => {
    const hit = matched.has(index);
    const last = runs[runs.length - 1];
    if (last && last.hit === hit) last.text += char;
    else runs.push({ text: char, hit });
  });
  return (
    <>
      {runs.map((run, index) =>
        run.hit ? (
          <mark
            key={index}
            className="rounded-[2px] bg-foreground/15 text-foreground underline decoration-foreground/60 underline-offset-2"
          >
            {run.text}
          </mark>
        ) : (
          run.text
        ),
      )}
    </>
  );
}

function LetterBadge({ title }: { title: string }) {
  return (
    <span className="grid size-5 place-items-center rounded-[5px] bg-foreground text-[10px] font-semibold text-background">
      {title.charAt(0)}
    </span>
  );
}

const NEXT_COLOR_MODE: Readonly<Record<ColorMode, ColorMode>> = {
  light: "dark",
  dark: "system",
  system: "light",
};
const COLOR_MODE_ICONS = { light: SunIcon, dark: MoonIcon, system: MonitorIcon } as const;

function ColorModeButton({
  mode,
  label,
  onChange,
}: {
  mode: ColorMode;
  label: (mode: ColorMode) => string;
  onChange: (mode: ColorMode) => void;
}) {
  const ModeIcon = COLOR_MODE_ICONS[mode];
  return (
    <button
      type="button"
      aria-label={label(mode)}
      title={label(mode)}
      onClick={() => onChange(NEXT_COLOR_MODE[mode])}
      className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
    >
      <ModeIcon size={15} />
    </button>
  );
}

function Shell({
  title,
  stories,
  themes = [],
  toggles = [],
  actions,
  wrapper,
  defaultClosedGroups = [],
}: ShellProps) {
  const { labels, shortcuts, features, layout, logo } = useStorybookConfig();
  const store = usePreferencesStore();
  const preferences = usePreferences();
  const update = store.update;
  const hasBothSchemes =
    themes.some((theme) => theme.colorScheme === "light") &&
    themes.some((theme) => theme.colorScheme === "dark");
  const showColorMode = features.colorModeToggle && hasBothSchemes;
  const activeScheme = themes.find((theme) => theme.id === preferences.theme)?.colorScheme;
  const pickerThemes = showColorMode
    ? themes.filter((theme) => theme.colorScheme === activeScheme)
    : themes;
  const [activeId, setActiveId] = useState(() => storyIdFromHash(stories));
  const [query, setQuery] = useState("");
  const [jump, setJump] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const pendingKey = useRef<{ key: string; at: number } | null>(null);
  const [closedGroups, setClosedGroups] = useState<ReadonlySet<string>>(
    () => new Set(defaultClosedGroups),
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const active = stories.find((story) => story.id === activeId) ?? stories[0];
  const groups = [...new Set(stories.map((story) => story.group))];
  const needle = features.search ? query.trim().toLowerCase() : "";
  const collapsed = features.collapsibleSidebar && preferences.sidebarCollapsed;
  const searchShortcuts = features.search ? shortcuts.search : false;
  const sidebarShortcuts = features.collapsibleSidebar ? shortcuts.toggleSidebar : false;
  const searchHint = searchShortcuts ? searchShortcuts.map(formatShortcut) : [];
  const sidebarHint =
    sidebarShortcuts && sidebarShortcuts[0] ? ` (${formatShortcut(sidebarShortcuts[0])})` : "";
  const sources = active ? storySources(active) : [];
  const jumpShortcuts = features.jump ? shortcuts.jump : false;
  const orderedStories = groups.flatMap((group) =>
    stories.filter((story) => story.group === group),
  );
  const jumpResults = jump ? jumpMatches(orderedStories, jump) : [];
  const jumpTarget = jumpResults[0];
  const hasMatches = groups.some((group) =>
    stories.some((story) => story.group === group && story.title.toLowerCase().includes(needle)),
  );

  useEffect(() => {
    function sync() {
      setActiveId(storyIdFromHash(stories));
    }
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [stories]);

  function goToSection(section: string) {
    const heading = scrollRef.current?.querySelector<HTMLElement>(`[data-section="${section}"]`);
    if (!heading) return;
    heading.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    heading.focus({ preventScroll: true });
  }

  function sectionCombos(combos: readonly string[] | false) {
    return features.sectionShortcuts ? combos : false;
  }

  const sequenceActions: readonly { combos: readonly string[] | false; run: () => void }[] = [
    {
      combos: jumpShortcuts,
      run: () => {
        if (store.get().sidebarCollapsed) update({ sidebarCollapsed: false });
        setJump("");
      },
    },
    { combos: sectionCombos(shortcuts.goToMain), run: () => goToSection("main") },
    { combos: sectionCombos(shortcuts.goToUsage), run: () => goToSection("usage") },
    { combos: sectionCombos(shortcuts.goToApi), run: () => goToSection("api") },
    { combos: sectionCombos(shortcuts.goToSource), run: () => goToSection("source") },
  ];
  const helpShortcuts = features.help ? shortcuts.help : false;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const bare = !event.metaKey && !event.ctrlKey && !event.altKey;
      if (jump !== null) {
        if (event.key === "Escape") setJump(null);
        else if (event.key === "Enter") {
          if (jumpTarget) window.location.hash = jumpTarget.id;
          setJump(null);
        } else if (event.key === "Backspace") setJump(jump.slice(0, -1));
        else if (bare && event.key.length === 1 && event.key !== " ")
          setJump(jump + event.key.toLowerCase());
        else return;
        event.preventDefault();
        return;
      }
      if (bare && !isEditable(event.target)) {
        const key = event.key.toLowerCase();
        const pending = pendingKey.current;
        const sequences = sequenceActions.flatMap(({ combos, run }) =>
          combos ? combos.map((combo) => ({ keys: combo.toLowerCase().split(" "), run })) : [],
        );
        const hit =
          pending && event.timeStamp - pending.at < SEQUENCE_TIMEOUT_MS
            ? sequences.find(({ keys: [first, second] }) => first === pending.key && second === key)
            : undefined;
        if (hit) {
          event.preventDefault();
          pendingKey.current = null;
          hit.run();
          return;
        }
        pendingKey.current = sequences.some(
          ({ keys: [first, second] }) => first === key && second !== undefined,
        )
          ? { key, at: event.timeStamp }
          : null;
      }
      if (matchesShortcut(event, helpShortcuts)) {
        event.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }
      if (matchesShortcut(event, sidebarShortcuts)) {
        event.preventDefault();
        update({ sidebarCollapsed: !store.get().sidebarCollapsed });
        return;
      }
      if (!matchesShortcut(event, searchShortcuts)) return;
      event.preventDefault();
      if (store.get().sidebarCollapsed) flushSync(() => update({ sidebarCollapsed: false }));
      searchRef.current?.focus();
      searchRef.current?.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function toggleGroup(group: string) {
    setClosedGroups((current) => {
      const next = new Set(current);
      if (!next.delete(group)) next.add(group);
      return next;
    });
  }

  const canvas = active && (
    <>
      <header className="mb-10">
        <p className="text-[12px] font-medium text-muted-foreground">{active.group}</p>
        <h1
          data-section="main"
          tabIndex={-1}
          className="mt-1 scroll-mt-10 outline-none text-[22px] font-semibold tracking-[-0.015em]"
        >
          {active.title}
        </h1>
        {active.description && (
          <p className="mt-1.5 max-w-[60ch] text-[14px] leading-relaxed text-muted-foreground text-pretty">
            {active.description}
          </p>
        )}
      </header>
      <div key={active.id} className="flex flex-col gap-8">
        {active.render()}
      </div>
      {features.usage && active.usage && <UsageSection usage={active.usage} />}
      {features.api && active.api && active.api.length > 0 && <PropsTables api={active.api} />}
      {features.source && sources.length > 0 && <SourceSection sources={sources} />}
    </>
  );

  const rail = (
    <nav
      aria-label={labels.storiesNav}
      className="flex shrink-0 flex-col items-center gap-2 py-2.5"
      style={{ width: layout.railWidth }}
    >
      <span aria-hidden="true" title={title} className="grid size-8 place-items-center">
        {logo}
      </span>
      {features.search && (
        <button
          type="button"
          aria-label={labels.search}
          title={searchHint[0] ? `${labels.search} (${searchHint[0]})` : labels.search}
          onClick={() => {
            flushSync(() => update({ sidebarCollapsed: false }));
            searchRef.current?.focus();
          }}
          className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
        >
          <SearchIcon size={14} />
        </button>
      )}
    </nav>
  );

  const sidebar = (
    <nav
      aria-label={labels.storiesNav}
      className="flex shrink-0 flex-col gap-3 overflow-y-auto px-2 py-2.5"
      style={{ width: layout.sidebarWidth }}
    >
      <div className="flex h-8 items-center gap-2 px-2">
        <span aria-hidden="true" className="flex shrink-0">
          {logo}
        </span>
        <span className="truncate text-[13px] font-medium">{title}</span>
      </div>
      {features.search && (
        <label className="flex h-7 items-center gap-2 rounded-md px-2 text-muted-foreground focus-within:bg-muted/60 focus-within:ring-1 focus-within:ring-ring hover:bg-muted/40">
          <SearchIcon size={14} />
          <input
            ref={searchRef}
            type="search"
            aria-label={labels.search}
            aria-keyshortcuts={ariaShortcuts(searchShortcuts)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") return;
              if (query) setQuery("");
              else event.currentTarget.blur();
            }}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none [&::-webkit-search-cancel-button]:hidden placeholder:text-muted-foreground"
            placeholder={labels.searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {searchHint.length > 0 && (
            <span aria-hidden="true" className="flex shrink-0 gap-0.5">
              {searchHint.map((hint) => (
                <kbd
                  key={hint}
                  className="rounded border border-border/60 px-1 font-sans text-[10px] leading-4"
                >
                  {hint}
                </kbd>
              ))}
            </span>
          )}
        </label>
      )}
      {!hasMatches && <p className="px-2 text-[12px] text-muted-foreground">{labels.noResults}</p>}
      {groups.map((group) => {
        const matches = stories.filter(
          (story) => story.group === group && story.title.toLowerCase().includes(needle),
        );
        if (matches.length === 0) return null;
        const open =
          !features.collapsibleGroups || needle !== "" || jump !== null || !closedGroups.has(group);
        return (
          <div key={group} className="flex flex-col gap-px">
            {features.collapsibleGroups ? (
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggleGroup(group)}
                className="flex h-6 items-center gap-1 self-start rounded-md px-2 text-[12px] font-medium text-muted-foreground hover:text-foreground"
              >
                {group}
                <ChevronDownIcon size={10} className={open ? "" : "-rotate-90"} />
              </button>
            ) : (
              <span className="flex h-6 items-center px-2 text-[12px] font-medium text-muted-foreground">
                {group}
              </span>
            )}
            {open &&
              matches.map((story) => {
                const match = jump ? jumpMatch(story.title, jump) : null;
                const dimmed = jump !== null && jump !== "" && !match;
                const target = jump !== null && story === jumpTarget;
                return (
                  <a
                    key={story.id}
                    href={`#${story.id}`}
                    aria-current={story.id === active?.id ? "page" : undefined}
                    className={`flex h-7 items-center rounded-md px-2 text-[13px] text-foreground/85 hover:bg-muted/60 aria-[current=page]:bg-muted aria-[current=page]:text-foreground ${dimmed ? "opacity-35" : ""} ${target ? "ring-1 ring-ring" : ""}`}
                  >
                    <span className="truncate">
                      <Highlighted text={story.title} indices={match?.indices ?? []} />
                    </span>
                    {target && (
                      <kbd
                        aria-hidden="true"
                        className="ml-auto pl-2 font-sans text-[10px] text-muted-foreground"
                      >
                        ↵
                      </kbd>
                    )}
                  </a>
                );
              })}
          </div>
        );
      })}
      <span role="status" aria-live="polite" className="sr-only">
        {jump === null
          ? ""
          : jump === ""
            ? `${labels.jumpTo}. ${labels.jumpHint}`
            : `${labels.jumpMatches(jumpResults.length)}${jumpTarget ? `: ${jumpTarget.title}` : ""}`}
      </span>
    </nav>
  );

  const panelClass = layout.insetPanel
    ? "my-2 mr-2 rounded-lg border border-border/60 shadow-sm"
    : "border-l border-border/60";

  const shell = (
    <div className="flex h-dvh bg-muted/30 text-foreground">
      {collapsed ? rail : sidebar}
      <div className={`flex min-w-0 flex-1 flex-col overflow-hidden bg-background ${panelClass}`}>
        <header className="flex h-11 shrink-0 flex-wrap items-center gap-3 border-b border-border/60 px-2 text-[13px]">
          {features.collapsibleSidebar && (
            <button
              type="button"
              aria-label={collapsed ? labels.expandSidebar : labels.collapseSidebar}
              aria-expanded={!collapsed}
              aria-keyshortcuts={ariaShortcuts(sidebarShortcuts)}
              title={`${collapsed ? labels.expandSidebar : labels.collapseSidebar}${sidebarHint}`}
              onClick={() => update({ sidebarCollapsed: !collapsed })}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              <SidebarIcon size={15} />
            </button>
          )}
          {features.breadcrumb && active && (
            <div className="flex min-w-0 items-center gap-1.5 px-2">
              <span className="text-muted-foreground">{active.group}</span>
              <ChevronRightIcon size={12} className="text-muted-foreground" />
              <span className="truncate font-medium">{active.title}</span>
            </div>
          )}
          <div className="ml-auto flex items-center gap-1 text-[12px] text-muted-foreground">
            {showColorMode && (
              <ColorModeButton
                mode={preferences.colorMode}
                label={labels.colorMode}
                onChange={(colorMode) => update({ colorMode })}
              />
            )}
            {pickerThemes.length > 1 && (
              <select
                className="h-7 rounded-md border border-border/60 bg-muted/40 px-2 text-foreground"
                value={preferences.theme}
                aria-label={labels.theme}
                onChange={(event) => update({ theme: event.target.value })}
              >
                {pickerThemes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.label}
                  </option>
                ))}
              </select>
            )}
            {toggles.map((toggle) => (
              <label
                key={toggle.id}
                className="flex h-7 items-center gap-1.5 rounded-md px-2 hover:bg-muted/60 hover:text-foreground"
              >
                <input
                  type="checkbox"
                  checked={preferences.toggles[toggle.id] ?? toggle.defaultValue}
                  onChange={(event) => update({ toggles: { [toggle.id]: event.target.checked } })}
                />
                {toggle.label}
              </label>
            ))}
            {actions}
            {features.help && <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />}
          </div>
        </header>
        <main ref={scrollRef} className="flex-1 overflow-y-auto">
          <div
            className="mx-auto flex w-full gap-12 px-10 pb-16 pt-10"
            style={{ maxWidth: layout.contentMaxWidth + 272 } as CSSProperties}
          >
            <div
              ref={contentRef}
              className="min-w-0 flex-1"
              style={{ maxWidth: layout.contentMaxWidth }}
            >
              {canvas ?? <p className="text-muted-foreground">{labels.noStories}</p>}
            </div>
            {features.tableOfContents && active && (
              <TableOfContents contentRef={contentRef} scrollRef={scrollRef} storyId={active.id} />
            )}
          </div>
        </main>
      </div>
      {jump !== null && (
        <div
          aria-hidden="true"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-border/60 bg-background/95 px-3 py-2 text-[12px] shadow-lg backdrop-blur"
        >
          <span className="text-muted-foreground">{labels.jumpTo}</span>
          <span className="min-w-[6ch] font-mono text-[13px] text-foreground">
            {jump}
            <span className="animate-pulse">▏</span>
          </span>
          {jump && (
            <span className="text-muted-foreground">
              {labels.jumpMatches(jumpResults.length)}
              {jumpTarget ? ` · ${jumpTarget.title}` : ""}
            </span>
          )}
          <span className="border-l border-border/60 pl-3 text-[11px] text-muted-foreground/80">
            {labels.jumpHint}
          </span>
        </div>
      )}
    </div>
  );

  return wrapper ? wrapper(shell, preferences) : shell;
}
