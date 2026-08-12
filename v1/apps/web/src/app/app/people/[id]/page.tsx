import { Suspense } from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { listPeople, listPersonNotes } from "@/domain/people/actions";
import { peopleKeys } from "@/features/people/lib/people-keys";
import { PersonInsights } from "@/features/people/components/person-insights";
import { createServerQueryClient } from "@/shared/api/create-server-query-client";

type Props = {
	params: Promise<{ id: string }>;
};

export const instant = false;

async function PersonInsightsContent({ params }: Props) {
	const [{ id }, { user }] = await Promise.all([params, getServerUser()]);
	const queryClient = await createServerQueryClient();

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

export default function PersonInsightsPage({ params }: Props) {
	return (
		<Suspense>
			<PersonInsightsContent params={params} />
		</Suspense>
	);
}
