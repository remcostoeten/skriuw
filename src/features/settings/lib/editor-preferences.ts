import { isEditorFontId, type EditorFontId } from "@/shared/lib/editor-fonts";

const STORAGE_KEY = "skriuw:editor:preferences:v1";

export type StoredEditorPreferences = {
	defaultFont?: EditorFontId;
};

export function getUserEditorPreferences(): StoredEditorPreferences | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Record<string, unknown>;
		const defaultFont =
			typeof parsed.defaultFont === "string" && isEditorFontId(parsed.defaultFont)
				? (parsed.defaultFont as EditorFontId)
				: undefined;
		return defaultFont ? { defaultFont } : null;
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
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
	} catch {
		// Storage unavailable; nothing to do.
	}
}
