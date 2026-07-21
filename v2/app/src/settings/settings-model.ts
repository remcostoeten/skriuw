import type { WorkspaceSettings } from "../contracts/workspace";
import type { ShortcutActionId } from "../shortcuts/definitions";

export const THEME_OPTIONS = [
  { value: "midnight", label: "Midnight" },
  { value: "paper", label: "Paper" },
  { value: "embers", label: "Embers" },
  { value: "mocha", label: "Mocha" },
  { value: "rose-pine", label: "Rosé Pine" },
  { value: "rose-pine-dawn", label: "Rosé Pine Dawn" },
  { value: "catppuccin-latte", label: "Catppuccin Latte" },
  { value: "gruvbox", label: "Gruvbox" },
  { value: "tokyo-night", label: "Tokyo Night" },
] as const;

export const EDITOR_FONT_OPTIONS = [
  { value: "inter", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
] as const;

export const EDITOR_LINE_HEIGHT_OPTIONS = [
  { value: "cozy", label: "Cozy" },
  { value: "comfortable", label: "Comfortable" },
  { value: "relaxed", label: "Relaxed" },
] as const;

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  settingsVersion: 1,
  theme: "midnight",
  compactSidebar: false,
  showTreeGuides: false,
  showPageIcons: true,
  reduceMotion: false,
  rememberLastNote: true,
  editorFont: "inter",
  editorLineHeight: "comfortable",
  showLineNumbers: true,
  editorPlaceholder: "Start writing...",
};

export type SettingsViewModel = {
  theme: string;
  compactSidebar: boolean;
  showTreeGuides: boolean;
  reduceMotion: boolean;
  rememberLastNote: boolean;
  editorFont: string;
  editorLineHeight: string;
  editorPlaceholder: string;
};

export type EditableSettings = SettingsViewModel;

function supportedValue(
  value: string,
  options: readonly { value: string }[],
  fallback: string,
): string {
  return options.some((option) => option.value === value) ? value : fallback;
}

export function projectSettings(settings: WorkspaceSettings): SettingsViewModel {
  return {
    theme: supportedValue(
      settings.theme,
      THEME_OPTIONS,
      DEFAULT_WORKSPACE_SETTINGS.theme,
    ),
    compactSidebar: settings.compactSidebar,
    showTreeGuides: settings.showTreeGuides === true,
    reduceMotion: settings.reduceMotion,
    rememberLastNote: settings.rememberLastNote,
    editorFont: supportedValue(
      settings.editorFont,
      EDITOR_FONT_OPTIONS,
      DEFAULT_WORKSPACE_SETTINGS.editorFont,
    ),
    editorLineHeight: supportedValue(
      settings.editorLineHeight,
      EDITOR_LINE_HEIGHT_OPTIONS,
      DEFAULT_WORKSPACE_SETTINGS.editorLineHeight,
    ),
    editorPlaceholder: settings.editorPlaceholder,
  };
}

export function changeSetting<K extends keyof EditableSettings>(
  settings: WorkspaceSettings,
  field: K,
  value: EditableSettings[K],
): WorkspaceSettings {
  return { ...settings, [field]: value };
}

function rawShortcutOverrides(settings: WorkspaceSettings): Record<string, unknown> {
  const value = settings["shortcutOverrides"];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function changeShortcutOverride(
  settings: WorkspaceSettings,
  actionId: ShortcutActionId,
  combo: string,
): WorkspaceSettings {
  return {
    ...settings,
    shortcutOverrides: {
      ...rawShortcutOverrides(settings),
      [actionId]: combo,
    },
  };
}

export function resetShortcutOverride(
  settings: WorkspaceSettings,
  actionId: ShortcutActionId,
): WorkspaceSettings {
  const overrides = rawShortcutOverrides(settings);
  if (!(actionId in overrides)) {
    return settings;
  }
  const { [actionId]: _removed, ...remaining } = overrides;
  return { ...settings, shortcutOverrides: remaining };
}
