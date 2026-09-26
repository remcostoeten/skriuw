import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { listPeople } from "@/domain/people/actions";
import { peopleKeys } from "@/features/people/lib/people-keys";
import { PeopleOverview } from "@/features/people/components/people-overview";
import { createServerQueryClient } from "@/shared/api/create-server-query-client";

export const instant = false;

export default async function PeoplePage() {
	const { user } = await getServerUser();
	const queryClient = await createServerQueryClient();

	if (user) {
		await queryClient.prefetchQuery({
			queryKey: peopleKeys.list(`user:${user.id}`),
			queryFn: () => listPeople(),
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<PeopleOverview />
		</HydrationBoundary>
	);
}
