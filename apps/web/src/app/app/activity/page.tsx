import type { Metadata } from "next";
import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { listNoteMetadata } from "@/domain/notes/queries";
import { fetchTrashBatches } from "@/domain/trash/actions";
import { loadGuestWorkspaceSnapshot } from "@/domain/seed/guest-bundle";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { ActivityOverview } from "@/features/activity/components/activity-overview";

export const metadata: Metadata = {
	title: "Activity",
	description: "Recent changes across your notes — created, edited, and deleted.",
	alternates: {
		canonical: "/app/activity",
	},
};

export default async function ActivityPage() {
	const { user } = await getServerUser();
	const queryClient = new QueryClient();

	if (user) {
		const scope = notesKeys.userScope(user.id);
		await Promise.all([
			queryClient.prefetchQuery({
				queryKey: notesKeys.files(scope),
				queryFn: () => listNoteMetadata(),
			}),
			queryClient.prefetchQuery({
				queryKey: notesKeys.trash(scope),
				queryFn: () => fetchTrashBatches(),
			}),
		]);
	} else {
		const snapshot = await loadGuestWorkspaceSnapshot();
		queryClient.setQueryData(notesKeys.files(notesKeys.localScope()), snapshot.notes);
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<ActivityOverview />
		</HydrationBoundary>
	);
}
