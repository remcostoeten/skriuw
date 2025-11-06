import { transact, tx } from '@/api/db/client';
import type { Folder, Note } from '@/api/db/schema';
import { useMutation } from '@/hooks/core';
import { withTimestamps } from '@/shared/utilities/timestamps';

type Id = UUID;

const getId = (x?: { id?: string } | null) => x?.id ?? null;
const pos = (n?: { position?: number | null } | null) => n?.position ?? 0;

const byPosAsc = <T extends { position?: number | null }>(a: T, b: T) =>
  pos(a) - pos(b);

const maxPos = (items: Array<{ position?: number | null }>) =>
  items.length ? Math.max(...items.map(pos)) : 0;

const between = (x: number, lo: number, hi: number) => x > lo && x < hi;

const cloneSortByPos = <T extends { position?: number | null }>(arr: T[]) =>
  [...arr].sort(byPosAsc);

const noteFolderId = (n: Note) => getId((n as any).folder);
const folderParentId = (f: Folder) => getId((f as any).parent);

const notesInFolder = (notes: Note[], folderId: Nullable<Id>, excludeId?: Id) =>
  notes.filter(n => noteFolderId(n) === folderId && n.id !== excludeId);

const foldersInParent = (folders: Folder[], parentId: Nullable<Id>) =>
  folders.filter(f => folderParentId(f) === parentId && !(f as any).deletedAt);

const linkOps = (noteId: Id, fromId: Nullable<Id>, toId: Nullable<Id>) => {
  if (fromId === toId) return [];
  if (toId) return [tx.notes[noteId].link({ folder: toId })];
  if (fromId) return [tx.notes[noteId].unlink({ folder: fromId })];
  return [];
};

const mid = (a: number, b: number) => (a + b) / 2;

/**
 * @name Move Note Mutation
 * @description Mutation hook for moving a note
 */

type MoveProps = {
  draggedNoteId: Id;
  targetFolderId: Id;
  position: 'before' | 'after' | 'inside';
  notes: Note[];
  folders: Folder[];
};

export function useMoveNote() {
  const { mutate, isLoading, error } = useMutation(async (input: MoveProps) => {
    const { draggedNoteId, targetFolderId, position, notes, folders } = input;

    const draggedNote = notes.find(n => n.id === draggedNoteId);
    const targetFolder = folders.find(f => f.id === targetFolderId);
    if (!draggedNote || !targetFolder) return;

    const currentParentId = noteFolderId(draggedNote);
    let newParentId: Nullable<Id> = null;

    if (position === 'inside') {
      newParentId = targetFolderId;

      const targetNotes = notesInFolder(notes, targetFolderId, draggedNoteId);
      const newPosition = (targetNotes.length ? maxPos(targetNotes) : -1) + 1;

      await transact([
        tx.notes[draggedNoteId].update(withTimestamps({ position: newPosition })),
        tx.notes[draggedNoteId].link({ folder: targetFolderId }),
      ]);
    } else {
      newParentId = folderParentId(targetFolder);

      const ops = linkOps(draggedNoteId, currentParentId, newParentId);
      if (ops.length) await transact(ops);

      const siblingNotes = notesInFolder(notes, newParentId, draggedNoteId);
      const siblingFolders = foldersInParent(folders, newParentId);

      const sortedNotes = cloneSortByPos(siblingNotes);
      const sortedFolders = cloneSortByPos(siblingFolders as Array<{ position?: number | null; id: string }>);

      const folderIndex = sortedFolders.findIndex(f => f.id === targetFolderId);
      const targetFolderPos = pos(targetFolder as { position?: number | null });

      let newPosition: number;

      if (position === 'before') {
        const prevFolder = folderIndex > 0 ? sortedFolders[folderIndex - 1] : null;
        const prevPos = prevFolder ? pos(prevFolder as { position?: number | null }) : 0;

        const notesInRange = sortedNotes.filter(n =>
          between(pos(n), prevPos, targetFolderPos),
        );

        if (notesInRange.length) {
          const last = notesInRange[notesInRange.length - 1];
          newPosition = mid(pos(last), targetFolderPos);
        } else {
          newPosition = mid(prevPos, targetFolderPos);
        }
      } else {
        const nextFolder =
          folderIndex >= 0 && folderIndex < sortedFolders.length - 1
            ? sortedFolders[folderIndex + 1]
            : null;

        const nextPos = nextFolder ? pos(nextFolder) : targetFolderPos + 100;

        const notesInRange = sortedNotes.filter(n =>
          between(pos(n), targetFolderPos, nextPos),
        );

        if (notesInRange.length) {
          const first = notesInRange[0];
          newPosition = mid(targetFolderPos, pos(first));
        } else {
          newPosition = mid(targetFolderPos, nextPos);
        }
      }

      await transact([
        tx.notes[draggedNoteId].update(withTimestamps({ position: newPosition })),
      ]);
    }

    return {
      id: draggedNoteId,
      newParentId,
      oldParentId: currentParentId,
    };
  });

  return { moveNote: mutate, isLoading, error };
}

