'use client';
import { transact, tx } from '@/api/db/client';
import type { Folder, Note } from '@/api/db/schema';
import { NoteEditor } from '@/components/editor/note-editor';
import { SearchableSidebar } from '@/components/sidebar/searchable-sidebar';
import { useCreateFolder } from '@/modules/folders/api/mutations/create';
import { useUpdateFolder } from '@/modules/folders/api/mutations/update';
import { useGetFolders } from '@/modules/folders/api/queries/get-folders';
import { useCreateNote } from '@/modules/notes/api/mutations/create';
import { useDestroyNote } from '@/modules/notes/api/mutations/destroy';
import { useUpdateNote } from '@/modules/notes/api/mutations/update';
import { useGetNotes } from '@/modules/notes/api/queries/get-notes';
import { useState } from 'react';

export function NotesView() {
  const { notes, isLoading } = useGetNotes();
  const { folders } = useGetFolders();
  const { createFolder } = useCreateFolder();
  const { createNote } = useCreateNote();
  const { destroyNote } = useDestroyNote();
  const { updateNote } = useUpdateNote();
  const { updateFolder } = useUpdateFolder();
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null);
  const [draggedNoteId, setDraggedNoteId] = useState<string | null>(null);
  const [dragOverRoot, setDragOverRoot] = useState(false);

  async function handleCreateNote() {
    const suffix = '.md'
    const amount = notes.length + 1
    const title = `Untitled ${amount}${suffix}`

    // Calculate position - put at the end of root-level notes
    const rootNotes = notes.filter((n: Note) => !(n.folder as any))
    const position = rootNotes.length > 0 ? Math.max(...rootNotes.map((n: Note) => n.position || 0)) + 1 : 0

    const note = await createNote({ title, content: '', position })
    setSelectedNote(note as Note)
  }

  async function handleDeleteNote(id: string) {
    await destroyNote(id);
    if (selectedNote?.id === id) {
      setSelectedNote(null);
    }
  }

  function handleDragStart(folderId: string) {
    setDraggedFolderId(folderId);
  }

  function handleDragEnd() {
    setDraggedFolderId(null);
    setDraggedNoteId(null);
    setDragOverRoot(false);
  }

  function handleDragOverRoot(e: React.DragEvent) {
    if (!draggedNoteId && !draggedFolderId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverRoot(true);
  }

  function handleDragLeaveRoot(e: React.DragEvent) {
    setDragOverRoot(false);
  }

  async function handleFolderDropToRoot(draggedFolderId: string) {
    const draggedFolder = folders.find((f: Folder) => f.id === draggedFolderId);

    if (!draggedFolder) return;

    // Calculate position for root level
    const rootFolders = folders.filter((f: Folder) => !(f.parent as any) && f.id !== draggedFolderId && !f.deletedAt);
    const newPosition = rootFolders.length > 0 ? Math.max(...rootFolders.map((f: Folder) => f.position || 0)) + 1 : 0;

    const currentParentId = (draggedFolder.parent as any)?.id || null;
    await updateFolder(draggedFolderId, { parentId: null, position: newPosition }, currentParentId);

    setDraggedFolderId(null);
  }

  function handleDropOnRoot(e: React.DragEvent) {
    e.preventDefault();
    if (draggedNoteId) {
      handleNoteDropToRoot(draggedNoteId as string);
    } else if (draggedFolderId) {
      handleFolderDropToRoot(draggedFolderId);
    }
    setDragOverRoot(false);
  }

  function handleNoteDragStart(noteId: string) {
    setDraggedNoteId(noteId);
  }

  async function handleNoteDrop(draggedNoteId: string, targetFolderId: string, position: 'before' | 'after' | 'inside') {
    const draggedNote = notes.find((n: Note) => n.id === draggedNoteId);
    const targetFolder = folders.find((f: Folder) => f.id === targetFolderId);

    if (!draggedNote || !targetFolder) return;

    if (position === 'inside') {
      // Dropping inside the folder - add to end of folder's notes
      const targetFolderNotes = notes.filter((n: Note) => (n.folder as any)?.id === targetFolderId && n.id !== draggedNoteId);
      const sortedTargetNotes = targetFolderNotes.sort((a: Note, b: Note) => (a.position || 0) - (b.position || 0));
      const newPosition = sortedTargetNotes.length > 0 ? Math.max(...sortedTargetNotes.map((n: Note) => n.position || 0)) + 1 : 0;
      await transact([
        tx.notes[draggedNoteId].update({ position: newPosition, updatedAt: Date.now() }),
        tx.notes[draggedNoteId].link({ folder: targetFolderId })
      ]);
    } else {
      // Dropping before/after folder - note goes to same parent as the folder
      const newParentId = (targetFolder.parent as any)?.id || null;
      const currentParentId = (draggedNote.folder as any)?.id || null;

      // Update folder association if needed
      if (currentParentId !== newParentId) {
        if (newParentId) {
          await transact([tx.notes[draggedNoteId].link({ folder: newParentId })]);
        } else {
          if (currentParentId) {
            await transact([tx.notes[draggedNoteId].unlink({ folder: currentParentId })]);
          }
        }
      }

      // Get all notes and folders at the target level to calculate proper position
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
        // Find the highest positioned note that comes before this folder
        const folderIndex = sortedSiblingFolders.findIndex((f: Folder) => f.id === targetFolderId);
        const prevFolder = folderIndex > 0 ? sortedSiblingFolders[folderIndex - 1] : null;
        const targetFolderPos = targetFolder.position || 0;
        const prevFolderPos = prevFolder?.position || 0;

        // Find notes between previous folder (or 0) and target folder
        const notesInRange = sortedSiblingNotes.filter(n => {
          const notePos = n.position || 0;
          return notePos > prevFolderPos && notePos < targetFolderPos;
        });

        if (notesInRange.length > 0) {
          // Place after the last note before this folder
          const lastNote = notesInRange[notesInRange.length - 1];
          newPosition = (lastNote.position || 0) + (targetFolderPos - (lastNote.position || 0)) / 2;
        } else {
          // No notes between, place between folders
          newPosition = (prevFolderPos + targetFolderPos) / 2;
        }
      } else { // after
        // Find the lowest positioned note that comes after this folder
        const folderIndex = sortedSiblingFolders.findIndex((f: Folder) => f.id === targetFolderId);
        const nextFolder = folderIndex < sortedSiblingFolders.length - 1 ? sortedSiblingFolders[folderIndex + 1] : null;
        const targetFolderPos = targetFolder.position || 0;
        const nextFolderPos = nextFolder?.position || (targetFolderPos + 100);

        // Find notes between target folder and next folder (or end)
        const notesInRange = sortedSiblingNotes.filter(n => {
          const notePos = n.position || 0;
          return notePos > targetFolderPos && notePos < nextFolderPos;
        });

        if (notesInRange.length > 0) {
          // Place before the first note after this folder
          const firstNote = notesInRange[0];
          newPosition = (targetFolderPos + (firstNote.position || 0)) / 2;
        } else {
          // No notes between, place between folders or at end
          newPosition = (targetFolderPos + nextFolderPos) / 2;
        }
      }

      await transact([tx.notes[draggedNoteId].update({ position: newPosition, updatedAt: Date.now() })]);
    }

    setDraggedNoteId(null);
  }

  async function handleNoteDropToRoot(draggedNoteId: string) {
    const draggedNote = notes.find((n: Note) => n.id === draggedNoteId);

    if (!draggedNote) return;

    // Calculate position for root level
    const rootNotes = notes.filter((n: Note) => !(n.folder as any) && n.id !== draggedNoteId);
    const newPosition = rootNotes.length > 0 ? Math.max(...rootNotes.map((n: Note) => n.position || 0)) + 1 : 0;

    const transactions = [
      tx.notes[draggedNoteId].update({ position: newPosition, updatedAt: Date.now() })
    ];

    if ((draggedNote.folder as any)?.id) {
      transactions.push(tx.notes[draggedNoteId].unlink({ folder: (draggedNote.folder as any).id }));
    }

    await transact(transactions);

    setDraggedNoteId(null);
  }

  async function handleNoteReorder(draggedNoteId: string, targetNoteId: string, position: 'before' | 'after') {
    const draggedNote = notes.find((n: Note) => n.id === draggedNoteId);
    const targetNote = notes.find((n: Note) => n.id === targetNoteId);

    if (!draggedNote || !targetNote || draggedNote.id === targetNote.id) return;

    // Check if both notes are in the same folder
    const draggedFolderId = (draggedNote.folder as any)?.id;
    const targetFolderId = (targetNote.folder as any)?.id;

    if (draggedFolderId !== targetFolderId) {
      // Moving to a different folder - update folder association first
      if (targetFolderId) {
        await transact([tx.notes[draggedNoteId].link({ folder: targetFolderId })]);
      } else {
        if (draggedFolderId) {
          await transact([tx.notes[draggedNoteId].unlink({ folder: draggedFolderId })]);
        }
      }
    }

    // Get all notes in the target folder (or root if no folder)
    const folderNotes = targetFolderId
      ? notes.filter((n: Note) => (n.folder as any)?.id === targetFolderId && n.id !== draggedNoteId)
      : notes.filter((n: Note) => !(n.folder as any) && n.id !== draggedNoteId);

    const sortedNotes = folderNotes.sort((a: Note, b: Note) => (a.position || 0) - (b.position || 0));
    const targetIndex = sortedNotes.findIndex((n: Note) => n.id === targetNoteId);

    let newPosition: number;

    if (targetIndex === -1) {
      // Target note not found, put at the end
      newPosition = sortedNotes.length > 0 ? Math.max(...sortedNotes.map((n: Note) => n.position || 0)) + 1 : 0;
    } else {
      const targetPosition = sortedNotes[targetIndex].position || 0;

      if (position === 'before') {
        // Find the position before the target note
        const prevPosition = targetIndex > 0 ? sortedNotes[targetIndex - 1].position || 0 : 0;
        newPosition = (prevPosition + targetPosition) / 2;
      } else {
        // Find the position after the target note
        const nextPosition = targetIndex < sortedNotes.length - 1 ? sortedNotes[targetIndex + 1].position || 0 : targetPosition + 2;
        newPosition = (targetPosition + nextPosition) / 2;
      }
    }

    await transact([tx.notes[draggedNoteId].update({ position: newPosition, updatedAt: Date.now() })]);

    setDraggedNoteId(null);
  }

  async function handleDrop(draggedFolderId: string, targetFolderId: string, position: 'before' | 'after' | 'inside') {
    const draggedFolder = folders.find((f: Folder) => f.id === draggedFolderId);
    const targetFolder = folders.find((f: Folder) => f.id === targetFolderId);

    if (!draggedFolder || !targetFolder) return;

    let newParentId: string | null = null;
    let newPosition: number;

    if (position === 'inside') {
      newParentId = targetFolderId;
      const childFolders = folders.filter((f: Folder) => (f.parent as any)?.id === newParentId && f.id !== draggedFolderId);
      newPosition = childFolders.length > 0 ? Math.max(...childFolders.map((f: Folder) => f.position || 0)) + 1 : 0;
    } else {
      newParentId = (targetFolder.parent as any)?.id || null;
      const siblingFolders = folders.filter((f: Folder) => ((f.parent as any)?.id || null) === newParentId && f.id !== draggedFolderId);
      const sortedSiblings = siblingFolders.sort((a: Folder, b: Folder) => (a.position || 0) - (b.position || 0));
      const targetIndex = sortedSiblings.findIndex((f: Folder) => f.id === targetFolderId);

      if (position === 'before') {
        const prevPosition = targetIndex > 0 ? sortedSiblings[targetIndex - 1].position || 0 : 0;
        newPosition = (prevPosition + (targetFolder.position || 0)) / 2;
      } else { // after
        const nextPosition = targetIndex < sortedSiblings.length - 1 ? sortedSiblings[targetIndex + 1].position || 0 : (targetFolder.position || 0) + 2;
        newPosition = ((targetFolder.position || 0) + nextPosition) / 2;
      }
    }

    const currentParentId = (draggedFolder.parent as any)?.id || null;
    await updateFolder(draggedFolderId, { parentId: newParentId, position: newPosition }, currentParentId);

    setDraggedFolderId(null);
  }

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      <SearchableSidebar
        folders={folders}
        notes={notes}
        isLoading={isLoading}
        onNewNote={handleCreateNote}
        onNewFolder={() => createFolder(undefined)}
        onFolderClick={(folder) => console.log('Folder clicked:', folder)}
        onNoteClick={(note) => setSelectedNote(note)}
        onToggleAllFolders={() => console.log('Toggle all folders')}
        // Drag and drop props
        draggedFolderId={draggedFolderId}
        draggedNoteId={draggedNoteId}
        onDragStart={handleDragStart}
        onNoteDragStart={handleNoteDragStart}
        onDragEnd={handleDragEnd}
        onDrop={handleDrop}
        onNoteDrop={handleNoteDrop}
        onNoteReorder={handleNoteReorder}
        onDropOnRoot={handleDropOnRoot}
        onDragOverRoot={handleDragOverRoot}
        onDragLeaveRoot={handleDragLeaveRoot}
        dragOverRoot={dragOverRoot}
        selectedNoteId={selectedNote?.id}
      />

      <div className="flex-1 relative">
        {selectedNote ? (
          <NoteEditor
            note={selectedNote}
            onNoteSelect={(noteId: Note['id']) => {
              const referencedNote = notes.find((n: Note) => n.id === noteId);
              if (referencedNote) {
                setSelectedNote(referencedNote);
              }
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p className="text-sm">Select a note or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}
