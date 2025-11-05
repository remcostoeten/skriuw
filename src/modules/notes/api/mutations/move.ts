import { transact, tx } from '@/api/db/client';
import type { Folder, Note } from '@/api/db/schema';
import { useMutation } from '@/hooks/core';

type MoveNoteInput = {
    draggedNoteId: string;
    targetFolderId: string;
    position: 'before' | 'after' | 'inside';
    notes: Note[];
    folders: Folder[];
}

export function useMoveNote() {
    const { mutate, isLoading, error } = useMutation(async (input: MoveNoteInput) => {
        const { draggedNoteId, targetFolderId, position, notes, folders } = input;

        const draggedNote = notes.find((n: Note) => n.id === draggedNoteId);
        const targetFolder = folders.find((f: Folder) => f.id === targetFolderId);

        if (!draggedNote || !targetFolder) return;

        let newParentId: string | null = null;
        const currentParentId = (draggedNote.folder as any)?.id || null;

        if (position === 'inside') {
            const targetFolderNotes = notes.filter((n: Note) =>
                (n.folder as any)?.id === targetFolderId && n.id !== draggedNoteId
            );
            const sortedTargetNotes = targetFolderNotes.sort((a: Note, b: Note) => (a.position || 0) - (b.position || 0));
            const newPosition = sortedTargetNotes.length > 0
                ? Math.max(...sortedTargetNotes.map((n: Note) => n.position || 0)) + 1
                : 0;

            newParentId = targetFolderId;

            const transactions = [
                tx.notes[draggedNoteId].update({ position: newPosition, updatedAt: Date.now() })
            ];

            // Unlink from current folder if it exists and is different
            if (currentParentId && currentParentId !== targetFolderId) {
                transactions.push(tx.notes[draggedNoteId].unlink({ folder: currentParentId }));
            }

            // Link to new folder
            transactions.push(tx.notes[draggedNoteId].link({ folder: targetFolderId }));

            await transact(transactions);
        } else {
            newParentId = (targetFolder.parent as any)?.id || null;

            if (currentParentId !== newParentId) {
                if (newParentId) {
                    await transact([tx.notes[draggedNoteId].link({ folder: newParentId })]);
                } else {
                    if (currentParentId) {
                        await transact([tx.notes[draggedNoteId].unlink({ folder: currentParentId })]);
                    }
                }
            }

            const siblingNotes = newParentId
                ? notes.filter((n: Note) => (n.folder as any)?.id === newParentId && n.id !== draggedNoteId)
                : notes.filter((n: Note) => !(n.folder as any) && n.id !== draggedNoteId);

            const siblingFolders = newParentId
                ? folders.filter((f: Folder) => (f.parent as any)?.id === newParentId && !f.deletedAt)
                : folders.filter((f: Folder) => !(f.parent as any) && !f.deletedAt);

            const sortedSiblingNotes = siblingNotes.sort((a: Note, b: Note) => (a.position || 0) - (b.position || 0));
            const sortedSiblingFolders = siblingFolders.sort((a: Folder, b: Folder) => (a.position || 0) - (b.position || 0));

            let newPosition: number;

            if (position === 'before') {
                const folderIndex = sortedSiblingFolders.findIndex((f: Folder) => f.id === targetFolderId);
                const prevFolder = folderIndex > 0 ? sortedSiblingFolders[folderIndex - 1] : null;
                const targetFolderPos = targetFolder.position || 0;
                const prevFolderPos = prevFolder?.position || 0;

                const notesInRange = sortedSiblingNotes.filter(n => {
                    const notePos = n.position || 0;
                    return notePos > prevFolderPos && notePos < targetFolderPos;
                });

                if (notesInRange.length > 0) {
                    const lastNote = notesInRange[notesInRange.length - 1];
                    newPosition = (lastNote.position || 0) + (targetFolderPos - (lastNote.position || 0)) / 2;
                } else {
                    newPosition = (prevFolderPos + targetFolderPos) / 2;
                }
            } else {
                const folderIndex = sortedSiblingFolders.findIndex((f: Folder) => f.id === targetFolderId);
                const nextFolder = folderIndex < sortedSiblingFolders.length - 1
                    ? sortedSiblingFolders[folderIndex + 1]
                    : null;
                const targetFolderPos = targetFolder.position || 0;
                const nextFolderPos = nextFolder?.position || (targetFolderPos + 100);

                const notesInRange = sortedSiblingNotes.filter(n => {
                    const notePos = n.position || 0;
                    return notePos > targetFolderPos && notePos < nextFolderPos;
                });

                if (notesInRange.length > 0) {
                    const firstNote = notesInRange[0];
                    newPosition = (targetFolderPos + (firstNote.position || 0)) / 2;
                } else {
                    newPosition = (targetFolderPos + nextFolderPos) / 2;
                }
            }

            await transact([tx.notes[draggedNoteId].update({ position: newPosition, updatedAt: Date.now() })]);
        }

        return {
            id: draggedNoteId,
            newParentId,
            oldParentId: currentParentId
        };
    });

    return { moveNote: mutate, isLoading, error };
}

