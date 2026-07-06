"use client";

import { useEffect } from "react";
import { isTauriRuntime, tauriInvoke } from "@/core/workspace-backend/tauri-backend";

/**
 * Desktop-only. Toggles the main window between maximized and the default
 * 1440×960 size on `mod+enter`. Registered as a raw global listener so it
 * fires from any route. No-ops in the web build.
 */
export function DesktopToggleSize(): null {
	useEffect(() => {
		if (!isTauriRuntime()) return;

		function onKeyDown(event: KeyboardEvent) {
			if (
				event.key === "Enter" &&
				(event.metaKey || event.ctrlKey)
			) {
				event.preventDefault();
				void tauriInvoke("toggle_window_size");
			}
		}

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	return null;
}
