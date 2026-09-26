"use client";

import {
	useEffect,
	useRef,
	useState,
	type DragEvent,
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
} from "react";
import { Pin, X } from "lucide-react";
import { useLazyRef } from "@/shared/lib/use-lazy-ref";
import { stripMarkdownExtension } from "@/domain/notes/note-links";
import { cn } from "@/shared/lib/utils";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { DevContextSubmenu } from "@/features/desktop/dev-context-menu";
import { usePreferencesStore } from "@/features/settings/store";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/shared/ui/context-menu";
import type { EditorPane } from "@/features/notes/store";
import {
	getActiveTreeItemDrag,
	isTreeItemDrag,
	readDroppedFileId,
} from "@/features/notes/lib/note-drag";
import type { NoteFile } from "@/types/notes";

export type WorkspaceTabItem = {
	file: NoteFile;
	pinned: boolean;
};

function isMacPlatform(): boolean {
	if (typeof navigator === "undefined") return false;
	return /Mac|iP(hone|ad|od)/.test(navigator.userAgent);
}

function isCloseTabClick(event: { ctrlKey: boolean; metaKey: boolean }): boolean {
	return isMacPlatform() ? event.metaKey && !event.ctrlKey : event.ctrlKey || event.metaKey;
}

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
	onDropNoteOnTab: (pane: EditorPane, targetFileId: string | null, droppedFileId: string) => void;
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
	onDropNote?: (targetFileId: string | null, droppedFileId: string) => void;
	onActivatePane?: () => void;
};

function tabLabel(file: NoteFile): string {
	return stripMarkdownExtension(file.name).trim() || "Untitled";
}

function activeDraggedFileId(): string | null {
	const item = getActiveTreeItemDrag();
	return item?.type === "file" ? item.id : null;
}

// Native HTML5 DnD (draggable/onDragStart/onDragOver/onDrop) has no touch
// equivalent, so touch pointers get a parallel long-press-then-drag path.
const TOUCH_LONG_PRESS_MS = 320;
const TOUCH_MOVE_CANCEL_PX = 8;

type TouchPressState = {
	fileId: string;
	startX: number;
	startY: number;
	timer: ReturnType<typeof setTimeout> | null;
};

function tabIdAtPoint(x: number, y: number): string | null {
	const el = document.elementFromPoint(x, y);
	const tabEl = el instanceof Element ? el.closest<HTMLElement>("[data-tab-id]") : null;
	return tabEl?.dataset.tabId ?? null;
}

