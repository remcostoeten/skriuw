"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/shared/ui/tooltip";
import { MotionConfig } from "framer-motion";
import { useState } from "react";
import { PersistenceBootstrap } from "@/providers/persistence-bootstrap";
import { ProtectedAppGuard } from "@/providers/protected-app-guard";
import { ThemeAttribute } from "@/providers/theme-attribute";
import { ShortcutProvider, type ShortcutHandlers } from "@/core/shortcuts";
import { useRouter } from "next/navigation";
import { signOut } from "@/platform/auth";

type Props = {
	children: React.ReactNode;
};

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

export function AppProviders({ children }: Props) {
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
					<ProtectedAppGuard>
						<PersistenceBootstrap />
						<ThemeAttribute />
						<ShortcutHandlerProvider>{children}</ShortcutHandlerProvider>
					</ProtectedAppGuard>
				</TooltipProvider>
			</MotionConfig>
		</QueryClientProvider>
	);
}
