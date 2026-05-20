import { getAuthStateSnapshot, initializeAuth } from "@/platform/auth";
import { getSupabaseClient, isSupabaseConfigured } from "@/core/supabase/browser-client";
import { isEditorFontId, type EditorFontId } from "@/shared/lib/editor-fonts";

export type StoredEditorPreferences = {
	defaultFont?: EditorFontId;
};

export function getUserEditorPreferences(): StoredEditorPreferences | null {
	const rawPreferences = getAuthStateSnapshot().session?.user.user_metadata?.editor_preferences;
	if (!rawPreferences || typeof rawPreferences !== "object") {
		return null;
	}

	const rawEditorPreferences = rawPreferences as Record<string, unknown>;
	const defaultFont =
		typeof rawEditorPreferences.defaultFont === "string" &&
		isEditorFontId(rawEditorPreferences.defaultFont)
			? (rawEditorPreferences.defaultFont as EditorFontId)
			: undefined;

	return defaultFont ? { defaultFont } : null;
}

export async function updateUserEditorPreferences(
	preferences: Partial<StoredEditorPreferences>,
): Promise<void> {
	await initializeAuth();

	if (!getAuthStateSnapshot().session?.user || !isSupabaseConfigured()) {
		return;
	}

	const currentPreferences = getUserEditorPreferences() ?? {};
	const nextPreferences = {
		...currentPreferences,
		...preferences,
	};

	const supabase = getSupabaseClient();
	const { error } = await supabase.auth.updateUser({
		data: {
			editor_preferences: nextPreferences,
		},
	});

	if (error) {
		throw error;
	}
}
