import { Suspense } from "react";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { listFolders } from "@/domain/folders/queries";
import { listNoteMetadata } from "@/domain/notes/queries";
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

async function AppHomeContent() {
	const { user } = await getServerUser();
	if (user) {
		await ensureCloudStarterContentSeeded(user.id);
	}

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
