"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { MotionPreferences } from "@/providers/motion-preferences";
import { useEffect, useState } from "react";
import { PersistenceBootstrap } from "@/providers/persistence-bootstrap";
import { ProtectedAppGuard } from "@/providers/protected-app-guard";
import { ThemeAttribute } from "@/providers/theme-attribute";
import { WorkspaceBackendProvider } from "@/core/workspace-backend";
import { GuestWorkspaceBootstrap } from "@/providers/guest-workspace-bootstrap";
import { AppRoutePrefetcher } from "@/providers/app-route-prefetcher";
import { QueryCachePersistence } from "@/providers/query-cache-persistence";
import { WorkspaceWarmup } from "@/providers/workspace-warmup";
import { ShortcutProvider, type ShortcutHandlers } from "@/core/shortcuts";
import { PendingCollabReplay } from "@/features/collaboration/components/pending-collab-replay";
import { useRouter } from "next/navigation";
import { signOut } from "@/core/auth";
import { DevMenu } from "@/features/dev-tools/dev-menu";
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
		}
	}, [initialEditorPreferences]);

	return null;
}

function ShortcutHandlerProvider({ children }: { children: React.ReactNode }) {
	const router = useRouter();

	const handlers: ShortcutHandlers = {
		profile: () => router.push("/app/profile"),
		notes: () => router.push("/app"),
		journal: () => router.push("/app/journal"),
		activity: () => router.push("/app/activity"),
		settings: () => router.push("/app/settings"),
		signOut: async () => {
			try {
				await signOut();
				window.location.replace("/app?auth=sign-in");
			} catch (error) {
				console.error("Shortcut sign-out failed", error);
			}
		},
	};

	return <ShortcutProvider handlers={handlers}>{children}</ShortcutProvider>;
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
				<TooltipProvider delayDuration={300}>
					<EditorPreferencesBootstrap
						initialEditorPreferences={initialEditorPreferences}
					/>
					<ProtectedAppGuard>
						<WorkspaceBackendProvider>
							<PersistenceBootstrap />
							<GuestWorkspaceBootstrap />
							<AppRoutePrefetcher />
							<WorkspaceWarmup />
							<ThemeAttribute />
							<ShortcutHandlerProvider>{children}</ShortcutHandlerProvider>
							<PendingCollabReplay />
							<UserToastHost />
							<DevMenu />
						</WorkspaceBackendProvider>
					</ProtectedAppGuard>
				</TooltipProvider>
			</MotionPreferences>
		</QueryClientProvider>
	);
}
