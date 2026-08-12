import { getServerUser } from "@/core/db";
import { getSharedNotesOverview } from "@/domain/sharing/overview";
import { SharedWorkspace } from "@/features/sharing/components/shared-workspace";
import { SharedWorkspaceShell } from "@/features/sharing/components/shared-workspace-shell";

export const instant = false;

export default async function SharedNotesRoute() {
	// Sharing is account-only. getSharedNotesOverview() calls
	// getAuthenticatedUser() and would throw → 500 for guests, so branch first.
	const { user } = await getServerUser();
	if (!user) {
		return <SharedWorkspaceShell />;
	}

	const overview = await getSharedNotesOverview();
	return <SharedWorkspace overview={overview} />;
}
