import type { DragEvent } from "react";

export const TREE_ITEM_MIME = "application/x-skriuw-tree-item";

export type TreeDragItem = {
	type: "file" | "folder";
	id: string;
	parentId: string | null;
};

// WebKitGTK doesn't reliably deliver the native drop event, so drop targets
// can't depend on it alone. The drag source registers the dragged item here on
// dragstart; targets that showed a drop indicator commit from this registry in
// a window-level dragend fallback when their drop handler never ran.
let activeDragItem: TreeDragItem | null = null;

export function beginTreeItemDrag(item: TreeDragItem): void {
	activeDragItem = item;
}

export function endTreeItemDrag(): void {
	activeDragItem = null;
}

export function getActiveTreeItemDrag(): TreeDragItem | null {
	return activeDragItem;
}

/** Marks a drag as a sidebar tree item so editor panes and tab bars can accept it. */
export function setTreeItemDragData(event: DragEvent, item: TreeDragItem, label: string): void {
	beginTreeItemDrag(item);
	event.dataTransfer.effectAllowed = "copyMove";
	event.dataTransfer.setData("text/plain", label);
	event.dataTransfer.setData(TREE_ITEM_MIME, JSON.stringify(item));
}

/** True when the active drag originated from the sidebar tree. */
export function isTreeItemDrag(event: DragEvent): boolean {
	return Array.from(event.dataTransfer.types).includes(TREE_ITEM_MIME);
}

/** Returns the dragged note id, or null when the payload is missing or a folder. */
export function readDroppedFileId(event: DragEvent): string | null {
	const raw = event.dataTransfer.getData(TREE_ITEM_MIME);
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as { type?: string; id?: string };
		return parsed.type === "file" && parsed.id ? parsed.id : null;
	} catch {
		return null;
	}
}
