import type { WorkspaceSettings } from "@skriuw/renderer-core/contracts/workspace";
import { BUILTIN_THEMES, builtinThemeLabel, resolveTheme } from "@skriuw/theme";
import type { ShortcutActionId } from "@/commands/definitions";

export const THEME_OPTIONS = BUILTIN_THEMES.map((theme) => ({
  value: theme.id,
  label: builtinThemeLabel(theme),
}));

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

export const VIM_CURSOR_STYLE_OPTIONS = [
  { value: "block", label: "Block" },
  { value: "underline", label: "Underline" },
  { value: "bar", label: "Bar" },
] as const;

export const PALETTE_DENSITY_OPTIONS = [
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "spacious", label: "Spacious" },
] as const;

export type PaletteDensity = (typeof PALETTE_DENSITY_OPTIONS)[number]["value"];

export const PALETTE_SIZE_OPTIONS = [
  { value: "default", label: "Default" },
  { value: "roomy", label: "Roomy" },
  { value: "large", label: "Large" },
] as const;

export type PaletteSize = (typeof PALETTE_SIZE_OPTIONS)[number]["value"];

export const REMOTE_IMPORT_IMAGE_OPTIONS = [
  { value: "ask", label: "Ask on next import" },
  { value: "download", label: "Download during import" },
  { value: "block", label: "Keep blocked" },
] as const;

export type RemoteImportImages = (typeof REMOTE_IMPORT_IMAGE_OPTIONS)[number]["value"];

export type VimCursorStyle = (typeof VIM_CURSOR_STYLE_OPTIONS)[number]["value"];

export const DEFAULT_AUTO_LOCK_MINUTES = 5;

export const DEFAULT_WORKSPACE_SETTINGS: WorkspaceSettings = {
  settingsVersion: 1,
  theme: "midnight",
  compactSidebar: false,
  showTreeGuides: false,
  showPageIcons: true,
  animatedIcons: true,
  rememberLastNote: true,
  editorFont: "inter",
  editorLineHeight: "comfortable",
  showLineNumbers: true,
  editorPlaceholder: "Start writing...",
  editorDefaultRawMode: false,
  blockDragHandle: true,
  vimMode: false,
  vimCursorStyle: "block",
  vimCursorBlink: false,
  typewriterScrolling: false,
  focusDimParagraphs: false,
  openNotesInTabs: false,
  showToasts: true,
  openLinksInApp: false,
  aiEnabled: false,
  autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
  lockOnBlur: false,
  paletteDensity: "normal",
  paletteSize: "default",
  remoteImportImages: "ask",
  facehashAvatar: true,
};

export type SettingsViewModel = {
  theme: string;
  compactSidebar: boolean;
  showTreeGuides: boolean;
  animatedIcons: boolean;
  rememberLastNote: boolean;
  editorFont: string;
  editorLineHeight: string;
  editorPlaceholder: string;
  editorDefaultRawMode: boolean;
  blockDragHandle: boolean;
  vimMode: boolean;
  vimCursorStyle: VimCursorStyle;
  vimCursorBlink: boolean;
  typewriterScrolling: boolean;
  focusDimParagraphs: boolean;
  openNotesInTabs: boolean;
  showToasts: boolean;
  openLinksInApp: boolean;
  aiEnabled: boolean;
  /** Minutes of inactivity before locked notes close again; zero means never. */
  autoLockMinutes: number;
  lockOnBlur: boolean;
  paletteDensity: PaletteDensity;
  paletteSize: PaletteSize;
  remoteImportImages: RemoteImportImages;
  facehashAvatar: boolean;
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
    theme: resolveTheme(settings.theme).id,
    compactSidebar: settings.compactSidebar,
    showTreeGuides: settings.showTreeGuides === true,
    animatedIcons: usesAnimatedIcons(settings),
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
    editorDefaultRawMode: settings.editorDefaultRawMode === true,
    blockDragHandle: usesBlockDragHandle(settings),
    vimMode: usesVimMode(settings),
    vimCursorStyle: vimCursorStyle(settings),
    vimCursorBlink: vimCursorBlinks(settings),
    typewriterScrolling: usesTypewriterScrolling(settings),
    focusDimParagraphs: dimsFocusParagraphs(settings),
    openNotesInTabs: settings.openNotesInTabs === true,
    showToasts: showsToasts(settings),
    openLinksInApp: opensLinksInApp(settings),
    aiEnabled: settings.aiEnabled === true,
    autoLockMinutes: autoLockMinutes(settings),
    lockOnBlur: locksOnBlur(settings),
    paletteDensity: paletteDensity(settings),
    paletteSize: paletteSize(settings),
    remoteImportImages: remoteImportImages(settings),
    facehashAvatar: usesFacehashAvatar(settings),
  };
}

/**
 * Whether both editors run modal Vim keybindings. Off unless explicitly turned
 * on, so a workspace written before the setting existed keeps ordinary typing.
 */
