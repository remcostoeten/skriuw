"use client";

import { memo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLazyRef } from "@/shared/lib/use-lazy-ref";
import { getSharedNotesAction } from "@/domain/collaboration/actions";
import { notesKeys } from "@/features/notes/hooks/notes-keys";
import { SidebarSection } from "./sidebar-section";
import { cn } from "@/shared/lib/utils";

const sharedKeys = {
	all: ["shared-notes"] as const,
};

type Props = {
	activeFileId: string;
	isCollapsed: boolean;
	showHeader?: boolean;
	compactMode?: boolean;
	onToggleCollapse: () => void;
	onFileSelect: (id: string) => void;
};

export const SharedSection = memo(function SharedSection({
	activeFileId,
	isCollapsed,
	showHeader = true,
	compactMode = false,
	onToggleCollapse,
	onFileSelect,
}: Props) {
	const queryClient = useQueryClient();
	const { data: sharedNotes = [] } = useQuery({
		queryKey: sharedKeys.all,
		queryFn: () => getSharedNotesAction(),
		staleTime: 60_000,
		refetchInterval: 120_000,
	});

	// When the owner revokes access or changes a permission, this list updates on
	// its next refetch. The open editor's note detail is cached with
	// `staleTime: Infinity` and a cache-first queryFn, so a plain invalidate won't
	// re-run `fetchNote` — drop the detail entry outright so the editor re-resolves
	// its access (revoked → note gone, downgraded → read-only).
	const prevPermsRef = useLazyRef<Map<string, string>>(() => new Map());
	useEffect(() => {
		const prev = prevPermsRef.current;
		const next = new Map(sharedNotes.map((note) => [note.id, note.permission]));
		for (const [id, permission] of prev) {
			const current = next.get(id);
			if (current === undefined || current !== permission) {
				queryClient.removeQueries({ queryKey: notesKeys.detail(id) });
			}
		}
		prevPermsRef.current = next;
	}, [sharedNotes, queryClient]);

	if (sharedNotes.length === 0) return null;

	return (
		<SidebarSection
			id="shared"
			title="Shared with me"
			isCollapsed={isCollapsed}
			showHeader={showHeader}
			compactMode={compactMode}
			itemCount={sharedNotes.length}
			onToggleCollapse={onToggleCollapse}
		>
			<div className={cn("space-y-px px-1", compactMode && "space-y-[1px]")}>
				{sharedNotes.map((note) => (
					<button
						key={note.id}
						type="button"
						onClick={() => onFileSelect(note.id)}
						className={cn(
							"flex w-full items-center gap-2 border border-transparent px-2 text-left text-xs transition-colors [@media(pointer:coarse)]:min-h-11",
							compactMode ? "h-6" : "h-7",
							note.id === activeFileId
								? "border-border bg-muted text-foreground"
								: "text-foreground/60 hover:border-border hover:bg-muted hover:text-foreground",
						)}
					>
						<span className="flex-1 truncate">{note.name}</span>
						<span className="text-[9px] uppercase tracking-wide text-muted-foreground/40">
							{note.permission}
						</span>
					</button>
				))}
			</div>
		</SidebarSection>
	);
});
