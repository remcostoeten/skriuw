import * as React from "react";
import { useShortcutScope } from "@/core/shortcuts";
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
	const webview = getWebview();
	if (webview) {
		const style = document.documentElement.style as CSSStyleDeclaration & { zoom: string };
		if (style.zoom) style.zoom = "";
		webview.setZoom(value).catch(noop);
		return;
	}
	(document.documentElement.style as CSSStyleDeclaration & { zoom: string }).zoom = String(value);
}

function persistZoom(zoom: number): void {
	window.localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
}

/**
 * Desktop-only page zoom. Mirrors browser zoom: `Ctrl +` / `Ctrl -` step the
 * level, `Ctrl 0` resets, and `Ctrl` + mouse wheel zooms continuously. The level
 * is clamped to [{@link MIN_ZOOM}, {@link MAX_ZOOM}] and persisted across launches.
 * Renders nothing; it only wires up global listeners while running under Tauri.
 */
export function DesktopZoom() {
	const zoomRef = React.useRef(readStoredZoom());

	React.useEffect(() => {
		if (!isTauriRuntime()) return;

		zoomRef.current = readStoredZoom();
		applyZoom(zoomRef.current);

		const onWheel = (event: WheelEvent) => {
			if (!(event.ctrlKey || event.metaKey)) return;
			event.preventDefault();
			const delta = event.deltaY < 0 ? STEP : -STEP;
			const next = clamp(roundZoom(zoomRef.current + delta));
			zoomRef.current = next;
			applyZoom(next);
			persistZoom(next);
		};

		window.addEventListener("wheel", onWheel, { passive: false });
		return () => window.removeEventListener("wheel", onWheel);
	}, []);

	useShortcutScope("app", {
		"desktop.zoomIn": () => {
			const next = clamp(roundZoom(zoomRef.current + STEP));
			zoomRef.current = next;
			applyZoom(next);
			persistZoom(next);
		},
		"desktop.zoomOut": () => {
			const next = clamp(roundZoom(zoomRef.current - STEP));
			zoomRef.current = next;
			applyZoom(next);
			persistZoom(next);
		},
		"desktop.zoomReset": () => {
			zoomRef.current = 1;
			applyZoom(1);
			persistZoom(1);
		},
	});

	return null;
}
