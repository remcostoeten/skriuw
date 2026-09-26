"use client";

import { useEffect, useRef } from "react";

const MENU_ACTION_EVENT = "skriuw:menu-action";

type DesktopMenuAction = "new-note" | "new-folder" | "save" | "toggle-sidebar";

type UseDesktopMenuActionsOptions = {
	onCreateFile: () => void;
	onCreateFolder: () => void;
	onToggleSidebar: () => void;
	onSave: () => void;
};

/**
 * Bridges the desktop shell's native application menu to the notes workspace.
 * The Rust shell forwards each menu click as a `skriuw:menu-action` DOM event
 * (payload = the item id); this maps the workspace-scoped ids onto the same
 * handlers the keyboard shortcuts and command palette use. No-ops in the web
 * build, where the event never fires.
 */
export function useDesktopMenuActions(options: UseDesktopMenuActionsOptions): void {
	const handlersRef = useRef(options);
	handlersRef.current = options;

	useEffect(() => {
		function onMenuAction(event: Event) {
			const action = (event as CustomEvent<string>).detail as DesktopMenuAction;
			const handlers = handlersRef.current;
			switch (action) {
				case "new-note":
					handlers.onCreateFile();
					break;
				case "new-folder":
					handlers.onCreateFolder();
					break;
				case "toggle-sidebar":
					handlers.onToggleSidebar();
					break;
				case "save":
					handlers.onSave();
					break;
			}
		}

		window.addEventListener(MENU_ACTION_EVENT, onMenuAction);
		return () => window.removeEventListener(MENU_ACTION_EVENT, onMenuAction);
	}, []);
}
