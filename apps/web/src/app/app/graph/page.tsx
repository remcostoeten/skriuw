import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { ensureCloudStarterContentSeeded } from "@/domain/seed/api";
import { loadGuestWorkspaceSnapshot } from "@/domain/seed/guest-bundle";
import { fetchNoteGraph } from "@/domain/notes/actions";
import { buildGraphFromNotes } from "@/domain/notes/graph-from-notes";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { WorkspaceGraph } from "@/features/notes/components/workspace-graph";

export default async function GraphPage() {
	const { user } = await getServerUser();
	const queryClient = new QueryClient();

	if (user) {
		// Race seeding with the graph prefetch; re-fetch for brand-new users whose
		// prefetch may have run before the seed insert committed.
		const prefetchGraph = () =>
			queryClient.prefetchQuery({
				queryKey: notesKeys.graph(),
				queryFn: () => fetchNoteGraph(),
			});

		const [didSeed] = await Promise.all([ensureCloudStarterContentSeeded(), prefetchGraph()]);
		if (didSeed) {
			await prefetchGraph();
		}
	} else {
		const snapshot = await loadGuestWorkspaceSnapshot();
		queryClient.setQueryData(notesKeys.files(), snapshot.notes);
		queryClient.setQueryData(notesKeys.folders(), snapshot.folders);
		// Hydrate the guest graph under the SAME key useNoteGraph derives on the
		// client — keyed on the files() query's dataUpdatedAt (preserved through
		// dehydrate/hydrate). Hardcoding "0" caused a guaranteed cache miss and a
		// redundant client-side rebuild on first paint.
		const guestRevision = queryClient.getQueryState(notesKeys.files())?.dataUpdatedAt ?? 0;
		queryClient.setQueryData(
			[...notesKeys.graph(), "guest", guestRevision],
			buildGraphFromNotes(snapshot.noteDetails),
		);
		for (const note of snapshot.noteDetails) {
			queryClient.setQueryData(notesKeys.detail(note.id), note);
		}
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<WorkspaceGraph />
		</HydrationBoundary>
	);
}
