import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";
import { getServerUser } from "@/core/db";
import { listWorkspaceTags } from "@/domain/tags/queries";
import { ensureCloudStarterContentSeeded } from "@/domain/seed/api";
import { SettingsPage } from "@/features/settings/components/settings-page";
import { journalKeys } from "@/features/journal/hooks/journal-keys";

export default async function SettingsRoute() {
	const { user } = await getServerUser();
	const queryClient = new QueryClient();

	if (user) {
		await ensureCloudStarterContentSeeded();
		await queryClient.prefetchQuery({
			queryKey: journalKeys.workspaceTags(),
			queryFn: () => listWorkspaceTags(),
		});
	}

	return (
		<HydrationBoundary state={dehydrate(queryClient)}>
			<SettingsPage />
		</HydrationBoundary>
	);
}
