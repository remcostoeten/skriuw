import type { useCommandRegistry } from "@/core/commands";
import type { useNotesLayoutShortcuts } from "@/features/notes/hooks/use-notes-layout-shortcuts";

/**
 * Typed factories for the command-registry mocks in
 * `use-notes-layout-save-switch.test.ts`. Building them against
 * `ReturnType<typeof ...>` (rather than duplicating the shape by hand) means
 * a future field added to either hook's return value fails typecheck here
 * instead of silently drifting from what `useNotesLayout` actually receives.
 */

type CommandRegistryMock = ReturnType<typeof useCommandRegistry>;

export function createCommandRegistryMock(
	overrides: Partial<CommandRegistryMock> = {},
): CommandRegistryMock {
	return {
		registerHandlers: () => () => undefined,
		registerItemsProvider: () => () => undefined,
		pushActiveScope: () => () => undefined,
		executeCommand: () => undefined,
		getRegisteredHandler: () => undefined,
		isOpen: false,
		setIsOpen: () => undefined,
		toggleOpen: () => undefined,
		query: "",
		setQuery: () => undefined,
		activeScope: "global",
		itemProviders: [],
		...overrides,
	};
}

type NotesLayoutShortcutsMock = ReturnType<typeof useNotesLayoutShortcuts>;

export function createNotesLayoutShortcutsMock(
	overrides: Partial<NotesLayoutShortcutsMock> = {},
): NotesLayoutShortcutsMock {
	return {
		showCommandPalette: false,
		setShowCommandPalette: () => undefined,
		showShortcutHelp: false,
		setShowShortcutHelp: () => undefined,
		handleOpenCommandPalette: () => undefined,
		handleOpenShortcutHelp: () => undefined,
		shortcutGroups: [],
		...overrides,
	};
}
