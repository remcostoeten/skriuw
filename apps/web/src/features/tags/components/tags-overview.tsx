"use client";

import { useState } from "react";
import Link from "next/link";
import { Hash, MoreHorizontal, Pencil, Trash2, Merge } from "lucide-react";
import type { TagSummary } from "@/core/workspace-backend/types";
import { normalizeTagName } from "@/domain/tags/normalize";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { NotesEmptyState } from "@/features/notes/components/notes-empty-state";
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
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu";
import { Input } from "@/shared/ui/input";
import {
	useDeleteTag,
	useRenameTag,
	useSetTagColor,
	useWorkspaceTagSummaries,
} from "../hooks/use-tags";
import { ColorSwatchPicker } from "./color-swatch-picker";

type PendingAction =
	| { kind: "rename"; tag: TagSummary }
	| { kind: "merge"; tag: TagSummary }
	| { kind: "delete"; tag: TagSummary };

function noteCountLabel(count: number): string {
	return count === 1 ? "1 note" : `${count} notes`;
}

export function TagsOverview() {
	const { data: tags = [], isPending } = useWorkspaceTagSummaries();
	const renameTag = useRenameTag();
	const deleteTag = useDeleteTag();
	const setTagColor = useSetTagColor();
	const [pending, setPending] = useState<PendingAction | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [mergeTarget, setMergeTarget] = useState("");
	const [openMenuId, setOpenMenuId] = useState<string | null>(null);
	const [contextTagName, setContextTagName] = useState<string | null>(null);

	function openRename(tag: TagSummary) {
		setRenameValue(tag.name);
		setPending({ kind: "rename", tag });
	}

	function openMerge(tag: TagSummary) {
		setMergeTarget("");
		setPending({ kind: "merge", tag });
	}

	function submitRename() {
		if (pending?.kind !== "rename") return;
		const next = normalizeTagName(renameValue);
		if (!next || next === pending.tag.name) {
			setPending(null);
			return;
		}
		renameTag.mutate({ from: pending.tag.name, to: next });
		setPending(null);
	}

	function submitMerge() {
		if (pending?.kind !== "merge" || !mergeTarget) return;
		renameTag.mutate({ from: pending.tag.name, to: mergeTarget });
		setPending(null);
	}

	function submitDelete() {
		if (pending?.kind !== "delete") return;
		deleteTag.mutate(pending.tag.name);
		setPending(null);
	}

	const isEmpty = tags.length === 0;
	const totalNotes = tags.reduce((sum, tag) => sum + tag.noteCount, 0);
	const contextTag = contextTagName
		? (tags.find((tag) => tag.name === contextTagName) ?? null)
		: null;

	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<div className="mx-auto flex h-full w-full max-w-3xl flex-col">
					<header className="border-b border-border px-6 py-5">
						<h1 className="text-base font-semibold text-foreground">Tags</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Every #tag across your notes. Rename, recolor, merge, or delete —
							changes rewrite the notes that use them.
						</p>
						{!isEmpty ? (
							<div className="mt-3 flex flex-wrap gap-2">
								<div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
									<Hash className="h-3.5 w-3.5 text-primary" strokeWidth={1.8} />
									<span className="text-sm font-semibold tabular-nums text-foreground">
										{tags.length}
									</span>
									<span className="text-xs text-muted-foreground">
										{tags.length === 1 ? "tag" : "tags"}
									</span>
								</div>
								<div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5">
									<span className="text-sm font-semibold tabular-nums text-foreground">
										{totalNotes}
									</span>
									<span className="text-xs text-muted-foreground">
										tagged {totalNotes === 1 ? "note" : "notes"}
									</span>
								</div>
							</div>
						) : null}
					</header>

					{isPending ? null : isEmpty ? (
						<NotesEmptyState
							icon={Hash}
							title="No tags yet"
							description="Type # in a note to tag it. Tags collect here automatically."
						/>
					) : (
						<ContextMenu
							onOpenChange={(open) => {
								if (!open) setContextTagName(null);
							}}
						>
							<ContextMenuTrigger asChild>
								<ul className="flex-1 overflow-y-auto px-3 py-2">
									{tags.map((tag) => (
										<li
											key={tag.name}
											onContextMenu={() => setContextTagName(tag.name)}
										>
											<div className="group/row flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60">
												<ColorSwatchPicker
													value={tag.color}
													label={`#${tag.name}`}
													onChange={(color) =>
														setTagColor.mutate({
															name: tag.name,
															color,
														})
													}
												/>
												<Link
													href={`/app/tags/${encodeURIComponent(tag.name)}`}
													className="min-w-0 flex-1"
												>
													<p className="truncate text-sm font-medium text-foreground">
														#{tag.name}
													</p>
												</Link>
												<span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
													{noteCountLabel(tag.noteCount)}
												</span>
												<DropdownMenu
													onOpenChange={(open) => {
														setOpenMenuId((current) =>
															open
																? tag.name
																: current === tag.name
																	? null
																	: current,
														);
													}}
												>
													<DropdownMenuTrigger asChild>
														<Button
															variant="ghost"
															size="sm"
															aria-label={`Actions for #${tag.name}`}
														>
															<MoreHorizontal className="h-4 w-4" />
														</Button>
													</DropdownMenuTrigger>
													{openMenuId === tag.name ? (
														<DropdownMenuContent align="end">
															<DropdownMenuItem
																className="gap-2"
																onSelect={() => openRename(tag)}
															>
																<Pencil className="h-3.5 w-3.5" />
																Rename
															</DropdownMenuItem>
															<DropdownMenuItem
																className="gap-2"
																onSelect={() => openMerge(tag)}
																disabled={tags.length < 2}
															>
																<Merge className="h-3.5 w-3.5" />
																Merge into…
															</DropdownMenuItem>
															<DropdownMenuSeparator />
															<DropdownMenuItem
																className="gap-2 text-[#ff808a] focus:bg-[#ff808a4d]"
																onSelect={() =>
																	setPending({
																		kind: "delete",
																		tag,
																	})
																}
															>
																<Trash2 className="h-3.5 w-3.5" />
																Delete
															</DropdownMenuItem>
														</DropdownMenuContent>
													) : null}
												</DropdownMenu>
											</div>
										</li>
									))}
								</ul>
							</ContextMenuTrigger>
							{contextTag ? (
								<ContextMenuContent className="w-48">
									<ContextMenuItem
										className="gap-2"
										onClick={() => openRename(contextTag)}
									>
										<Pencil className="h-3.5 w-3.5" />
										Rename
									</ContextMenuItem>
									<ContextMenuItem
										className="gap-2"
										disabled={tags.length < 2}
										onClick={() => openMerge(contextTag)}
									>
										<Merge className="h-3.5 w-3.5" />
										Merge into…
									</ContextMenuItem>
									<ContextMenuSeparator />
									<ContextMenuItem
										className="gap-2 text-[#ff808a] focus:bg-[#ff808a4d]"
										onClick={() =>
											setPending({ kind: "delete", tag: contextTag })
										}
									>
										<Trash2 className="h-3.5 w-3.5" />
										Delete
									</ContextMenuItem>
								</ContextMenuContent>
							) : null}
						</ContextMenu>
					)}
				</div>
			</div>

			<Dialog
				open={pending?.kind === "rename"}
				onOpenChange={(open) => !open && setPending(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Rename tag</DialogTitle>
						<DialogDescription>
							Every note using #{pending?.tag.name} is rewritten to the new name.
							Renaming onto an existing tag merges them.
						</DialogDescription>
					</DialogHeader>
					<Input
						value={renameValue}
						onChange={(event) => setRenameValue(event.target.value)}
						onKeyDown={(event) => event.key === "Enter" && submitRename()}
						placeholder="new-name"
						autoFocus
					/>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline" size="sm">
								Cancel
							</Button>
						</DialogClose>
						<Button size="sm" onClick={submitRename} disabled={renameTag.isPending}>
							Rename
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={pending?.kind === "merge"}
				onOpenChange={(open) => !open && setPending(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Merge #{pending?.tag.name} into…</DialogTitle>
						<DialogDescription>
							Notes tagged #{pending?.tag.name} are rewritten to the target tag.
						</DialogDescription>
					</DialogHeader>
					<ul className="max-h-64 overflow-y-auto rounded-md border border-border">
						{tags.flatMap((tag) =>
							tag.name === pending?.tag.name
								? []
								: [
										<li key={tag.name}>
											<button
												type="button"
												onClick={() => setMergeTarget(tag.name)}
												className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted ${
													mergeTarget === tag.name ? "bg-muted" : ""
												}`}
											>
												<span>#{tag.name}</span>
												<span className="text-xs text-muted-foreground">
													{noteCountLabel(tag.noteCount)}
												</span>
											</button>
										</li>,
									],
						)}
					</ul>
					<DialogFooter>
						<DialogClose asChild>
							<Button variant="outline" size="sm">
								Cancel
							</Button>
						</DialogClose>
						<Button
							size="sm"
							onClick={submitMerge}
							disabled={!mergeTarget || renameTag.isPending}
						>
							Merge
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={pending?.kind === "delete"}
				onOpenChange={(open) => !open && setPending(null)}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Delete #{pending?.tag.name}?</DialogTitle>
						<DialogDescription>
							The tag is removed from {noteCountLabel(pending?.tag.noteCount ?? 0)};
							the words stay as plain text. This cannot be undone.
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
							onClick={submitDelete}
							disabled={deleteTag.isPending}
						>
							Delete tag
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</LayoutContainer>
	);
}
