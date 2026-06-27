import { getServerUser } from "@/core/db";

export type EditorPreferencesRecord = {
	defaultFont?: string;
	animateNumbers?: boolean;
};

export async function loadUserEditorPreferences(): Promise<EditorPreferencesRecord | null> {
	const { user } = await getServerUser();
	if (!user) return null;
	return (user as { editorPreferences?: EditorPreferencesRecord | null }).editorPreferences ?? null;
}
