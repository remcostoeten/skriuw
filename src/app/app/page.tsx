import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { listFolders } from "@/domain/folders/queries";
import { getNote, listNoteMetadata } from "@/domain/notes/queries";
import { ensureCloudStarterContentSeeded } from "@/domain/seed/api";
import { loadGuestWorkspaceSnapshot } from "@/domain/seed/guest-bundle";
import { NotesLayout } from "@/features/notes/components/notes-layout";
import { notesKeys } from "@/features/notes/hooks/notes-keys";

export default async function AppHomePage(props: {
	searchParams?: Promise<Record<string, string>>;
}) {
	const { user } = await getServerUser();
	const searchParams = await props.searchParams;

	const queryClient = new QueryClient();

	if (user) {
		// Seed must finish before the data queries so new users see their content.
		// For existing users starterSeededAt is set → single-field lookup → ~instant.
		await ensureCloudStarterContentSeeded();

		await Promise.all([
			queryClient.prefetchQuery({
				queryKey: notesKeys.files(),
				queryFn: () => listNoteMetadata(),
			}),
			queryClient.prefetchQuery({
				queryKey: notesKeys.folders(),
				queryFn: () => listFolders(),
			}),
		]);

		const files = queryClient.getQueryData<Awaited<ReturnType<typeof listNoteMetadata>>>(
			notesKeys.files(),
		);
		const initialActiveFileId = searchParams?.note ?? files?.[0]?.id ?? null;
		if (initialActiveFileId) {
			await queryClient.prefetchQuery({
				queryKey: notesKeys.detail(initialActiveFileId),
				queryFn: () => getNote(initialActiveFileId),
			});
		}

		return (
			<HydrationBoundary state={dehydrate(queryClient)}>
				<NotesLayout
					initialActiveFileId={initialActiveFileId}
					initialUserScopeId={user.id}
				/>
			</HydrationBoundary>
		);
	}

	const snapshot = await loadGuestWorkspaceSnapshot();
	queryClient.setQueryData(notesKeys.files(), snapshot.notes);
	queryClient.setQueryData(notesKeys.folders(), snapshot.folders);

	const initialActiveFileId = searchParams?.note ?? snapshot.notes[0]?.id ?? null;
	if (initialActiveFileId) {
		const activeNote =
			snapshot.noteDetails.find((note) => note.id === initialActiveFileId) ?? null;
		queryClient.setQueryData(notesKeys.detail(initialActiveFileId), activeNote);
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<NotesLayout initialActiveFileId={initialActiveFileId} initialUserScopeId={null} />
		</HydrationBoundary>
	);
}
