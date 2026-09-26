import { Suspense } from "react";
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { listJournalEntries } from "@/domain/journal/queries";
import { ensureCloudStarterContentSeeded } from "@/domain/seed/api";
import { JournalContentSkeleton } from "@/features/journal/components/journal-content-skeleton";
import { JournalPageLayout } from "@/features/journal/components/journal-page-layout";
import { journalKeys } from "@/features/journal/hooks/journal-keys";
import { createServerQueryClient } from "@/shared/api/create-server-query-client";

export const instant = false;

export default async function JournalPage() {
	return <JournalContent />;
}

async function JournalContent() {
	const { user } = await getServerUser();

	const queryClient = await createServerQueryClient();

	// Journal is account-only. Skip seeding + prefetch entirely when signed out —
	// listJournalEntries calls getAuthenticatedUser() and
	// would throw → 500 for guests.
	if (user) {
		const journalScope = journalKeys.userScope(user.id);
		// Race seeding with the prefetch; re-fetch only for brand-new users whose
		// prefetch may have run before the seed insert committed (see app/page.tsx).
		const prefetchJournal = () =>
			Promise.all([
				queryClient.prefetchQuery({
					queryKey: journalKeys.entries(journalScope),
					queryFn: () => listJournalEntries(),
				}),
			]);

		const [didSeed] = await Promise.all([ensureCloudStarterContentSeeded(), prefetchJournal()]);

		if (didSeed) {
			await prefetchJournal();
		}
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<Suspense fallback={<JournalContentSkeleton />}>
				<JournalPageLayout />
			</Suspense>
		</HydrationBoundary>
	);
}
