import { KeyboardIcon } from "@/shared/icons/static";
import type { AppCommand } from "./registry";

export function commandPaletteCommand(togglePalette: () => void): AppCommand {
  return {
    id: "toggle-command-palette",
    label: "Open command palette",
    group: "General",
    shortcut: "toggleCommandPalette",
    visible: () => false,
    run: togglePalette,
  };
}

export function shortcutHelpCommand(showShortcutHelp: () => void): AppCommand {
  return {
    id: "show-shortcut-help",
    label: "Show keyboard shortcuts",
    group: "General",
    keywords: ["cheat sheet", "keybindings", "help"],
    icon: <KeyboardIcon size={15} />,
    shortcut: "showShortcutHelp",
    run: showShortcutHelp,
  };
}
