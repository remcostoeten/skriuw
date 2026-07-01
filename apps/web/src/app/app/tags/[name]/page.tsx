import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { normalizeStoredTagEntry } from "@/domain/tags/normalize";
import { listTagNotes } from "@/domain/tags/actions";
import { tagsKeys } from "@/features/tags/lib/tags-keys";
import { TagInsights } from "@/features/tags/components/tag-insights";

type Props = {
	params: Promise<{ name: string }>;
};

export default async function TagInsightsPage({ params }: Props) {
	const { name } = await params;
	const tagName = normalizeStoredTagEntry(decodeURIComponent(name));
	const { user } = await getServerUser();
	const queryClient = new QueryClient();

	if (user && tagName) {
		await queryClient.prefetchQuery({
			queryKey: tagsKeys.notes(`user:${user.id}`, tagName),
			queryFn: () => listTagNotes(tagName),
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<TagInsights name={tagName} />
		</HydrationBoundary>
	);
}