/**
 * @name Move Note to Root Mutation
 * @description Mutation hook for moving a note to the root
 */

type MoveNoteToRootInput = {
  draggedNoteId: Id;
  notes: Note[];
};

export function useMoveNoteToRoot() {
  const { mutate, isLoading, error } = useMutation(
    async (input: MoveNoteToRootInput) => {
      const { draggedNoteId, notes } = input;

      const draggedNote = notes.find(n => n.id === draggedNoteId);
      if (!draggedNote) return;

      const rootNotes = notesInFolder(notes, null, draggedNoteId);
      const newPosition = (rootNotes.length ? maxPos(rootNotes) : -1) + 1;

      const txs = [
        tx.notes[draggedNoteId].update(withTimestamps({ position: newPosition })),
      ];

      const fromId = noteFolderId(draggedNote);
      if (fromId) txs.push(tx.notes[draggedNoteId].unlink({ folder: fromId }));

      await transact(txs);

      return { id: draggedNoteId };
    },
  );

  return { moveNoteToRoot: mutate, isLoading, error };
}

/**
 * @name Reorder Note Mutation
 * @description Mutation hook for reordering a note
 */

type ReorderProps = {
  draggedNoteId: Id;
  targetNoteId: Id;
  position: 'before' | 'after';
  notes: Note[];
};

export function useReorderNote() {
  const { mutate, isLoading, error } = useMutation(async (input: ReorderProps) => {
    const { draggedNoteId, targetNoteId, position, notes } = input;

    const dragged = notes.find(n => n.id === draggedNoteId);
    const target = notes.find(n => n.id === targetNoteId);
    if (!dragged || !target || dragged.id === target.id) return;

    const fromFolderId = noteFolderId(dragged);
    const toFolderId = noteFolderId(target);

    const ops = linkOps(draggedNoteId, fromFolderId, toFolderId);
    if (ops.length) await transact(ops);

    const folderNotes = notesInFolder(notes, toFolderId, draggedNoteId);
    const sorted = cloneSortByPos(folderNotes);

    const idx = sorted.findIndex(n => n.id === targetNoteId);

    let newPosition: number;

    if (idx === -1) {
      newPosition = (sorted.length ? maxPos(sorted) : -1) + 1;
    } else {
      const tPos = pos(sorted[idx]);
      if (position === 'before') {
        const prevPos = idx > 0 ? pos(sorted[idx - 1]) : 0;
        newPosition = mid(prevPos, tPos);
      } else {
        const nextPos = idx < sorted.length - 1 ? pos(sorted[idx + 1]) : tPos + 2;
        newPosition = mid(tPos, nextPos);
      }
    }

    await transact([
      tx.notes[draggedNoteId].update(withTimestamps({ position: newPosition })),
    ]);

    return { id: draggedNoteId };
  });

  return { reorderNote: mutate, isLoading, error };
}