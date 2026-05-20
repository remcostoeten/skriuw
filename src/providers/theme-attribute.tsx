"use client";

import { useEffect } from "react";
import { usePreferencesStore } from "@/features/settings/store";

/**
 * Writes the user's selected theme onto `<html data-theme="...">` so the
 * CSS variants defined in `globals.css` activate.
 *
 * The default theme (`midnight`) matches the `:root` block, so first
 * paint for new users is already correct. Returning users with a non-
 * default theme may see a single-frame flash; if that ever becomes
 * noticeable, hoist this into a synchronous inline script in `<head>`
 * that reads `localStorage.getItem("preferences-store")` before paint.
 */
export function ThemeAttribute() {
	const theme = usePreferencesStore((state) => state.appearance.theme);

	useEffect(() => {
		const root = document.documentElement;
		root.setAttribute("data-theme", theme);
	}, [theme]);

	return null;
}
