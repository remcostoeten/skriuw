"use client";

import dynamic from "next/dynamic";

function TagManagerLoading() {
	return (
		<div className="rounded-lg border border-border/60 bg-card/40 px-5" aria-hidden="true">
			{Array.from({ length: 5 }, (_, index) => (
				<div
					key={index}
					className="flex items-center justify-between gap-4 border-b border-border/50 py-3.5 last:border-b-0"
				>
					<div className="h-px w-32 bg-foreground/[0.08]" />
					<div className="h-7 w-20 border border-border bg-background" />
				</div>
			))}
		</div>
	);
}

const TagManager = dynamic(
	() =>
		import("@/features/settings/components/tag-manager").then((mod) => ({
			default: mod.TagManager,
		})),
	{ ssr: false, loading: TagManagerLoading },
);

export function TagsSection() {
	return (
		<div className="space-y-4">
			<div>
				<h3 className="text-sm font-medium text-foreground">Tags</h3>
				<p className="text-xs text-muted-foreground mt-1">
					Manage the tag vocabulary across notes and journal entries.
				</p>
			</div>
			<div className="border-t border-border" />
			<TagManager />
		</div>
	);
}
