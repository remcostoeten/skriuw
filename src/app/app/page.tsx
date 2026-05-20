import { Suspense } from "react";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { listFolders } from "@/domain/folders/api";
import { listNoteMetadata } from "@/domain/notes/api";
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

async function AppHomeContent() {
	const queryClient = new QueryClient();

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

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<NotesLayout />
		</HydrationBoundary>
	);
}
