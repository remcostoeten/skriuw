"use client";

import { useCallback, useEffect, useState } from "react";
import { useShortcut } from "@remcostoeten/use-shortcut";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import type { ShortcutHelpGroup } from "@/shared/ui/shortcut-help-dialog";

const NOTES_SHORTCUT_GROUPS: ShortcutHelpGroup[] = [
	{
		id: "notes-global",
		title: "Notes",
		shortcuts: [
			{ id: "palette", label: "Open command palette", combo: "mod+k / mod+shift+p" },
			{ id: "new-note", label: "Create note", combo: "mod+n" },
			{ id: "new-folder", label: "Create folder", combo: "mod+shift+n" },
			{ id: "toggle-sidebar", label: "Toggle sidebar", combo: "mod+b" },
			{ id: "toggle-metadata", label: "Toggle note details", combo: "mod+shift+b" },
			{ id: "settings", label: "Open settings", combo: "mod+comma" },
			{ id: "help", label: "Open shortcut help", combo: "shift+slash" },
		],
	},
];

type UseNotesLayoutShortcutsOptions = {
	handleCreateFile: () => void;
	handleCreateFolder: () => void;
	handleToggleSidebar: () => void;
	handleToggleMetadata: () => void;
	handleOpenSettings: () => void;
	handleToggleEditorMode: () => void;
};

export function useNotesLayoutShortcuts({
	handleCreateFile,
	handleCreateFolder,
	handleToggleSidebar,
	handleToggleMetadata,
	handleOpenSettings,
	handleToggleEditorMode,
}: UseNotesLayoutShortcutsOptions) {
	const $ = useShortcut({ ignoreInputs: true });
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

	useEffect(() => {
		$.setScopes(["notes"]);

		const bindings = [
			$.in("notes").mod.key("k").except("typing").on(handleOpenCommandPalette, {
				preventDefault: true,
				description: "Open the notes command palette",
			}),
			$.in("notes").mod.shift.key("p").except("typing").on(handleOpenCommandPalette, {
				preventDefault: true,
				description: "Open the notes command palette",
			}),
			$.in("notes").mod.key("n").except("typing").on(handleCreateFile, {
				preventDefault: true,
				description: "Create a new note",
			}),
			$.in("notes").mod.shift.key("n").except("typing").on(handleCreateFolder, {
				preventDefault: true,
				description: "Create a new folder",
			}),
			$.in("notes").mod.key("b").except("typing").on(handleToggleSidebar, {
				description: "Toggle the notes sidebar",
			}),
			$.in("notes").mod.shift.key("b").except("typing").on(handleToggleMetadata, {
				description: "Toggle the note details panel",
			}),
			$.in("notes").mod.key("comma").except("typing").on(handleOpenSettings, {
				preventDefault: true,
				description: "Open settings",
			}),
			$.in("notes").mod.key("e").except("typing").on(handleToggleEditorMode, {
				description: "Switch editor mode",
			}),
			$.in("notes").shift.key("slash").except("typing").on(handleOpenShortcutHelp, {
				description: "Open shortcut help",
			}),
		];

		return () => {
			bindings.forEach((binding) => binding.unbind());
		};
	}, [
		$,
		handleCreateFile,
		handleCreateFolder,
		handleOpenCommandPalette,
		handleOpenSettings,
		handleOpenShortcutHelp,
		handleToggleEditorMode,
		handleToggleMetadata,
		handleToggleSidebar,
	]);

	return {
		showCommandPalette,
		setShowCommandPalette,
		showShortcutHelp,
		setShowShortcutHelp,
		handleOpenCommandPalette,
		handleOpenShortcutHelp,
		shortcutGroups: NOTES_SHORTCUT_GROUPS,
	};
}
