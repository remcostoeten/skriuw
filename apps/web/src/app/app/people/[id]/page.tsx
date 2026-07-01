import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { listPeople, listPersonNotes } from "@/domain/people/actions";
import { peopleKeys } from "@/features/people/lib/people-keys";
import { PersonInsights } from "@/features/people/components/person-insights";

type Props = {
	params: Promise<{ id: string }>;
};

export default async function PersonInsightsPage({ params }: Props) {
	const { id } = await params;
	const { user } = await getServerUser();
	const queryClient = new QueryClient();

	if (user) {
		const scope = `user:${user.id}`;
		await Promise.all([
			queryClient.prefetchQuery({
				queryKey: peopleKeys.list(scope),
				queryFn: () => listPeople(),
			}),
			queryClient.prefetchQuery({
				queryKey: [...peopleKeys.all, "notes", scope, id],
				queryFn: () => listPersonNotes(id),
			}),
		]);
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<PersonInsights personId={id} />
		</HydrationBoundary>
	);
}
