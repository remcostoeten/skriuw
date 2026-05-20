import type { Metadata } from "next";
import { ProjectPlanningPage } from "@/features/project-planning/project-planning-page";
import { fetchPlanningSnapshot } from "@/features/project-planning/server/queries";

export const metadata: Metadata = {
	title: "Project Planning | Skriuw",
	description:
		"A public view of what the Skriuw team is exploring, planning, building, and has shipped.",
	openGraph: {
		title: "Project Planning | Skriuw",
		description:
			"A public view of what the Skriuw team is exploring, planning, building, and has shipped.",
	},
};

export const dynamic = "force-dynamic";

export default async function ProjectPlanningRoute() {
	const snapshot = await fetchPlanningSnapshot();
	return (
		<ProjectPlanningPage
			initialFeatures={snapshot.features}
			initialNiceToHaves={snapshot.niceToHaves}
			initialScratch={snapshot.scratch}
			initialCustomSections={snapshot.customSections}
			isAdmin={snapshot.isAdmin}
			isSignedIn={snapshot.isSignedIn}
		/>
	);
}
