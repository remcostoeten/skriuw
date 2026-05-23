import { Suspense } from "react";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { listFolders } from "@/domain/folders/queries";
import { getNote, listNoteMetadata } from "@/domain/notes/queries";
import { ensureCloudStarterContentSeeded } from "@/domain/seed/api";
import { NotesLayout } from "@/features/notes/components/notes-layout";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { WorkspaceLoadingShell } from "@/features/layout/components/app-loading-shell";

export default function AppHomePage() {
	return (
		<Suspense fallback={<WorkspaceLoadingShell variant="notes" />}>
			<AppHomeContent />
		</Suspense>
	);
}

async function AppHomeContent(props: { searchParams?: Promise<Record<string, string>> }) {
	const { user } = await getServerUser();
	const searchParams = await props.searchParams;

	const queryClient = new QueryClient();

	// Seed must finish before the data queries so new users see their content.
	// For existing users starterSeededAt is set → single-field lookup → ~instant.
	if (user) await ensureCloudStarterContentSeeded(user.id);

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

	// Prefetch the active note's full content so the editor renders without a
	// loading state. Priority: ?note= URL param → first note in the list.
	const files = queryClient.getQueryData<Awaited<ReturnType<typeof listNoteMetadata>>>(
		notesKeys.files(),
	);
	const activeNoteId = searchParams?.note ?? files?.[0]?.id;
	if (activeNoteId) {
		await queryClient.prefetchQuery({
			queryKey: notesKeys.detail(activeNoteId),
			queryFn: () => getNote(activeNoteId),
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<NotesLayout />
		</HydrationBoundary>
	);
}
