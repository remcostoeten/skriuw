'use client';

import { useState, useMemo } from 'react';
import type { Folder, Note } from '@/lib/db/schema';
import { SidebarNoteItem } from '@/components/note-editor';
import { Folder as ClosedIcon, FolderOpen as OpenIcon } from 'lucide-react';
import { useUpdateFolder } from '@/modules/folders/api/mutations/update';

type TProps = {
  folder: Folder;
  folders: Folder[];
  notes: Note[];
};

export function SidebarFolderItem({ folder, folders, notes }: TProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(folder.name);
  const { updateFolder } = useUpdateFolder();

  const childNotes = useMemo(() => notes.filter((n) => (n.folder as any)?.id === folder.id), [notes, folder.id]);
  const childFolders = useMemo(() => folders.filter((f) => (f.parent as any)?.id === folder.id && !f.deletedAt), [folders, folder.id]);

  function handleToggleFolder() {
    if (isEditing) return;
    const hasChildren = childNotes.length > 0 || childFolders.length > 0;
    if (hasChildren) setIsOpen(!isOpen);
  }

  async function commitRename() {
    if (name.trim() && name !== folder.name) {
      await updateFolder(folder.id, { name: name.trim() });
    }
    setIsEditing(false);
  }

  return (
    <div className="mb-1">
      <div
        className="group flex items-center justify-between px-2 py-1 rounded-md cursor-pointer hover:bg-accent/50"
        onClick={handleToggleFolder}
        onDoubleClick={() => setIsEditing(true)}
      >
        <div className="flex items-center gap-2 flex-1 transition-all active:scale-[98%]">
          <div className="text-muted-foreground">
            {isOpen ? <OpenIcon className="h-4 w-4" /> : <ClosedIcon className="h-4 w-4" />}
          </div>
          {isEditing ? (
            <input
              className="bg-transparent outline-none text-sm flex-1"
              value={name}
              autoFocus
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setName(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setName(folder.name);
                  setIsEditing(false);
                }
              }}
            />
          ) : (
            <span className="text-sm text-[#ccc] truncate">{folder.name}</span>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="pl-4 mt-1">
          {childFolders.map((childFolder) => (
            <SidebarFolderItem key={childFolder.id} folder={childFolder} folders={folders} notes={notes} />
          ))}

          {childNotes.map((note) => (
            // SidebarNoteItem exists in both apps as part of note list; reusing NoteEditor would be wrong here
            <div key={note.id} className="px-2 py-1 text-sm text-muted-foreground truncate">
              {note.title || 'Untitled'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


