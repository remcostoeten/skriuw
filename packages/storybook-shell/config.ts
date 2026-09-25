import type { ColorMode } from "./preferences";
import { createContext, useContext, type ReactNode } from "react";

export type StorybookLabels = {
  storiesNav: string;
  search: string;
  searchPlaceholder: string;
  noResults: string;
  noStories: string;
  theme: string;
  colorMode: (mode: ColorMode) => string;
  expandSidebar: string;
  collapseSidebar: string;
  onThisPage: string;
  usage: string;
  apiReference: string;
  source: string;
  copy: string;
  copied: string;
  required: string;
  alsoAccepts: string;
  jumpTo: string;
  shortcutsTitle: string;
  showShortcuts: string;
  close: string;
  sequenceSeparator: string;
  helpSearch: string;
  helpSidebar: string;
  helpJump: string;
  helpJumpDetail: string;
  helpMain: string;
  helpUsage: string;
  helpApi: string;
  helpSource: string;
  helpShortcuts: string;
  jumpHint: string;
  jumpMatches: (count: number) => string;
  lines: (count: number) => string;
  props: (count: number) => string;
};

/** Key combos like `"mod+k"`, `"/"` or `"shift+alt+p"`; `mod` is ⌘ on Apple platforms and Ctrl elsewhere. `false` disables the action. */
export type StorybookShortcuts = {
  search: readonly string[] | false;
  toggleSidebar: readonly string[] | false;
  /** Two-key sequences separated by a space, e.g. `"g t"`: then type the start of a story title and press Enter. */
  jump: readonly string[] | false;
  /** Sequences that scroll to a section of the open story and focus its heading. */
  goToMain: readonly string[] | false;
  goToUsage: readonly string[] | false;
  goToApi: readonly string[] | false;
  goToSource: readonly string[] | false;
  help: readonly string[] | false;
};

export type StorybookFeatures = {
  search: boolean;
  jump: boolean;
  sectionShortcuts: boolean;
  help: boolean;
  collapsibleSidebar: boolean;
  collapsibleGroups: boolean;
  breadcrumb: boolean;
  /** Light / dark / system switch; shown only when `themes` cover both schemes. */
  colorModeToggle: boolean;
  tableOfContents: boolean;
  usage: boolean;
  api: boolean;
  source: boolean;
};

export type StorybookLayout = {
  /** Expanded sidebar width in pixels. */
  sidebarWidth: number;
  /** Collapsed rail width in pixels. */
  railWidth: number;
  /** Maximum width of the story column in pixels. */
  contentMaxWidth: number;
  /** Draw the main area as an inset, rounded panel instead of edge to edge. */
  insetPanel: boolean;
  /** Hide the table of contents below this viewport width in pixels. */
  tableOfContentsMinViewport: number;
  /** Show the table of contents only when a story has at least this many entries. */
  tableOfContentsMinEntries: number;
};

export type StorybookConfig = {
  labels: StorybookLabels;
  shortcuts: StorybookShortcuts;
  features: StorybookFeatures;
  layout: StorybookLayout;
  logo: ReactNode;
};

export const DEFAULT_LABELS: StorybookLabels = {
  storiesNav: "Stories",
  search: "Search stories",
  searchPlaceholder: "Search stories",
  noResults: "No matching stories",
  noStories: "No stories.",
  theme: "Theme",
  colorMode: (mode) =>
    `Color mode: ${mode === "system" ? "System" : mode === "dark" ? "Dark" : "Light"}`,
  expandSidebar: "Expand sidebar",
  collapseSidebar: "Collapse sidebar",
  onThisPage: "On this page",
  usage: "Usage",
  apiReference: "API reference",
  source: "Source",
  copy: "Copy",
  copied: "Copied",
  required: "required",
  alsoAccepts: "Also accepts",
  jumpTo: "Jump to",
  shortcutsTitle: "Keyboard shortcuts",
  showShortcuts: "Keyboard shortcuts",
  close: "Close",
  sequenceSeparator: "then",
  helpSearch: "Search stories",
  helpSidebar: "Collapse or expand the sidebar",
  helpJump: "Jump to a story",
  helpJumpDetail:
    "Type letters in order, fuzzy: “inlco” finds InlineConfirm. Enter opens the outlined match, Esc cancels.",
  helpMain: "Go to the story",
  helpUsage: "Go to usage",
  helpApi: "Go to props (API reference)",
  helpSource: "Go to source",
  helpShortcuts: "Show this list",
  jumpHint: "Type letters in order · Enter to open · Esc to cancel",
  jumpMatches: (count) => (count === 0 ? "No match" : count === 1 ? "1 match" : `${count} matches`),
  lines: (count) => `${count} lines`,
  props: (count) => `${count} ${count === 1 ? "prop" : "props"}`,
};

