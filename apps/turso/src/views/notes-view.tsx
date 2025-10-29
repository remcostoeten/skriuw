import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useNotes } from '@/modules/notes/api/queries/get-notes';
import { useCreateNote } from '@/modules/notes/api/mutations/create-note';
import { useDeleteNote } from '@/modules/notes/api/mutations/delete-note';
import { Button } from '@/components/ui/button';
import { NoteEditor } from '@/components/note-editor';
import type { Note } from '@/lib/db/schema';

export function NotesView() {
  const { data: notes, refetch } = useNotes();
  const { createNote } = useCreateNote();
  const { deleteNote } = useDeleteNote();
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);

  const handleCreateNote = async () => {
    const note = await createNote({
      title: 'New Note',
      content: '',
    });
    await refetch();
    setSelectedNote(note as Note);
  };

  const handleDeleteNote = async (id: string) => {
    await deleteNote(id);
    if (selectedNote?.id === id) {
      setSelectedNote(null);
    }
    await refetch();
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h1 className="text-xl font-semibold">Notes</h1>
          <Button size="icon" variant="ghost" onClick={handleCreateNote}>
            <Plus className="h-5 w-5" />
          </Button>
        </div>
        <div className="overflow-y-auto h-[calc(100vh-73px)]">
          {notes.map((note) => (
            <div
              key={note.id}
              className={`p-4 border-b border-border cursor-pointer hover:bg-accent transition-colors group ${
                selectedNote?.id === note.id ? 'bg-accent' : ''
              }`}
              onClick={() => setSelectedNote(note)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{note.title}</h3>
                  <p className="text-sm text-muted-foreground truncate mt-1">
                    {new Date(note.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteNote(note.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {notes.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <p>No notes yet.</p>
              <p className="text-sm mt-2">Click the + button to create one.</p>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        {selectedNote ? (
          <NoteEditor note={selectedNote} onUpdate={refetch} />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p>Select a note or create a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}