type MoveNoteToRootInput = {
    draggedNoteId: string;
    notes: Note[];
}

export function useMoveNoteToRoot() {
    const { mutate, isLoading, error } = useMutation(async (input: MoveNoteToRootInput) => {
        const { draggedNoteId, notes } = input;

        const draggedNote = notes.find((n: Note) => n.id === draggedNoteId);
        if (!draggedNote) return;

        const rootNotes = notes.filter((n: Note) => !(n.folder as any) && n.id !== draggedNoteId);
        const newPosition = rootNotes.length > 0
            ? Math.max(...rootNotes.map((n: Note) => n.position || 0)) + 1
            : 0;

        const transactions = [
            tx.notes[draggedNoteId].update({ position: newPosition, updatedAt: Date.now() })
        ];

        if ((draggedNote.folder as any)?.id) {
            transactions.push(tx.notes[draggedNoteId].unlink({ folder: (draggedNote.folder as any).id }));
        }

        await transact(transactions);

        return { id: draggedNoteId };
    });

    return { moveNoteToRoot: mutate, isLoading, error };
}

type ReorderNoteInput = {
    draggedNoteId: string;
    targetNoteId: string;
    position: 'before' | 'after';
    notes: Note[];
}

export function useReorderNote() {
    const { mutate, isLoading, error } = useMutation(async (input: ReorderNoteInput) => {
        const { draggedNoteId, targetNoteId, position, notes } = input;

        const draggedNote = notes.find((n: Note) => n.id === draggedNoteId);
        const targetNote = notes.find((n: Note) => n.id === targetNoteId);

        if (!draggedNote || !targetNote || draggedNote.id === targetNote.id) return;

        const draggedFolderId = (draggedNote.folder as any)?.id;
        const targetFolderId = (targetNote.folder as any)?.id;

        if (draggedFolderId !== targetFolderId) {
            if (targetFolderId) {
                await transact([tx.notes[draggedNoteId].link({ folder: targetFolderId })]);
            } else {
                if (draggedFolderId) {
                    await transact([tx.notes[draggedNoteId].unlink({ folder: draggedFolderId })]);
                }
            }
        }

        const folderNotes = targetFolderId
            ? notes.filter((n: Note) => (n.folder as any)?.id === targetFolderId && n.id !== draggedNoteId)
            : notes.filter((n: Note) => !(n.folder as any) && n.id !== draggedNoteId);

        const sortedNotes = folderNotes.sort((a: Note, b: Note) => (a.position || 0) - (b.position || 0));
        const targetIndex = sortedNotes.findIndex((n: Note) => n.id === targetNoteId);

        let newPosition: number;

        if (targetIndex === -1) {
            newPosition = sortedNotes.length > 0
                ? Math.max(...sortedNotes.map((n: Note) => n.position || 0)) + 1
                : 0;
        } else {
            const targetPosition = sortedNotes[targetIndex].position || 0;

            if (position === 'before') {
                const prevPosition = targetIndex > 0 ? sortedNotes[targetIndex - 1].position || 0 : 0;
                newPosition = (prevPosition + targetPosition) / 2;
            } else {
                const nextPosition = targetIndex < sortedNotes.length - 1
                    ? sortedNotes[targetIndex + 1].position || 0
                    : targetPosition + 2;
                newPosition = (targetPosition + nextPosition) / 2;
            }
        }

        await transact([tx.notes[draggedNoteId].update({ position: newPosition, updatedAt: Date.now() })]);

        return { id: draggedNoteId };
    });

    return { reorderNote: mutate, isLoading, error };
}

