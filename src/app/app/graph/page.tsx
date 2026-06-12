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
		await ensureCloudStarterContentSeeded();
		await queryClient.prefetchQuery({
			queryKey: notesKeys.graph(),
			queryFn: () => fetchNoteGraph(),
		});
	} else {
		const snapshot = await loadGuestWorkspaceSnapshot();
		queryClient.setQueryData(notesKeys.files(), snapshot.notes);
		queryClient.setQueryData(notesKeys.folders(), snapshot.folders);
		queryClient.setQueryData(
			[...notesKeys.graph(), "guest", 0],
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
