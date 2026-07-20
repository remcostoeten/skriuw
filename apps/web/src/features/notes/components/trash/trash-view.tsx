"use client";

import { useState } from "react";
import { FileText, FolderClosed, RotateCcw, Trash2 } from "lucide-react";
import type { TrashBatch } from "@/core/workspace-backend/types";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { Button } from "@/shared/ui/button";
import { DeleteButton } from "@/shared/ui/delete-button";
import { DevContextSubmenu } from "@/features/desktop/dev-context-menu";
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
	const { data: batches = [], isLoading } = useTrash();
	const restore = useRestoreTrash();
	const purge = usePurgeTrash();
	const emptyTrash = useEmptyTrash();
	const [contextBatchId, setContextBatchId] = useState<string | null>(null);

	const isEmpty = batches.length === 0;
	const contextBatch = contextBatchId
		? (batches.find((batch) => batch.id === contextBatchId) ?? null)
		: null;

	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<div className="mx-auto flex h-full w-full max-w-3xl flex-col">
					<header className="flex items-center justify-between gap-4 border-b border-border px-6 py-5">
						<div>
							<h1 className="text-base font-semibold text-foreground">Trash</h1>
							<p className="mt-0.5 text-sm text-muted-foreground">
								Deleted notes and folders. Restore them, or delete them permanently.
							</p>
						</div>
						<DeleteButton
							label="Empty trash"
							confirmLabel="Confirm empty"
							pendingLabel="Emptying"
							successLabel="Emptied"
							disabled={isEmpty}
							size="sm"
							onDelete={async () => {
								try {
									await emptyTrash.mutateAsync();
									return true;
								} catch {
									return false;
								}
							}}
						/>
					</header>

					{isLoading ? null : isEmpty ? (
						<NotesEmptyState
							icon={Trash2}
							title="Trash is empty"
							description="Notes and folders you delete will appear here before they're permanently removed."
						/>
					) : (
						// One shared context menu serves every row; rows only set the
						// target id in onContextMenu, instead of mounting a Radix
						// ContextMenu root per row.
						<ContextMenu
							onOpenChange={(open) => {
								if (!open) setContextBatchId(null);
							}}
						>
							<ContextMenuTrigger asChild>
								<ul className="flex-1 divide-y divide-border overflow-y-auto">
									{batches.map((batch) => (
										<li
											key={batch.id}
											className="flex items-center gap-3 px-6 py-3"
											onContextMenu={() => setContextBatchId(batch.id)}
										>
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
												<DeleteButton
													size="sm"
													onDelete={async () => {
														try {
															await purge.mutateAsync(batch.id);
															return true;
														} catch {
															return false;
														}
													}}
												/>
											</div>
										</li>
									))}
								</ul>
							</ContextMenuTrigger>
							{contextBatch ? (
								<ContextMenuContent className="w-48">
									<ContextMenuItem
										className="gap-2"
										onClick={() => restore.mutate(contextBatch.id)}
									>
										<RotateCcw className="h-3.5 w-3.5" />
										Restore
									</ContextMenuItem>
									<ContextMenuSeparator />
									<ContextMenuItem
										className="gap-2 text-[#ff808a] focus:bg-[#ff808a4d]"
										onClick={() => purge.mutate(contextBatch.id)}
									>
										<Trash2 className="h-3.5 w-3.5" />
										Delete permanently
									</ContextMenuItem>
									<ContextMenuSeparator />
									<DevContextSubmenu />
								</ContextMenuContent>
							) : null}
						</ContextMenu>
					)}
				</div>
			</div>
		</LayoutContainer>
	);
}
