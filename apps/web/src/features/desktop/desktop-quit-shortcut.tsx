"use client";

import { useEffect } from "react";
import { isTauriRuntime, tauriInvoke } from "@/core/workspace-backend/tauri-backend";

/**
 * Desktop-only. Quits the app on Ctrl/Cmd+Shift+Q by invoking the Rust
 * `quit_app` command (`app.exit(0)`), which is a real quit rather than the
 * hide-to-tray a plain window close would do. Registered as a raw window
 * listener rather than a scoped shortcut so it fires from any route. No-ops in
 * the web build, where the command is absent.
 */
export function DesktopQuitShortcut(): null {
	useEffect(() => {
		if (!isTauriRuntime()) return;

		function onKeyDown(event: KeyboardEvent) {
			if (
				event.shiftKey &&
				(event.ctrlKey || event.metaKey) &&
				event.key.toLowerCase() === "q"
			) {
				event.preventDefault();
				void tauriInvoke("quit_app");
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	return null;
}
