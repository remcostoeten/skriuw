"use client";

import { useEffect } from "react";
import { usePreferencesStore } from "@/features/settings/store";
import { noop } from "@/shared/lib/noop";
import type { ThemeId } from "@/features/settings/preferences/themes";

/** Shared with the pre-paint theme script in the root layout `<head>`. */
export const ACTIVE_THEME_KEY = "skriuw-active-theme";

const THEME_COLOR_BY_ID: Record<ThemeId, string> = {
	midnight: "hsl(2 0% 7%)",
	paper: "hsl(40 18% 96%)",
	embers: "hsl(20 15% 9%)",
	mocha: "hsl(240 21% 15%)",
	"catppuccin-latte": "hsl(220 23% 95%)",
	"rose-pine": "hsl(249 22% 12%)",
	"rose-pine-dawn": "hsl(35 30% 95%)",
	gruvbox: "hsl(0 0% 16%)",
	"tokyo-night": "hsl(235 22% 12%)",
};

/**
 * Writes the user's selected theme onto `<html data-theme="...">` so the
 * CSS variants defined in `globals.css` activate, and keeps the browser
 * chrome / Android-PWA status bar tint in sync with that theme.
 *
 * First paint (before hydration) is handled by the pre-paint script in the
 * root layout `<head>`, which reads the `ACTIVE_THEME_KEY` mirror this effect
 * maintains — so returning users don't flash the default theme on reload.
 */
export function ThemeAttribute() {
	const theme = usePreferencesStore((state) => state.appearance.theme);

	useEffect(() => {
		const root = document.documentElement;
		root.dataset.theme = theme;
		// Mirror the resolved theme to a flat key the pre-paint <head> script can
		// read synchronously. `preferences-store` is a per-profile map keyed by
		// user id, so it can't be resolved before auth settles — this avoids a
		// flash of the default theme on reload for returning users.
		try {
			localStorage.setItem(ACTIVE_THEME_KEY, theme);
		} catch {
			noop();
		}
		syncThemeColorMeta();
		const frame = requestAnimationFrame(() => {
			delete root.dataset.themeSwitching;
		});
		return () => cancelAnimationFrame(frame);
	}, [theme]);

	return null;
}

/**
 * The app has seven `data-theme` themes that are independent of the OS
 * `prefers-color-scheme`, so a static media-scoped `theme-color` pair would
 * tint the mobile address bar / Android PWA status bar wrong (e.g. a light
 * "paper" theme on a dark-mode phone). The pre-paint script seeds a single
 * media-less meta; here we keep its content matched to the real active-theme
 * background. Any stray media-scoped metas are removed defensively.
 */
function syncThemeColorMeta() {
	const head = document.head;
	if (!head) return;
	head.querySelectorAll('meta[name="theme-color"][media]').forEach((meta) => meta.remove());
	let meta = head.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
	if (!meta) {
		meta = document.createElement("meta");
		meta.name = "theme-color";
		head.appendChild(meta);
	}
	const color = THEME_COLOR_BY_ID[document.documentElement.dataset.theme as ThemeId] ?? "#121212";
	if (meta.content !== color) {
		meta.content = color;
	}
}
