"use client";

import { useShortcutScope } from "@/core/shortcuts";
import { isTauriRuntime, tauriInvoke } from "@/core/workspace-backend/tauri-backend";

/**
 * Desktop-only. Toggles the main window between maximized and the default
 * 1440×960 size on `mod+enter`. No-ops in the web build.
 */
export function DesktopToggleSize(): null {
	useShortcutScope(
		"app",
		{ "desktop.toggleMaximize": () => void tauriInvoke("toggle_window_size") },
		{ active: isTauriRuntime() },
	);

	return null;
}
