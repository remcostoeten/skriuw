"use client";

import { useState, useRef, useEffect } from "react";
import { cn } from "@/shared/lib/utils";
import { colorWithAlpha } from "@/shared/lib/theme-colors";
import { EmptyState } from "@/shared/ui/empty-state";
import { TAG_COLORS } from "@/features/journal/types";
import type { JournalTag as Tag } from "@/types/journal";
import { Plus, Hash } from "lucide-react";
import { DeleteButton } from "@/shared/ui/delete-button";
import type { CssColorValue, TagId, TagName } from "@/core/persistence-types";
import {
	useCreateJournalTag,
	useDeleteJournalTag,
	useWorkspaceTags,
} from "@/features/journal/hooks/use-journal-tags";
import { settingsFocusDomId } from "@/features/settings/lib/settings-focus-anchor";

function tagColorName(color: string): string {
	return color.match(/--project-(\w+)/)?.[1] ?? color;
}

export function TagManager() {
	const { data: tags = [] } = useWorkspaceTags();
	const createTag = useCreateJournalTag();
	const removeTag = useDeleteJournalTag();

	const [isAddingTag, setIsAddingTag] = useState(false);
	const [newTagName, setNewTagName] = useState("");
	const [selectedColor, setSelectedColor] = useState<string>(TAG_COLORS[0]);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (isAddingTag && inputRef.current) {
			inputRef.current.focus();
		}
	}, [isAddingTag]);

	const handleAddTag = () => {
		const trimmed = newTagName.trim().toLowerCase();
		if (trimmed && !tags.find((t) => t.name === trimmed)) {
			void createTag.mutateAsync({
				name: trimmed as TagName,
				color: selectedColor as CssColorValue,
			});
		}
		setNewTagName("");
		setSelectedColor(TAG_COLORS[0]);
		setIsAddingTag(false);
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleAddTag();
		} else if (e.key === "Escape") {
			setIsAddingTag(false);
			setNewTagName("");
		}
	};

	// Sort by usage count
	const sortedTags = [...tags].sort((a, b) => b.usageCount - a.usageCount);

	return (
		<div
			id={settingsFocusDomId("manage-tags")}
			data-settings-focus="manage-tags"
			className="space-y-4 scroll-mt-24"
		>
			<div className="flex items-center justify-between">
				<div>
					<h3 className="text-sm font-medium text-foreground">Manage Tags</h3>
					<p className="text-xs text-muted-foreground mt-0.5">
						{tags.length} tags created
					</p>
				</div>
				{!isAddingTag && (
					<button
						onClick={() => setIsAddingTag(true)}
						className="flex items-center gap-1.5 border border-dashed border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						<Plus className="w-3.5 h-3.5" />
						New tag
					</button>
				)}
			</div>

			{/* Add tag form */}
			{isAddingTag && (
				<div className="space-y-3 border border-border bg-card p-3">
					<div className="flex items-center gap-2">
						<Hash className="w-4 h-4 text-muted-foreground" />
						<input
							ref={inputRef}
							type="text"
							value={newTagName}
							onChange={(e) => setNewTagName(e.target.value)}
							onKeyDown={handleKeyDown}
							placeholder="Tag name..."
							className="flex-1 text-base bg-transparent outline-hidden placeholder:text-muted-foreground/50 md:text-sm"
						/>
					</div>

					{/* Color picker */}
					<div className="space-y-2">
						<span id="tag-color-label" className="text-xs text-muted-foreground">
							Color
						</span>
						<div
							role="radiogroup"
							aria-labelledby="tag-color-label"
							className="flex flex-wrap gap-1.5"
							onKeyDown={(e) => {
								const arrows = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
								if (!arrows.includes(e.key)) return;
								e.preventDefault();
								const idx = Math.max(0, TAG_COLORS.indexOf(selectedColor as CssColorValue));
								const delta = e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1;
								const next =
									TAG_COLORS[(idx + delta + TAG_COLORS.length) % TAG_COLORS.length];
								setSelectedColor(next);
								e.currentTarget
									.querySelector<HTMLElement>(`[data-tag-color="${next}"]`)
									?.focus();
							}}
						>
							{TAG_COLORS.map((color, i) => (
								<button
									key={color}
									type="button"
									role="radio"
									data-tag-color={color}
									aria-checked={selectedColor === color}
									aria-label={tagColorName(color)}
									tabIndex={
										selectedColor === color ||
										(i === 0 && !TAG_COLORS.includes(selectedColor as CssColorValue))
											? 0
											: -1
									}
									onClick={() => setSelectedColor(color)}
									className={cn(
										"h-6 w-6 border transition-transform focus-visible:scale-115",
										selectedColor === color
											? "border-foreground"
											: "border-transparent hover:border-border",
									)}
									style={{ backgroundColor: color }}
								/>
							))}
						</div>
					</div>

					{/* Preview */}
					{newTagName && (
						<div className="border-t border-border pt-2">
							<span className="text-xs text-muted-foreground">Preview: </span>
							<span
								className="ml-1 inline-flex items-center border px-1.5 py-0.5 text-[11px] font-medium"
								style={{
									borderColor: colorWithAlpha(selectedColor, 0.33),
									backgroundColor: colorWithAlpha(selectedColor, 0.12),
									color: selectedColor,
								}}
							>
								{newTagName.toLowerCase()}
							</span>
						</div>
					)}

					{/* Actions */}
					<div className="flex items-center justify-end gap-2 pt-2">
						<button
							onClick={() => {
								setIsAddingTag(false);
								setNewTagName("");
							}}
							className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
						>
							Cancel
						</button>
						<button
							onClick={handleAddTag}
							disabled={!newTagName.trim()}
							className={cn(
								"border px-3 py-1.5 text-xs transition-colors",
								newTagName.trim()
									? "border-border bg-foreground text-background hover:bg-foreground/90"
									: "cursor-not-allowed border-border bg-muted text-muted-foreground",
							)}
						>
							Create tag
						</button>
					</div>
				</div>
			)}

			{/* Tags list */}
			<div className="space-y-1">
				{sortedTags.map((tag) => (
					<TagRow
						key={tag.id}
						tag={tag}
						onDelete={() => removeTag.mutateAsync(tag.id as TagId).then(() => true).catch(() => false)}
					/>
				))}

				{tags.length === 0 && !isAddingTag && (
					<EmptyState
						icon={Hash}
						title="No tags yet."
						description="Create your first tag to organize notes and journal entries."
						className="py-8"
					/>
				)}
			</div>
		</div>
	);
}

function TagRow({ tag, onDelete }: { tag: Tag; onDelete: () => Promise<boolean> }) {
	const canDelete = !tag.id.startsWith("derived-") && !tag.id.startsWith("optimistic-");

	return (
		<div className="group -mx-2 flex items-center gap-3 border border-transparent px-2 py-2 transition-colors hover:border-border hover:bg-muted">
			<span
				className="inline-flex min-w-[60px] items-center border px-2 py-0.5 text-xs font-medium"
				style={{
					borderColor: colorWithAlpha(tag.color, 0.33),
					backgroundColor: colorWithAlpha(tag.color, 0.12),
					color: tag.color,
				}}
			>
				{tag.name}
			</span>

			<div className="flex-1 min-w-0">
				<div className="flex items-center gap-3 text-[11px] text-muted-foreground">
					<span className="tabular-nums">{tag.usageCount} uses</span>
				</div>
			</div>

			{canDelete ? (
				<DeleteButton
					onDelete={onDelete}
					confirmLabel="Confirm delete tag"
					pendingLabel="Deleting tag"
					successLabel="Deleted"
					failedLabel="Retry"
				/>
			) : null}
		</div>
	);
}
