"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { MotionPreferences } from "@/providers/motion-preferences";
import { useEffect, useState } from "react";
import { PersistenceBootstrap } from "@/providers/persistence-bootstrap";
import { noop } from "@/shared/lib/noop";
import { ProtectedAppGuard } from "@/providers/protected-app-guard";
import { ThemeAttribute } from "@/providers/theme-attribute";
import { WorkspaceBackendProvider } from "@/core/workspace-backend";
import { GuestWorkspaceBootstrap } from "@/providers/guest-workspace-bootstrap";
import { AppRoutePrefetcher } from "@/providers/app-route-prefetcher";
import { QueryCachePersistence } from "@/providers/query-cache-persistence";
import { WorkspaceWarmup } from "@/providers/workspace-warmup";
import { ShortcutProvider } from "@/core/shortcuts";
import { CommandProvider } from "@/core/commands";
import { GlobalCommandPaletteMount } from "@/features/layout/components/global-command-palette-mount";
import { PendingCollabReplay } from "@/features/collaboration/components/pending-collab-replay";
import { DesktopIndexSync } from "@/features/desktop/desktop-index-sync";
import { DesktopQuitShortcut } from "@/features/desktop/desktop-quit-shortcut";
import { DesktopToggleSize } from "@/features/desktop/desktop-toggle-size";
import { WindowControls } from "@/features/desktop/window-controls";
import { UserToastHost } from "@/shared/ui/user-toast-host";
import { EDITOR_PREFERENCES_STORAGE_KEY } from "@/features/settings/lib/editor-preferences";
import type { EditorPreferencesRecord } from "@/features/settings/server/queries";

type Props = {
	children: React.ReactNode;
	initialEditorPreferences: EditorPreferencesRecord | null;
};

function EditorPreferencesBootstrap({
	initialEditorPreferences,
}: {
	initialEditorPreferences: EditorPreferencesRecord | null;
}) {
	useEffect(() => {
		if (typeof window === "undefined") return;
		try {
			if (!initialEditorPreferences) {
				window.localStorage.removeItem(EDITOR_PREFERENCES_STORAGE_KEY);
				return;
			}
			window.localStorage.setItem(
				EDITOR_PREFERENCES_STORAGE_KEY,
				JSON.stringify(initialEditorPreferences),
			);
		} catch {
			// Ignore cache write failures.
			noop();
		}
	}, [initialEditorPreferences]);

	return null;
}

export function AppProviders({ children, initialEditorPreferences }: Props) {
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 60 * 1000,
						// Keep inactive queries around far longer than the 5-minute
						// default so the local-first cache survives between views and
						// so QueryCachePersistence can write them to IndexedDB before
						// they are garbage collected.
						gcTime: 1000 * 60 * 60 * 24,
						// User-owned, mutation-driven data: tab-focus refetches are
						// almost always wasted round trips. Mutations invalidate the
						// specific keys that need it.
						refetchOnWindowFocus: false,
					},
				},
			}),
	);

	return (
		<QueryClientProvider client={queryClient}>
			<QueryCachePersistence />
			<MotionPreferences>
				<TooltipProvider>
					<EditorPreferencesBootstrap
						initialEditorPreferences={initialEditorPreferences}
					/>
					<ProtectedAppGuard>
						<WorkspaceBackendProvider>
							<DesktopIndexSync />
							<DesktopQuitShortcut />
							<DesktopToggleSize />
							<WindowControls />
							<PersistenceBootstrap />
							<GuestWorkspaceBootstrap />
							<AppRoutePrefetcher />
							<WorkspaceWarmup />
							<ThemeAttribute />
							<ShortcutProvider>
								<CommandProvider>
									{children}
									<GlobalCommandPaletteMount />
								</CommandProvider>
							</ShortcutProvider>
							<PendingCollabReplay />
							<UserToastHost />
						</WorkspaceBackendProvider>
					</ProtectedAppGuard>
				</TooltipProvider>
			</MotionPreferences>
		</QueryClientProvider>
	);
}
