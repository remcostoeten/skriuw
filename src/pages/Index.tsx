import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { EmptyState } from "@/shared/ui/empty-state";

import { NoteEditor } from "@/features/editor/components/NoteEditor";
import { useNotes } from "@/features/notes/hooks/useNotes";
import { useShortcut, shortcut } from "@/features/shortcuts";

import { AppLayout } from "@/components/layout/app-layout";


export default function Index() {
  const location = useLocation();
  const navigate = useNavigate();
  const { createNote } = useNotes();

  const isNoteRoute = location.pathname.startsWith("/note/");
  const noteId = isNoteRoute ? location.pathname.split("/note/")[1] : null;

  async function handleCreateNote() {
    const newNote = await createNote("Untitled");
    if (newNote) {
      navigate(`/note/${newNote.id}?focus=true`);
      toast.success("Note created");
    }
  }

  async function handleOpenCollection() {
    // TODO: Implement open collection functionality
    toast.warning("Not implemented yet");
  }

  useShortcut("create-note", (e) => {
    e.preventDefault();
    handleCreateNote();
  });

  useShortcut("open-collection", (e) => {
    e.preventDefault();
    handleOpenCollection();
  });

  if (!noteId) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center bg-background">
          <EmptyState
            message="Select a note to start editing"
            submessage="Get started by opening a collection or creating a new note"
            actions={[
              {
                label: "Open Collection",
                shortcut: shortcut().modifiers("Cmd").key("O"),
                separator: true,
                onClick: handleOpenCollection,
              },
              {
                label: "Create Note",
                shortcut: shortcut().modifiers("Cmd").key("N"),
                separator: true,
                onClick: handleCreateNote,
              },
            ]}
          />
        </div>
      </AppLayout>
    );
  }

  // Show note editor when a note is selected
  return (
    <AppLayout sidebarActiveNoteId={noteId}>
      <NoteEditor
        noteId={noteId}
        className="overflow-y-auto"
      />
    </AppLayout>
  );
}
