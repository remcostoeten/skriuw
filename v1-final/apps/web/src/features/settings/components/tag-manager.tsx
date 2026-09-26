"use client";

import { useRef, useState } from "react";
import { Hash } from "lucide-react";
import { NOTE_PROPERTY_COLORS } from "@/domain/notes/properties";
import { normalizeTagName } from "@/domain/tags/normalize";
import { ColorSwatchPicker } from "@/features/tags/components/color-swatch-picker";
import {
	useDeleteTag,
	useRenameTag,
	useSetTagColor,
	useWorkspaceTagSummaries,
} from "@/features/tags/hooks/use-tags";
import { settingsFocusDomId } from "@/features/settings/lib/settings-focus-anchor";
import { DeleteButton } from "@/shared/ui/delete-button";
import { EmptyState } from "@/shared/ui/empty-state";
import { cn } from "@/shared/lib/utils";
import type { TagSummary } from "@/core/workspace-backend/types";

function noteCountLabel(count: number): string {
	return count === 1 ? "1 note" : `${count} notes`;
}

export function TagManager() {
	const { data: tags = [] } = useWorkspaceTagSummaries();
	const renameTag = useRenameTag();
	const deleteTag = useDeleteTag();
	const setTagColor = useSetTagColor();

	const [editingName, setEditingName] = useState<string | null>(null);
	const [editValue, setEditValue] = useState("");
	const editInputRef = useRef<HTMLInputElement | null>(null);

	const sortedTags = tags.toSorted((a, b) => b.noteCount - a.noteCount);

	function startEditing(tag: TagSummary) {
		setEditingName(tag.name);
		setEditValue(tag.name);
		requestAnimationFrame(() => editInputRef.current?.focus());
	}

	function commitRename(originalName: string) {
		const next = normalizeTagName(editValue);
		if (next && next !== originalName) {
			renameTag.mutate({ from: originalName, to: next });
		}
		setEditingName(null);
	}

	return (
		<div
			id={settingsFocusDomId("manage-tags")}
			data-settings-focus="manage-tags"
			className="space-y-4 scroll-mt-24"
		>
			<div>
				<h3 className="text-sm font-medium text-foreground">Manage Tags</h3>
				<p className="text-xs text-muted-foreground mt-0.5">
					{tags.length} {tags.length === 1 ? "tag" : "tags"} across your notes
				</p>
			</div>

			<div className="space-y-1">
				{sortedTags.map((tag) => (
					<div
						key={tag.name}
						className="group -mx-2 flex items-center gap-3 border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-muted"
					>
						<ColorSwatchPicker
							value={tag.color}
							label={`#${tag.name}`}
							onChange={(color) => setTagColor.mutate({ name: tag.name, color })}
						/>

						{editingName === tag.name ? (
							<input
								ref={editInputRef}
								type="text"
								value={editValue}
								onChange={(e) => setEditValue(e.target.value)}
								onBlur={() => commitRename(tag.name)}
								onKeyDown={(e) => {
									if (e.key === "Enter") commitRename(tag.name);
									if (e.key === "Escape") setEditingName(null);
								}}
								className="min-w-0 flex-1 border-b border-foreground/30 bg-transparent text-sm outline-hidden"
								aria-label={`Rename tag ${tag.name}`}
							/>
						) : (
							<button
								type="button"
								onClick={() => startEditing(tag)}
								className={cn(
									"inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
									"transition-opacity hover:opacity-80",
								)}
								style={
									tag.color
										? {
												backgroundColor: NOTE_PROPERTY_COLORS[tag.color].bg,
												color: NOTE_PROPERTY_COLORS[tag.color].fg,
											}
										: undefined
								}
							>
								<span className="truncate">#{tag.name}</span>
							</button>
						)}

						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-3 text-[11px] text-muted-foreground">
								<span className="tabular-nums">
									{noteCountLabel(tag.noteCount)}
								</span>
							</div>
						</div>

						<DeleteButton
							onDelete={() =>
								deleteTag
									.mutateAsync(tag.name)
									.then(() => true)
									.catch(() => false)
							}
							confirmLabel="Confirm delete tag"
							pendingLabel="Deleting tag"
							successLabel="Deleted"
							failedLabel="Retry"
						/>
					</div>
				))}

				{tags.length === 0 && (
					<EmptyState
						icon={Hash}
						title="No tags yet."
						description="Type # in a note to tag it. Tags collect here automatically."
						className="py-8"
					/>
				)}
			</div>
		</div>
	);
}
