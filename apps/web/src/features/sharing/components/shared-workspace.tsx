"use client";

import { useRouter } from "next/navigation";

import type { TSharedOverview } from "@/domain/sharing/models";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
import { SharedNotesOverview } from "./shared-notes-overview";

/**
 * Page shell for `/app/shared`: keeps the app's icon rail so the overview sits
 * inside the same navigation chrome as Notes, Journal, and Settings.
 */
export function SharedWorkspace({ overview }: { overview: TSharedOverview }) {
	const router = useRouter();

	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<IconRail onOpenSettings={() => router.push("/app/settings")} />
				<main className="relative flex min-w-0 flex-1 flex-col overflow-y-auto">
					<SharedNotesOverview overview={overview} />
				</main>
			</div>
		</LayoutContainer>
	);
}
