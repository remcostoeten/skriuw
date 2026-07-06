"use client";

import { useShortcutScope } from "@/core/shortcuts";
import { isTauriRuntime, tauriInvoke } from "@/core/workspace-backend/tauri-backend";

/**
 * Desktop-only. Quits the app on Ctrl/Cmd+Shift+Q by invoking the Rust
 * `quit_app` command (`app.exit(0)`), which is a real quit rather than the
 * hide-to-tray a plain window close would do. No-ops in the web build, where
 * the command is absent.
 */
export function DesktopQuitShortcut(): null {
	useShortcutScope(
		"app",
		{ "desktop.quit": () => void tauriInvoke("quit_app") },
		{ active: isTauriRuntime() },
	);

	return null;
}
