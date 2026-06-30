"use client";

import { useCallback, useState } from "react";
import { useShortcutManager, useShortcutScope } from "@/core/shortcuts";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { focusActiveEditor } from "@/shared/lib/focus-editor";

type UseNotesLayoutShortcutsOptions = {
	handleCreateFile: () => void;
	handleCreateFolder: () => void;
	handleToggleSidebar: () => void;
	handleToggleMetadata: () => void;
	handleOpenSettings: () => void;
	handleToggleEditorMode: () => void;
	handleFocusFileTree: () => void;
	handleToggleSplit: () => void;
	handleSplitHorizontal: () => void;
	handleCloseSplitPane: () => void;
	handleCloseFocusedTab: () => void;
	handleFocusNextSplitPane: () => void;
	handleFocusPreviousSplitPane: () => void;
};

export function useNotesLayoutShortcuts({
	handleCreateFile,
	handleCreateFolder,
	handleToggleSidebar,
	handleToggleMetadata,
	handleOpenSettings,
	handleToggleEditorMode,
	handleFocusFileTree,
	handleToggleSplit,
	handleSplitHorizontal,
	handleCloseSplitPane,
	handleCloseFocusedTab,
	handleFocusNextSplitPane,
	handleFocusPreviousSplitPane,
}: UseNotesLayoutShortcutsOptions) {
	const { getHelpGroups } = useShortcutManager();
	const [showCommandPalette, setShowCommandPalette] = useState(false);
	const [showShortcutHelp, setShowShortcutHelp] = useState(false);

	const handleOpenCommandPalette = useCallback(() => {
		triggerNativeFeedback("selection");
		setShowCommandPalette(true);
	}, []);

	const handleOpenShortcutHelp = useCallback(() => {
		triggerNativeFeedback("selection");
		setShowShortcutHelp(true);
	}, []);

	useShortcutScope("notes", {
		"notes.commandPalette": handleOpenCommandPalette,
		"notes.newNote": handleCreateFile,
		"notes.newFolder": handleCreateFolder,
		"notes.toggleSidebar": handleToggleSidebar,
		"notes.toggleMetadata": handleToggleMetadata,
		"notes.settings": handleOpenSettings,
		"notes.toggleEditor": handleToggleEditorMode,
		"notes.focusFileTree": handleFocusFileTree,
		"notes.toggleSplit": handleToggleSplit,
		"notes.splitHorizontal": handleSplitHorizontal,
		"notes.closeTab": handleCloseFocusedTab,
		"notes.closeSplit": handleCloseSplitPane,
		"notes.focusNextSplitPane": handleFocusNextSplitPane,
		"notes.focusPreviousSplitPane": handleFocusPreviousSplitPane,
		"notes.focusEditor": () => focusActiveEditor(),
		"notes.help": handleOpenShortcutHelp,
	});

	return {
		showCommandPalette,
		setShowCommandPalette,
		showShortcutHelp,
		setShowShortcutHelp,
		handleOpenCommandPalette,
		handleOpenShortcutHelp,
		shortcutGroups: getHelpGroups(["notes"]),
	};
}
