'use client';

import type { Note } from '@/api/db/schema';
import { FoldersSidebar } from '@/components/sidebar/folders-sidebar';
import { useCreateFolder } from '@/modules/folders/api/mutations/create';
import { useGetFolders } from '@/modules/folders/api/queries/get-folders';
import { useCreateNote } from '@/modules/notes/api/mutations/create';
import { useGetNotes } from '@/modules/notes/api/queries/get-notes';
import { useGetTasks } from '@/modules/tasks/api/queries/get-tasks';
import { TaskList } from '@/modules/tasks/components/task-list';
import { DockManager } from '@/utils/dock-utils';
import { useEffect, useState } from 'react';

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

            </FoldersSidebar>

            <div className="flex-1 relative px-8 py-6 overflow-y-auto scrollbar-content">
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


