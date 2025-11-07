/**
 * Native Menu Manager for Linux
 * 
 * Handles native application menu integration for Linux (GNOME/Ubuntu)
 * - Updates recent notes menu dynamically
 * - Listens to menu events
 */

import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { isTauri } from '@/shared/utilities/platform';
import type { Note } from '@/api/db/schema';

/**
 * Update the recent notes menu in the native menu bar
 */
export async function updateRecentNotesMenu(notes: Note[]): Promise<void> {
    if (!isTauri()) return;

    try {
        // Get the 5 most recent notes (they're already sorted by createdAt desc)
        const recentNotes = notes.slice(0, 5).map(note => [
            note.id,
            note.title || 'Untitled'
        ] as [string, string]);

        await invoke('update_recent_notes_menu', { notes: recentNotes });
    } catch (error) {
        console.error('Failed to update recent notes menu:', error);
    }
}

/**
 * Hook to handle native menu events
 */
export function useNativeMenu(handlers: {
    onNewNote?: () => void;
    onOpenRecentNote?: (noteId: string) => void;
}) {
    useEffect(() => {
        if (!isTauri()) return;

        const unlistenPromises: Promise<() => void>[] = [];

        // Handle new note event
        if (handlers.onNewNote) {
            unlistenPromises.push(
                listen('menu:new-note', () => {
                    handlers.onNewNote?.();
                })
            );
        }

        // Handle open recent note event
        if (handlers.onOpenRecentNote) {
            unlistenPromises.push(
                listen<string>('menu:open-recent-note', (event) => {
                    handlers.onOpenRecentNote?.(event.payload);
                })
            );
        }

        return () => {
            Promise.all(unlistenPromises).then(unlisteners => {
                unlisteners.forEach(unlisten => unlisten());
            });
        };
    }, [handlers]);
}

