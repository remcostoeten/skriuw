"use client";

import { memo, useState, useRef, useEffect, useMemo, useCallback, type RefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "framer-motion";
import { cn } from "@/shared/lib/utils";
import { NoteFile, NoteFolder } from "@/types/notes";
import { useIsMobile } from "@/shared/hooks/use-mobile";
import { triggerNativeFeedback } from "@/shared/lib/native-feedback";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/shared/ui/sheet";
import { EmptyState } from "@/shared/ui/empty-state";
import {
	Briefcase,
	Check,
	Columns2,
	FileText,
	Folder,
	FolderInput,
	FolderOpen,
	Pencil,
	Star,
	Trash2,
} from "lucide-react";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@/shared/ui/context-menu";
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
	scrollElementRef?: RefObject<HTMLElement | null>;
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
	scrollElementRef,
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
	// Sidebar store for favorites, projects, and custom sections
	const {
		config,
		isFavorite,
		addToFavorites,
		removeFromFavorites,
		getProjects,
		addToProject,
		addToCustomSection,
	} = useSidebarStore();
	const projects = getProjects();
	const customSections = config.sections.filter((section) => section.type === "custom");
	const isMobile = useIsMobile();
	const listRef = useRef<HTMLDivElement>(null);
	const itemButtonRefs = useRef(new Map<string, HTMLButtonElement>());
	const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const suppressClickRef = useRef(false);
	const rowHeight = compactMode ? FILE_TREE_COMPACT_ROW_HEIGHT : FILE_TREE_ROW_HEIGHT;

	const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
	const [focusedItemKey, setFocusedItemKey] = useState<string | null>(null);
	const lastSelectedIndexRef = useRef<number | null>(null);

	function renderTreeGuides(depth: number) {
		if (!showTreeGuides || depth <= 0) {
			return null;
		}

		const guideLevels = Array.from({ length: depth }, (_, index) => index);
		const currentGuideLeft = 19 + (depth - 1) * 16;

		return (
			<span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0">
				{guideLevels.map((level) => (
					<span
						key={level}
						className="absolute top-0 bottom-0 w-px bg-border/55"
						style={{ left: `${19 + level * 16}px` }}
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

	// Focus and select text when editing starts
	useEffect(() => {
		if (editingId && inputRef.current) {
			inputRef.current.focus();
			inputRef.current.select();
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
			items.forEach((item) => {
				if (item.type === "file") {
					onDeleteFile(item.id);
				} else {
					onDeleteFolder(item.id);
				}
			});
			setSelectedItems([]);
		},
		[onDeleteFile, onDeleteFolder, setSelectedItems],
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

			if (shiftKey && lastSelectedIndexRef.current !== null && itemIndex !== -1) {
				const start = Math.min(lastSelectedIndexRef.current, itemIndex);
				const end = Math.max(lastSelectedIndexRef.current, itemIndex);
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
		[flattenedVisibleItems, getItemKey, setSelectedItems],
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

			if (event.key === "ArrowDown") {
				event.preventDefault();
				focusItemAtIndex(Math.min(flattenedVisibleItems.length - 1, currentIndex + 1));
				return;
			}

			if (event.key === "ArrowUp") {
				event.preventDefault();
				focusItemAtIndex(Math.max(0, currentIndex - 1));
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
			flattenedVisibleItems,
			focusItemAtIndex,
			focusParentFolder,
			getItemKey,
			onFileSelect,
			onToggleFolder,
			setSelectedItems,
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

						{projects.length > 0 && (
							<div className="overflow-hidden rounded-2xl border border-foreground/8 bg-foreground/[0.03]">
								<div className="px-4 pb-2 pt-3 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground/42">
									Add To Project
								</div>
								{projects.map((project, index) => (
									<div key={project.id}>
										{index > 0 && <div className="mx-4 h-px bg-foreground/8" />}
										<button
											type="button"
											onClick={() =>
												runMobileAction(() =>
													addToProject(project.id, item.id, item.type),
												)
											}
											className="flex min-h-14 w-full items-center gap-3 px-4 text-left text-[15px] text-foreground transition-colors"
										>
											<span
												className={cn(
													"h-2.5 w-2.5 rounded-full shrink-0",
													project.color,
												)}
											/>
											<span className="truncate">{project.name}</span>
										</button>
									</div>
								))}
							</div>
						)}

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
			addToProject,
			closeMobileActionSheet,
			customSections,
			deleteSelection,
			files,
			folders,
			getDescendantIds,
			isFavorite,
			moveSelected,
			projects,
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
		const selectionForAction = getSelectionForAction(folderItem);
		const selectionHasMultiple = selectionForAction.length > 1;
		const isSelected = isItemSelected(folderItem);

		return (
			<div key={folder.id}>
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<motion.button
							whileTap={!isEditing ? { scale: 0.985 } : undefined}
							transition={{ duration: 0.06, ease: [0.32, 0.72, 0, 1] }}
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
							onContextMenu={(event) => handleContextMenu(event, folderItem)}
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
								compactMode ? "h-[28px]" : "h-[34px]",
								isSelected
									? "border-border bg-muted text-foreground"
									: "text-foreground/70 hover:border-border hover:bg-muted hover:text-foreground/88",
								isDragging && "opacity-35",
								isDropTarget && "border-border bg-muted",
							)}
							style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: "10px" }}
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
							<div className="flex min-w-0 items-center gap-1.5">
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
							<span className="ml-1.5 w-4 shrink-0 text-right text-[10px] text-muted-foreground/50 tabular-nums">
								{totalCount}
							</span>
						</motion.button>
					</ContextMenuTrigger>
					<ContextMenuContent
						className="w-48"
						onCloseAutoFocus={(event) => {
							if (inputRef.current) {
								event.preventDefault();
							}
						}}
					>
						<ContextMenuItem
							onClick={() => {
								if (!selectionHasMultiple) {
									startRename(folder.id, folder.name, "folder");
								}
							}}
							className="gap-2"
							disabled={selectionHasMultiple}
						>
							<Pencil className="w-4 h-4" />
							Rename
						</ContextMenuItem>
						{renderMoveToSubmenu(selectionForAction)}
						<ContextMenuSeparator />
						{isFavorite(folder.id) ? (
							<ContextMenuItem
								onClick={() => removeFromFavorites(folder.id)}
								className="gap-2"
							>
								<Star className="w-4 h-4 fill-favorite text-favorite" />
								Remove from Favorites
							</ContextMenuItem>
						) : (
							<ContextMenuItem
								onClick={() => addToFavorites(folder.id, "folder")}
								className="gap-2"
							>
								<Star className="w-4 h-4" />
								Add to Favorites
							</ContextMenuItem>
						)}
						{projects.length > 0 && (
							<ContextMenuSub>
								<ContextMenuSubTrigger className="gap-2">
									<Briefcase className="w-4 h-4" />
									Add to Project
								</ContextMenuSubTrigger>
								<ContextMenuSubContent className="w-40">
									{projects.map((project) => (
										<ContextMenuItem
											key={project.id}
											onClick={() =>
												addToProject(project.id, folder.id, "folder")
											}
											className="gap-2"
										>
											<span
												className={cn(
													"w-2 h-2 rounded-full shrink-0",
													project.color,
												)}
											/>
											{project.name}
										</ContextMenuItem>
									))}
								</ContextMenuSubContent>
							</ContextMenuSub>
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
												addToCustomSection(section.id, folder.id, "folder")
											}
											className="gap-2"
										>
											{section.name}
										</ContextMenuItem>
									))}
								</ContextMenuSubContent>
							</ContextMenuSub>
						)}
						<ContextMenuSeparator />
						<ContextMenuItem
							onClick={() => deleteSelection(selectionForAction)}
							className="gap-2 text-destructive focus:text-destructive"
						>
							<Trash2 className="w-4 h-4" />
							{selectionHasMultiple ? "Delete selected" : "Delete"}
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>
			</div>
		);
	};

	function renderFileRow(file: NoteFile, depth: number) {
		const isEditing = editingId === file.id;
		const isDragging = dragItem?.id === file.id;
		const isDropTarget = dropTarget?.id === file.id && dropTarget.type === "sibling";
		const fileItem: SelectedItem = { id: file.id, type: "file", parentId: file.parentId };
		const selectionForAction = getSelectionForAction(fileItem);
		const selectionHasMultiple = selectionForAction.length > 1;
		const isSelected = isItemSelected(fileItem);

		return (
			<ContextMenu key={file.id}>
				<ContextMenuTrigger asChild>
					<motion.button
						whileTap={!isEditing ? { scale: 0.985 } : undefined}
						transition={{ duration: 0.06, ease: [0.32, 0.72, 0, 1] }}
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
						onContextMenu={(event) => handleContextMenu(event, fileItem)}
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
						tabIndex={0}
						className={cn(
							"relative flex w-full items-center overflow-hidden border border-transparent text-left text-xs font-medium transition-colors",
							compactMode ? "h-7" : "h-[34px]",
							isSelected || activeFileId === file.id
								? "border-border bg-muted text-foreground"
								: "text-foreground/60 hover:border-border hover:bg-muted hover:text-foreground/85",
							isDragging && "opacity-35",
							isDropTarget && "border-border bg-muted",
						)}
						style={{ paddingLeft: `${12 + depth * 16}px`, paddingRight: "10px" }}
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
								<span className="truncate select-none">{file.name}</span>
							)}
						</span>
					</motion.button>
				</ContextMenuTrigger>
				<ContextMenuContent
					className="w-48"
					onCloseAutoFocus={(event) => {
						if (inputRef.current) {
							event.preventDefault();
						}
					}}
				>
					<ContextMenuItem
						onClick={() => {
							if (!selectionHasMultiple) {
								startRename(file.id, file.name, "file");
							}
						}}
						className="gap-2"
						disabled={selectionHasMultiple}
					>
						<Pencil className="w-4 h-4" />
						Rename
					</ContextMenuItem>
					{onOpenBeside &&
					!isMobile &&
					!selectionHasMultiple &&
					file.id !== activeFileId ? (
						<ContextMenuItem
							onClick={() => onOpenBeside(file.id)}
							className="gap-2"
						>
							<Columns2 className="w-4 h-4" />
							Open beside
						</ContextMenuItem>
					) : null}
					{renderMoveToSubmenu(selectionForAction)}
					<ContextMenuSeparator />
					{isFavorite(file.id) ? (
						<ContextMenuItem
							onClick={() => removeFromFavorites(file.id)}
							className="gap-2"
						>
							<Star className="w-4 h-4 fill-favorite text-favorite" />
							Remove from Favorites
						</ContextMenuItem>
					) : (
						<ContextMenuItem
							onClick={() => addToFavorites(file.id, "file")}
							className="gap-2"
						>
							<Star className="w-4 h-4" />
							Add to Favorites
						</ContextMenuItem>
					)}
					{projects.length > 0 && (
						<ContextMenuSub>
							<ContextMenuSubTrigger className="gap-2">
								<Briefcase className="w-4 h-4" />
								Add to Project
							</ContextMenuSubTrigger>
							<ContextMenuSubContent className="w-40">
								{projects.map((project) => (
									<ContextMenuItem
										key={project.id}
										onClick={() => addToProject(project.id, file.id, "file")}
										className="gap-2"
									>
										<span
											className={cn(
												"w-2 h-2 rounded-full shrink-0",
												project.color,
											)}
										/>
										{project.name}
									</ContextMenuItem>
								))}
							</ContextMenuSubContent>
						</ContextMenuSub>
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
											addToCustomSection(section.id, file.id, "file")
										}
										className="gap-2"
									>
										{section.name}
									</ContextMenuItem>
								))}
							</ContextMenuSubContent>
						</ContextMenuSub>
					)}
					<NoteSendContextSubmenu note={file} />
					<ContextMenuSeparator />
					<ContextMenuItem
						onClick={() => deleteSelection(selectionForAction)}
						className="gap-2 text-destructive focus:text-destructive"
					>
						<Trash2 className="w-4 h-4" />
						{selectionHasMultiple ? "Delete selected" : "Delete"}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
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
	const isRootDropTarget = dropTarget?.id === null && dropTarget?.type === "root";
	const virtualItems = virtualizer.getVirtualItems();
	const totalHeight = virtualizer.getTotalSize();

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
			<div
				ref={listRef}
				className={cn(
					"px-1.5 pb-4 pt-1",
					!scrollElementRef && "flex-1 overflow-y-auto",
					isRootDropTarget && "bg-primary/6",
				)}
				role="tree"
				aria-label="Notes file tree"
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
								data-index={virtualRow.index}
								ref={virtualizer.measureElement}
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
