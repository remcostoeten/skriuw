"use client";

import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";

export function SharedWorkspaceShell() {
	const router = useRouter();

	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<IconRail />
				<main className="relative flex min-w-0 flex-1 items-center justify-center">
					<div className="flex items-center gap-3 text-muted-foreground/70">
						<Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.8} />
						<span className="text-sm">Loading shared notes…</span>
					</div>
				</main>
			</div>
		</LayoutContainer>
	);
}
