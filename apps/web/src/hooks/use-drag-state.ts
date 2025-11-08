import { useCallback, useState } from 'react';

type DropPosition = 'before' | 'after' | 'inside';

export function useDragState() {
    const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
    const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
    const [dragOverRoot, setDragOverRoot] = useState(false);
    const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
    const [dropPosition, setDropPosition] = useState<DropPosition | null>(null);

    const startDragFolder = useCallback((id: string) => {
        setDraggedFolderId(id);
        setDragOverFolderId(null);
        setDropPosition(null);
    }, []);

    const startDragNote = useCallback((id: string) => {
        setDraggedNoteId(id);
        setDragOverFolderId(null);
        setDropPosition(null);
    }, []);

    const endDrag = useCallback(() => {
        setDraggedFolderId(null);
        setDraggedNoteId(null);
        setDragOverRoot(false);
        setDragOverFolderId(null);
        setDropPosition(null);
    }, []);

    const setDragOver = useCallback((folderId: string, position: DropPosition) => {
        setDragOverFolderId(folderId);
        setDropPosition(position);
    }, []);

    const clearDragOver = useCallback(() => {
        setDragOverFolderId(null);
        setDropPosition(null);
    }, []);

    return {
        draggedFolderId,
        draggedNoteId,
        dragOverRoot,
        dragOverFolderId,
        dropPosition,
        startDragFolder,
        startDragNote,
        endDrag,
        setDragOverRoot,
        setDragOver,
        clearDragOver,
    };
}

