import type { AppRoute } from "@skriuw/renderer-core/route/app-route";
import type { RendererStore } from "@skriuw/renderer-core/store/types";
import { commandPaletteCommand, shortcutHelpCommand } from "@/commands/palette-commands";
import type { AppCommand } from "@/commands/registry";
import { aiCommands } from "@/features/ai/commands";
import { authCommands } from "@/features/auth/commands";
import { editorCommands } from "@/features/editor/commands";
import { journalCommands } from "@/features/journal/commands";
import { lockCommands } from "@/features/lock/commands";
import { referenceCommands } from "@/features/references/commands";
import { settingsCommands } from "@/features/settings-dialog/commands";
import { sharingCommands } from "@/features/sharing/commands";
import { sidebarCommands } from "@/features/sidebar/commands";
import { templateCommands } from "@/features/templates/commands";
import { transferCommands } from "@/features/transfer/commands";
import { shellCommands } from "@/shell/commands";

export type AppCommandControls = {
  togglePalette: () => void;
  openSettings: () => void;
  /** Opens settings on a specific section, e.g. appearance for theme commands. */
  openSettingsAt: Parameters<typeof settingsCommands>[2];
  /** Opens the shell-level cloud sign-in drawer, closing settings if it is open. */
  openSignIn: () => void;
  showShortcutHelp: () => void;
  toggleSidebar: () => void;
  /** Reveals the sidebar without toggling it, for actions that live in the tree. */
  openSidebar: () => void;
  toggleMetadata: () => void;
  toggleFocusMode: () => void;
  navigate: (route: AppRoute) => void;
};

/**
 * Every module's commands in registration order. The palette lists a group's
 * commands in this order, so a module that shares a group with another keeps
 * its place here.
 */
export function createAppCommands(
  store: RendererStore,
  controls: AppCommandControls,
  aiEnabled: boolean,
): AppCommand[] {
  return [
    commandPaletteCommand(controls.togglePalette),
    ...sidebarCommands(store, controls.openSidebar),
    ...templateCommands(store),
    ...referenceCommands(controls.navigate),
    ...lockCommands(store),
    ...editorCommands(store),
    ...transferCommands(store, controls.navigate),
    ...sharingCommands(store),
    ...settingsCommands(store, controls.openSettings, controls.openSettingsAt),
    ...authCommands(controls.openSignIn),
    shortcutHelpCommand(controls.showShortcutHelp),
    ...shellCommands(store, controls),
    ...journalCommands(controls.openSidebar),
    ...aiCommands(
      aiEnabled,
      () => controls.openSettingsAt("ai"),
      () => controls.navigate("prompt-playground"),
    ),
  ];
}
