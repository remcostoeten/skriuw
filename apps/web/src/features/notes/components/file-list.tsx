"use client";

import { memo, useState, useRef, useEffect, useMemo, useCallback, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/shared/lib/utils";
import { NoteFile, NoteFolder } from "@/types/notes";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/shared/ui/sheet";
import { EmptyState } from "@/shared/ui/empty-state";
import {
	Check,
	Columns2,
	FilePlus,
	FileText,
	Folder,
	FolderInput,
	FolderOpen,
	FolderPlus,
	Pencil,
	Star,
	Trash2,
} from "lucide-react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
	ContextMenuTrigger,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@/shared/ui/context-menu";
import { NoteNameLabel } from "./note-name-label";
import { useSidebarStore } from "./sidebar/store";
import { SidebarTreeRowSkeleton } from "./sidebar/sidebar-tree-skeleton";
import { NoteSendContextSubmenu, NoteSendMobileActionBlock } from "./note-send-menu";
import { GuestGate } from "@/shared/ui/guest-gate";
import type { NoteTreeActions, NoteTreeQueries } from "../lib/tree-actions";

interface FileListProps {
	files: NoteFile[];
	folders: NoteFolder[];
	activeFileId: string;
	compactMode?: boolean;
	showTreeGuides?: boolean;
	isLoading?: boolean;
	actions: NoteTreeActions;
	queries: NoteTreeQueries;
	onCreationParentChange?: (folderId: string | null) => void;
	onReorderFiles?: (fileId: string, targetIndex: number, parentId: string | null) => void;
	onReorderFolders?: (folderId: string, targetIndex: number, parentId: string | null) => void;
	onCreateNote?: () => void;
	onCreateFolder?: () => void;
	scrollElementRef?: RefObject<HTMLElement | null>;
	sidebarWidth?: number;
}

type SelectedItem = {
	id: string;
	type: "file" | "folder";
	parentId: string | null;
};

type DragItem = {
	type: "file" | "folder";
	id: string;
	parentId: string | null;
};

type DragPreview = DragItem & {
	name: string;
	x: number;
	y: number;
};

type DropPosition = "before" | "after";

type VisibleItem =
	| (SelectedItem & { depth: number; folder: NoteFolder; file?: never })
	| (SelectedItem & { depth: number; file: NoteFile; folder?: never });

type MobileActionTarget = {
	item: SelectedItem;
	label: string;
	selection: SelectedItem[];
};

type ContextTarget =
	| {
			kind: "item";
			item: SelectedItem;
			name: string;
			file: NoteFile | null;
			folder: NoteFolder | null;
	  }
	| { kind: "root" };

const FILE_TREE_ROW_HEIGHT = 36;
const FILE_TREE_COMPACT_ROW_HEIGHT = 30;
const FILE_TREE_OVERSCAN = 10;
const LONG_PRESS_DURATION_MS = 380;

export const FileList = memo(function FileList({
	folders,
	files,
	activeFileId,
	compactMode = false,
	showTreeGuides = false,
	isLoading = false,
	actions,
	queries,
	onCreationParentChange,
	onCreateNote,
	onCreateFolder,
	scrollElementRef,
	sidebarWidth,
}: FileListProps) {
	const {
		onFileSelect,
		onOpenBeside,
		onFilePrefetch,
		onToggleFolder,
		onRenameFile,
		onRenameFolder,
		onDeleteFile,
		onDeleteFolder,
		onMoveFile,
		onMoveFolder,
	} = actions;
	const { getFilesInFolder, getFoldersInFolder, countDescendants } = queries;
	// Sidebar store for favorites and custom sections
	const { config, isFavorite, addToFavorites, removeFromFavorites, addToCustomSection } =
		useSidebarStore();
	const customSections = config.sections.filter((section) => section.type === "custom");
	const isMobile = useIsMobile();
	const listRef = useRef<HTMLDivElement>(null);
	const itemButtonRefs = useRef(new Map<string, HTMLButtonElement>());
	const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const suppressClickRef = useRef(false);
	const rowHeight = compactMode ? FILE_TREE_COMPACT_ROW_HEIGHT : FILE_TREE_ROW_HEIGHT;
	const isNarrow = sidebarWidth !== undefined && sidebarWidth < 220;
	const isVeryNarrow = sidebarWidth !== undefined && sidebarWidth < 176;
	const depthIndent = isVeryNarrow ? 8 : isNarrow ? 12 : 16;
	const rowBasePadding = isNarrow ? 8 : 12;
	const rowRightPadding = isNarrow ? 6 : 10;

	const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
	const [focusedItemKey, setFocusedItemKey] = useState<string | null>(null);
	const lastSelectedIndexRef = useRef<number | null>(null);
	// Index to focus once the list re-renders after a deletion, so repeated
	// Backspace keeps walking down the tree instead of dropping focus.
	const pendingFocusIndexRef = useRef<number | null>(null);
	// When non-null, "move mode" is active: these items are being relocated and
	// arrow keys steer a destination cursor until Enter/M drops them (Esc cancels).
	const [moveModeItems, setMoveModeItems] = useState<SelectedItem[] | null>(null);
	// A single shared context menu serves every row. Rows carry `data-row-key`;
	// right-clicking the list resolves the row under the cursor and points the
	// one menu at it, instead of mounting a Radix ContextMenu per virtualized row.
	const [contextTarget, setContextTarget] = useState<ContextTarget | null>(null);

	function renderTreeGuides(depth: number) {
		if (!showTreeGuides || depth <= 0) {
			return null;
		}

		const guideLevels = Array.from({ length: depth }, (_, index) => index);
		const currentGuideLeft = rowBasePadding + 7 + (depth - 1) * depthIndent;

		return (
			<span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0">
				{guideLevels.map((level) => (
					<span
						key={level}
						className="absolute top-0 bottom-0 w-px bg-border/55"
						style={{ left: `${rowBasePadding + 7 + level * depthIndent}px` }}
					/>
				))}
				<span
					className="absolute h-px w-2.5 bg-border/55"
					style={{ left: `${currentGuideLeft}px`, top: "50%" }}
				/>
			</span>
		);
	}

	const flattenedVisibleItems = useMemo<VisibleItem[]>(() => {
		const list: VisibleItem[] = [];

		const visit = (parentId: string | null, depth: number) => {
			const children: VisibleItem[] = [
				...getFoldersInFolder(parentId).map((folder) => ({
					id: folder.id,
					type: "folder" as const,
					parentId: folder.parentId,
					depth,
					folder,
				})),
				...getFilesInFolder(parentId).map((file) => ({
					id: file.id,
					type: "file" as const,
					parentId: file.parentId,
					depth,
					file,
				})),
			].sort((left, right) => {
				const leftOrder =
					left.type === "folder" ? left.folder.sortOrder : left.file.sortOrder;
				const rightOrder =
					right.type === "folder" ? right.folder.sortOrder : right.file.sortOrder;
				return (leftOrder ?? 0) - (rightOrder ?? 0);
			});

			children.forEach((child) => {
				list.push(child);
				if (child.type === "folder" && child.folder?.isOpen) {
					visit(child.id, depth + 1);
				}
			});
		};

		visit(null, 0);
		return list;
	}, [getFilesInFolder, getFoldersInFolder]);

	const virtualizer = useVirtualizer({
		count: flattenedVisibleItems.length,
		getScrollElement: () => scrollElementRef?.current ?? listRef.current,
		estimateSize: () => rowHeight,
		overscan: FILE_TREE_OVERSCAN,
		getItemKey: (index) => {
			const item = flattenedVisibleItems[index];
			return item ? `${item.type}:${item.id}` : index;
		},
	});

	const getDescendantIds = useCallback(
		function collect(folderId: string): string[] {
			const children = getFoldersInFolder(folderId);
			return [folderId, ...children.flatMap((child) => collect(child.id))];
		},
		[getFoldersInFolder],
	);

	const getItemKey = useCallback((item: SelectedItem) => `${item.type}:${item.id}`, []);

	const focusItemAtIndex = useCallback(
		(index: number) => {
			const target = flattenedVisibleItems[index];
			if (!target || !listRef.current) {
				return;
			}

			const targetKey = getItemKey(target);
			setFocusedItemKey(targetKey);
			setSelectedItems([{ id: target.id, type: target.type, parentId: target.parentId }]);
			lastSelectedIndexRef.current = index;

			virtualizer.scrollToIndex(index, { align: "auto" });

			requestAnimationFrame(() => {
				itemButtonRefs.current.get(targetKey)?.focus();
			});
		},
		[flattenedVisibleItems, getItemKey, virtualizer],
	);

	// Like focusItemAtIndex but extends the selection from the anchor
	// (lastSelectedIndexRef) to the target, leaving the anchor in place so
	// repeated Shift+Arrow grows/shrinks a contiguous range.
	const extendSelectionToIndex = useCallback(
		(index: number) => {
			const target = flattenedVisibleItems[index];
			if (!target || !listRef.current) {
				return;
			}

			const anchor = lastSelectedIndexRef.current ?? index;
			const start = Math.min(anchor, index);
			const end = Math.max(anchor, index);
			const range = flattenedVisibleItems.slice(start, end + 1);

			const targetKey = getItemKey(target);
			setSelectedItems(range);
			setFocusedItemKey(targetKey);

			virtualizer.scrollToIndex(index, { align: "auto" });

			requestAnimationFrame(() => {
				itemButtonRefs.current.get(targetKey)?.focus();
			});
		},
		[flattenedVisibleItems, getItemKey, virtualizer],
	);

	// Move focus/scroll to a row without touching the selection. Used by move
	// mode, where the selection is the cargo and focus is the destination cursor.
	const focusOnlyAtIndex = useCallback(
		(index: number) => {
			const target = flattenedVisibleItems[index];
			if (!target || !listRef.current) {
				return;
			}

			const targetKey = getItemKey(target);
			setFocusedItemKey(targetKey);

			virtualizer.scrollToIndex(index, { align: "auto" });

			requestAnimationFrame(() => {
				itemButtonRefs.current.get(targetKey)?.focus();
			});
		},
		[flattenedVisibleItems, getItemKey, virtualizer],
	);

	const focusParentFolder = useCallback(
		(item: SelectedItem) => {
			if (!item.parentId) {
				return;
			}

			const parentIndex = flattenedVisibleItems.findIndex(
				(entry) => entry.type === "folder" && entry.id === item.parentId,
			);

			if (parentIndex !== -1) {
				focusItemAtIndex(parentIndex);
			}
		},
		[flattenedVisibleItems, focusItemAtIndex],
	);

	const isItemSelected = useCallback(
		(item: SelectedItem) =>
			selectedItems.some(
				(selection) => selection.id === item.id && selection.type === item.type,
			),
		[selectedItems],
	);

	const [editingId, setEditingId] = useState<string | null>(null);
	const [editingName, setEditingName] = useState("");
	const [editingType, setEditingType] = useState<"file" | "folder">("file");
	const inputRef = useRef<HTMLInputElement>(null);

	// Drag and drop state
	const [dragItem, setDragItem] = useState<DragItem | null>(null);
	const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);
	const [dropTarget, setDropTarget] = useState<{
		id: string | null;
		type: "folder" | "root" | "sibling";
		position?: DropPosition;
	} | null>(null);
	const [mobileActionTarget, setMobileActionTarget] = useState<MobileActionTarget | null>(null);

	// Focus and place a blinking caret at the start of the name when editing starts
	useEffect(() => {
		if (editingId && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.setSelectionRange(0, 0);
		}
	}, [editingId]);

	useEffect(
		() => () => {
			if (longPressTimerRef.current) {
				clearTimeout(longPressTimerRef.current);
			}
		},
		[],
	);

	const startRename = useCallback((id: string, currentName: string, type: "file" | "folder") => {
		setEditingId(id);
		setEditingName(type === "file" ? currentName.replace(".md", "") : currentName);
		setEditingType(type);
	}, []);

	const finishRename = useCallback(() => {
		if (editingId && editingName.trim()) {
			if (editingType === "file") {
				onRenameFile(editingId, editingName.trim());
			} else {
				onRenameFolder(editingId, editingName.trim());
			}
		}
		setEditingId(null);
		setEditingName("");
	}, [editingId, editingName, editingType, onRenameFile, onRenameFolder]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				finishRename();
			} else if (e.key === "Escape") {
				setEditingId(null);
				setEditingName("");
			}
		},
		[finishRename],
	);

	// Closes an open context menu by dispatching Escape to its dismissable layer.
	const closeContextMenu = useCallback((element: HTMLElement) => {
		element.dispatchEvent(
			new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
		);
	}, []);

	// Double-click handler for inline rename
	const handleDoubleClick = useCallback(
		(e: React.MouseEvent, id: string, name: string, type: "file" | "folder") => {
			e.preventDefault();
			e.stopPropagation();
			if (
				selectedItems.length > 1 &&
				selectedItems.some((selection) => selection.id === id && selection.type === type)
			) {
				return;
			}
			startRename(id, name, type);
		},
		[selectedItems, startRename],
	);

	// Drag handlers
	const getDragItemName = useCallback(
		(item: DragItem) => {
			if (item.type === "folder") {
				return folders.find((folder) => folder.id === item.id)?.name ?? "Folder";
			}

			return files.find((file) => file.id === item.id)?.name ?? "Note";
		},
		[files, folders],
	);

	const updateDragPreviewPosition = useCallback((event: React.DragEvent) => {
		if (event.clientX === 0 && event.clientY === 0) {
			return;
		}

		setDragPreview((preview) =>
			preview
				? {
						...preview,
						x: event.clientX,
						y: event.clientY,
					}
				: preview,
		);
	}, []);

	const handleDragStart = useCallback(
		(e: React.DragEvent, item: DragItem) => {
			setDragItem(item);
			setDragPreview({
				...item,
				name: getDragItemName(item),
				x: e.clientX,
				y: e.clientY,
			});
			e.dataTransfer.effectAllowed = "move";
			e.dataTransfer.setData("text/plain", getDragItemName(item));
			e.dataTransfer.setData("application/x-skriuw-tree-item", JSON.stringify(item));
		},
		[getDragItemName],
	);

	const handleDrag = useCallback(
		(event: React.DragEvent) => {
			updateDragPreviewPosition(event);
		},
		[updateDragPreviewPosition],
	);

	const handleDragEnd = useCallback(() => {
		setDragItem(null);
		setDragPreview(null);
		setDropTarget(null);
	}, []);

	const getSelectionForAction = useCallback(
		(item: SelectedItem) => {
			const alreadySelected = selectedItems.some(
				(selection) => selection.id === item.id && selection.type === item.type,
			);
			const base = alreadySelected ? selectedItems : [...selectedItems, item];
			const deduped: SelectedItem[] = [];
			const seen = new Set<string>();
			base.forEach((selection) => {
				const key = `${selection.type}:${selection.id}`;
				if (!seen.has(key)) {
					seen.add(key);
					deduped.push(selection);
				}
			});
			return deduped.length ? deduped : [item];
		},
		[selectedItems],
	);

	const deleteSelection = useCallback(
		(items: SelectedItem[]) => {
			// Remember where the deleted block starts so we can move focus to
			// whatever item slides into its place after the list re-renders.
			const deletedKeys = new Set(items.map(getItemKey));
			const firstDeletedIndex = flattenedVisibleItems.findIndex((entry) =>
				deletedKeys.has(getItemKey(entry)),
			);
			pendingFocusIndexRef.current = firstDeletedIndex === -1 ? null : firstDeletedIndex;

			items.forEach((item) => {
				if (item.type === "file") {
					onDeleteFile(item.id);
				} else {
					onDeleteFolder(item.id);
				}
			});
			setSelectedItems([]);
		},
		[flattenedVisibleItems, getItemKey, onDeleteFile, onDeleteFolder, setSelectedItems],
	);

	// While a note's context menu is open: "r" renames, Delete/Backspace/"d" deletes.
	const handleContextMenuKeyDown = useCallback(
		(
			event: React.KeyboardEvent,
			item: SelectedItem,
			name: string,
			selection: SelectedItem[],
			renameDisabled: boolean,
		) => {
			if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
				return;
			}

			if (event.key === "r" || event.key === "R") {
				if (renameDisabled) {
					return;
				}
				event.preventDefault();
				startRename(item.id, name, item.type);
				closeContextMenu(event.currentTarget as HTMLElement);
				return;
			}

			if (
				event.key === "Delete" ||
				event.key === "Backspace" ||
				event.key === "d" ||
				event.key === "D"
			) {
				event.preventDefault();
				closeContextMenu(event.currentTarget as HTMLElement);
				deleteSelection(selection);
			}
		},
		[closeContextMenu, deleteSelection, startRename],
	);

	const closeMobileActionSheet = useCallback(() => {
		setMobileActionTarget(null);
	}, []);

	const runMobileAction = useCallback(
		(
			action: () => void,
			feedback: Parameters<typeof triggerNativeFeedback>[0] = "selection",
		) => {
			action();
			triggerNativeFeedback(feedback);
			closeMobileActionSheet();
		},
		[closeMobileActionSheet],
	);

	const moveSelected = useCallback(
		(items: SelectedItem[], targetParentId: string | null) => {
			items.forEach((item) => {
				if (item.type === "file") {
					onMoveFile(item.id, targetParentId);
				} else {
					if (targetParentId && getDescendantIds(item.id).includes(targetParentId)) {
						return;
					}
					onMoveFolder(item.id, targetParentId);
				}
			});
			setSelectedItems([]);
		},
		[onMoveFile, onMoveFolder, getDescendantIds, setSelectedItems],
	);

	const getOrderedChildren = useCallback(
		(parentId: string | null): VisibleItem[] =>
			[
				...getFoldersInFolder(parentId).map((folder) => ({
					id: folder.id,
					type: "folder" as const,
					parentId: folder.parentId,
					depth: 0,
					folder,
				})),
				...getFilesInFolder(parentId).map((file) => ({
					id: file.id,
					type: "file" as const,
					parentId: file.parentId,
					depth: 0,
					file,
				})),
			].sort((left, right) => {
				const leftOrder =
					left.type === "folder" ? left.folder.sortOrder : left.file.sortOrder;
				const rightOrder =
					right.type === "folder" ? right.folder.sortOrder : right.file.sortOrder;
				return (leftOrder ?? 0) - (rightOrder ?? 0);
			}),
		[getFilesInFolder, getFoldersInFolder],
	);

	const moveDraggedToParent = useCallback(
		(targetParentId: string | null, sortOrder?: number) => {
			if (!dragItem) return;

			if (dragItem.type === "file") {
				onMoveFile(dragItem.id, targetParentId, sortOrder);
				return;
			}

			onMoveFolder(dragItem.id, targetParentId, sortOrder);
		},
		[dragItem, onMoveFile, onMoveFolder],
	);

	const reorderDraggedAroundTarget = useCallback(
		(target: VisibleItem, position: DropPosition) => {
			if (!dragItem) return;

			const targetParentId = target.parentId;
			const movingItem: VisibleItem = {
				id: dragItem.id,
				type: dragItem.type,
				parentId: targetParentId,
				depth: target.depth,
				...(dragItem.type === "folder"
					? {
							folder:
								folders.find((folder) => folder.id === dragItem.id) ??
								({
									id: dragItem.id,
									name: "",
									parentId: targetParentId,
									sortOrder: 0,
									isOpen: false,
								} as NoteFolder),
						}
					: {
							file:
								files.find((file) => file.id === dragItem.id) ??
								({
									id: dragItem.id,
									name: "",
									content: "",
									richContent: [],
									preferredEditorMode: "block",
									createdAt: new Date(),
									modifiedAt: new Date(),
									parentId: targetParentId,
									sortOrder: 0,
								} as NoteFile),
						}),
			} as VisibleItem;

			const siblings = getOrderedChildren(targetParentId).filter(
				(item) => !(item.id === dragItem.id && item.type === dragItem.type),
			);
			const targetIndex = siblings.findIndex(
				(item) => item.id === target.id && item.type === target.type,
			);
			const insertIndex =
				targetIndex === -1
					? siblings.length
					: position === "before"
						? targetIndex
						: targetIndex + 1;
			const nextSiblings = [...siblings];
			nextSiblings.splice(insertIndex, 0, movingItem);

			nextSiblings.forEach((item, sortOrder) => {
				if (item.type === "file") {
					const shouldUpdate =
						item.id === dragItem.id ||
						item.parentId !== targetParentId ||
						item.file?.sortOrder !== sortOrder;
					if (shouldUpdate) {
						onMoveFile(item.id, targetParentId, sortOrder);
					}
					return;
				}

				const shouldUpdate =
					item.id === dragItem.id ||
					item.parentId !== targetParentId ||
					item.folder?.sortOrder !== sortOrder;
				if (shouldUpdate) {
					onMoveFolder(item.id, targetParentId, sortOrder);
				}
			});
		},
		[dragItem, files, folders, getOrderedChildren, onMoveFile, onMoveFolder],
	);

	const handleItemClick = useCallback(
		(event: React.MouseEvent<HTMLElement>, item: SelectedItem, action: () => void) => {
			const metaKey = event.metaKey || event.ctrlKey;
			const shiftKey = event.shiftKey;
			const itemIndex = flattenedVisibleItems.findIndex(
				(entry) => entry.id === item.id && entry.type === item.type,
			);

			// Anchor the range on the last explicitly-selected row, falling back to
			// whatever currently has focus so "focus a row, Shift+Click another" works.
			const focusedIndex = flattenedVisibleItems.findIndex(
				(entry) => getItemKey(entry) === focusedItemKey,
			);
			const anchorIndex =
				lastSelectedIndexRef.current !== null ? lastSelectedIndexRef.current : focusedIndex;

			if (shiftKey && anchorIndex >= 0 && itemIndex !== -1) {
				const start = Math.min(anchorIndex, itemIndex);
				const end = Math.max(anchorIndex, itemIndex);
				const range = flattenedVisibleItems.slice(start, end + 1);
				setSelectedItems(range);
				lastSelectedIndexRef.current = itemIndex;
				event.preventDefault();
				return;
			}

			if (metaKey) {
				setSelectedItems((prev) => {
					const exists = prev.some(
						(selection) => selection.id === item.id && selection.type === item.type,
					);
					if (exists) {
						return prev.filter(
							(selection) =>
								!(selection.id === item.id && selection.type === item.type),
						);
					}
					return [...prev, item];
				});
				lastSelectedIndexRef.current = itemIndex;
				event.preventDefault();
				return;
			}

			setSelectedItems([item]);
			setFocusedItemKey(getItemKey(item));
			lastSelectedIndexRef.current = itemIndex;
			action();
		},
		[flattenedVisibleItems, focusedItemKey, getItemKey, setSelectedItems],
	);

	const handleContextMenu = useCallback(
		(event: React.MouseEvent, item: SelectedItem) => {
			if (isMobile) {
				event.preventDefault();
			}
			if (!isItemSelected(item)) {
				setSelectedItems([item]);
				setFocusedItemKey(getItemKey(item));
				const index = flattenedVisibleItems.findIndex(
					(entry) => entry.id === item.id && entry.type === item.type,
				);
				lastSelectedIndexRef.current = index !== -1 ? index : null;
			}
		},
		[flattenedVisibleItems, getItemKey, isItemSelected, isMobile, setSelectedItems],
	);

	const handleListContextMenu = useCallback(
		(event: React.MouseEvent) => {
			// On touch devices the long-press sheet handles this; suppress the
			// native menu and skip Radix (it bails when defaultPrevented).
			if (isMobile) {
				event.preventDefault();
				return;
			}
			const rowEl = (event.target as HTMLElement).closest<HTMLElement>("[data-row-key]");
			const key = rowEl?.getAttribute("data-row-key");
			const visibleItem = key
				? flattenedVisibleItems.find((entry) => getItemKey(entry) === key)
				: undefined;
			if (!visibleItem) {
				// Empty list space: offer the root "new note / new folder" menu.
				setContextTarget({ kind: "root" });
				return;
			}
			const item: SelectedItem = {
				id: visibleItem.id,
				type: visibleItem.type,
				parentId: visibleItem.parentId,
			};
			handleContextMenu(event, item);
			setContextTarget({
				kind: "item",
				item,
				name: visibleItem.folder?.name ?? visibleItem.file?.name ?? "",
				file: visibleItem.file ?? null,
				folder: visibleItem.folder ?? null,
			});
		},
		[flattenedVisibleItems, getItemKey, handleContextMenu, isMobile],
	);

	const openMobileActionSheet = useCallback(
		(item: SelectedItem, label: string) => {
			const selection = getSelectionForAction(item);
			setSelectedItems(selection);
			setFocusedItemKey(getItemKey(item));
			const index = flattenedVisibleItems.findIndex(
				(entry) => entry.id === item.id && entry.type === item.type,
			);
			lastSelectedIndexRef.current = index !== -1 ? index : null;
			suppressClickRef.current = true;
			triggerNativeFeedback("impact");
			setMobileActionTarget({ item, label, selection });
		},
		[flattenedVisibleItems, getItemKey, getSelectionForAction, setSelectedItems],
	);

	const cancelLongPress = useCallback(() => {
		if (longPressTimerRef.current) {
			clearTimeout(longPressTimerRef.current);
			longPressTimerRef.current = null;
		}
	}, []);

	const scheduleLongPress = useCallback(
		(event: React.PointerEvent<HTMLButtonElement>, item: SelectedItem, label: string) => {
			if (!isMobile || event.pointerType !== "touch" || editingId) {
				return;
			}

			cancelLongPress();
			longPressTimerRef.current = setTimeout(() => {
				openMobileActionSheet(item, label);
				longPressTimerRef.current = null;
			}, LONG_PRESS_DURATION_MS);
		},
		[cancelLongPress, editingId, isMobile, openMobileActionSheet],
	);

	const handleTreeItemKeyDown = useCallback(
		(
			event: React.KeyboardEvent<HTMLButtonElement>,
			item: SelectedItem,
			options?: { isFolder?: boolean; isOpen?: boolean },
		) => {
			const currentIndex = flattenedVisibleItems.findIndex(
				(entry) => entry.id === item.id && entry.type === item.type,
			);

			if (currentIndex === -1) {
				return;
			}

			// Move mode swallows the tree's normal keys: arrows steer a destination
			// cursor, Enter/M drops the cargo into the focused folder (or root),
			// Esc cancels. The selection stays put as the set being relocated.
			if (moveModeItems) {
				if (event.key === "Escape") {
					event.preventDefault();
					setMoveModeItems(null);
					return;
				}

				if (event.key === "ArrowDown") {
					event.preventDefault();
					focusOnlyAtIndex(Math.min(flattenedVisibleItems.length - 1, currentIndex + 1));
					return;
				}

				if (event.key === "ArrowUp") {
					event.preventDefault();
					focusOnlyAtIndex(Math.max(0, currentIndex - 1));
					return;
				}

				if (event.key === "Home") {
					event.preventDefault();
					focusOnlyAtIndex(0);
					return;
				}

				if (event.key === "End") {
					event.preventDefault();
					focusOnlyAtIndex(flattenedVisibleItems.length - 1);
					return;
				}

				if (event.key === "ArrowRight") {
					if (options?.isFolder && !options.isOpen) {
						event.preventDefault();
						onToggleFolder(item.id);
					}
					return;
				}

				if (event.key === "ArrowLeft") {
					event.preventDefault();
					if (options?.isFolder && options.isOpen) {
						onToggleFolder(item.id);
					} else {
						focusParentFolder(item);
					}
					return;
				}

				if (
					event.key === "Enter" ||
					event.key === " " ||
					event.key === "m" ||
					event.key === "M"
				) {
					event.preventDefault();
					// Drop into the focused folder; on a file, drop into its parent.
					const destination = item.type === "folder" ? item.id : item.parentId;
					moveSelected(moveModeItems, destination);
					setMoveModeItems(null);
					return;
				}

				// Ignore every other key while relocating.
				return;
			}

			if (event.key === "ArrowDown") {
				event.preventDefault();
				const nextIndex = Math.min(flattenedVisibleItems.length - 1, currentIndex + 1);
				if (event.shiftKey) {
					if (lastSelectedIndexRef.current === null) {
						lastSelectedIndexRef.current = currentIndex;
					}
					extendSelectionToIndex(nextIndex);
				} else {
					focusItemAtIndex(nextIndex);
				}
				return;
			}

			if (event.key === "ArrowUp") {
				event.preventDefault();
				const prevIndex = Math.max(0, currentIndex - 1);
				if (event.shiftKey) {
					if (lastSelectedIndexRef.current === null) {
						lastSelectedIndexRef.current = currentIndex;
					}
					extendSelectionToIndex(prevIndex);
				} else {
					focusItemAtIndex(prevIndex);
				}
				return;
			}

			if (event.key === "Home") {
				event.preventDefault();
				focusItemAtIndex(0);
				return;
			}

			if (event.key === "End") {
				event.preventDefault();
				focusItemAtIndex(flattenedVisibleItems.length - 1);
				return;
			}

			if (event.key === "ArrowRight") {
				if (options?.isFolder) {
					event.preventDefault();
					if (!options.isOpen) {
						onToggleFolder(item.id);
						return;
					}

					const nextItem = flattenedVisibleItems[currentIndex + 1];
					if (nextItem && nextItem.parentId === item.id) {
						focusItemAtIndex(currentIndex + 1);
					}
				}
				return;
			}

			if (event.key === "ArrowLeft") {
				event.preventDefault();
				if (options?.isFolder && options.isOpen) {
					onToggleFolder(item.id);
					return;
				}

				focusParentFolder(item);
				return;
			}

			if (
				(event.key === "r" || event.key === "R") &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey &&
				!event.shiftKey
			) {
				event.preventDefault();
				if (getSelectionForAction(item).length > 1) {
					return;
				}
				const entry = flattenedVisibleItems[currentIndex];
				const name = entry.type === "folder" ? entry.folder?.name : entry.file?.name;
				if (!name) {
					return;
				}
				startRename(item.id, name, item.type);
				return;
			}

			if (
				(event.key === "Delete" ||
					event.key === "Backspace" ||
					event.key === "d" ||
					event.key === "D") &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey &&
				!event.shiftKey
			) {
				event.preventDefault();
				deleteSelection(getSelectionForAction(item));
				return;
			}

			if (
				(event.key === "m" || event.key === "M") &&
				!event.metaKey &&
				!event.ctrlKey &&
				!event.altKey &&
				!event.shiftKey
			) {
				event.preventDefault();
				const selection = getSelectionForAction(item);
				setSelectedItems(selection);
				setMoveModeItems(selection);
				return;
			}

			if (event.key === "Enter" || event.key === " ") {
				event.preventDefault();
				setSelectedItems([item]);
				setFocusedItemKey(getItemKey(item));

				if (options?.isFolder) {
					onToggleFolder(item.id);
				} else {
					onFileSelect(item.id);
				}
			}
		},
		[
			deleteSelection,
			extendSelectionToIndex,
			flattenedVisibleItems,
			focusItemAtIndex,
			focusOnlyAtIndex,
			focusParentFolder,
			getItemKey,
			getSelectionForAction,
			moveModeItems,
			moveSelected,
			onFileSelect,
			onToggleFolder,
			setSelectedItems,
			startRename,
		],
	);

	const getDropPosition = useCallback(
		(event: React.DragEvent, edgeBias: "half" | "edges" = "half"): DropPosition | "inside" => {
			const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
			const offset = event.clientY - rect.top;
			const ratio = rect.height > 0 ? offset / rect.height : 0.5;

			if (edgeBias === "edges") {
				if (ratio < 0.25) return "before";
				if (ratio > 0.75) return "after";
				return "inside";
			}

			return ratio < 0.5 ? "before" : "after";
		},
		[],
	);

	const handleDragOver = useCallback(
		(e: React.DragEvent, targetId: string | null, targetType: "folder" | "root") => {
			e.preventDefault();
			e.stopPropagation();

			if (!dragItem) return;
			updateDragPreviewPosition(e);

			// Prevent dropping a folder into itself or its descendants
			if (dragItem.type === "folder" && targetType === "folder") {
				const descendants = getDescendantIds(dragItem.id);
				if (targetId && descendants.includes(targetId)) {
					e.dataTransfer.dropEffect = "none";
					return;
				}
			}

			e.dataTransfer.dropEffect = "move";
			setDropTarget({ id: targetId, type: targetType });
		},
		[dragItem, getDescendantIds, updateDragPreviewPosition],
	);

	const handleSiblingDragOver = useCallback(
		(e: React.DragEvent, target: VisibleItem) => {
			e.preventDefault();
			e.stopPropagation();

			if (!dragItem) return;
			updateDragPreviewPosition(e);

			const targetParentId = target.parentId;

			if (
				dragItem.type === "folder" &&
				targetParentId &&
				getDescendantIds(dragItem.id).includes(targetParentId)
			) {
				e.dataTransfer.dropEffect = "none";
				return;
			}

			e.dataTransfer.dropEffect = "move";
			setDropTarget({
				id: target.id,
				type: "sibling",
				position: getDropPosition(e) as DropPosition,
			});
		},
		[dragItem, getDescendantIds, getDropPosition, updateDragPreviewPosition],
	);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		// Only clear if we're leaving to outside the list
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const { clientX, clientY } = e;
		if (
			clientX < rect.left ||
			clientX > rect.right ||
			clientY < rect.top ||
			clientY > rect.bottom
		) {
			setDropTarget(null);
		}
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent, targetId: string | null) => {
			e.preventDefault();
			e.stopPropagation();

			if (!dragItem) return;

			// Don't drop on itself
			if (dragItem.id === targetId) {
				setDragItem(null);
				setDragPreview(null);
				setDropTarget(null);
				return;
			}

			// Prevent dropping folder into its descendants
			if (dragItem.type === "folder" && targetId) {
				if (getDescendantIds(dragItem.id).includes(targetId)) {
					setDragItem(null);
					setDragPreview(null);
					setDropTarget(null);
					return;
				}
			}

			const appendOrder = getOrderedChildren(targetId).filter(
				(item) => !(item.id === dragItem.id && item.type === dragItem.type),
			).length;
			moveDraggedToParent(targetId, appendOrder);

			setDragItem(null);
			setDragPreview(null);
			setDropTarget(null);
		},
		[dragItem, getDescendantIds, getOrderedChildren, moveDraggedToParent],
	);

	const handleSiblingDrop = useCallback(
		(e: React.DragEvent, target: VisibleItem) => {
			e.preventDefault();
			e.stopPropagation();

			if (!dragItem) return;

			const targetParentId = target.parentId;

			if (dragItem.id === target.id && dragItem.type === target.type) {
				setDragItem(null);
				setDragPreview(null);
				setDropTarget(null);
				return;
			}

			if (
				dragItem.type === "folder" &&
				targetParentId &&
				getDescendantIds(dragItem.id).includes(targetParentId)
			) {
				setDragItem(null);
				setDragPreview(null);
				setDropTarget(null);
				return;
			}

			reorderDraggedAroundTarget(target, getDropPosition(e) as DropPosition);

			setDragItem(null);
			setDragPreview(null);
			setDropTarget(null);
		},
		[dragItem, getDescendantIds, getDropPosition, reorderDraggedAroundTarget],
	);

	// Get all folders for "Move to" submenu
	const renderMoveToSubmenu = useCallback(
		(items: SelectedItem[]) => {
			const selectionFolders = items.filter((item) => item.type === "folder");
			const invalidFolderIds = new Set<string>(
				selectionFolders.flatMap((folderItem) => getDescendantIds(folderItem.id)),
			);

			const availableFolders = folders.filter((folder) => !invalidFolderIds.has(folder.id));
			const hasSelectionAtNonRoot = items.some((item) => item.parentId !== null);

			return (
				<ContextMenuSub>
					<ContextMenuSubTrigger className="gap-2">
						<FolderInput className="w-4 h-4" />
						Move to
						<ContextMenuShortcut className="mr-1">M</ContextMenuShortcut>
					</ContextMenuSubTrigger>
					<ContextMenuSubContent className="w-48">
						{hasSelectionAtNonRoot && (
							<ContextMenuItem onClick={() => moveSelected(items, null)}>
								Root
							</ContextMenuItem>
						)}
						{availableFolders.length > 0
							? availableFolders.map((folder) => (
									<ContextMenuItem
										key={folder.id}
										onClick={() => moveSelected(items, folder.id)}
									>
										{folder.name}
									</ContextMenuItem>
								))
							: !hasSelectionAtNonRoot && (
									<ContextMenuItem disabled>No folders available</ContextMenuItem>
								)}
					</ContextMenuSubContent>
				</ContextMenuSub>
			);
		},
		[folders, getDescendantIds, moveSelected],
	);

	const renderRootContextItems = useCallback(() => {
		return (
			<>
				<ContextMenuItem onClick={() => onCreateNote?.()} className="gap-2">
					<FilePlus className="w-4 h-4" />
					New note
				</ContextMenuItem>
				<ContextMenuItem onClick={() => onCreateFolder?.()} className="gap-2">
					<FolderPlus className="w-4 h-4" />
					New folder
				</ContextMenuItem>
			</>
		);
	}, [onCreateNote, onCreateFolder]);

	const renderContextMenuItems = useCallback(
		(target: Extract<ContextTarget, { kind: "item" }>) => {
			const { item, name, file } = target;
			const selectionForAction = getSelectionForAction(item);
			const selectionHasMultiple = selectionForAction.length > 1;
			const canOpenBeside =
				!!file && !!onOpenBeside && !isMobile && !selectionHasMultiple && file.id !== activeFileId;

			return (
				<>
					<ContextMenuItem
						onClick={() => {
							if (!selectionHasMultiple) {
								startRename(item.id, name, item.type);
							}
						}}
						className="gap-2"
						disabled={selectionHasMultiple}
					>
						<Pencil className="w-4 h-4" />
						Rename
						<ContextMenuShortcut>R</ContextMenuShortcut>
					</ContextMenuItem>
					{canOpenBeside && file ? (
						<ContextMenuItem onClick={() => onOpenBeside?.(file.id)} className="gap-2">
							<Columns2 className="w-4 h-4" />
							Open beside
						</ContextMenuItem>
					) : null}
					{renderMoveToSubmenu(selectionForAction)}
					<ContextMenuSeparator />
					{isFavorite(item.id) ? (
						<ContextMenuItem
							onClick={() => removeFromFavorites(item.id)}
							className="gap-2"
						>
							<Star className="w-4 h-4 fill-favorite text-favorite" />
							Remove from Favorites
						</ContextMenuItem>
					) : (
						<ContextMenuItem
							onClick={() => addToFavorites(item.id, item.type)}
							className="gap-2"
						>
							<Star className="w-4 h-4" />
							Add to Favorites
						</ContextMenuItem>
					)}
					{customSections.length > 0 && (
						<ContextMenuSub>
							<ContextMenuSubTrigger className="gap-2">
								<Folder className="w-4 h-4" />
								Add to Section
							</ContextMenuSubTrigger>
							<ContextMenuSubContent className="w-44">
								{customSections.map((section) => (
									<ContextMenuItem
										key={section.id}
										onClick={() =>
											addToCustomSection(section.id, item.id, item.type)
										}
										className="gap-2"
									>
										{section.name}
									</ContextMenuItem>
								))}
							</ContextMenuSubContent>
						</ContextMenuSub>
					)}
					{file && <NoteSendContextSubmenu note={file} />}
					<ContextMenuSeparator />
					<ContextMenuItem
						onClick={() => deleteSelection(selectionForAction)}
						className="gap-2 text-destructive focus:text-destructive"
					>
						<Trash2 className="w-4 h-4" />
						{selectionHasMultiple ? "Delete selected" : "Delete"}
						<ContextMenuShortcut>⌫</ContextMenuShortcut>
					</ContextMenuItem>
				</>
			);
		},
		[
			activeFileId,
			addToCustomSection,
			addToFavorites,
			customSections,
			deleteSelection,
			getSelectionForAction,
			isFavorite,
			isMobile,
			onOpenBeside,
			removeFromFavorites,
			renderMoveToSubmenu,
			startRename,
		],
	);

	const renderMobileSheetSections = useCallback(
		(target: MobileActionTarget) => {
			const { item, selection, label } = target;
			const selectionHasMultiple = selection.length > 1;
			const targetIsFavorite = isFavorite(item.id);
			const selectionFolders = selection.filter(
				(selectionItem) => selectionItem.type === "folder",
			);
			const invalidFolderIds = new Set<string>(
				selectionFolders.flatMap((folderItem) => getDescendantIds(folderItem.id)),
			);

			const availableFolders = folders.filter((folder) => !invalidFolderIds.has(folder.id));
			const hasSelectionAtNonRoot = selection.some(
				(selectionItem) => selectionItem.parentId !== null,
			);

			return (
				<>
					<div className="px-5 pb-3 pt-2">
						<div className="mx-auto h-1.5 w-12 rounded-full bg-foreground/12" />
						<SheetTitle className="mt-4 text-center text-[15px] font-medium text-foreground">
							{label}
						</SheetTitle>
						<SheetDescription className="mt-1 text-center text-[12px] text-foreground/48">
							{selectionHasMultiple
								? `${selection.length} items selected`
								: "Choose an action"}
						</SheetDescription>
					</div>

					<div className="space-y-3 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
						<div className="overflow-hidden rounded-2xl border border-foreground/8 bg-foreground/[0.03]">
							<button
								type="button"
								onClick={() =>
									runMobileAction(() => {
										if (!selectionHasMultiple) {
											startRename(item.id, label, item.type);
										}
									})
								}
								disabled={selectionHasMultiple}
								className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-foreground transition-colors disabled:opacity-40"
							>
								<Pencil className="h-5 w-5 shrink-0 text-foreground/72" />
								Rename
							</button>

							<div className="mx-4 h-px bg-foreground/8" />

							<button
								type="button"
								onClick={() =>
									runMobileAction(() => {
										if (targetIsFavorite) {
											removeFromFavorites(item.id);
										} else {
											addToFavorites(item.id, item.type);
										}
									})
								}
								className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-foreground transition-colors"
							>
								<Star
									className={cn(
										"h-5 w-5 shrink-0",
										targetIsFavorite
											? "fill-favorite text-favorite"
											: "text-foreground/72",
									)}
								/>
								{targetIsFavorite ? "Remove from Favorites" : "Add to Favorites"}
							</button>
						</div>

						<div className="overflow-hidden rounded-2xl border border-foreground/8 bg-foreground/[0.03]">
							<div className="px-4 pb-2 pt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/42">
								Move To
							</div>
							{hasSelectionAtNonRoot && (
								<button
									type="button"
									onClick={() =>
										runMobileAction(() => moveSelected(selection, null))
									}
									className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-foreground transition-colors"
								>
									<FolderInput className="h-5 w-5 shrink-0 text-foreground/72" />
									Root
								</button>
							)}
							{availableFolders.length > 0 ? (
								availableFolders.map((folder, index) => (
									<div key={folder.id}>
										{(index > 0 || hasSelectionAtNonRoot) && (
											<div className="mx-4 h-px bg-foreground/8" />
										)}
										<button
											type="button"
											onClick={() =>
												runMobileAction(() =>
													moveSelected(selection, folder.id),
												)
											}
											className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-foreground transition-colors"
										>
											<Folder className="h-5 w-5 shrink-0 text-foreground/72" />
											<span className="truncate">{folder.name}</span>
										</button>
									</div>
								))
							) : !hasSelectionAtNonRoot ? (
								<div className="px-4 pb-4 pt-1 text-[13px] text-foreground/42">
									No folders available
								</div>
							) : null}
						</div>

						{customSections.length > 0 && (
							<div className="overflow-hidden rounded-2xl border border-foreground/8 bg-foreground/[0.03]">
								<div className="px-4 pb-2 pt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/42">
									Add To Section
								</div>
								{customSections.map((section, index) => (
									<div key={section.id}>
										{index > 0 && <div className="mx-4 h-px bg-foreground/8" />}
										<button
											type="button"
											onClick={() =>
												runMobileAction(() =>
													addToCustomSection(
														section.id,
														item.id,
														item.type,
													),
												)
											}
											className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-foreground transition-colors"
										>
											<Check className="h-5 w-5 shrink-0 text-foreground/54" />
											<span className="truncate">{section.name}</span>
										</button>
									</div>
								))}
							</div>
						)}

						{!selectionHasMultiple && item.type === "file"
							? (() => {
									const sendFile = files.find((entry) => entry.id === item.id);
									if (!sendFile) return null;
									return (
										<GuestGate feature="share" align="start">
											<NoteSendMobileActionBlock
												note={sendFile}
												onClose={closeMobileActionSheet}
											/>
										</GuestGate>
									);
								})()
							: null}

						<div className="overflow-hidden rounded-2xl border border-destructive/20 bg-destructive/5">
							<button
								type="button"
								onClick={() =>
									runMobileAction(() => deleteSelection(selection), "dismiss")
								}
								className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-destructive transition-colors"
							>
								<Trash2 className="h-5 w-5 shrink-0 text-destructive" />
								{selectionHasMultiple ? "Delete selected" : "Delete"}
							</button>
						</div>
					</div>
				</>
			);
		},
		[
			addToCustomSection,
			addToFavorites,
			closeMobileActionSheet,
			customSections,
			deleteSelection,
			files,
			folders,
			getDescendantIds,
			isFavorite,
			moveSelected,
			removeFromFavorites,
			runMobileAction,
			startRename,
		],
	);

	const renderFolderRow = (folder: NoteFolder, depth: number) => {
		const totalCount = countDescendants(folder.id);
		const isEditing = editingId === folder.id;
		const isDragging = dragItem?.id === folder.id;
		const isDropTarget =
			dropTarget?.id === folder.id &&
			(dropTarget.type === "folder" || dropTarget.type === "sibling");
		const isSiblingDropTarget = dropTarget?.id === folder.id && dropTarget.type === "sibling";
		const folderItem: SelectedItem = {
			id: folder.id,
			type: "folder",
			parentId: folder.parentId,
		};
		const folderVisibleItem: VisibleItem = {
			...folderItem,
			depth,
			folder,
		};
		const isSelected = isItemSelected(folderItem);
		const isMoving = movingKeys.has(getItemKey(folderItem));
		const isMoveDestination = moveActive && moveDestinationId === folder.id;

		return (
			<button
							type="button"
							data-row-key={getItemKey(folderItem)}
							ref={(node) => {
								const key = getItemKey(folderItem);
								if (node) {
									itemButtonRefs.current.set(key, node);
								} else {
									itemButtonRefs.current.delete(key);
								}
							}}
							onClick={(event) =>
								handleItemClick(event, folderItem, () => {
									if (suppressClickRef.current) {
										suppressClickRef.current = false;
										return;
									}
									if (!isEditing) {
										onToggleFolder(folder.id);
									}
								})
							}
							onDoubleClick={(e) =>
								handleDoubleClick(e, folder.id, folder.name, "folder")
							}
							onPointerDown={(event) =>
								scheduleLongPress(event, folderItem, folder.name)
							}
							onPointerUp={cancelLongPress}
							onPointerMove={cancelLongPress}
							onPointerCancel={cancelLongPress}
							onPointerLeave={cancelLongPress}
							draggable={!isEditing}
							onDragStart={(e) =>
								handleDragStart(
									e as unknown as React.DragEvent<HTMLButtonElement>,
									{ type: "folder", id: folder.id, parentId: folder.parentId },
								)
							}
							onDrag={handleDrag as any}
							onDragEnd={handleDragEnd}
							onDragOver={(e) => {
								const position = getDropPosition(e, "edges");
								if (position === "inside") {
									handleDragOver(e, folder.id, "folder");
									return;
								}
								handleSiblingDragOver(e, folderVisibleItem);
							}}
							onDragLeave={handleDragLeave}
							onDrop={(e) => {
								const position = getDropPosition(e, "edges");
								if (position === "inside") {
									handleDrop(e, folder.id);
									return;
								}
								handleSiblingDrop(e, folderVisibleItem);
							}}
							onFocus={() => setFocusedItemKey(getItemKey(folderItem))}
							onFocusCapture={() => onCreationParentChange?.(folder.id)}
							onKeyDown={(event) =>
								!isEditing &&
								handleTreeItemKeyDown(event, folderItem, {
									isFolder: true,
									isOpen: folder.isOpen,
								})
							}
							role="treeitem"
							aria-level={depth + 1}
							aria-expanded={folder.isOpen}
							aria-selected={isSelected}
							tabIndex={0}
							className={cn(
								"group relative flex w-full items-center justify-between overflow-hidden border border-transparent text-xs font-medium transition-colors",
								!isEditing && "active:scale-[0.985]",
								compactMode ? "h-[28px]" : "h-[34px]",
								isSelected
									? "border-border bg-muted text-foreground"
									: "text-foreground/70 hover:border-border hover:bg-muted hover:text-foreground/88",
								isDragging && "opacity-35",
								isDropTarget && "border-border bg-muted",
								isMoving && "opacity-50 ring-1 ring-primary/40",
								isMoveDestination && "border-primary bg-primary/10 ring-1 ring-primary",
							)}
							style={{
								paddingLeft: `${rowBasePadding + depth * depthIndent}px`,
								paddingRight: `${rowRightPadding}px`,
							}}
						>
							{renderTreeGuides(depth)}
							{isSiblingDropTarget && (
								<span
									aria-hidden="true"
									className={cn(
										"pointer-events-none absolute left-0 right-0 h-px bg-primary",
										dropTarget.position === "before" ? "top-0" : "bottom-0",
									)}
								/>
							)}
							<div
								className={cn(
									"flex min-w-0 items-center",
									isNarrow ? "gap-1" : "gap-1.5",
								)}
							>
								{folder.isOpen ? (
									<FolderOpen
										className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
										strokeWidth={1.5}
									/>
								) : (
									<Folder
										className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70"
										strokeWidth={1.5}
									/>
								)}
								<span
									className={cn(
										"flex min-w-0 flex-1 items-center",
										isEditing ? "h-[18px]" : "h-[18px]",
									)}
								>
									{isEditing ? (
										<input
											ref={inputRef}
											type="text"
											value={editingName}
											onChange={(e) => setEditingName(e.target.value)}
											onBlur={finishRename}
											onKeyDown={handleKeyDown}
											onClick={(e) => e.stopPropagation()}
											className="m-0 h-[18px] w-full border-none bg-transparent p-0 text-base caret-foreground outline-hidden shadow-none focus:shadow-none focus-visible:shadow-none selection:bg-primary/30 md:text-xs"
											style={{ caretColor: "currentColor" }}
										/>
									) : (
										<span className="truncate text-left select-none">
											{folder.name}
										</span>
									)}
								</span>
							</div>
							{!isVeryNarrow && (
								<span className="ml-1.5 w-4 shrink-0 text-right text-[10px] text-muted-foreground/50 tabular-nums">
									{totalCount}
								</span>
							)}
						</button>
		);
	};

	function renderFileRow(file: NoteFile, depth: number) {
		const isEditing = editingId === file.id;
		const isDragging = dragItem?.id === file.id;
		const isDropTarget = dropTarget?.id === file.id && dropTarget.type === "sibling";
		const fileItem: SelectedItem = { id: file.id, type: "file", parentId: file.parentId };
		const isSelected = isItemSelected(fileItem);
		const isMoving = movingKeys.has(getItemKey(fileItem));

		return (
			<button
						type="button"
						data-row-key={getItemKey(fileItem)}
						ref={(node) => {
							const key = getItemKey(fileItem);
							if (node) {
								itemButtonRefs.current.set(key, node);
							} else {
								itemButtonRefs.current.delete(key);
							}
						}}
						onClick={(event) =>
							handleItemClick(event, fileItem, () => {
								if (suppressClickRef.current) {
									suppressClickRef.current = false;
									return;
								}
								if (!isEditing) {
									onFileSelect(file.id);
								}
							})
						}
						onPointerEnter={() => onFilePrefetch?.(file.id)}
						onPointerDown={(event) => scheduleLongPress(event, fileItem, file.name)}
						onPointerUp={cancelLongPress}
						onPointerMove={cancelLongPress}
						onPointerCancel={cancelLongPress}
						onPointerLeave={cancelLongPress}
						onDoubleClick={(e) => handleDoubleClick(e, file.id, file.name, "file")}
						draggable={!isEditing}
						onDragStart={(e) =>
							handleDragStart(e as unknown as React.DragEvent<HTMLButtonElement>, {
								type: "file",
								id: file.id,
								parentId: file.parentId,
							})
						}
						onDrag={handleDrag as any}
						onDragEnd={handleDragEnd}
						onFocus={() => {
							setFocusedItemKey(getItemKey(fileItem));
							onCreationParentChange?.(file.parentId);
						}}
						onKeyDown={(event) => !isEditing && handleTreeItemKeyDown(event, fileItem)}
						role="treeitem"
						aria-level={depth + 1}
						aria-selected={isSelected || activeFileId === file.id}
						data-active-note-tree-item={activeFileId === file.id ? "true" : undefined}
						tabIndex={0}
						className={cn(
							"relative flex w-full items-center overflow-hidden border border-transparent text-left text-xs font-medium transition-colors",
							!isEditing && "active:scale-[0.985]",
							compactMode ? "h-7" : "h-[34px]",
							isSelected || activeFileId === file.id
								? "border-border bg-muted text-foreground"
								: "text-foreground/60 hover:border-border hover:bg-muted hover:text-foreground/85",
							isDragging && "opacity-35",
							isDropTarget && "border-border bg-muted",
							isMoving && "opacity-50 ring-1 ring-primary/40",
						)}
						style={{
							paddingLeft: `${rowBasePadding + depth * depthIndent}px`,
							paddingRight: `${rowRightPadding}px`,
						}}
					>
						{renderTreeGuides(depth)}
						{isDropTarget && (
							<span
								aria-hidden="true"
								className={cn(
									"pointer-events-none absolute left-0 right-0 h-px bg-primary",
									dropTarget.position === "before" ? "top-0" : "bottom-0",
								)}
							/>
						)}
						<span
							className={cn(
								"flex min-w-0 flex-1 items-center truncate",
								isEditing ? "h-[18px]" : "h-[18px]",
							)}
						>
							{isEditing ? (
								<input
									ref={inputRef}
									type="text"
									value={editingName}
									onChange={(e) => setEditingName(e.target.value)}
									onBlur={finishRename}
									onKeyDown={handleKeyDown}
									onClick={(e) => e.stopPropagation()}
									className="m-0 h-[18px] w-full border-none bg-transparent p-0 text-base caret-foreground outline-hidden selection:bg-primary/30 md:text-xs"
									style={{ caretColor: "currentColor" }}
								/>
							) : (
								<NoteNameLabel name={file.name} className="truncate select-none" />
							)}
						</span>
					</button>
		);
	}
	useEffect(() => {
		const validKeys = new Set<string>();
		files.forEach((file) => validKeys.add(`file:${file.id}`));
		folders.forEach((folder) => validKeys.add(`folder:${folder.id}`));
		setSelectedItems((prev) =>
			prev.filter((selection) => validKeys.has(`${selection.type}:${selection.id}`)),
		);
		setFocusedItemKey((prev) => (prev && validKeys.has(prev) ? prev : null));
		// Drop out of move mode if any cargo item disappeared underneath us.
		setMoveModeItems((prev) =>
			prev && prev.every((entry) => validKeys.has(`${entry.type}:${entry.id}`))
				? prev
				: null,
		);
	}, [files, folders, setSelectedItems]);

	useEffect(() => {
		if (
			focusedItemKey &&
			flattenedVisibleItems.some((item) => getItemKey(item) === focusedItemKey)
		) {
			return;
		}

		const preferredItem =
			flattenedVisibleItems.find(
				(item) => item.type === "file" && item.id === activeFileId,
			) ?? flattenedVisibleItems[0];

		setFocusedItemKey(preferredItem ? getItemKey(preferredItem) : null);
	}, [activeFileId, flattenedVisibleItems, focusedItemKey, getItemKey]);

	// After a deletion the list shrinks; move focus to the item that now sits
	// where the deleted one was (or the new last item) so Backspace can repeat.
	useEffect(() => {
		const pendingIndex = pendingFocusIndexRef.current;
		if (pendingIndex === null) {
			return;
		}
		pendingFocusIndexRef.current = null;

		if (flattenedVisibleItems.length === 0) {
			return;
		}

		focusItemAtIndex(Math.min(pendingIndex, flattenedVisibleItems.length - 1));
	}, [flattenedVisibleItems, focusItemAtIndex]);
	const isRootDropTarget = dropTarget?.id === null && dropTarget?.type === "root";
	const virtualItems = virtualizer.getVirtualItems();
	const totalHeight = virtualizer.getTotalSize();

	// Move-mode derived view state: which rows are cargo, where they'd land.
	const moveActive = moveModeItems !== null;
	const movingKeys = new Set((moveModeItems ?? []).map((entry) => getItemKey(entry)));
	const focusedMoveItem = moveActive
		? (flattenedVisibleItems.find((entry) => getItemKey(entry) === focusedItemKey) ?? null)
		: null;
	const moveDestinationId = focusedMoveItem
		? focusedMoveItem.type === "folder"
			? focusedMoveItem.id
			: focusedMoveItem.parentId
		: null;
	const moveDestinationLabel = !moveActive
		? null
		: moveDestinationId === null
			? "Top level"
			: (folders.find((folder) => folder.id === moveDestinationId)?.name ?? "folder");
	const isRootMoveDestination = moveActive && moveDestinationId === null;

	if (flattenedVisibleItems.length === 0) {
		if (isLoading) {
			return (
				<div className="px-1.5 pt-1" aria-busy="true" aria-label="Loading file tree">
					{Array.from({ length: 6 }).map((_, index) => (
						<SidebarTreeRowSkeleton
							key={index}
							index={index}
							depth={index === 1 || index === 2 ? 1 : 0}
							kind={index === 0 || index === 3 ? "folder" : "file"}
						/>
					))}
				</div>
			);
		}
		return (
			<div className="flex flex-1 items-center justify-center px-4 pb-6 pt-4">
				<EmptyState variant="files" />
			</div>
		);
	}

	return (
		<>
			{moveActive && (
				<div className="sticky top-0 z-20 mx-1.5 mb-1 flex items-center gap-2 border border-primary/40 bg-primary/10 px-2.5 py-1.5 text-[11px] font-medium text-foreground">
					<FolderInput className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={1.5} />
					<span className="min-w-0 truncate">
						Moving {moveModeItems.length} item{moveModeItems.length > 1 ? "s" : ""} →{" "}
						<span className="text-primary">{moveDestinationLabel}</span>
					</span>
					<span className="ml-auto shrink-0 text-muted-foreground">
						↵ / m drop · esc cancel
					</span>
				</div>
			)}
			<ContextMenu onOpenChange={(open) => !open && setContextTarget(null)}>
				<ContextMenuTrigger asChild>
					<div
						ref={listRef}
						className={cn(
							"px-1.5 pb-4 pt-1",
							!scrollElementRef && "flex-1 overflow-y-auto",
							isRootDropTarget && "bg-primary/6",
							isRootMoveDestination && "bg-primary/6 ring-1 ring-inset ring-primary/40",
						)}
						role="tree"
						aria-label="Notes file tree"
						tabIndex={-1}
						onContextMenu={handleListContextMenu}
						onDragOver={(e) => handleDragOver(e, null, "root")}
						onDragLeave={handleDragLeave}
						onDrop={(e) => handleDrop(e, null)}
					>
						<div className="relative space-y-px" style={{ height: totalHeight }}>
							{virtualItems.map((virtualRow) => {
								const item = flattenedVisibleItems[virtualRow.index];
								if (!item) return null;

								const rowContent =
									item.type === "folder" && item.folder
										? renderFolderRow(item.folder, item.depth)
										: item.file
											? renderFileRow(item.file, item.depth)
											: null;

								return (
									<div
										key={virtualRow.key}
										className="absolute left-0 right-0"
										style={{ top: virtualRow.start, height: virtualRow.size }}
										onDragOver={(event) => handleSiblingDragOver(event, item)}
										onDrop={(event) => handleSiblingDrop(event, item)}
									>
										{rowContent}
									</div>
								);
							})}
						</div>
					</div>
				</ContextMenuTrigger>
				{contextTarget?.kind === "root" && (
					<ContextMenuContent className="w-48">
						{renderRootContextItems()}
					</ContextMenuContent>
				)}
				{contextTarget?.kind === "item" &&
					(() => {
						const itemTarget = contextTarget;
						const selectionForAction = getSelectionForAction(itemTarget.item);
						return (
							<ContextMenuContent
								className="w-48"
								onKeyDown={(event) =>
									handleContextMenuKeyDown(
										event,
										itemTarget.item,
										itemTarget.name,
										selectionForAction,
										selectionForAction.length > 1,
									)
								}
								onCloseAutoFocus={(event) => {
									if (inputRef.current) {
										event.preventDefault();
									}
								}}
							>
								{renderContextMenuItems(itemTarget)}
							</ContextMenuContent>
						);
					})()}
			</ContextMenu>

			{dragPreview && (
				<div
					className="pointer-events-none fixed z-[100] flex max-w-56 items-center gap-2 border border-border bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground shadow-lg"
					style={{
						left: dragPreview.x,
						top: dragPreview.y,
						transform: "translate(12px, 12px)",
					}}
				>
					{dragPreview.type === "folder" ? (
						<Folder
							className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
							strokeWidth={1.5}
						/>
					) : (
						<FileText
							className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
							strokeWidth={1.5}
						/>
					)}
					<span className="truncate">{dragPreview.name}</span>
				</div>
			)}

			<Sheet
				open={!!mobileActionTarget}
				onOpenChange={(open) => !open && closeMobileActionSheet()}
			>
				<SheetContent
					side="bottom"
					hideClose
					className="rounded-t-[28px] border-x-0 border-b-0 border-t border-border bg-theme-deep p-0 shadow-xl"
				>
					{mobileActionTarget ? renderMobileSheetSections(mobileActionTarget) : null}
				</SheetContent>
			</Sheet>
		</>
	);
});
