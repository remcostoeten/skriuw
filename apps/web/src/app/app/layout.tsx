import { getServerUser } from "@/core/db";
import { toAuthUser } from "@/core/auth/auth-user";
import type { BetterAuthUser } from "@/core/auth/auth-user";
import { editorFontVariables } from "@/app/editor-font-loaders";
import { GuestBanner } from "@/features/layout/components/guest-banner";
import { AppProviders } from "@/providers/app-providers";
import { SettingsModal } from "@/features/settings/components/settings-modal";
import { MobileAppNav } from "@/features/layout/components/mobile-app-nav";
import type { EditorPreferencesRecord } from "@/features/settings/server/queries";

export const instant = false;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
	const { user } = await getServerUser();
	const initialEditorPreferences: EditorPreferencesRecord | null = user
		? ((user as { editorPreferences?: EditorPreferencesRecord | null }).editorPreferences ??
			null)
		: null;

	return (
		<AppProviders
			initialEditorPreferences={initialEditorPreferences}
			initialAuthUser={toAuthUser(user as BetterAuthUser | null)}
		>
			<div className={`flex h-dvh flex-col ${editorFontVariables}`}>
				{!user && <GuestBanner />}
				<div className="flex min-h-0 flex-1 flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0">
					{children}
				</div>
				<MobileAppNav />
			</div>
			<SettingsModal />
		</AppProviders>
	);
}
