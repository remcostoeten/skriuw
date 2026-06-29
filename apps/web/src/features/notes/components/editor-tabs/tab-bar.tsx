"use client";

import { useState, type DragEvent, type KeyboardEvent } from "react";
import { Pin, X } from "lucide-react";
import { stripMarkdownExtension } from "@/domain/notes/note-links";
import { cn } from "@/shared/lib/utils";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import type { EditorPane } from "@/features/notes/store";
import type { NoteFile } from "@/types/notes";

export type WorkspaceTabItem = {
	file: NoteFile;
	pinned: boolean;
};

export type WorkspaceTabBarApi = {
	openInTabs: boolean;
	primaryTabItems: WorkspaceTabItem[];
	secondaryTabItems: WorkspaceTabItem[];
	onSelectTab: (pane: EditorPane, fileId: string) => void;
	onCloseTab: (pane: EditorPane, fileId: string) => void;
	onReorderTabs: (pane: EditorPane, orderedFileIds: string[]) => void;
	onTogglePinTab: (pane: EditorPane, fileId: string) => void;
	onCloseOtherTabs: (pane: EditorPane, fileId: string) => void;
	onCloseTabsToSide: (pane: EditorPane, fileId: string, side: "left" | "right") => void;
};

type Props = {
	tabs: WorkspaceTabItem[];
	activeFileId: string | null;
	isPaneFocused?: boolean;
	onSelect: (fileId: string) => void;
	onClose: (fileId: string) => void;
	onReorder: (orderedFileIds: string[]) => void;
	onTogglePin: (fileId: string) => void;
	onCloseOthers: (fileId: string) => void;
	onCloseToSide: (fileId: string, side: "left" | "right") => void;
	onActivatePane?: () => void;
};

function tabLabel(file: NoteFile): string {
	return stripMarkdownExtension(file.name).trim() || "Untitled";
}

export function TabBar({
	tabs,
	activeFileId,
	isPaneFocused = true,
	onSelect,
	onClose,
	onReorder,
	onTogglePin,
	onCloseOthers,
	onCloseToSide,
	onActivatePane,
}: Props) {
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [dragOverId, setDragOverId] = useState<string | null>(null);

	if (tabs.length === 0) return null;

	function reorderAround(targetId: string) {
		if (!draggingId || draggingId === targetId) return;
		const ids = tabs.map((tab) => tab.file.id);
		const from = ids.indexOf(draggingId);
		const to = ids.indexOf(targetId);
		if (from === -1 || to === -1) return;
		ids.splice(from, 1);
		ids.splice(to, 0, draggingId);
		onReorder(ids);
	}

	const handleSelect = (fileId: string) => {
		onActivatePane?.();
		onSelect(fileId);
	};

	const handleKeyDown = (fileId: string) => (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			handleSelect(fileId);
		}
	};

	const handleDragStart = (fileId: string) => (event: DragEvent<HTMLDivElement>) => {
		setDraggingId(fileId);
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", fileId);
	};

	const handleDragOver = (fileId: string) => (event: DragEvent<HTMLDivElement>) => {
		if (!draggingId) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
		if (fileId !== dragOverId) setDragOverId(fileId);
	};

	const handleDrop = (fileId: string) => (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		reorderAround(fileId);
		setDraggingId(null);
		setDragOverId(null);
	};

	const handleDragEnd = () => {
		setDraggingId(null);
		setDragOverId(null);
	};

	return (
		<div
			role="tablist"
			aria-label="Open notes"
			className="flex min-h-9 shrink-0 items-stretch overflow-x-auto border-b border-border bg-background/80"
		>
			{tabs.map(({ file, pinned }) => {
				const isActive = file.id === activeFileId;
				return (
					<ContextMenu key={file.id}>
						<ContextMenuTrigger asChild>
							<div
								role="tab"
								aria-selected={isActive}
								tabIndex={0}
								draggable
								onClick={() => handleSelect(file.id)}
								onKeyDown={handleKeyDown(file.id)}
								onDragStart={handleDragStart(file.id)}
								onDragOver={handleDragOver(file.id)}
								onDrop={handleDrop(file.id)}
								onDragEnd={handleDragEnd}
								className={cn(
									"group flex max-w-52 min-w-28 cursor-pointer items-center gap-1.5 border-r border-border px-3 py-1.5 text-xs transition-colors select-none",
									isActive
										? "bg-accent text-accent-foreground"
										: "text-muted-foreground hover:bg-muted hover:text-foreground",
									isActive && isPaneFocused && "shadow-[inset_0_-2px_0_0_hsl(var(--ring))]",
									dragOverId === file.id && "bg-muted",
									draggingId === file.id && "opacity-50",
								)}
							>
								{pinned ? (
									<Pin className="h-3 w-3 shrink-0 fill-current" aria-hidden />
								) : null}
								<span className="truncate">{tabLabel(file)}</span>
								<button
									type="button"
									aria-label={`Close ${tabLabel(file)}`}
									onClick={(event) => {
										event.stopPropagation();
										onClose(file.id);
									}}
									className={cn(
										"ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-foreground/10 group-hover:opacity-100 focus-visible:opacity-100",
										isActive && "opacity-60",
									)}
								>
									<X className="h-3 w-3" />
								</button>
							</div>
						</ContextMenuTrigger>
						<ContextMenuContent className="w-52">
							<ContextMenuItem onClick={() => onTogglePin(file.id)}>
								<Pin className="h-3.5 w-3.5" />
								{pinned ? "Unpin" : "Pin"}
							</ContextMenuItem>
							<ContextMenuSeparator />
							<ContextMenuItem onClick={() => onClose(file.id)}>Close</ContextMenuItem>
							<ContextMenuItem onClick={() => onCloseOthers(file.id)}>
								Close all but this
							</ContextMenuItem>
							<ContextMenuItem onClick={() => onCloseToSide(file.id, "right")}>
								Close all to the right
							</ContextMenuItem>
							<ContextMenuItem onClick={() => onCloseToSide(file.id, "left")}>
								Close all to the left
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				);
			})}
		</div>
	);
}
