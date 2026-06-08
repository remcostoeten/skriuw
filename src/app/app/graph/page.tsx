import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { ensureCloudStarterContentSeeded } from "@/domain/seed/api";
import { fetchNoteGraph } from "@/domain/notes/actions";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { WorkspaceGraph } from "@/features/notes/components/workspace-graph";

export default async function GraphPage() {
	const { user } = await getServerUser();

	const queryClient = new QueryClient();

	// The graph is account-only — fetchNoteGraph() calls getAuthenticatedUser()
	// and would throw for guests. Skip seeding + prefetch when signed out; the
	// client renders an AuthRequiredState.
	if (user) {
		await ensureCloudStarterContentSeeded();
		await queryClient.prefetchQuery({
			queryKey: notesKeys.graph(),
			queryFn: () => fetchNoteGraph(),
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<WorkspaceGraph />
		</HydrationBoundary>
	);
}
