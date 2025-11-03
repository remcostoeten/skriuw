'use client';

import type { Note } from '@/api/db/schema';
import NoteEditor from '@/components/editor/note-editor';
import { Sidebar as FileTreeSidebar } from '@/components/file-tree/sidebar';
import { useCreateNote } from '@/modules/notes/api/mutations/create';
import { useDestroyNote } from '@/modules/notes/api/mutations/destroy';
import { useGetNotes } from '@/modules/notes/api/queries/get-notes';
import { SearchStateProvider } from '@/modules/search/context/search-state-context';
import { DockManager } from '@/utils/dock-utils';
import { useEffect, useMemo, useRef, useState } from 'react';

export function NotesView() {
  const { notes, isLoading } = useGetNotes();
  const { createNote } = useCreateNote();
  const { destroyNote } = useDestroyNote();
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const pendingNoteIdRef = useRef<string | null>(null);

  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const prevNoteRef = useRef<Note | null>(null);

  useEffect(() => {
    if (!selectedNoteId) {
      if (prevNoteRef.current !== null) {
        setSelectedNote(null);
        prevNoteRef.current = null;
      }
      return;
    }

    const note = notes.find((n: Note) => n.id === selectedNoteId);
    if (!note) {
      if (prevNoteRef.current !== null) {
        setSelectedNote(null);
        prevNoteRef.current = null;
      }
      return;
    }

    const noteChanged = !prevNoteRef.current ||
      prevNoteRef.current.id !== note.id ||
      prevNoteRef.current.content !== note.content ||
      prevNoteRef.current.title !== note.title;

    if (noteChanged) {
      setSelectedNote(note);
      prevNoteRef.current = note;
    }
  }, [selectedNoteId, notes]);

  const handleNoteSelect = useMemo(() => (noteId: Note['id']) => {
    setSelectedNoteId(noteId);
  }, []);

  useEffect(() => {
    DockManager.setBadge(notes.length);
  }, [notes]);

  useEffect(() => {
    if (pendingNoteIdRef.current) {
      const note = notes.find((n: Note) => n.id === pendingNoteIdRef.current)
      if (note) {
        setSelectedNoteId(note.id)
        pendingNoteIdRef.current = null
      }
    }
  }, [notes]);

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

    const rootNotes = notes.filter((n: Note) => !(n.folder as any))
    const position = rootNotes.length > 0 ? Math.max(...rootNotes.map((n: Note) => n.position || 0)) + 1 : 0

    const note = await createNote({ title, content: '', position })
    setSelectedNoteId((note as Note).id)
  }

  async function handleCreateNoteFromSidebar(noteId?: string) {
    if (noteId) {
      const note = notes.find((n: Note) => n.id === noteId)
      if (note) {
        setSelectedNoteId(note.id)
      } else {
        pendingNoteIdRef.current = noteId
      }
    } else {
      await handleCreateNote()
    }
  }

  function handleNoteSelectFromSidebar(noteId: string) {
    setSelectedNoteId(noteId)
  }

  async function handleDeleteNote(id: string) {
    await destroyNote(id);
    if (selectedNoteId === id) {
      setSelectedNoteId(null);
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
    <SearchStateProvider>
      <div className="flex h-screen bg-background">
        <FileTreeSidebar
          onNoteSelect={handleNoteSelectFromSidebar}
          onNoteCreate={handleCreateNoteFromSidebar}
          onNoteDuplicate={async (noteId: string) => {
            // Wait for note to appear in list, then select it
            const checkInterval = setInterval(() => {
              const note = notes.find((n: Note) => n.id === noteId);
              if (note) {
                clearInterval(checkInterval);
                setSelectedNoteId(noteId);
              }
            }, 50);
            // Clear interval after 2 seconds if note doesn't appear
            setTimeout(() => clearInterval(checkInterval), 2000);
          }}
          selectedNoteId={selectedNote?.id}
        />

        <div className="flex-1 relative ml-[220px]">
          {selectedNote ? (
            <NoteEditor
              note={selectedNote}
              onNoteSelect={handleNoteSelect}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <p className="text-sm">Select a note or create a new one</p>
            </div>
          )}
        </div>
      </div>
    </SearchStateProvider>
  );
}
