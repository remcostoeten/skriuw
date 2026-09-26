"use server";

import { getAuthenticatedUser } from "@/core/db";
import type { EditorPreferencesRecord } from "./queries";

export async function updateUserEditorPreferences(
	preferences: Partial<EditorPreferencesRecord>,
): Promise<void> {
	const { prisma, user } = await getAuthenticatedUser();
	const current =
		(user as { editorPreferences?: EditorPreferencesRecord | null }).editorPreferences ?? {};
	const next = {
		...current,
		...preferences,
		...(preferences.ai ? { ai: { ...current.ai, ...preferences.ai } } : {}),
	};

	await prisma.user.update({
		where: { id: user.id },
		data: { editorPreferences: next },
	});
}
