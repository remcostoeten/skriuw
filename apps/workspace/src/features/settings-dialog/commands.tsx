import type { RendererStore } from "@skriuw/renderer-core/store/types";
import type { AppCommand } from "@/commands/registry";
import { updateSetting } from "@/features/settings/update-settings";
import { PaletteIcon, SettingsIcon } from "@/shared/icons/static";
import type { SectionId } from "./sections";
import { THEME_ENTRIES } from "@/features/settings/themes";

type ThemeChoice = {
  id: string;
  label: string;
  swatchFrom: string;
  swatchTo: string;
};

/**
 * Every selectable theme, with variants flattened into standalone choices so
 * the palette offers "Catppuccin Latte" directly instead of a nested picker.
 */
function themeChoices(): ThemeChoice[] {
  return THEME_ENTRIES.flatMap((entry) =>
    entry.variants
      ? entry.variants.map((variant) => ({
          id: variant.id,
          label: `${entry.label} ${variant.label}`,
          swatchFrom: variant.swatchFrom,
          swatchTo: variant.swatchTo,
        }))
      : [
          {
            id: entry.id,
            label: entry.label,
            swatchFrom: entry.swatchFrom,
            swatchTo: entry.swatchTo,
          },
        ],
  );
}

function themeCommands(store: RendererStore): AppCommand[] {
  return themeChoices().map((choice) => ({
    id: `set-theme-${choice.id}`,
    label: `Theme: ${choice.label}`,
    group: "View",
    family: "Themes",
    keywords: ["theme", "appearance", "color", "switch"],
    icon: (
      <span
        aria-hidden
        className="block size-[13px] rounded-full border border-border/60"
        style={{
          background: `linear-gradient(135deg, ${choice.swatchFrom}, ${choice.swatchTo})`,
        }}
      />
    ),
    run: () => updateSetting(store, "theme", choice.id),
  }));
}

export function settingsCommands(
  store: RendererStore,
  openSettings: () => void,
  openSettingsAt: (section: SectionId) => void,
): AppCommand[] {
  return [
    {
      id: "open-settings",
      label: "Open settings",
      group: "General",
      keywords: ["preferences"],
      icon: <SettingsIcon size={15} />,
      shortcut: "openSettings",
      run: openSettings,
    },
    {
      id: "open-theme-settings",
      label: "Theme settings",
      group: "General",
      keywords: ["theme", "appearance", "color", "dark", "light", "preferences"],
      icon: <PaletteIcon size={15} />,
      run: () => openSettingsAt("appearance"),
    },
    ...themeCommands(store),
  ];
}
