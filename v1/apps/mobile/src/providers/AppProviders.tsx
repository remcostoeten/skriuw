// Wires React Query with the offline read-cache persister. Mirrors web
// providers/app-providers.tsx + query-cache-persistence.tsx.
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { AppState } from "react-native";
import { focusManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createPersister, persistOptions, queryClient, setPersistUser } from "@/query/client";
import { useSession } from "@/auth/auth-client";

export function AppProviders({ children }: { children: ReactNode }) {
	const { data: session } = useSession();
	const userId = session?.user?.id ?? "anon";
	const previousUserId = useRef(userId);

	useEffect(() => {
		const subscription = AppState.addEventListener("change", (state) => {
			focusManager.setFocused(state === "active");
		});
		return () => subscription.remove();
	}, []);

	useEffect(() => {
		if (previousUserId.current !== userId) {
			queryClient.clear();
			previousUserId.current = userId;
		}
	}, [userId]);

	// Scope the persisted cache per user so accounts never share note bodies.
	const persister = useMemo(() => {
		setPersistUser(userId);
		return createPersister();
	}, [userId]);

	return (
		<PersistQueryClientProvider
			key={userId}
			client={queryClient}
			persistOptions={{ persister, ...persistOptions }}
		>
			{children}
		</PersistQueryClientProvider>
	);
}
