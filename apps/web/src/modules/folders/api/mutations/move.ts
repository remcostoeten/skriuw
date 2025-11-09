import type { Folder } from '@/api/db/schema';
import { useMutation } from '@/hooks/core';
import { useUpdateFolder } from './update';

type MoveFolderInput = {
    draggedFolderId: string;
    targetFolderId: string;
    position: 'before' | 'after' | 'inside';
    folders: Folder[];
}

export function useMoveFolder() {
    const { updateFolder } = useUpdateFolder();

    const { mutate, isLoading, error } = useMutation(async (input: MoveFolderInput) => {
        const { draggedFolderId, targetFolderId, position, folders } = input;

        const draggedFolder = folders.find((f: Folder) => f.id === draggedFolderId);
        const targetFolder = folders.find((f: Folder) => f.id === targetFolderId);

        if (!draggedFolder || !targetFolder) return;

        let newParentId: string | null = null;
        let newPosition: number;

        if (position === 'inside') {
            newParentId = targetFolderId;
            const childFolders = folders.filter((f: Folder) =>
                (f.parent as any)?.id === targetFolderId && f.id !== draggedFolderId
            );
            newPosition = childFolders.length > 0
                ? Math.max(...childFolders.map((f: Folder) => f.position || 0)) + 1
                : 0;
        } else {
            newParentId = (targetFolder.parent as any)?.id || null;
            const siblingFolders = folders.filter((f: Folder) =>
                ((f.parent as any)?.id || null) === newParentId && f.id !== draggedFolderId
            );
            const sortedSiblings = siblingFolders.sort((a: Folder, b: Folder) => (a.position || 0) - (b.position || 0));
            const targetIndex = sortedSiblings.findIndex((f: Folder) => f.id === targetFolderId);

            if (position === 'before') {
                const prevPosition = targetIndex > 0 ? sortedSiblings[targetIndex - 1].position || 0 : 0;
                newPosition = (prevPosition + (targetFolder.position || 0)) / 2;
            } else {
                const nextPosition = targetIndex < sortedSiblings.length - 1
                    ? sortedSiblings[targetIndex + 1].position || 0
                    : (targetFolder.position || 0) + 2;
                newPosition = ((targetFolder.position || 0) + nextPosition) / 2;
            }
        }

        const currentParentId = (draggedFolder.parent as any)?.id || null;
        await updateFolder(draggedFolderId, { parentId: newParentId, position: newPosition }, currentParentId);

        return {
            id: draggedFolderId,
            newParentId,
            oldParentId: currentParentId
        };
    });

    return { moveFolder: mutate, isLoading, error };
}

type MoveFolderToRootInput = {
    draggedFolderId: string;
    folders: Folder[];
}

export function useMoveFolderToRoot() {
    const { updateFolder } = useUpdateFolder();

    const { mutate, isLoading, error } = useMutation(async (input: MoveFolderToRootInput) => {
        const { draggedFolderId, folders } = input;

        const draggedFolder = folders.find((f: Folder) => f.id === draggedFolderId);
        if (!draggedFolder) return;

        const rootFolders = folders.filter((f: Folder) => !(f.parent as any) && f.id !== draggedFolderId && !(f as any).deletedAt);
        const newPosition = rootFolders.length > 0
            ? Math.max(...rootFolders.map((f: Folder) => f.position || 0)) + 1
            : 0;

        const currentParentId = (draggedFolder.parent as any)?.id || null;
        await updateFolder(draggedFolderId, { parentId: null, position: newPosition }, currentParentId);

        return { id: draggedFolderId };
    });

    return { moveFolderToRoot: mutate, isLoading, error };
}

