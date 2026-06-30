"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { MotionPreferences } from "@/providers/motion-preferences";
import { lazy, Suspense, useEffect, useState } from "react";
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
import { GlobalShortcutHandlers } from "@/core/shortcuts/global-shortcut-handlers";
import { PendingCollabReplay } from "@/features/collaboration/components/pending-collab-replay";
import { DesktopIndexSync } from "@/features/desktop/desktop-index-sync";
import { isDevEnv } from "@/features/dev-tools/store";
import { UserToastHost } from "@/shared/ui/user-toast-host";
import { EDITOR_PREFERENCES_STORAGE_KEY } from "@/features/settings/lib/editor-preferences";
import type { EditorPreferencesRecord } from "@/features/settings/server/queries";

const DevMenu = lazy(() =>
	import("@/features/dev-tools/dev-menu").then((module) => ({
		default: module.DevMenu,
	})),
);

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
							<PersistenceBootstrap />
							<GuestWorkspaceBootstrap />
							<AppRoutePrefetcher />
							<WorkspaceWarmup />
							<ThemeAttribute />
							<ShortcutProvider>
								<GlobalShortcutHandlers />
								{children}
							</ShortcutProvider>
							<PendingCollabReplay />
							<UserToastHost />
							{isDevEnv() && (
								<Suspense fallback={null}>
									<DevMenu />
								</Suspense>
							)}
						</WorkspaceBackendProvider>
					</ProtectedAppGuard>
				</TooltipProvider>
			</MotionPreferences>
		</QueryClientProvider>
	);
}