function useTabDragAndDrop({
	tabs,
	onReorder,
	onDropNote,
}: {
	tabs: WorkspaceTabItem[];
	onReorder: (orderedFileIds: string[]) => void;
	onDropNote?: (targetFileId: string | null, droppedFileId: string) => void;
}) {
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [dragOverId, setDragOverId] = useState<string | null>(null);
	const externalOverRef = useRef<string | "strip" | null>(null);
	const touchPressRef = useRef<TouchPressState | null>(null);
	const dropNoteRef = useRef(onDropNote);
	dropNoteRef.current = onDropNote;

	// Same WebKitGTK rescue as SplitDropZone: if the native drop never fires,
	// commit the tab that was highlighted when the drag was released.
	useEffect(() => {
		function handleWindowDragEnd() {
			const pending = externalOverRef.current;
			externalOverRef.current = null;
			setDragOverId(null);
			if (!pending || !dropNoteRef.current) return;
			const item = getActiveTreeItemDrag();
			if (!item || item.type !== "file") return;
			dropNoteRef.current(pending === "strip" ? null : pending, item.id);
		}
		window.addEventListener("dragend", handleWindowDragEnd, true);
		return () => window.removeEventListener("dragend", handleWindowDragEnd, true);
	}, []);

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

	const handleDragStart = (fileId: string) => (event: DragEvent<HTMLDivElement>) => {
		setDraggingId(fileId);
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", fileId);
	};

	const handleDragOver = (fileId: string) => (event: DragEvent<HTMLDivElement>) => {
		if (!draggingId) {
			if (!onDropNote || !isTreeItemDrag(event)) return;
			event.preventDefault();
			event.dataTransfer.dropEffect = "copy";
			externalOverRef.current = fileId;
			if (fileId !== dragOverId) setDragOverId(fileId);
			return;
		}
		event.preventDefault();
		event.dataTransfer.dropEffect = "move";
		if (fileId !== dragOverId) setDragOverId(fileId);
	};

	const handleDrop = (fileId: string) => (event: DragEvent<HTMLDivElement>) => {
		event.preventDefault();
		if (!draggingId && onDropNote && isTreeItemDrag(event)) {
			externalOverRef.current = null;
			const droppedId = readDroppedFileId(event) ?? activeDraggedFileId();
			if (droppedId) onDropNote(fileId, droppedId);
			setDragOverId(null);
			return;
		}
		reorderAround(fileId);
		setDraggingId(null);
		setDragOverId(null);
	};

	const handleStripDragOver = (event: DragEvent<HTMLDivElement>) => {
		if (event.defaultPrevented || draggingId) return;
		if (!onDropNote || !isTreeItemDrag(event)) return;
		event.preventDefault();
		event.dataTransfer.dropEffect = "copy";
		externalOverRef.current = "strip";
	};

	const handleStripDrop = (event: DragEvent<HTMLDivElement>) => {
		if (event.defaultPrevented || draggingId) return;
		if (!onDropNote || !isTreeItemDrag(event)) return;
		event.preventDefault();
		externalOverRef.current = null;
		const droppedId = readDroppedFileId(event) ?? activeDraggedFileId();
		if (droppedId) onDropNote(null, droppedId);
	};

	const handleStripDragLeave = () => {
		if (draggingId) return;
		externalOverRef.current = null;
		setDragOverId(null);
	};

	const handleDragEnd = () => {
		setDraggingId(null);
		setDragOverId(null);
	};

	const handleTabPointerDown = (fileId: string) => (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType !== "touch") return;
		const startX = event.clientX;
		const startY = event.clientY;
		touchPressRef.current = {
			fileId,
			startX,
			startY,
			timer: setTimeout(() => {
				if (!touchPressRef.current || touchPressRef.current.fileId !== fileId) return;
				touchPressRef.current.timer = null;
				setDraggingId(fileId);
				setDragOverId(null);
				event.currentTarget.setPointerCapture(event.pointerId);
				triggerNativeFeedback("impact");
			}, TOUCH_LONG_PRESS_MS),
		};
	};

	const handleTabPointerMove = (fileId: string) => (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType !== "touch") return;
		const press = touchPressRef.current;
		if (!press || press.fileId !== fileId) return;

		if (draggingId !== fileId) {
			if (!press.timer) return;
			const dx = event.clientX - press.startX;
			const dy = event.clientY - press.startY;
			if (Math.hypot(dx, dy) > TOUCH_MOVE_CANCEL_PX) {
				clearTimeout(press.timer);
				touchPressRef.current = null;
			}
			return;
		}

		const hoveredId = tabIdAtPoint(event.clientX, event.clientY);
		if (!hoveredId || hoveredId === dragOverId) return;
		setDragOverId(hoveredId);
		if (hoveredId !== draggingId) {
			reorderAround(hoveredId);
			triggerNativeFeedback("selection");
		}
	};

	const handleTabPointerEnd = (fileId: string) => (event: PointerEvent<HTMLDivElement>) => {
		if (event.pointerType !== "touch") return;
		const press = touchPressRef.current;
		if (press?.timer) clearTimeout(press.timer);
		touchPressRef.current = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		if (draggingId === fileId) {
			setDraggingId(null);
			setDragOverId(null);
		}
	};

	return {
		draggingId,
		dragOverId,
		handleDragStart,
		handleDragOver,
		handleDrop,
		handleStripDragOver,
		handleStripDrop,
		handleStripDragLeave,
		handleDragEnd,
		handleTabPointerDown,
		handleTabPointerMove,
		handleTabPointerEnd,
	};
}

