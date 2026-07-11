import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { ensureCloudStarterContentSeeded } from "@/domain/seed/api";
import { loadGuestWorkspaceSnapshot } from "@/domain/seed/guest-bundle";
import { fetchNoteGraph } from "@/domain/notes/actions";
import { buildGraphFromNotes } from "@/domain/notes/graph-from-notes";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { WorkspaceGraph } from "@/features/notes/components/workspace-graph";

export const instant = false;

export default async function GraphPage() {
	const { user } = await getServerUser();
	const queryClient = new QueryClient();

	if (user) {
		const notesScope = notesKeys.userScope(user.id);
		// Race seeding with the graph prefetch; re-fetch for brand-new users whose
		// prefetch may have run before the seed insert committed.
		const prefetchGraph = () =>
			queryClient.prefetchQuery({
				queryKey: notesKeys.graph(notesScope),
				queryFn: () => fetchNoteGraph(),
			});

		const [didSeed] = await Promise.all([ensureCloudStarterContentSeeded(), prefetchGraph()]);
		if (didSeed) {
			await prefetchGraph();
		}
	} else {
		const snapshot = await loadGuestWorkspaceSnapshot();
		const localScope = notesKeys.localScope();
		const filesKey = notesKeys.files(localScope);
		queryClient.setQueryData(filesKey, snapshot.notes);
		queryClient.setQueryData(notesKeys.folders(localScope), snapshot.folders);
		// Hydrate the guest graph under the SAME key useNoteGraph derives on the
		// client — keyed on the files() query's dataUpdatedAt (preserved through
		// dehydrate/hydrate). Hardcoding "0" caused a guaranteed cache miss and a
		// redundant client-side rebuild on first paint.
		const guestRevision = queryClient.getQueryState(filesKey)?.dataUpdatedAt ?? 0;
		queryClient.setQueryData(
			[...notesKeys.graph(localScope), "guest", guestRevision],
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