export function usesVimMode(settings: WorkspaceSettings): boolean {
  return settings.vimMode === true;
}

/**
 * @name usesTypewriterScrolling
 * @description Whether both editors keep the caret line vertically centred
 * while typing. Off unless explicitly turned on.
 *
 * @example
 * createTypewriterPlugin({ enabled: () => usesTypewriterScrolling(settings), scrollContainer });
 */
export function usesTypewriterScrolling(settings: WorkspaceSettings): boolean {
  return settings["typewriterScrolling"] === true;
}

/**
 * @name dimsFocusParagraphs
 * @description Whether focus mode dims every block except the one holding the
 * caret. Off unless explicitly turned on.
 *
 * @example
 * createFocusDimPlugin(() => dimsFocusParagraphs(store.getState().settings));
 */
export function dimsFocusParagraphs(settings: WorkspaceSettings): boolean {
  return settings["focusDimParagraphs"] === true;
}

export function vimCursorStyle(settings: WorkspaceSettings): VimCursorStyle {
  const value = settings["vimCursorStyle"];
  return VIM_CURSOR_STYLE_OPTIONS.some((option) => option.value === value)
    ? (value as VimCursorStyle)
    : "block";
}

export function paletteDensity(settings: WorkspaceSettings): PaletteDensity {
  const value = settings["paletteDensity"];
  return PALETTE_DENSITY_OPTIONS.some((option) => option.value === value)
    ? (value as PaletteDensity)
    : "normal";
}

/**
 * @name paletteSize
 * @description How large the command palette opens on wide screens. Unknown or
 * missing values fall back to the default size.
 *
 * @example
 * <CommandPalette size={paletteSize(state.settings)} />
 */
export function paletteSize(settings: WorkspaceSettings): PaletteSize {
  const value = settings["paletteSize"];
  return PALETTE_SIZE_OPTIONS.some((option) => option.value === value)
    ? (value as PaletteSize)
    : "default";
}

/**
 * What imports do with remote images in Markdown. Workspaces written before the
 * setting existed have no key and ask on the next import that contains one.
 */
export function remoteImportImages(settings: WorkspaceSettings): RemoteImportImages {
  const value = settings["remoteImportImages"];
  return REMOTE_IMPORT_IMAGE_OPTIONS.some((option) => option.value === value)
    ? (value as RemoteImportImages)
    : "ask";
}

export function vimCursorBlinks(settings: WorkspaceSettings): boolean {
  return settings["vimCursorBlink"] === true;
}

export function autoLockMinutes(settings: WorkspaceSettings): number {
  const value: unknown = settings.autoLockMinutes;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return DEFAULT_AUTO_LOCK_MINUTES;
  }
  return value;
}

export function locksOnBlur(settings: WorkspaceSettings): boolean {
  return settings.lockOnBlur === true;
}

export function showsToasts(settings: WorkspaceSettings): boolean {
  return settings.showToasts !== false;
}

/**
 * Whether links open in Skriuw's own browser window instead of the system
 * browser. Off unless explicitly turned on, so workspaces written before the
 * setting existed keep handing links to the operating system.
 */
export function opensLinksInApp(settings: WorkspaceSettings): boolean {
  return settings.openLinksInApp === true;
}

/**
 * Workspaces written before this setting existed have no `animatedIcons` key,
 * and animation is the default, so only an explicit `false` turns it off.
 */
export function usesAnimatedIcons(settings: WorkspaceSettings): boolean {
  return settings.animatedIcons !== false;
}

/**
 * Whether the signed-in account shows a generated Facehash face instead of its
 * initials. Workspaces written before the setting existed have no key, and the
 * face is the default, so only an explicit `false` brings the initials back.
 */
export function usesFacehashAvatar(settings: WorkspaceSettings): boolean {
  return settings.facehashAvatar !== false;
}

/**
 * Whether hovering a top-level block reveals the gutter that drags it to a new
 * position, inserts below it, and opens its actions. Workspaces written before
 * the setting existed have no key and kept the gutter, so only an explicit
 * `false` removes it. Every action the gutter offers stays reachable from the
 * keyboard (Alt-Arrow, slash menu, block context menu) when it is off.
 */
export function usesBlockDragHandle(settings: WorkspaceSettings): boolean {
  return settings.blockDragHandle !== false;
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

export function resetShortcutOverrides(
  settings: WorkspaceSettings,
  actionIds: readonly ShortcutActionId[],
): WorkspaceSettings {
  const overrides = rawShortcutOverrides(settings);
  const remaining: Record<string, unknown> = {};
  let removed = false;
  for (const [key, value] of Object.entries(overrides)) {
    if ((actionIds as readonly string[]).includes(key)) {
      removed = true;
      continue;
    }
    remaining[key] = value;
  }
  if (!removed) {
    return settings;
  }
  return { ...settings, shortcutOverrides: remaining };
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
