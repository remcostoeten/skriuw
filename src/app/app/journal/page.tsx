import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { listJournalEntries, listJournalTags } from "@/domain/journal/queries";
import { ensureCloudStarterContentSeeded } from "@/domain/seed/api";
import { JournalPageLayout } from "@/features/journal/components/journal-page-layout";
import { journalKeys } from "@/features/journal/hooks/journal-keys";

export default async function JournalPage() {
	return <JournalContent />;
}

async function JournalContent() {
	const { user } = await getServerUser();

	const queryClient = new QueryClient();

	// Journal is account-only. Skip seeding + prefetch entirely when signed out —
	// listJournalEntries / listJournalTags call getAuthenticatedUser() and
	// would throw → 500 for guests.
	if (user) {
		await ensureCloudStarterContentSeeded();

		await Promise.all([
			queryClient.prefetchQuery({
				queryKey: journalKeys.entries(),
				queryFn: () => listJournalEntries(),
			}),
			queryClient.prefetchQuery({
				queryKey: journalKeys.tags(),
				queryFn: () => listJournalTags(),
			}),
		]);
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<JournalPageLayout />
		</HydrationBoundary>
	);
}
