import * as React from "react";

import { isTauriRuntime } from "@/core/workspace-backend/tauri-backend";
import { noop } from "@/shared/lib/noop";

type TauriWebview = { setZoom: (factor: number) => Promise<void> };
type TauriWebviewApi = {
	getCurrentWebview?: () => TauriWebview;
	getCurrent?: () => TauriWebview;
};
type TauriWebviewGlobal = { __TAURI__?: { webview?: TauriWebviewApi } };

function getWebview(): TauriWebview | null {
	if (typeof window === "undefined") return null;
	const api = (window as TauriWebviewGlobal).__TAURI__?.webview;
	if (!api) return null;
	const resolve = api.getCurrentWebview ?? api.getCurrent;
	return resolve ? resolve() : null;
}

const ZOOM_STORAGE_KEY = "skriuw:desktop:zoom:v1";
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const STEP = 0.1;

function clamp(value: number): number {
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function roundZoom(value: number): number {
	return Math.round(value * 100) / 100;
}

function readStoredZoom(): number {
	if (typeof window === "undefined") return 1;
	const raw = window.localStorage.getItem(ZOOM_STORAGE_KEY);
	const parsed = raw ? Number.parseFloat(raw) : NaN;
	return Number.isFinite(parsed) ? clamp(parsed) : 1;
}

function applyZoom(value: number): void {
	// Zoom at the webview engine level, not via CSS `zoom`. CSS `zoom` on
	// WebKitGTK puts `getBoundingClientRect()` (read by floating-ui) and
	// `MouseEvent.clientX/clientY` (used to anchor context menus) in different
	// coordinate spaces, so every popover, dropdown and context menu mis-anchors
	// by a fixed offset. Native `setZoom` scales the whole webview, keeping both
	// spaces in sync.
	const webview = getWebview();
	if (webview) {
		const style = document.documentElement.style as CSSStyleDeclaration & { zoom: string };
		if (style.zoom) style.zoom = "";
		webview.setZoom(value).catch(noop);
		return;
	}
	(document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = String(value);
}

/**
 * Desktop-only page zoom. Mirrors browser zoom: `Ctrl +` / `Ctrl -` step the
 * level, `Ctrl 0` resets, and `Ctrl` + mouse wheel zooms continuously. The level
 * is clamped to [{@link MIN_ZOOM}, {@link MAX_ZOOM}] and persisted across launches.
 * Renders nothing; it only wires up global listeners while running under Tauri.
 */
export function DesktopZoom() {
	React.useEffect(() => {
		if (!isTauriRuntime()) return;

		let zoom = readStoredZoom();

		const persist = () => {
			window.localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
		};

		const setZoom = (next: number) => {
			zoom = clamp(roundZoom(next));
			applyZoom(zoom);
			persist();
		};

		applyZoom(zoom);

		const onKeyDown = (event: KeyboardEvent) => {
			if (!(event.ctrlKey || event.metaKey)) return;

			switch (event.key) {
				case "=":
				case "+":
					event.preventDefault();
					setZoom(zoom + STEP);
					break;
				case "-":
				case "_":
					event.preventDefault();
					setZoom(zoom - STEP);
					break;
				case "0":
					event.preventDefault();
					setZoom(1);
					break;
				default:
					break;
			}
		};

		const onWheel = (event: WheelEvent) => {
			if (!(event.ctrlKey || event.metaKey)) return;
			event.preventDefault();
			const delta = event.deltaY < 0 ? STEP : -STEP;
			setZoom(zoom + delta);
		};

		window.addEventListener("keydown", onKeyDown);
		// `passive: false` so `preventDefault` blocks the webview's own pinch/zoom.
		window.addEventListener("wheel", onWheel, { passive: false });

		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("wheel", onWheel);
		};
	}, []);

	return null;
}
