"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FolderClosed, RotateCcw, Trash2 } from "lucide-react";
import type { TrashBatch } from "@/core/workspace-backend/types";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
import { Button } from "@/shared/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/shared/ui/dialog";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import { AnimatedRelativeTime } from "@/shared/ui/animated-relative-time";
import { NotesEmptyState } from "@/features/notes/components/notes-empty-state";
import {
	useEmptyTrash,
	usePurgeTrash,
	useRestoreTrash,
	useTrash,
} from "@/features/notes/hooks/use-trash";

function batchSubtitle(batch: TrashBatch): string {
	if (batch.kind === "folder") {
		const folders = batch.folderCount === 1 ? "1 folder" : `${batch.folderCount} folders`;
		const notes = batch.noteCount === 1 ? "1 note" : `${batch.noteCount} notes`;
		return `Folder · ${folders}, ${notes}`;
	}
	return "Note";
}

export function TrashView() {
	const router = useRouter();
	const { data: batches = [], isLoading } = useTrash();
	const restore = useRestoreTrash();
	const purge = usePurgeTrash();
	const emptyTrash = useEmptyTrash();
	const [pendingPurge, setPendingPurge] = useState<TrashBatch | null>(null);
	const [emptyOpen, setEmptyOpen] = useState(false);

	const isEmpty = batches.length === 0;

	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<IconRail onOpenSettings={() => router.push("/app/settings")} />
				<div className="mx-auto flex h-full w-full max-w-3xl flex-col">
			<header className="flex items-center justify-between gap-4 border-b border-border px-6 py-5">
				<div>
					<h1 className="text-base font-semibold text-foreground">Trash</h1>
					<p className="mt-0.5 text-sm text-muted-foreground">
						Deleted notes and folders. Restore them, or delete them permanently.
					</p>
				</div>
				<Button
					variant="outline"
					size="sm"
					disabled={isEmpty || emptyTrash.isPending}
					onClick={() => setEmptyOpen(true)}
				>
					<Trash2 className="mr-1.5 h-3.5 w-3.5" />
					Empty trash
				</Button>
			</header>

			{isLoading ? null : isEmpty ? (
				<NotesEmptyState
					icon={Trash2}
					title="Trash is empty"
					description="Notes and folders you delete will appear here before they're permanently removed."
				/>
			) : (
				<ul className="flex-1 divide-y divide-border overflow-y-auto">
					{batches.map((batch) => (
						<ContextMenu key={batch.id}>
							<ContextMenuTrigger asChild>
								<li className="flex items-center gap-3 px-6 py-3">
									{batch.kind === "folder" ? (
										<FolderClosed className="h-4 w-4 shrink-0 text-muted-foreground" />
									) : (
										<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
									)}
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium text-foreground">
											{batch.primary.name.replace(/\.md$/, "")}
										</p>
										<p className="truncate text-xs text-muted-foreground">
											{batchSubtitle(batch)} · deleted{" "}
											<AnimatedRelativeTime
												date={batch.deletedAt}
												animate={false}
												suffix=" ago"
											/>
										</p>
									</div>
									<div className="flex shrink-0 gap-1.5">
										<Button
											variant="ghost"
											size="sm"
											disabled={restore.isPending}
											onClick={() => restore.mutate(batch.id)}
										>
											<RotateCcw className="mr-1.5 h-3.5 w-3.5" />
											Restore
										</Button>
										<Button
											variant="ghost"
											size="sm"
											className="text-destructive hover:text-destructive"
											onClick={() => setPendingPurge(batch)}
										>
											<Trash2 className="mr-1.5 h-3.5 w-3.5" />
											Delete
										</Button>
									</div>
								</li>
							</ContextMenuTrigger>
							<ContextMenuContent className="w-48">
								<ContextMenuItem onClick={() => restore.mutate(batch.id)}>
									<RotateCcw className="mr-2 h-3.5 w-3.5" />
									Restore
								</ContextMenuItem>
								<ContextMenuSeparator />
								<ContextMenuItem
									className="text-destructive focus:text-destructive"
									onClick={() => setPendingPurge(batch)}
								>
									<Trash2 className="mr-2 h-3.5 w-3.5" />
									Delete permanently
								</ContextMenuItem>
							</ContextMenuContent>
						</ContextMenu>
					))}
				</ul>
			)}

			<Dialog
				open={pendingPurge !== null}
				onOpenChange={(open) => !open && setPendingPurge(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete permanently?</DialogTitle>
						<DialogDescription>
							{pendingPurge?.kind === "folder"
								? `"${pendingPurge?.primary.name.replace(/\.md$/, "")}" and everything inside it will be permanently deleted. This cannot be undone.`
								: `"${pendingPurge?.primary.name.replace(/\.md$/, "")}" will be permanently deleted. This cannot be undone.`}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline" size="sm">
								Cancel
							</Button>
						</DialogClose>
						<Button
							variant="destructive"
							size="sm"
							onClick={() => {
								if (pendingPurge) purge.mutate(pendingPurge.id);
								setPendingPurge(null);
							}}
						>
							Delete permanently
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={emptyOpen} onOpenChange={setEmptyOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Empty trash?</DialogTitle>
						<DialogDescription>
							Every note and folder in the trash will be permanently deleted. This cannot be
							undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline" size="sm">
								Cancel
							</Button>
						</DialogClose>
						<Button
							variant="destructive"
							size="sm"
							onClick={() => {
								emptyTrash.mutate();
								setEmptyOpen(false);
							}}
						>
							Empty trash
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			</div>
			</div>
		</LayoutContainer>
	);
}
