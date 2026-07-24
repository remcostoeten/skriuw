import type { ReactNode } from "react";
import type { AppRoute } from "../app-route";
import type { CommandPaletteItem } from "../shared/ui/command-palette-model";
import { SHORTCUT_DEFINITIONS } from "../shortcuts/definitions";
import type { ShortcutActionId } from "../shortcuts/definitions";
import type { RendererState } from "../store/types";

export type CommandUiState = {
  route: AppRoute;
  sidebarOpen: boolean;
  metadataOpen: boolean;
  settingsOpen: boolean;
};

export type CommandPredicate = (state: RendererState, ui: CommandUiState) => boolean;

export type AppCommand = {
  id: string;
  label: string;
  group: string;
  icon?: ReactNode;
  keywords?: readonly string[];
  hint?: string;
  shortcut?: ShortcutActionId;
  enabled?: CommandPredicate;
  visible?: CommandPredicate;
  run: () => void;
};

export type ShortcutKeysLookup = (actionId: ShortcutActionId) => string;

export type CommandRegistry = {
  list: () => readonly AppCommand[];
  get: (id: string) => AppCommand | undefined;
  commandForShortcut: (actionId: ShortcutActionId) => AppCommand | undefined;
  isEnabled: (id: string, state: RendererState, ui: CommandUiState) => boolean;
  isVisible: (id: string, state: RendererState, ui: CommandUiState) => boolean;
  run: (id: string, state: RendererState, ui: CommandUiState) => boolean;
  paletteItems: (
    state: RendererState,
    ui: CommandUiState,
    shortcutKeys: ShortcutKeysLookup,
  ) => CommandPaletteItem[];
};

function commandEnabled(
  command: AppCommand,
  state: RendererState,
  ui: CommandUiState,
): boolean {
  return command.enabled?.(state, ui) ?? true;
}

function commandVisible(
  command: AppCommand,
  state: RendererState,
  ui: CommandUiState,
): boolean {
  return command.visible?.(state, ui) ?? true;
}

export function createCommandRegistry(
  commands: readonly AppCommand[],
): CommandRegistry {
  const byId = new Map<string, AppCommand>();
  const byShortcut = new Map<ShortcutActionId, AppCommand>();
  for (const command of commands) {
    if (byId.has(command.id)) {
      throw new Error(`duplicate command id: ${command.id}`);
    }
    byId.set(command.id, command);
    if (command.shortcut) {
      if (byShortcut.has(command.shortcut)) {
        throw new Error(`duplicate command shortcut: ${command.shortcut}`);
      }
      byShortcut.set(command.shortcut, command);
    }
  }

  function run(id: string, state: RendererState, ui: CommandUiState): boolean {
    const command = byId.get(id);
    if (!command || !commandEnabled(command, state, ui)) {
      return false;
    }
    command.run();
    return true;
  }

  function paletteItems(
    state: RendererState,
    ui: CommandUiState,
    shortcutKeys: ShortcutKeysLookup,
  ): CommandPaletteItem[] {
    const items: CommandPaletteItem[] = [];
    for (const command of byId.values()) {
      if (!commandVisible(command, state, ui) || !commandEnabled(command, state, ui)) {
        continue;
      }
      items.push({
        id: command.id,
        label: command.label,
        group: command.group,
        icon: command.icon,
        keywords: command.keywords,
        hint: command.hint,
        shortcut: command.shortcut ? shortcutKeys(command.shortcut) : undefined,
        action: command.run,
      });
    }
    return items;
  }

  return {
    list: () => commands,
    get: (id) => byId.get(id),
    commandForShortcut: (actionId) => byShortcut.get(actionId),
    isEnabled: (id, state, ui) => {
      const command = byId.get(id);
      return command !== undefined && commandEnabled(command, state, ui);
    },
    isVisible: (id, state, ui) => {
      const command = byId.get(id);
      return command !== undefined && commandVisible(command, state, ui);
    },
    run,
    paletteItems,
  };
}

export function registryShortcutActions(
  registry: CommandRegistry,
  getState: () => RendererState,
  getUi: () => CommandUiState,
): Record<ShortcutActionId, () => void> {
  const actions = {} as Record<ShortcutActionId, () => void>;
  for (const definition of SHORTCUT_DEFINITIONS) {
    actions[definition.id] = () => {
      const command = registry.commandForShortcut(definition.id);
      if (command) {
        registry.run(command.id, getState(), getUi());
      }
    };
  }
  return actions;
}
