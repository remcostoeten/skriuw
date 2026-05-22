"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { MotionConfig } from "framer-motion";
import { useEffect, useState } from "react";
import { PersistenceBootstrap } from "@/providers/persistence-bootstrap";
import { ProtectedAppGuard } from "@/providers/protected-app-guard";
import { ThemeAttribute } from "@/providers/theme-attribute";
import { ShortcutProvider, type ShortcutHandlers } from "@/core/shortcuts";
import { useRouter } from "next/navigation";
import { signOut } from "@/platform/auth";
import { DevMenu } from "@/features/dev-tools/dev-menu";
import {
	EDITOR_PREFERENCES_STORAGE_KEY,
} from "@/features/settings/lib/editor-preferences";
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

function ShortcutHandlerProvider({ children }: Props) {
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
				window.location.replace("/sign-in");
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
					},
				},
			}),
	);

	return (
		<QueryClientProvider client={queryClient}>
			<MotionConfig reducedMotion="user">
				<TooltipProvider delayDuration={300}>
					<EditorPreferencesBootstrap
						initialEditorPreferences={initialEditorPreferences}
					/>
					<ProtectedAppGuard>
						<PersistenceBootstrap />
						<ThemeAttribute />
						<ShortcutHandlerProvider>{children}</ShortcutHandlerProvider>
						<DevMenu />
					</ProtectedAppGuard>
				</TooltipProvider>
			</MotionConfig>
		</QueryClientProvider>
	);
}
