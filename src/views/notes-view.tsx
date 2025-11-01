'use client';

import type { Note } from '@/api/db/schema';
import { NoteEditor } from '@/components/editor/note-editor';
import { Sidebar as FileTreeSidebar } from '@/components/file-tree/sidebar';
import { useCreateNote } from '@/modules/notes/api/mutations/create';
import { useDestroyNote } from '@/modules/notes/api/mutations/destroy';
import { useGetNotes } from '@/modules/notes/api/queries/get-notes';
import { useState } from 'react';

export function NotesView() {
  const { notes, isLoading } = useGetNotes();
  const { createNote } = useCreateNote();
  const { destroyNote } = useDestroyNote();
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  // Update dock badge with note count
  DockManager.setBadge(notes.length || 0);

  // Handle search keyboard shortcuts
  useEffect(() => {
    const handleToggleSearch = () => {
      const searchToggleEvent = new CustomEvent('search:toggle');
      window.dispatchEvent(searchToggleEvent);
    };

    const handleCloseSearch = () => {
      const searchCloseEvent = new CustomEvent('search:close');
      window.dispatchEvent(searchCloseEvent);
    };

    window.addEventListener('menu:toggle-search', handleToggleSearch);
    window.addEventListener('menu:close-search', handleCloseSearch);

    return () => {
      window.removeEventListener('menu:toggle-search', handleToggleSearch);
      window.removeEventListener('menu:close-search', handleCloseSearch);
    };
  }, []);

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

  async function handleCreateNoteFromSidebar() {
    await handleCreateNote()
  }

  function handleNoteSelectFromSidebar(noteId: string) {
    const note = notes.find((n: Note) => n.id === noteId)
    if (note) {
      setSelectedNote(note)
    }
  }

  async function handleDeleteNote(id: string) {
    await destroyNote(id);
    if (selectedNote?.id === id) {
      setSelectedNote(null);
    }
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
      {/* File Tree Sidebar */}
      <FileTreeSidebar
        onNoteSelect={handleNoteSelectFromSidebar}
        onNoteCreate={handleCreateNoteFromSidebar}
        selectedNoteId={selectedNote?.id}
      />

<div className="flex-1 relative ml-[220px]">
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