function useTabKeyboardNav({
	tabs,
	onSelect,
	onClose,
	onActivatePane,
}: {
	tabs: WorkspaceTabItem[];
	onSelect: (fileId: string) => void;
	onClose: (fileId: string) => void;
	onActivatePane?: () => void;
}) {
	const tabRefs = useLazyRef(() => new Map<string, HTMLDivElement>());

	const handleSelect = (fileId: string) => {
		onActivatePane?.();
		onSelect(fileId);
	};

	function focusAndSelectTab(fileId: string) {
		tabRefs.current.get(fileId)?.focus();
		handleSelect(fileId);
	}

	function handleTabKeyDown(fileId: string, event: KeyboardEvent<HTMLDivElement>) {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			handleSelect(fileId);
			return;
		}

		const ids = tabs.map((tab) => tab.file.id);
		const currentIndex = ids.indexOf(fileId);
		if (currentIndex === -1) return;

		if (event.key === "ArrowRight") {
			event.preventDefault();
			focusAndSelectTab(ids[(currentIndex + 1) % ids.length]);
		} else if (event.key === "ArrowLeft") {
			event.preventDefault();
			focusAndSelectTab(ids[(currentIndex - 1 + ids.length) % ids.length]);
		} else if (event.key === "Home") {
			event.preventDefault();
			focusAndSelectTab(ids[0]);
		} else if (event.key === "End") {
			event.preventDefault();
			focusAndSelectTab(ids[ids.length - 1]);
		} else if (event.key === "Delete") {
			event.preventDefault();
			const survivorId = ids[currentIndex + 1] ?? ids[currentIndex - 1] ?? null;
			onClose(fileId);
			if (survivorId) {
				requestAnimationFrame(() => {
					tabRefs.current.get(survivorId)?.focus();
				});
			}
		}
	}

	return { tabRefs, handleSelect, handleTabKeyDown };
}

type TabItemProps = {
	file: NoteFile;
	pinned: boolean;
	isActive: boolean;
	isFocusable: boolean;
	isPaneFocused: boolean;
	showPageIcons: boolean;
	dragOverId: string | null;
	draggingId: string | null;
	registerRef: (node: HTMLDivElement | null) => void;
	onContextMenu: () => void;
	onClick: (event: MouseEvent<HTMLDivElement>) => void;
	onAuxClick: (event: MouseEvent<HTMLDivElement>) => void;
	onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
	onDragStart: (event: DragEvent<HTMLDivElement>) => void;
	onDragOver: (event: DragEvent<HTMLDivElement>) => void;
	onDrop: (event: DragEvent<HTMLDivElement>) => void;
	onDragEnd: () => void;
	onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
	onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
	onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
	onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
	onCloseClick: (event: MouseEvent<HTMLButtonElement>) => void;
};

function TabItem({
	file,
	pinned,
	isActive,
	isFocusable,
	isPaneFocused,
	showPageIcons,
	dragOverId,
	draggingId,
	registerRef,
	onContextMenu,
	onClick,
	onAuxClick,
	onKeyDown,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
	onPointerDown,
	onPointerMove,
	onPointerUp,
	onPointerCancel,
	onCloseClick,
}: TabItemProps) {
	return (
		<div
			role="tab"
			aria-selected={isActive}
			tabIndex={isFocusable ? 0 : -1}
			data-tab-id={file.id}
			ref={registerRef}
			draggable
			onContextMenu={onContextMenu}
			onClick={onClick}
			onAuxClick={onAuxClick}
			onKeyDown={onKeyDown}
			onDragStart={onDragStart}
			onDragOver={onDragOver}
			onDrop={onDrop}
			onDragEnd={onDragEnd}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
			onPointerCancel={onPointerCancel}
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
			{pinned ? <Pin className="h-3 w-3 shrink-0 fill-current" aria-hidden /> : null}
			{showPageIcons && file.icon && <span className="shrink-0 text-xs">{file.icon}</span>}
			<span className="truncate">{tabLabel(file)}</span>
			<button
				type="button"
				aria-label={`Close ${tabLabel(file)}`}
				tabIndex={-1}
				onClick={onCloseClick}
				className={cn(
					"ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-sm opacity-0 transition-opacity hover:bg-foreground/10 group-hover:opacity-100 focus-visible:opacity-100",
					isActive && "opacity-60",
				)}
			>
				<X className="h-3 w-3" />
			</button>
		</div>
	);
}

