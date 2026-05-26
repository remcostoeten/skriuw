import { getSharedNotesOverview } from "@/domain/sharing/overview";
import { SharedWorkspace } from "@/features/sharing/components/shared-workspace";

// View activity must reflect live opens, never a cached snapshot.
export const dynamic = "force-dynamic";

export default async function SharedNotesRoute() {
	const overview = await getSharedNotesOverview();
	return <SharedWorkspace overview={overview} />;
}
