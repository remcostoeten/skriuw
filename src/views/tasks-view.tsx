'use client';

import { useEffect, useState } from 'react';
import { useGetNotes } from '@/modules/notes/api/queries/get-notes';
import { useGetFolders } from '@/modules/folders/api/queries/get-folders';
import { useCreateFolder } from '@/modules/folders/api/mutations/create';
import { useCreateNote } from '@/modules/notes/api/mutations/create';
import { SidebarFolderItem } from '@/components/sidebar/sidebar-folder-item';
import { SidebarNoteItem } from '@/components/sidebar/sidebar-note-item';
import { FoldersSidebar } from '@/components/folders-sidebar';
import { DockManager } from '@/utils/dock-utils';
import type { Note, Folder } from '@/api/db/schema';
import { useGetTasks } from '@/modules/tasks/api/queries/get-tasks';
import { TaskList } from '@/modules/tasks/components/task-list';

export function TasksView() {
    const { notes, isLoading } = useGetNotes();
    const { folders } = useGetFolders();
    const { createFolder } = useCreateFolder();
    const { createNote } = useCreateNote();
    const [selectedNote, setSelectedNote] = useState<Note | null>(null);

    const { tasks } = useGetTasks(selectedNote?.id ?? null);

    // Update dock badge with task count for selected note
    useEffect(() => {
        DockManager.setBadge(tasks.length || 0);
    }, [tasks]);

    async function handleCreateNote() {
        const suffix = '.md';
        const amount = notes.length + 1;
        const title = `Untitled ${amount}${suffix}`;

        const rootNotes = notes.filter((n: Note) => !(n.folder as any));
        const position =
            rootNotes.length > 0
                ? Math.max(...rootNotes.map((n: Note) => n.position || 0)) + 1
                : 0;

        const note = await createNote({ title, content: '', position });
        setSelectedNote(note as Note);
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
            <FoldersSidebar
                onNewFolder={() => createFolder(undefined)}
                onNewNote={handleCreateNote}
                onFolderClick={(folder) => console.log('Folder clicked:', folder)}
                onNoteClick={(note) => setSelectedNote(note)}
                onToggleFullscreen={() => console.log('Toggle fullscreen')}
            >
                <div>
                    {(folders as any[])
                        .filter((f) => !f.parent && !f.deletedAt)
                        .map((f) => (
                            <SidebarFolderItem
                                key={f.id}
                                folder={f as Folder}
                                folders={folders as Folder[]}
                                notes={notes as Note[]}
                                draggedFolderId={null}
                                draggedNoteId={null}
                                onDragStart={() => { }}
                                onDragEnd={() => { }}
                                onDrop={() => { }}
                                onNoteDrop={() => { }}
                                onNoteSelect={setSelectedNote}
                                selectedNoteId={selectedNote?.id}
                                onNoteReorder={() => { }}
                                onNoteDragStart={() => { }}
                            />
                        ))}

                    {notes
                        .filter((n: Note) => !(n.folder as any))
                        .sort(
                            (a: Note, b: Note) => (a.position || 0) - (b.position || 0)
                        )
                        .map((note: Note) => (
                            <SidebarNoteItem
                                key={note.id}
                                note={note}
                                selectedNoteId={selectedNote?.id}
                                draggedNoteId={null}
                                onNoteSelect={setSelectedNote}
                                onDragStart={() => { }}
                                onDragEnd={() => { }}
                                onNoteDrop={() => { }}
                            />
                        ))}
                </div>
            </FoldersSidebar>

            <div className="flex-1 relative px-8 py-6">
                {selectedNote ? (
                    <div className="max-w-3xl mx-auto">
                        <h2 className="text-xl font-semibold mb-2">
                            {selectedNote.title}
                        </h2>
                        <p className="text-sm text-muted-foreground mb-6">
                            Tasks linked to this note
                        </p>
                        <TaskList noteId={selectedNote.id} />
                    </div>
                ) : (
                    <div className="h-full flex items-center justify-center">
                        <div className="text-center text-muted-foreground">
                            <p className="text-sm">Select a note to view its tasks.</p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default TasksView;