function TabContextMenuContent({
	tab,
	onTogglePin,
	onClose,
	onCloseOthers,
	onCloseToSide,
}: {
	tab: WorkspaceTabItem;
	onTogglePin: (fileId: string) => void;
	onClose: (fileId: string) => void;
	onCloseOthers: (fileId: string) => void;
	onCloseToSide: (fileId: string, side: "left" | "right") => void;
}) {
	return (
		<ContextMenuContent className="w-52">
			<ContextMenuItem onClick={() => onTogglePin(tab.file.id)}>
				<Pin className="h-3.5 w-3.5" />
				{tab.pinned ? "Unpin" : "Pin"}
			</ContextMenuItem>
			<ContextMenuSeparator />
			<ContextMenuItem onClick={() => onClose(tab.file.id)}>Close</ContextMenuItem>
			<ContextMenuItem onClick={() => onCloseOthers(tab.file.id)}>
				Close all but this
			</ContextMenuItem>
			<ContextMenuItem onClick={() => onCloseToSide(tab.file.id, "right")}>
				Close all to the right
			</ContextMenuItem>
			<ContextMenuItem onClick={() => onCloseToSide(tab.file.id, "left")}>
				Close all to the left
			</ContextMenuItem>
			<ContextMenuSeparator />
			<DevContextSubmenu />
		</ContextMenuContent>
	);
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
	onDropNote,
	onActivatePane,
}: Props) {
	const showPageIcons = usePreferencesStore((s) => s.appearance.showPageIcons);
	// A single shared context menu serves every tab; right-clicking a tab
	// records its id here instead of mounting a Radix ContextMenu per tab.
	const [contextTabId, setContextTabId] = useState<string | null>(null);
	const {
		draggingId,
		dragOverId,
		handleDragStart,
		handleDragOver,
		handleDrop,
		handleStripDragOver,
		handleStripDrop,
		handleStripDragLeave,
		handleDragEnd,
		handleTabPointerDown,
		handleTabPointerMove,
		handleTabPointerEnd,
	} = useTabDragAndDrop({ tabs, onReorder, onDropNote });
	const { tabRefs, handleSelect, handleTabKeyDown } = useTabKeyboardNav({
		tabs,
		onSelect,
		onClose,
		onActivatePane,
	});

	if (tabs.length === 0) return null;

	const focusableTabId = tabs.some((tab) => tab.file.id === activeFileId)
		? activeFileId
		: tabs[0].file.id;

	const contextTab = contextTabId
		? (tabs.find((tab) => tab.file.id === contextTabId) ?? null)
		: null;

	return (
		<ContextMenu
			onOpenChange={(open) => {
				if (!open) setContextTabId(null);
			}}
		>
			<ContextMenuTrigger asChild>
				<div
					role="tablist"
					aria-label="Open notes"
					onDragOver={handleStripDragOver}
					onDrop={handleStripDrop}
					onDragLeave={handleStripDragLeave}
					className="flex min-h-9 shrink-0 items-stretch overflow-x-auto border-b border-sidebar-border bg-sidebar text-sidebar-foreground"
				>
					{tabs.map(({ file, pinned }) => {
						const isActive = file.id === activeFileId;
						return (
							<TabItem
								key={file.id}
								file={file}
								pinned={pinned}
								isActive={isActive}
								isFocusable={file.id === focusableTabId}
								isPaneFocused={isPaneFocused}
								showPageIcons={showPageIcons}
								dragOverId={dragOverId}
								draggingId={draggingId}
								registerRef={(node) => {
									if (node) {
										tabRefs.current.set(file.id, node);
									} else {
										tabRefs.current.delete(file.id);
									}
								}}
								onContextMenu={() => setContextTabId(file.id)}
								onClick={(event) => {
									if (isCloseTabClick(event)) {
										event.preventDefault();
										onClose(file.id);
										return;
									}
									handleSelect(file.id);
								}}
								onAuxClick={(event) => {
									if (event.button === 1) {
										event.preventDefault();
										onClose(file.id);
									}
								}}
								onKeyDown={(event) => handleTabKeyDown(file.id, event)}
								onDragStart={handleDragStart(file.id)}
								onDragOver={handleDragOver(file.id)}
								onDrop={handleDrop(file.id)}
								onDragEnd={handleDragEnd}
								onPointerDown={handleTabPointerDown(file.id)}
								onPointerMove={handleTabPointerMove(file.id)}
								onPointerUp={handleTabPointerEnd(file.id)}
								onPointerCancel={handleTabPointerEnd(file.id)}
								onCloseClick={(event) => {
									event.stopPropagation();
									onClose(file.id);
								}}
							/>
						);
					})}
				</div>
			</ContextMenuTrigger>
			{contextTab ? (
				<TabContextMenuContent
					tab={contextTab}
					onTogglePin={onTogglePin}
					onClose={onClose}
					onCloseOthers={onCloseOthers}
					onCloseToSide={onCloseToSide}
				/>
			) : null}
		</ContextMenu>
	);
}
