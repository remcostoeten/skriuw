import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { listTags } from "@/domain/tags/actions";
import { tagsKeys } from "@/features/tags/lib/tags-keys";
import { TagsOverview } from "@/features/tags/components/tags-overview";
import { createServerQueryClient } from "@/shared/api/create-server-query-client";

export const instant = false;

export default async function TagsPage() {
	const { user } = await getServerUser();
	const queryClient = await createServerQueryClient();

	if (user) {
		await queryClient.prefetchQuery({
			queryKey: tagsKeys.list(`user:${user.id}`),
			queryFn: () => listTags(),
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<TagsOverview />
		</HydrationBoundary>
	);
}
