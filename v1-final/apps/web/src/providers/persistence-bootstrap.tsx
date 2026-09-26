"use client";

import { useEffect } from "react";
import { useAuth } from "@/core/auth/use-auth";
import { useNotesStore } from "@/features/notes/store";
import { usePreferencesStore } from "@/features/settings/store";
import { useSidebarStore } from "@/features/notes/components/sidebar/store";

export function PersistenceBootstrap() {
	const auth = useAuth();
	const userScopeId = auth.user?.id;

	useEffect(() => {
		if (!auth.isReady) return;

		useNotesStore.getState().resetUi();
		if (auth.phase !== "authenticated" || !userScopeId) return;

		void useNotesStore.getState().initialize();
		void useSidebarStore.getState().syncUserScope(userScopeId);
		usePreferencesStore.getState().syncUserScope(userScopeId);

		const appearance = usePreferencesStore.getState().appearance;
		if (
			appearance &&
			useSidebarStore.getState().config.compactMode !== appearance.compactSidebar
		) {
			useSidebarStore.getState().setCompactMode(appearance.compactSidebar);
		}
	}, [auth.isReady, auth.phase, userScopeId]);

	return null;
}
