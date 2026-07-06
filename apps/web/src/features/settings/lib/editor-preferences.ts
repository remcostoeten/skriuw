import { isEditorFontId, type EditorFontId } from "@/shared/lib/editor-fonts";
import { noop } from "@/shared/lib/noop";
import { updateUserEditorPreferences as saveUserEditorPreferences } from "@/features/settings/server/actions";

export const EDITOR_PREFERENCES_STORAGE_KEY = "skriuw:editor:preferences:v1";

export type StoredEditorPreferences = {
	defaultFont?: EditorFontId;
	animateNumbers?: boolean;
};

export function getUserEditorPreferences(): StoredEditorPreferences | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(EDITOR_PREFERENCES_STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const defaultFont =
			typeof parsed.defaultFont === "string" && isEditorFontId(parsed.defaultFont)
				? (parsed.defaultFont as EditorFontId)
				: undefined;
		const animateNumbers =
			typeof parsed.animateNumbers === "boolean" ? parsed.animateNumbers : undefined;
		if (!defaultFont && animateNumbers === undefined) return null;
		return {
			...(defaultFont ? { defaultFont } : {}),
			...(animateNumbers !== undefined ? { animateNumbers } : {}),
		};
	} catch {
		return null;
	}
}

export async function updateUserEditorPreferences(
	preferences: Partial<StoredEditorPreferences>,
): Promise<void> {
	if (typeof window === "undefined") return;
	const current = getUserEditorPreferences() ?? {};
	const next = { ...current, ...preferences };
	try {
		window.localStorage.setItem(EDITOR_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
		await saveUserEditorPreferences(next);
	} catch {
		// Storage unavailable; nothing to do.
		noop();
	}
}
