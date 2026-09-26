import { Suspense } from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { normalizeStoredTagEntry } from "@/domain/tags/normalize";
import { listTagNotes } from "@/domain/tags/actions";
import { tagsKeys } from "@/features/tags/lib/tags-keys";
import { TagInsights } from "@/features/tags/components/tag-insights";
import { createServerQueryClient } from "@/shared/api/create-server-query-client";

type Props = {
	params: Promise<{ name: string }>;
};

export const instant = false;

async function TagInsightsContent({ params }: Props) {
	const { name } = await params;
	const tagName = normalizeStoredTagEntry(decodeURIComponent(name));
	const { user } = await getServerUser();
	const queryClient = await createServerQueryClient();

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

export default function TagInsightsPage({ params }: Props) {
	return (
		<Suspense>
			<TagInsightsContent params={params} />
		</Suspense>
	);
}
