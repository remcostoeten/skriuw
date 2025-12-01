import { useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Folder } from "lucide-react";
import { Dialog, DialogContent } from "@/shared/ui/dialog";
import { DataCommand, type CommandDataItem } from "./data-command";
import { fetchNotes, fetchFolders, fetchOneNote, fetchOneFolder } from "../api/fetch-notes";
import { useNotes } from "@/features/notes";
import { useNoteSlug } from "@/features/notes/hooks/use-note-slug";
import type { Note, Folder as FolderType } from "@/features/notes/types";

type props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function GlobalSearchDialog({ open, onOpenChange }: props) {
  const navigate = useNavigate();
  const { items } = useNotes();
  const { getNoteUrl } = useNoteSlug(items);

  const parseNote = useCallback((note: Note): CommandDataItem => ({
    label: note.name,
    value: note.id,
    icon: <FileText className="h-4 w-4 text-muted-foreground" />,
    onSelect: () => {
      navigate(getNoteUrl(note.id));
    },
  }), [navigate, getNoteUrl]);

  const parseFolder = useCallback((folder: FolderType): CommandDataItem => ({
    label: folder.name,
    value: folder.id,
    icon: <Folder className="h-4 w-4 text-muted-foreground" />,
    loadItems: async ({ search }) => {
      const [notes, subFolders] = await Promise.all([
        fetchNotes({ parentFolderId: folder.id, search }),
        fetchFolders({ parentFolderId: folder.id, search }),
      ]);

      return [
        ...subFolders.map((f) => parseFolder(f)),
        ...notes.map((n) => parseNote(n)),
      ];
    },
    loadOneItem: async (itemId: string) => {
      // Try to fetch as folder first, then as note
      const fetchedFolder = await fetchOneFolder(itemId);
      if (fetchedFolder) {
        return parseFolder(fetchedFolder);
      }
      const note = await fetchOneNote(itemId);
      if (note) {
        return parseNote(note);
      }
      throw new Error("Item not found");
    },
    onSelect: () => {
      // Could navigate to folder view if implemented
      navigate("/");
    },
  }), [navigate, parseNote]);

  const rootItems = useMemo<CommandDataItem[]>(
    () => [
      {
        icon: <Folder className="h-4 w-4 text-muted-foreground" />,
        label: "All Notes",
        value: "all-notes",
        searchPlaceholder: "Search all notes...",
        loadItems: async ({ search }) => {
          const [notes, folders] = await Promise.all([
            fetchNotes({ search }),
            fetchFolders({ search }),
          ]);

          return [
            ...folders.map((f) => parseFolder(f)),
            ...notes.map((n) => parseNote(n)),
          ];
        },
        onSelect: () => {
          navigate("/");
        },
      },
    ],
    [navigate, parseNote, parseFolder]
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 max-w-2xl">
        <DataCommand items={rootItems} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
