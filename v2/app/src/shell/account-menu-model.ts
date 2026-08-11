import { THEME_ENTRIES } from "@/settings/themes";

export type ThemeOption = {
  id: string;
  label: string;
};

/**
 * Below this width a fly-out submenu has nowhere to land: the menu already
 * spans most of the viewport, so a second panel beside it would be pushed back
 * over its own trigger. Compact mode swaps the fly-outs for in-place panels.
 * Matches the breakpoint the settings dialog collapses at.
 */
export const COMPACT_MENU_QUERY = "(max-width: 620px)";

export type AccountMenuPanel = "root" | "appearance" | "transfer";

const PANEL_TITLES: Record<AccountMenuPanel, string> = {
  root: "Account",
  appearance: "Appearance",
  transfer: "Import and export",
};

/** Heading for a compact menu panel, reused as the label of its back row. */
export function accountMenuPanelTitle(panel: AccountMenuPanel): string {
  return PANEL_TITLES[panel];
}

/**
 * Theme list flattened for a menu: grouped palettes contribute one row per
 * variant, because a menu has no room for the settings picker's swatch cards.
 */
export function themeMenuOptions(): readonly ThemeOption[] {
  const options: ThemeOption[] = [];
  for (const entry of THEME_ENTRIES) {
    if (!entry.variants) {
      options.push({ id: entry.id, label: entry.label });
      continue;
    }
    for (const variant of entry.variants) {
      options.push({ id: variant.id, label: `${entry.label} ${variant.label}` });
    }
  }
  return options;
}

/** Label of the applied theme, or the raw id when a stored theme no longer exists. */
export function activeThemeLabel(theme: string): string {
  return themeMenuOptions().find((option) => option.id === theme)?.label ?? theme;
}

function emailLocalPart(email: string): string {
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

/** Name to show for the signed-in account, falling back to the email local part. */
export function accountDisplayName(name: string | null | undefined, email: string): string {
  const trimmed = name?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : emailLocalPart(email);
}

/**
 * Up to two letters for the avatar. Multi-word names give one letter per word;
 * anything else falls back to the leading characters of the single word.
 */
export function accountInitials(name: string | null | undefined, email: string): string {
  const source = accountDisplayName(name, email);
  const words = source
    .split(/[\s._-]+/)
    .map((word) => word.trim())
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return "?";
  }
  if (words.length === 1) {
    return words[0]!.slice(0, 2).toLocaleUpperCase();
  }
  return `${words[0]![0]!}${words[1]![0]!}`.toLocaleUpperCase();
}
