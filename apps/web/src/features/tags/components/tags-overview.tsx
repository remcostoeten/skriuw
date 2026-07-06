"use client";

import { useState } from "react";
import Link from "next/link";
import { Hash, MoreHorizontal, Pencil, Trash2, Merge } from "lucide-react";
import type { TagSummary } from "@/core/workspace-backend/types";
import { normalizeTagName } from "@/domain/tags/normalize";
import { LayoutContainer } from "@/features/layout/components/layout-container";
import { IconRail } from "@/features/layout/components/icon-rail";
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
	const { data: tags = [], isLoading } = useWorkspaceTagSummaries();
	const renameTag = useRenameTag();
	const deleteTag = useDeleteTag();
	const setTagColor = useSetTagColor();
	const [pending, setPending] = useState<PendingAction | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const [mergeTarget, setMergeTarget] = useState("");

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

	return (
		<LayoutContainer className="bg-background">
			<div className="relative flex min-h-0 flex-1 overflow-hidden">
				<IconRail />
				<div className="mx-auto flex h-full w-full max-w-3xl flex-col">
					<header className="border-b border-border px-6 py-5">
						<h1 className="text-base font-semibold text-foreground">Tags</h1>
						<p className="mt-0.5 text-sm text-muted-foreground">
							Every #tag across your notes. Rename, recolor, merge, or delete —
							changes rewrite the notes that use them.
						</p>
					</header>

					{isLoading ? null : isEmpty ? (
						<NotesEmptyState
							icon={Hash}
							title="No tags yet"
							description="Type # in a note to tag it. Tags collect here automatically."
						/>
					) : (
						<ul className="flex-1 divide-y divide-border overflow-y-auto">
							{tags.map((tag) => (
								<li key={tag.name} className="flex items-center gap-3 px-6 py-3">
									<ColorSwatchPicker
										value={tag.color}
										label={`#${tag.name}`}
										onChange={(color) =>
											setTagColor.mutate({ name: tag.name, color })
										}
									/>
									<Link
										href={`/app/tags/${encodeURIComponent(tag.name)}`}
										className="min-w-0 flex-1"
									>
										<p className="truncate text-sm font-medium text-foreground">
											#{tag.name}
										</p>
										<p className="text-xs text-muted-foreground">
											{noteCountLabel(tag.noteCount)}
										</p>
									</Link>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="sm"
												aria-label={`Actions for #${tag.name}`}
											>
												<MoreHorizontal className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem onSelect={() => openRename(tag)}>
												<Pencil className="mr-2 h-3.5 w-3.5" />
												Rename
											</DropdownMenuItem>
											<DropdownMenuItem
												onSelect={() => openMerge(tag)}
												disabled={tags.length < 2}
											>
												<Merge className="mr-2 h-3.5 w-3.5" />
												Merge into…
											</DropdownMenuItem>
											<DropdownMenuSeparator />
											<DropdownMenuItem
												className="text-destructive focus:text-destructive"
												onSelect={() => setPending({ kind: "delete", tag })}
											>
												<Trash2 className="mr-2 h-3.5 w-3.5" />
												Delete
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</li>
							))}
						</ul>
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
