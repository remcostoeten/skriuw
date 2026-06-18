import type { Metadata } from "next";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { listFolders } from "@/domain/folders/queries";
import { getNote, listNoteMetadata } from "@/domain/notes/queries";
import { ensureCloudStarterContentSeeded } from "@/domain/seed/api";
import { loadGuestWorkspaceSnapshot } from "@/domain/seed/guest-bundle";
import { isGuestScopedId } from "@/domain/notes/note-id";
import { NotesLayout } from "@/features/notes/components/notes-layout";
import { notesKeys } from "@/features/notes/hooks/notes-keys";

export const metadata: Metadata = {
	title: "App",
	description:
		"Open Skriuw's notes workspace, try the guest demo, or sign in to sync notes and journal entries across devices.",
	alternates: {
		canonical: "/app",
	},
	openGraph: {
		title: "Skriuw App",
		description:
			"Open Skriuw's notes workspace, try the guest demo, or sign in to sync notes and journal entries across devices.",
		url: "/app",
		images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Skriuw" }],
	},
	twitter: {
		card: "summary_large_image",
		title: "Skriuw App",
		description:
			"Open Skriuw's notes workspace, try the guest demo, or sign in to sync notes and journal entries across devices.",
		images: ["/opengraph-image"],
	},
};

export default async function AppHomePage(props: {
	searchParams?: Promise<Record<string, string>>;
}) {
	const { user } = await getServerUser();
	const searchParams = await props.searchParams;

	const queryClient = new QueryClient();

	if (user) {
		// Race seeding with the data prefetch instead of serializing it ahead.
		// Returning users (starterSeededAt set) resolve the seed check instantly,
		// so the prefetch no longer waits on a serial round trip. Brand-new users
		// (didSeed) may have prefetched before the seed insert committed, so we
		// refetch those two queries once afterwards.
		const prefetchWorkspace = () =>
			Promise.all([
				queryClient.prefetchQuery({
					queryKey: notesKeys.files(),
					queryFn: () => listNoteMetadata(),
				}),
				queryClient.prefetchQuery({
					queryKey: notesKeys.folders(),
					queryFn: () => listFolders(),
				}),
			]);

		const [didSeed] = await Promise.all([
			ensureCloudStarterContentSeeded(),
			prefetchWorkspace(),
		]);

		if (didSeed) {
			await prefetchWorkspace();
		}

		const files = queryClient.getQueryData<Awaited<ReturnType<typeof listNoteMetadata>>>(
			notesKeys.files(),
		);
		// Ignore a stale `?note=guest:…` carried over from a guest session — that
		// id isn't a persisted UUID, so prefetching it would throw P2007.
		const requestedNoteId =
			searchParams?.note && !isGuestScopedId(searchParams.note) ? searchParams.note : null;
		const initialActiveFileId = requestedNoteId ?? files?.[0]?.id ?? null;
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
