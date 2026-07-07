"use client";

import { memo, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { SidebarItemIcon } from "./sidebar-item-icon";
import { cn } from "@/shared/lib/utils";
import { NoteFile, NoteFolder } from "@/types/notes";
import type { RecentItem } from "./types";
import { SidebarSection } from "./sidebar-section";

const RECENTS_PREVIEW_LIMIT = 6;

type Props = {
	recents: RecentItem[];
	filesById: Map<string, NoteFile>;
	foldersById: Map<string, NoteFolder>;
	activeFileId: string;
	isCollapsed: boolean;
	showHeader?: boolean;
	compactMode?: boolean;
	onToggleCollapse: () => void;
	onToggleVisibility: () => void;
	onMoveUp?: () => void;
	onMoveDown?: () => void;
	canMoveUp?: boolean;
	canMoveDown?: boolean;
	onManageSections: () => void;
	onFileSelect: (id: string) => void;
	onFilePrefetch?: (id: string) => void;
	onClearRecents: () => void;
	isDraggable?: boolean;
	isDragging?: boolean;
	isDropTarget?: boolean;
	onDragStart?: (event: React.DragEvent) => void;
	onDragOver?: (event: React.DragEvent) => void;
	onDrop?: (event: React.DragEvent) => void;
	onDragEnd?: () => void;
};

export const RecentsSection = memo(function RecentsSection({
	recents,
	filesById,
	foldersById,
	activeFileId,
	isCollapsed,
	showHeader = true,
	compactMode = false,
	onToggleCollapse,
	onToggleVisibility,
	onMoveUp,
	onMoveDown,
	canMoveUp,
	canMoveDown,
	onFileSelect,
	onFilePrefetch,
	onClearRecents,
	isDraggable,
	isDragging,
	isDropTarget,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
}: Props) {
	const [showAllRecents, setShowAllRecents] = useState(false);
	const isHydrated = useSyncExternalStore(
		() => () => {},
		() => true,
		() => false,
	);
	const resolvedRecents = useMemo(
		() =>
			recents.flatMap<
				RecentItem & { item: NoteFile | NoteFolder; name: string; icon?: string }
			>((recent) => {
				if (recent.itemType === "file") {
					const file = filesById.get(recent.itemId);
					return file
						? [{ ...recent, item: file, name: file.name, icon: file.icon }]
						: [];
				}

				const folder = foldersById.get(recent.itemId);
				return folder ? [{ ...recent, item: folder, name: folder.name }] : [];
			}),
		[recents, filesById, foldersById],
	);

	useEffect(() => {
		if (resolvedRecents.length <= RECENTS_PREVIEW_LIMIT) {
			setShowAllRecents(false);
		}
	}, [resolvedRecents.length]);

	const visibleRecents = showAllRecents
		? resolvedRecents
		: resolvedRecents.slice(0, RECENTS_PREVIEW_LIMIT);
	const hiddenRecentCount = resolvedRecents.length - visibleRecents.length;

	const clearButton =
		isHydrated && resolvedRecents.length > 0 ? (
			<button
				type="button"
				onClick={onClearRecents}
				aria-label="Clear recent notes"
				className="flex h-5 w-5 items-center justify-center border border-transparent text-muted-foreground/60 transition-colors hover:border-border hover:bg-muted hover:text-foreground"
			>
				<X className="w-3 h-3" strokeWidth={1.5} />
			</button>
		) : null;

	return (
		<SidebarSection
			id="recents"
			title="Recents"
			isCollapsed={isCollapsed}
			showHeader={showHeader}
			compactMode={compactMode}
			itemCount={isHydrated ? resolvedRecents.length : undefined}
			onToggleCollapse={onToggleCollapse}
			onToggleVisibility={onToggleVisibility}
			onMoveUp={onMoveUp}
			onMoveDown={onMoveDown}
			canMoveUp={canMoveUp}
			canMoveDown={canMoveDown}
			actions={clearButton}
			isDraggable={isDraggable}
			isDragging={isDragging}
			isDropTarget={isDropTarget}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onDragEnd={onDragEnd}
		>
			{!isHydrated || resolvedRecents.length === 0 ? (
				<div
					className={cn(
						"mx-1 flex items-center gap-2 rounded-md border border-dashed border-border/60 px-2 text-xs text-muted-foreground/65",
						compactMode ? "h-7" : "h-8",
					)}
				>
					<span className="truncate">No recent notes</span>
				</div>
			) : (
				<div className={cn("space-y-px px-1", compactMode && "space-y-[1px]")}>
					{visibleRecents.map((recent) => (
						<button
							type="button"
							key={recent.id}
							onClick={() =>
								recent.itemType === "file" && onFileSelect(recent.itemId)
							}
							onPointerEnter={() =>
								recent.itemType === "file" && onFilePrefetch?.(recent.itemId)
							}
							className={cn(
								"group flex w-full items-center gap-2 rounded-md px-2 text-left text-xs transition-colors active:scale-[0.985] [@media(pointer:coarse)]:min-h-11",
								compactMode ? "h-6" : "h-7",
								recent.itemType === "file" && recent.itemId === activeFileId
									? "bg-foreground/[0.07] text-foreground"
									: "text-foreground/60 hover:bg-foreground/[0.045] hover:text-foreground",
							)}
						>
							{recent.icon ? (
								<span
									className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[13px] leading-none"
									aria-hidden
								>
									{recent.icon}
								</span>
							) : recent.itemType === "folder" ? (
								<SidebarItemIcon
									kind="folder"
									size={compactMode ? 12 : 14}
									className="shrink-0 text-muted-foreground/70"
								/>
							) : null}
							<span className="flex-1 truncate">{recent.name}</span>
						</button>
					))}
					{(hiddenRecentCount > 0 || showAllRecents) && (
						<button
							type="button"
							onClick={() => setShowAllRecents((value) => !value)}
							className={cn(
								"mt-1 flex w-full items-center justify-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground/60 transition-colors hover:bg-foreground/[0.045] hover:text-foreground [@media(pointer:coarse)]:min-h-11",
								compactMode ? "h-6" : "h-7",
							)}
						>
							{showAllRecents ? (
								<ChevronUp className="h-3 w-3" strokeWidth={1.5} />
							) : (
								<ChevronDown className="h-3 w-3" strokeWidth={1.5} />
							)}
							<span>
								{showAllRecents ? "Show less" : `Load ${hiddenRecentCount} more`}
							</span>
						</button>
					)}
				</div>
			)}
		</SidebarSection>
	);
});
