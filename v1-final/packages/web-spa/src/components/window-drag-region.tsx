import { useEffect, useState } from "react";

type TauriWindow = {
	startDragging: () => Promise<void>;
};

type TauriWindowApi = {
	getCurrentWindow?: () => TauriWindow;
	getCurrent?: () => TauriWindow;
};

type TauriGlobal = { __TAURI__?: { window?: TauriWindowApi } };

function getAppWindow(): TauriWindow | null {
	if (typeof window === "undefined") return null;
	const api = (window as TauriGlobal).__TAURI__?.window;
	if (!api) return null;
	const resolve = api.getCurrentWindow ?? api.getCurrent;
	return resolve ? resolve() : null;
}

function isInteractiveTarget(target: EventTarget | null) {
	if (!(target instanceof Element)) return false;
	return Boolean(
		target.closest(
			"button, a, input, textarea, select, option, [role='button'], [data-no-window-drag]",
		),
	);
}

/**
 * Programmatic window drag for the frameless desktop shell.
 * The native title bar is disabled (`decorations: false`), so the window needs
 * an explicit drag path. We only start dragging on `Alt`/`Meta` + left click and
 * skip interactive controls so header actions remain clickable.
 */
export function WindowDragRegion() {
	const [tauriWindow] = useState<TauriWindow | null>(getAppWindow);

	useEffect(() => {
		if (!tauriWindow) return;

		const onMouseDown = (event: MouseEvent) => {
			if (event.button !== 0) return;
			if (!event.altKey && !event.metaKey) return;
			if (isInteractiveTarget(event.target)) return;

			event.preventDefault();
			void tauriWindow.startDragging().catch(() => {});
		};

		window.addEventListener("mousedown", onMouseDown, true);
		return () => window.removeEventListener("mousedown", onMouseDown, true);
	}, [tauriWindow]);

	return null;
}
