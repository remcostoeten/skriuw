import { getServerUser } from "@/core/db";
import { editorFontVariables } from "@/app/editor-font-loaders";
import { GuestBanner } from "@/features/layout/components/guest-banner";
import { AppProviders } from "@/providers/app-providers";
import type { EditorPreferencesRecord } from "@/features/settings/server/queries";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
	const { user } = await getServerUser();
	const initialEditorPreferences: EditorPreferencesRecord | null = user
		? ((user as { editorPreferences?: EditorPreferencesRecord | null }).editorPreferences ??
			null)
		: null;

	return (
		<AppProviders initialEditorPreferences={initialEditorPreferences}>
			<div className={editorFontVariables}>
				{!user && <GuestBanner />}
				{children}
			</div>
		</AppProviders>
	);
}