export const DEFAULT_SHORTCUTS: StorybookShortcuts = {
  search: ["mod+k", "/"],
  toggleSidebar: ["mod+\\"],
  jump: ["g t"],
  goToMain: ["g m"],
  goToUsage: ["g u"],
  goToApi: ["g p"],
  goToSource: ["g s"],
  help: ["?"],
};

export const DEFAULT_FEATURES: StorybookFeatures = {
  search: true,
  jump: true,
  sectionShortcuts: true,
  help: true,
  collapsibleSidebar: true,
  collapsibleGroups: true,
  breadcrumb: true,
  colorModeToggle: true,
  tableOfContents: true,
  usage: true,
  api: true,
  source: true,
};

export const DEFAULT_LAYOUT: StorybookLayout = {
  sidebarWidth: 224,
  railWidth: 48,
  contentMaxWidth: 896,
  insetPanel: true,
  tableOfContentsMinViewport: 1280,
  tableOfContentsMinEntries: 2,
};

export const ConfigContext = createContext<StorybookConfig>({
  labels: DEFAULT_LABELS,
  shortcuts: DEFAULT_SHORTCUTS,
  features: DEFAULT_FEATURES,
  layout: DEFAULT_LAYOUT,
  logo: null,
});

/** Resolved configuration of the surrounding `<Storybook>`. */
export function useStorybookConfig(): StorybookConfig {
  return useContext(ConfigContext);
}

const IS_MAC = typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform);

type Combo = { key: string; mod: boolean; shift: boolean; alt: boolean };

function parseCombo(combo: string): Combo {
  const parts = combo.toLowerCase().split(/\+(?!$)/);
  const key = parts.pop() ?? "";
  return {
    key,
    mod: parts.includes("mod"),
    shift: parts.includes("shift"),
    alt: parts.includes("alt"),
  };
}

export function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  );
}

/** True when `event` matches one of `combos`. Bare single keys never fire while typing in a field. */
export function matchesShortcut(event: KeyboardEvent, combos: readonly string[] | false): boolean {
  if (!combos) return false;
  return combos.some((raw) => {
    const combo = parseCombo(raw);
    const mod = IS_MAC ? event.metaKey : event.ctrlKey;
    const other = IS_MAC ? event.ctrlKey : event.metaKey;
    if (event.key.toLowerCase() !== combo.key || mod !== combo.mod || other) return false;
    if (event.altKey !== combo.alt) return false;
    if (combo.key.length === 1 && /[a-z0-9]/.test(combo.key) && event.shiftKey !== combo.shift)
      return false;
    return combo.mod || combo.alt || !isEditable(event.target);
  });
}

/** Human-readable form, e.g. `⌘K` or `Ctrl K`. */
export function formatShortcut(raw: string): string {
  const combo = parseCombo(raw);
  const key =
    combo.key.length === 1
      ? combo.key.toUpperCase()
      : combo.key[0]!.toUpperCase() + combo.key.slice(1);
  const modifiers = [
    combo.mod && (IS_MAC ? "⌘" : "Ctrl"),
    combo.shift && (IS_MAC ? "⇧" : "Shift"),
    combo.alt && (IS_MAC ? "⌥" : "Alt"),
  ].filter(Boolean);
  return IS_MAC ? [...modifiers, key].join("") : [...modifiers, key].join(" ");
}

/** Value for `aria-keyshortcuts`. */
export function ariaShortcuts(combos: readonly string[] | false): string | undefined {
  if (!combos || combos.length === 0) return undefined;
  return combos
    .map((raw) => {
      const combo = parseCombo(raw);
      const modifiers = [
        combo.mod && (IS_MAC ? "Meta" : "Control"),
        combo.shift && "Shift",
        combo.alt && "Alt",
      ].filter(Boolean);
      return [...modifiers, combo.key.length === 1 ? combo.key.toUpperCase() : combo.key].join("+");
    })
    .join(" ");
}

/** Formats a key sequence such as `"g t"` as `G then T`. */
export function formatSequence(raw: string): string {
  return raw.split(" ").map(formatShortcut).join(" then ");
}
