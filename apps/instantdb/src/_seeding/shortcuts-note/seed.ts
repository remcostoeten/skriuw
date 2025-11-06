/**
 * Core seeding logic for the Keyboard Shortcuts documentation note
 */

import { transact, tx } from '@/api/db/client';
import { generateId } from 'utils';
import { SHORTCUTS_NOTE_CONTENT } from './content';

export interface SeedOptions {
    pinned?: boolean;
    position?: number;
}

export interface SeedResult {
    id: string;
    title: string;
    success: boolean;
}

/**
 * Seeds the Keyboard Shortcuts documentation note into the database
 * @param options Configuration options for the note
 * @returns Result with note ID and success status
 */
export async function seedKeyboardShortcutsNote(
    options: SeedOptions = {}
): Promise<SeedResult> {
    try {
        const id = generateId();
        const now = Date.now();

        console.log('🚀 Creating Keyboard Shortcuts note...');
        console.log(`📝 Note ID: ${id}`);

        await transact([
            tx.notes[id].update({
                title: 'Keyboard Shortcuts',
                content: SHORTCUTS_NOTE_CONTENT,
                position: options.position ?? 0,
                pinned: options.pinned ?? false,
                createdAt: now,
                updatedAt: now,
            })
        ]);

        console.log('✅ Successfully created Keyboard Shortcuts note!');
        console.log('🔄 The note should appear immediately in your app');

        return {
            id,
            title: 'Keyboard Shortcuts',
            success: true,
        };
    } catch (error) {
        console.error('❌ Failed to create Keyboard Shortcuts note:', error);
        throw error;
    }
}

// Expose to window for easy browser console access
if (typeof window !== 'undefined') {
    (window as any).seedKeyboardShortcutsNote = seedKeyboardShortcutsNote;
}

