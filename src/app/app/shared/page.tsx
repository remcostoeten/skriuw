import { getServerUser } from "@/core/db";
import { getSharedNotesOverview } from "@/domain/sharing/overview";
import { AuthRequiredState } from "@/features/auth/components/auth-required-state";
import { SharedWorkspace } from "@/features/sharing/components/shared-workspace";

// View activity must reflect live opens, never a cached snapshot.
export const dynamic = "force-dynamic";

export default async function SharedNotesRoute() {
	// Sharing is account-only. getSharedNotesOverview() calls
	// getAuthenticatedUser() and would throw → 500 for guests, so branch first.
	const { user } = await getServerUser();
	if (!user) {
		return (
			<AuthRequiredState
				title="Sign in to manage shared notes"
				description="Sharing notes by link and tracking views is available once you create a free account."
			/>
		);
	}

	const overview = await getSharedNotesOverview();
	return <SharedWorkspace overview={overview} />;
}
