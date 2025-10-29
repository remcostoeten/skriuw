'use client';

import { useState } from 'react';
import { Plus, Trash2, List } from 'lucide-react';
import { useGetNotes } from '@/modules/notes/api/queries/get-notes';
import { useCreateNote } from '@/modules/notes/api/mutations/create';
import { useDestroyNote } from '@/modules/notes/api/mutations/destroy';
import { Button } from '@/components/ui/button';
import { NoteEditor } from '@/components/note-editor';
import type { Note } from '@/lib/db/schema';

export function NotesView() {
  const { notes, isLoading } = useGetNotes();
  const { createNote } = useCreateNote();
  const { destroyNote } = useDestroyNote();
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  async function handleCreateNote() {
    const suffix = '.md'
    const amount = notes.length + 1
    const title = `Untitled ${amount}${suffix}`
    const note = await createNote({ title, content: '' })
    setSelectedNote(note as Note)
  }

  async function handleDeleteNote(id: string) {
    await destroyNote(id);
    if (selectedNote?.id === id) {
      setSelectedNote(null);
    }
  };

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'w-64' : 'w-0'
        } transition-all duration-300 overflow-hidden bg-background/50 backdrop-blur-sm`}
      >
        <div className="p-4 flex items-center justify-between">
          <h1 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Notes</h1>
          <Button size="icon" variant="ghost" onClick={handleCreateNote} className="h-8 w-8">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-y-auto h-[calc(100vh-65px)] px-2">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`px-3 py-2 mb-1 rounded-md cursor-pointer hover:bg-accent/50 transition-colors group ${
                selectedNote?.id === note.id ? 'bg-accent/70' : ''
              }`}
              onClick={() => setSelectedNote(note)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-medium truncate">{note.title || 'Untitled'}</h3>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteNote(note.id);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
          {notes.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <p className="text-sm">No notes yet.</p>
              <p className="text-xs mt-2">Click + to create one.</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative">
        {!sidebarOpen && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setSidebarOpen(true)}
            className="absolute top-4 left-4 h-8 w-8 z-10"
          >
            <List className="h-4 w-4" />
          </Button>
        )}
        {sidebarOpen && (
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setSidebarOpen(false)}
            className="absolute top-4 left-4 h-8 w-8 z-10"
          >
            <List className="h-4 w-4" />
          </Button>
        )}
        {selectedNote ? (
          <NoteEditor 
            note={selectedNote}
            onNoteSelect={(noteId) => {
              const referencedNote = notes.find((n) => n.id === noteId);
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

