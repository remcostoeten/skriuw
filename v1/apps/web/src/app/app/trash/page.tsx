import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { fetchTrashBatches } from "@/domain/trash/actions";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { TrashView } from "@/features/notes/components/trash/trash-view";
import { createServerQueryClient } from "@/shared/api/create-server-query-client";

export const instant = false;

export default async function TrashPage() {
	const { user } = await getServerUser();
	const queryClient = await createServerQueryClient();

	if (user) {
		await queryClient.prefetchQuery({
			queryKey: notesKeys.trash(notesKeys.userScope(user.id)),
			queryFn: () => fetchTrashBatches(),
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<TrashView />
		</HydrationBoundary>
	);
}
