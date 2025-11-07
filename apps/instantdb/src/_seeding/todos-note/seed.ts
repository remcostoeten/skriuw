/**
 * Core seeding logic for the Upgrade & Improvements Todo note
 */

import { transact, tx } from '@/api/db/client';
import { generateId } from 'utils';
import { TODOS_NOTE_CONTENT } from './content';

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
 * Seeds the Upgrade & Improvements Todo note into the database
 * @param options Configuration options for the note
 * @returns Result with note ID and success status
 */
export async function seedTodosNote(
    options: SeedOptions = {}
): Promise<SeedResult> {
    try {
        const id = generateId();
        const now = Date.now();

        console.log('🚀 Creating Upgrade & Improvements Todo note...');
        console.log(`📝 Note ID: ${id}`);

        await transact([
            tx.notes[id].update({
                title: 'Upgrade & Improvements Todo',
                content: TODOS_NOTE_CONTENT,
                position: options.position ?? 0,
                pinned: options.pinned ?? false,
                createdAt: now,
                updatedAt: now,
            })
        ]);

        console.log('✅ Successfully created Upgrade & Improvements Todo note!');
        console.log('🔄 The note should appear immediately in your app');

        return {
            id,
            title: 'Upgrade & Improvements Todo',
            success: true,
        };
    } catch (error) {
        console.error('❌ Failed to create Upgrade & Improvements Todo note:', error);
        throw error;
    }
}

// Expose to window for easy browser console access
if (typeof window !== 'undefined') {
    (window as any).seedTodosNote = seedTodosNote;
}

