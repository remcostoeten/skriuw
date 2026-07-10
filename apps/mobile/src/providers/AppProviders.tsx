// Wires React Query with the offline read-cache persister. Mirrors web
// providers/app-providers.tsx + query-cache-persistence.tsx.
import { useMemo, type ReactNode } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createPersister, persistOptions, queryClient, setPersistUser } from "@/query/client";
import { useSession } from "@/auth/auth-client";

export function AppProviders({ children }: { children: ReactNode }) {
	const { data: session } = useSession();

	// Scope the persisted cache per user so accounts never share note bodies.
	const persister = useMemo(() => {
		setPersistUser(session?.user?.id);
		return createPersister();
	}, [session?.user?.id]);

	return (
		<PersistQueryClientProvider
			client={queryClient}
			persistOptions={{ persister, ...persistOptions }}
		>
			{children}
		</PersistQueryClientProvider>
	);
}
