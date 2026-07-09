"use client";

import { useCallback, useState } from "react";
import { useShortcutManager, useShortcutScope } from "@/core/shortcuts";
import { useCommandRegistry } from "@/core/commands";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";

type UseNotesLayoutShortcutsOptions = {
	handleSwitchToTabIndex: (index: number) => void;
	handleCycleTab: (direction: 1 | -1) => void;
};

export function useNotesLayoutShortcuts({
	handleSwitchToTabIndex,
	handleCycleTab,
}: UseNotesLayoutShortcutsOptions) {
	const { getHelpGroups } = useShortcutManager();
	const {
		isOpen: showCommandPalette,
		setIsOpen: setShowCommandPalette,
		toggleOpen: handleOpenCommandPalette,
	} = useCommandRegistry();

	const [showShortcutHelp, setShowShortcutHelp] = useState(false);

	const handleOpenShortcutHelp = useCallback(() => {
		triggerNativeFeedback("selection");
		setShowShortcutHelp(true);
	}, []);

	// Only bind layout-specific shortcuts that are not commands in the registry
	useShortcutScope("notes", {
		"notes.switchTab1": () => handleSwitchToTabIndex(0),
		"notes.switchTab2": () => handleSwitchToTabIndex(1),
		"notes.switchTab3": () => handleSwitchToTabIndex(2),
		"notes.switchTab4": () => handleSwitchToTabIndex(3),
		"notes.switchTab5": () => handleSwitchToTabIndex(4),
		"notes.switchTab6": () => handleSwitchToTabIndex(5),
		"notes.switchTab7": () => handleSwitchToTabIndex(6),
		"notes.switchTab8": () => handleSwitchToTabIndex(7),
		"notes.switchTab9": () => handleSwitchToTabIndex(-1),
		"notes.cycleTabForward": () => handleCycleTab(1),
		"notes.cycleTabBackward": () => handleCycleTab(-1),
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
